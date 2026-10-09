/**
 * Circulation Desk Service (Phase 8).
 * Pure transaction orchestration integrating the rules engine (rules/).
 * Enforces atomic transactions and SELECT ... FOR UPDATE row-level locking (NFR-R-01).
 */

import { and, desc, eq, or, sql } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import * as schema from "@/db/schema";
import {
  calculateDueDate,
  calculateHoldPickupExpiry,
  calculateLostCharge,
  calculateOverdueFine,
  calculateRenewalDueDate,
  calendarDaysBetween,
  checkRenewalEligibility,
  DEFAULT_SYSTEM_SETTINGS,
  evaluateIssueEligibility,
  formatDateIso,
  resolveReturnedCopyHoldAssignment,
  type SystemSettingsConfig,
  selectRule,
} from "@/rules";
import { recordAuditLog } from "./audit";

// biome-ignore lint/suspicious/noExplicitAny: Generic database instance support for testing
type DbInstance = any;

interface Actor {
  id: number;
  fullName: string;
  ipAddress?: string;
}

/**
 * Loads system settings from database into strongly typed SystemSettingsConfig.
 */
export async function getSystemSettingsConfig(
  db: DbInstance = defaultDb,
): Promise<SystemSettingsConfig> {
  const rows = await db.select().from(schema.systemSettings);
  const map = new Map<string, string>();
  for (const r of rows) {
    map.set(r.settingKey, r.settingValue);
  }

  return {
    defaultLoanDays: Number(
      map.get("DEFAULT_LOAN_DAYS") ?? DEFAULT_SYSTEM_SETTINGS.defaultLoanDays,
    ),
    defaultMaxBooks: Number(
      map.get("DEFAULT_MAX_BOOKS") ?? DEFAULT_SYSTEM_SETTINGS.defaultMaxBooks,
    ),
    defaultMaxRenewals: Number(
      map.get("DEFAULT_MAX_RENEWALS") ?? DEFAULT_SYSTEM_SETTINGS.defaultMaxRenewals,
    ),
    defaultFinePerDay: Number(
      map.get("DEFAULT_FINE_PER_DAY") ?? DEFAULT_SYSTEM_SETTINGS.defaultFinePerDay,
    ),
    defaultGraceDays: Number(
      map.get("DEFAULT_GRACE_DAYS") ?? DEFAULT_SYSTEM_SETTINGS.defaultGraceDays,
    ),
    fineBlockLimit: Number(map.get("FINE_BLOCK_LIMIT") ?? DEFAULT_SYSTEM_SETTINGS.fineBlockLimit),
    blockIssueIfOverdue: (map.get("BLOCK_ISSUE_IF_OVERDUE") ?? "true") === "true",
    holdPickupDays: Number(map.get("HOLD_PICKUP_DAYS") ?? DEFAULT_SYSTEM_SETTINGS.holdPickupDays),
    lostProcessingFee: Number(
      map.get("LOST_PROCESSING_FEE") ?? DEFAULT_SYSTEM_SETTINGS.lostProcessingFee,
    ),
    opacAllowHolds: (map.get("OPAC_ALLOW_HOLDS") ?? "true") === "true",
  };
}

/**
 * Loads full patron profile for circulation desk (FR-CI-01).
 * Resolves by scanning or typing card_no, roll_no, employee_id, or username.
 */
export async function lookupPatronForCirculation(
  identifier: string,
  referenceDate: string | Date = new Date(),
  db: DbInstance = defaultDb,
) {
  const term = identifier.trim().toUpperCase();
  if (!term) return null;

  const [patron] = await db
    .select({
      id: schema.patrons.id,
      cardNo: schema.patrons.cardNo,
      rollNo: schema.patrons.rollNo,
      employeeId: schema.patrons.employeeId,
      username: schema.patrons.username,
      firstName: schema.patrons.firstName,
      lastName: schema.patrons.lastName,
      patronType: schema.patrons.patronType,
      categoryId: schema.patrons.categoryId,
      categoryName: schema.patronCategories.name,
      departmentId: schema.patrons.departmentId,
      departmentName: schema.departments.name,
      courseId: schema.patrons.courseId,
      courseName: schema.courses.name,
      cardExpiry: schema.patrons.cardExpiry,
      status: schema.patrons.status,
      mobile: schema.patrons.mobile,
      email: schema.patrons.email,
    })
    .from(schema.patrons)
    .innerJoin(schema.patronCategories, eq(schema.patrons.categoryId, schema.patronCategories.id))
    .leftJoin(schema.departments, eq(schema.patrons.departmentId, schema.departments.id))
    .leftJoin(schema.courses, eq(schema.patrons.courseId, schema.courses.id))
    .where(
      or(
        eq(schema.patrons.cardNo, term),
        eq(schema.patrons.rollNo, term),
        eq(schema.patrons.employeeId, term),
        eq(schema.patrons.username, term),
      ),
    )
    .limit(1);

  if (!patron) return null;

  // Active loans for this patron
  const activeLoans = await db
    .select({
      id: schema.loans.id,
      itemId: schema.loans.itemId,
      accessionNo: schema.items.accessionNo,
      barcode: schema.items.barcode,
      title: schema.bibRecords.title,
      callNumber: schema.items.callNumber,
      issueDate: schema.loans.issueDate,
      dueDate: schema.loans.dueDate,
      renewalCount: schema.loans.renewalCount,
      status: schema.loans.status,
    })
    .from(schema.loans)
    .innerJoin(schema.items, eq(schema.loans.itemId, schema.items.id))
    .innerJoin(schema.bibRecords, eq(schema.items.bibId, schema.bibRecords.id))
    .where(and(eq(schema.loans.patronId, patron.id), eq(schema.loans.status, "ISSUED")))
    .orderBy(schema.loans.dueDate);

  const today = new Date(referenceDate);

  const enrichedLoans = activeLoans.map((l: any) => {
    const daysDiff = calendarDaysBetween(today, l.dueDate);
    const isOverdue = daysDiff < 0;
    const daysOverdue = isOverdue ? Math.abs(daysDiff) : 0;
    return {
      ...l,
      daysRemaining: daysDiff,
      isOverdue,
      daysOverdue,
    };
  });

  const overdueCount = enrichedLoans.filter((l: any) => l.isOverdue).length;

  // Outstanding fines
  const [finesRes] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${schema.fines.amount} - ${schema.fines.paidAmount}), 0)`,
    })
    .from(schema.fines)
    .where(and(eq(schema.fines.patronId, patron.id), eq(schema.fines.status, "OUTSTANDING")));

  const outstandingFines = Number(finesRes?.total ?? 0);

  // Active holds
  const activeHolds = await db
    .select({
      id: schema.holds.id,
      bibId: schema.holds.bibId,
      title: schema.bibRecords.title,
      requestDate: schema.holds.requestDate,
      status: schema.holds.status,
      availableDate: schema.holds.availableDate,
      expiryDate: schema.holds.expiryDate,
    })
    .from(schema.holds)
    .innerJoin(schema.bibRecords, eq(schema.holds.bibId, schema.bibRecords.id))
    .where(
      and(
        eq(schema.holds.patronId, patron.id),
        sql`${schema.holds.status} IN ('WAITING', 'AVAILABLE_FOR_PICKUP')`,
      ),
    )
    .orderBy(schema.holds.requestDate);

  return {
    ...patron,
    activeLoansCount: enrichedLoans.length,
    overdueLoansCount: overdueCount,
    hasOverdueLoans: overdueCount > 0,
    totalOutstandingFines: outstandingFines,
    activeLoans: enrichedLoans,
    activeHolds: activeHolds,
    stats: {
      activeLoansCount: enrichedLoans.length,
      overdueLoansCount: overdueCount,
      hasOverdueLoans: overdueCount > 0,
      outstandingFinesTotal: outstandingFines,
      activeHoldsCount: activeHolds.length,
    },
    loans: enrichedLoans,
    holds: activeHolds,
  };
}

/**
 * Loads copy details for circulation desk by scanning/typing barcode or accession number (FR-CI-01).
 */
export async function lookupCopyForCirculation(
  barcodeOrAccession: string,
  db: DbInstance = defaultDb,
) {
  const term = barcodeOrAccession.trim().toUpperCase();
  if (!term) return null;

  const [copy] = await db
    .select({
      id: schema.items.id,
      bibId: schema.items.bibId,
      libraryId: schema.items.libraryId,
      libraryName: schema.libraries.name,
      accessionNo: schema.items.accessionNo,
      barcode: schema.items.barcode,
      status: schema.items.status,
      location: schema.items.location,
      callNumber: schema.items.callNumber,
      price: schema.items.price,
      title: schema.bibRecords.title,
      authors: schema.bibRecords.authors,
      isbn: schema.bibRecords.isbn,
      itemTypeId: schema.bibRecords.itemTypeId,
      itemTypeName: schema.itemTypes.name,
      isReference: schema.itemTypes.isReference,
      bibPrice: schema.bibRecords.price,
    })
    .from(schema.items)
    .innerJoin(schema.bibRecords, eq(schema.items.bibId, schema.bibRecords.id))
    .innerJoin(schema.itemTypes, eq(schema.bibRecords.itemTypeId, schema.itemTypes.id))
    .innerJoin(schema.libraries, eq(schema.items.libraryId, schema.libraries.id))
    .where(or(eq(schema.items.barcode, term), eq(schema.items.accessionNo, term)))
    .limit(1);

  if (!copy) return null;

  // If copy is issued, find active loan and borrower
  let activeLoan = null;
  if (copy.status === "ISSUED") {
    const [loan] = await db
      .select({
        id: schema.loans.id,
        issueDate: schema.loans.issueDate,
        dueDate: schema.loans.dueDate,
        renewalCount: schema.loans.renewalCount,
        patronId: schema.loans.patronId,
        patronCard: schema.patrons.cardNo,
        patronName: sql<string>`concat(${schema.patrons.firstName}, ' ', coalesce(${schema.patrons.lastName}, ''))`,
      })
      .from(schema.loans)
      .innerJoin(schema.patrons, eq(schema.loans.patronId, schema.patrons.id))
      .where(and(eq(schema.loans.itemId, copy.id), eq(schema.loans.status, "ISSUED")))
      .limit(1);

    activeLoan = loan ?? null;
  }

  // If copy is reserved, find pickup hold
  let pickupHold = null;
  if (copy.status === "RESERVED") {
    const [hold] = await db
      .select({
        id: schema.holds.id,
        patronId: schema.holds.patronId,
        patronCard: schema.patrons.cardNo,
        patronName: sql<string>`concat(${schema.patrons.firstName}, ' ', coalesce(${schema.patrons.lastName}, ''))`,
        patronMobile: schema.patrons.mobile,
        expiryDate: schema.holds.expiryDate,
      })
      .from(schema.holds)
      .innerJoin(schema.patrons, eq(schema.holds.patronId, schema.patrons.id))
      .where(
        and(eq(schema.holds.bibId, copy.bibId), eq(schema.holds.status, "AVAILABLE_FOR_PICKUP")),
      )
      .limit(1);

    pickupHold = hold ?? null;
  }

  return {
    ...copy,
    activeLoan,
    pickupHold,
  };
}

/**
 * Issues a physical copy to a patron (FR-CI-02, UC-01, BR-01 to BR-09).
 * Runs the exact 9 SRS validation checks in order.
 * Executes as a single atomic transaction with SELECT ... FOR UPDATE copy row lock.
 */
export async function issueCopy(
  params: {
    patronIdentifier: string;
    barcodeOrAccession: string;
    referenceDate?: string | Date;
  },
  actor: Actor,
  db: DbInstance = defaultDb,
) {
  const patronTerm = params.patronIdentifier.trim().toUpperCase();
  const copyTerm = params.barcodeOrAccession.trim().toUpperCase();
  const today = params.referenceDate ? new Date(params.referenceDate) : new Date();

  try {
    return await db.transaction(async (tx: DbInstance) => {
      // 1. Lock physical copy row using SELECT ... FOR UPDATE (NFR-R-01)
      const copyRows = await tx
        .select({
          id: schema.items.id,
          bibId: schema.items.bibId,
          libraryId: schema.items.libraryId,
          accessionNo: schema.items.accessionNo,
          barcode: schema.items.barcode,
          status: schema.items.status,
        })
        .from(schema.items)
        .where(or(eq(schema.items.barcode, copyTerm), eq(schema.items.accessionNo, copyTerm)))
        .for("update");

      const copy = copyRows[0];
      if (!copy) {
        throw new Error(`Physical copy "${params.barcodeOrAccession}" not found`);
      }

      // 2. Fetch Patron
      const [patron] = await tx
        .select({
          id: schema.patrons.id,
          cardNo: schema.patrons.cardNo,
          categoryId: schema.patrons.categoryId,
          status: schema.patrons.status,
          cardExpiry: schema.patrons.cardExpiry,
          firstName: schema.patrons.firstName,
          lastName: schema.patrons.lastName,
        })
        .from(schema.patrons)
        .where(
          or(
            eq(schema.patrons.cardNo, patronTerm),
            eq(schema.patrons.rollNo, patronTerm),
            eq(schema.patrons.employeeId, patronTerm),
            eq(schema.patrons.username, patronTerm),
          ),
        )
        .limit(1);

      if (!patron) {
        throw new Error(`Patron "${params.patronIdentifier}" not found`);
      }

      // 3. Fetch Title & Item Type
      const [bib] = await tx
        .select({
          id: schema.bibRecords.id,
          title: schema.bibRecords.title,
          itemTypeId: schema.bibRecords.itemTypeId,
          isReference: schema.itemTypes.isReference,
        })
        .from(schema.bibRecords)
        .innerJoin(schema.itemTypes, eq(schema.bibRecords.itemTypeId, schema.itemTypes.id))
        .where(eq(schema.bibRecords.id, copy.bibId))
        .limit(1);

      // 4. Gather Patron Circulation Status (active loans, overdue flag, outstanding fines)
      const activeLoans = await tx
        .select({
          id: schema.loans.id,
          dueDate: schema.loans.dueDate,
        })
        .from(schema.loans)
        .where(and(eq(schema.loans.patronId, patron.id), eq(schema.loans.status, "ISSUED")));

      const activeLoansCount = activeLoans.length;
      const hasOverdueLoans = activeLoans.some(
        (l: any) => calendarDaysBetween(today, l.dueDate) < 0,
      );

      const [finesRes] = await tx
        .select({
          total: sql<string>`COALESCE(SUM(${schema.fines.amount} - ${schema.fines.paidAmount}), 0)`,
        })
        .from(schema.fines)
        .where(and(eq(schema.fines.patronId, patron.id), eq(schema.fines.status, "OUTSTANDING")));

      const outstandingFinesTotal = Number(finesRes?.total ?? 0);

      // 5. Fetch Rules and System Settings
      const allRules = await tx.select().from(schema.circulationRules);
      const settings = await getSystemSettingsConfig(tx);

      // 6. Check hold reservation context if copy is RESERVED
      let reservedForPatronId: number | null = null;
      let pickupHoldRecord: any = null;

      if (copy.status === "RESERVED") {
        const [pickupHold] = await tx
          .select()
          .from(schema.holds)
          .where(
            and(
              eq(schema.holds.bibId, copy.bibId),
              eq(schema.holds.status, "AVAILABLE_FOR_PICKUP"),
            ),
          )
          .orderBy(schema.holds.requestDate)
          .limit(1);

        if (pickupHold) {
          reservedForPatronId = pickupHold.patronId;
          pickupHoldRecord = pickupHold;
        }
      }

      // 7. Execute the 9 SRS checks in exact sequence via rules engine
      const eligibility = evaluateIssueEligibility({
        patron: {
          id: patron.id,
          status: patron.status,
          cardExpiry: patron.cardExpiry,
          activeLoansCount,
          hasOverdueLoans,
          outstandingFinesTotal,
        },
        copy: {
          id: copy.id,
          status: copy.status,
          isReference: bib.isReference || copy.status === "REFERENCE_ONLY",
          reservedForPatronId,
        },
        target: {
          libraryId: copy.libraryId,
          categoryId: patron.categoryId,
          itemTypeId: bib.itemTypeId,
          isReference: bib.isReference || copy.status === "REFERENCE_ONLY",
        },
        rules: allRules,
        settings,
        referenceDate: today,
      });

      // 8. If check fails: attach refusal audit metadata and throw to rollback transaction
      if (!eligibility.eligible) {
        // biome-ignore lint/suspicious/noExplicitAny: refusal error metadata
        const err: any = new Error(eligibility.reason);
        err.isRefusal = true;
        err.refusalAudit = {
          actorType: "STAFF",
          actorId: actor.id,
          actorName: actor.fullName,
          action: "CIRC_REFUSAL",
          entity: "loans",
          entityId: String(copy.id),
          details: `Issue refused for patron ${patron.cardNo} on copy ${copy.accessionNo}: ${eligibility.reason}`,
          ipAddress: actor.ipAddress,
        };
        throw err;
      }

      // 9. Success: calculate due date, insert loan, update copy, complete hold, audit
      const winningRule = eligibility.rule!;
      const dueDate = calculateDueDate(today, winningRule.loanDays);

      const [loan] = await tx
        .insert(schema.loans)
        .values({
          itemId: copy.id,
          patronId: patron.id,
          libraryId: copy.libraryId,
          issueDate: sql`${formatDateIso(today)}::date`,
          dueDate: sql`${formatDateIso(dueDate)}::date`,
          renewalCount: 0,
          status: "ISSUED",
          issuedBy: actor.id,
        })
        .returning();

      await tx
        .update(schema.items)
        .set({
          status: "ISSUED",
          updatedAt: new Date(),
        })
        .where(eq(schema.items.id, copy.id));

      // If hold was fulfilled, mark it COMPLETED
      if (pickupHoldRecord && pickupHoldRecord.patronId === patron.id) {
        await tx
          .update(schema.holds)
          .set({
            status: "COMPLETED",
            itemId: copy.id,
            updatedAt: new Date(),
          })
          .where(eq(schema.holds.id, pickupHoldRecord.id));
      }

      const patronFullName = [patron.firstName, patron.lastName].filter(Boolean).join(" ");
      await recordAuditLog(
        {
          actorType: "STAFF",
          actorId: actor.id,
          actorName: actor.fullName,
          action: "ISSUE",
          entity: "loans",
          entityId: String(loan.id),
          details: `Issued ${copy.accessionNo} ("${bib.title}") to ${patron.cardNo} (${patronFullName}). Due: ${formatDateIso(dueDate)} (rule #${winningRule.id ?? "default"})`,
          ipAddress: actor.ipAddress,
        },
        tx,
      );

      return {
        success: true,
        loan: {
          ...loan,
          dueDate: formatDateIso(dueDate),
          issueDate: formatDateIso(today),
        },
        copy: {
          ...copy,
          status: "ISSUED",
        },
        patron: {
          id: patron.id,
          cardNo: patron.cardNo,
          name: patronFullName,
        },
        title: bib.title,
        dueDate: formatDateIso(dueDate),
        loanDays: winningRule.loanDays,
        ruleId: winningRule.id,
        reservationFulfilled: !!(pickupHoldRecord && pickupHoldRecord.patronId === patron.id),
      };
    });
  } catch (error: any) {
    if (error?.isRefusal && error.refusalAudit) {
      await recordAuditLog(error.refusalAudit, db);
    }
    throw error;
  }
}

/**
 * Checks in a returned physical copy (FR-CI-03, UC-02, BR-06).
 * Computes overdue fine, assigns to waiting hold if present, and updates copy status.
 */
export async function returnCopy(
  params: {
    barcodeOrAccession: string;
    referenceDate?: string | Date;
  },
  actor: Actor,
  db: DbInstance = defaultDb,
) {
  const copyTerm = params.barcodeOrAccession.trim().toUpperCase();
  const today = params.referenceDate ? new Date(params.referenceDate) : new Date();

  return await db.transaction(async (tx: DbInstance) => {
    // 1. Lock copy row
    const copyRows = await tx
      .select({
        id: schema.items.id,
        bibId: schema.items.bibId,
        libraryId: schema.items.libraryId,
        accessionNo: schema.items.accessionNo,
        barcode: schema.items.barcode,
        status: schema.items.status,
      })
      .from(schema.items)
      .where(or(eq(schema.items.barcode, copyTerm), eq(schema.items.accessionNo, copyTerm)))
      .for("update");

    const copy = copyRows[0];
    if (!copy) {
      throw new Error(`Physical copy "${params.barcodeOrAccession}" not found`);
    }

    // 2. Find active loan
    const [activeLoan] = await tx
      .select({
        id: schema.loans.id,
        patronId: schema.loans.patronId,
        dueDate: schema.loans.dueDate,
        renewalCount: schema.loans.renewalCount,
      })
      .from(schema.loans)
      .where(and(eq(schema.loans.itemId, copy.id), eq(schema.loans.status, "ISSUED")))
      .for("update");

    if (!activeLoan) {
      throw new Error(`Copy "${copy.accessionNo}" is not currently issued`);
    }

    // 3. Close active loan
    await tx
      .update(schema.loans)
      .set({
        status: "RETURNED",
        returnDate: sql`${formatDateIso(today)}::date`,
        returnedTo: actor.id,
        updatedAt: new Date(),
      })
      .where(eq(schema.loans.id, activeLoan.id));

    // 4. Compute overdue fine per BR-06
    const [patron] = await tx
      .select({
        id: schema.patrons.id,
        cardNo: schema.patrons.cardNo,
        categoryId: schema.patrons.categoryId,
        firstName: schema.patrons.firstName,
        lastName: schema.patrons.lastName,
      })
      .from(schema.patrons)
      .where(eq(schema.patrons.id, activeLoan.patronId))
      .limit(1);

    const [bib] = await tx
      .select({
        id: schema.bibRecords.id,
        title: schema.bibRecords.title,
        itemTypeId: schema.bibRecords.itemTypeId,
        isReference: schema.itemTypes.isReference,
      })
      .from(schema.bibRecords)
      .innerJoin(schema.itemTypes, eq(schema.bibRecords.itemTypeId, schema.itemTypes.id))
      .where(eq(schema.bibRecords.id, copy.bibId))
      .limit(1);

    const allRules = await tx.select().from(schema.circulationRules);
    const settings = await getSystemSettingsConfig(tx);

    const { rule } = selectRule(
      allRules,
      {
        libraryId: copy.libraryId,
        categoryId: patron.categoryId,
        itemTypeId: bib.itemTypeId,
      },
      settings,
    );

    const fineResult = calculateOverdueFine({
      dueDate: activeLoan.dueDate,
      returnDate: today,
      finePerDay: rule.finePerDay,
      graceDays: rule.graceDays,
      maxFine: rule.maxFine,
    });

    let fineRecord = null;
    if (fineResult.finalOverdueFine > 0) {
      const [createdFine] = await tx
        .insert(schema.fines)
        .values({
          patronId: activeLoan.patronId,
          loanId: activeLoan.id,
          amount: sql`${fineResult.finalOverdueFine.toFixed(2)}::numeric`,
          paidAmount: "0.00",
          fineType: "OVERDUE",
          reason: `Overdue return of ${copy.accessionNo} (${fineResult.daysLate} days late, ${fineResult.chargeableDays} chargeable days)`,
          status: "OUTSTANDING",
          createdBy: actor.id,
        })
        .returning();

      fineRecord = createdFine;
    }

    // 5. Check waiting holds on title (FR-HO-03)
    const waitingHolds = await tx
      .select({
        id: schema.holds.id,
        patronId: schema.holds.patronId,
        requestDate: schema.holds.requestDate,
      })
      .from(schema.holds)
      .where(and(eq(schema.holds.bibId, copy.bibId), eq(schema.holds.status, "WAITING")))
      .orderBy(schema.holds.requestDate);

    const assignment = resolveReturnedCopyHoldAssignment({
      waitingHolds,
      isReference: bib.isReference,
    });

    let holdAlert = null;

    if (assignment.assignToHold && assignment.holdToFulfill) {
      const expiryDate = calculateHoldPickupExpiry(today, settings.holdPickupDays);

      await tx
        .update(schema.holds)
        .set({
          status: "AVAILABLE_FOR_PICKUP",
          itemId: copy.id,
          availableDate: sql`${formatDateIso(today)}::date`,
          expiryDate: sql`${formatDateIso(expiryDate)}::date`,
          updatedAt: new Date(),
        })
        .where(eq(schema.holds.id, assignment.holdToFulfill.id));

      const [holdPatron] = await tx
        .select({
          firstName: schema.patrons.firstName,
          lastName: schema.patrons.lastName,
          cardNo: schema.patrons.cardNo,
          mobile: schema.patrons.mobile,
        })
        .from(schema.patrons)
        .where(eq(schema.patrons.id, assignment.holdToFulfill.patronId))
        .limit(1);

      holdAlert = {
        holdId: assignment.holdToFulfill.id,
        patronName: [holdPatron?.firstName, holdPatron?.lastName].filter(Boolean).join(" "),
        patronCard: holdPatron?.cardNo,
        patronMobile: holdPatron?.mobile,
        pickupExpiryDate: formatDateIso(expiryDate),
      };
    }

    // Update copy status
    await tx
      .update(schema.items)
      .set({
        status: assignment.nextCopyStatus,
        updatedAt: new Date(),
      })
      .where(eq(schema.items.id, copy.id));

    // Audit return
    await recordAuditLog(
      {
        actorType: "STAFF",
        actorId: actor.id,
        actorName: actor.fullName,
        action: "RETURN",
        entity: "loans",
        entityId: String(activeLoan.id),
        details: `Returned copy ${copy.accessionNo} ("${bib.title}"). Status $\to$ ${assignment.nextCopyStatus}${
          fineResult.finalOverdueFine > 0
            ? `. Overdue fine: ₹${fineResult.finalOverdueFine.toFixed(2)}`
            : ""
        }${holdAlert ? `. Assigned to hold #${holdAlert.holdId}` : ""}`,
        ipAddress: actor.ipAddress,
      },
      tx,
    );

    return {
      success: true,
      copy: {
        ...copy,
        status: assignment.nextCopyStatus,
      },
      title: bib.title,
      daysLate: fineResult.daysLate,
      fineAmount: fineResult.finalOverdueFine,
      fineRecord,
      holdAlert,
    };
  });
}

/**
 * Renews an active loan (FR-CI-04, UC-03, BR-05, BR-08).
 * Checks overdue, max renewals, fines limit, and hold queue.
 */
export async function renewLoan(
  params: {
    loanId?: number;
    barcodeOrAccession?: string;
    referenceDate?: string | Date;
  },
  actor: Actor,
  db: DbInstance = defaultDb,
) {
  const today = params.referenceDate ? new Date(params.referenceDate) : new Date();

  try {
    return await db.transaction(async (tx: DbInstance) => {
      // 1. Locate active loan
      let loanQuery = tx
        .select({
          id: schema.loans.id,
          itemId: schema.loans.itemId,
          patronId: schema.loans.patronId,
          libraryId: schema.loans.libraryId,
          issueDate: schema.loans.issueDate,
          dueDate: schema.loans.dueDate,
          renewalCount: schema.loans.renewalCount,
          status: schema.loans.status,
        })
        .from(schema.loans);

      if (params.loanId) {
        loanQuery = loanQuery.where(
          and(eq(schema.loans.id, params.loanId), eq(schema.loans.status, "ISSUED")),
        );
      } else if (params.barcodeOrAccession) {
        const term = params.barcodeOrAccession.trim().toUpperCase();
        loanQuery = loanQuery
          .innerJoin(schema.items, eq(schema.loans.itemId, schema.items.id))
          .where(
            and(
              or(eq(schema.items.barcode, term), eq(schema.items.accessionNo, term)),
              eq(schema.loans.status, "ISSUED"),
            ),
          );
      } else {
        throw new Error("Must provide loanId or barcodeOrAccession to renew");
      }

      const [activeLoan] = await loanQuery.limit(1);
      if (!activeLoan) {
        throw new Error("Active loan not found for renewal");
      }

      // 2. Lock copy row
      const [copy] = await tx
        .select()
        .from(schema.items)
        .where(eq(schema.items.id, activeLoan.itemId))
        .for("update");

      // 3. Fetch Patron, Bib, Rules, Settings
      const [patron] = await tx
        .select()
        .from(schema.patrons)
        .where(eq(schema.patrons.id, activeLoan.patronId))
        .limit(1);

      const [bib] = await tx
        .select()
        .from(schema.bibRecords)
        .where(eq(schema.bibRecords.id, copy.bibId))
        .limit(1);

      const allRules = await tx.select().from(schema.circulationRules);
      const settings = await getSystemSettingsConfig(tx);

      const { rule } = selectRule(
        allRules,
        {
          libraryId: copy.libraryId,
          categoryId: patron.categoryId,
          itemTypeId: bib.itemTypeId,
        },
        settings,
      );

      // 4. Check renewal conditions
      const isOverdue = calendarDaysBetween(today, activeLoan.dueDate) < 0;

      const [finesRes] = await tx
        .select({
          total: sql<string>`COALESCE(SUM(${schema.fines.amount} - ${schema.fines.paidAmount}), 0)`,
        })
        .from(schema.fines)
        .where(and(eq(schema.fines.patronId, patron.id), eq(schema.fines.status, "OUTSTANDING")));

      const patronOutstandingFines = Number(finesRes?.total ?? 0);

      const [waitingHold] = await tx
        .select()
        .from(schema.holds)
        .where(and(eq(schema.holds.bibId, copy.bibId), eq(schema.holds.status, "WAITING")))
        .limit(1);

      const renewalEligibility = checkRenewalEligibility(
        {
          currentRenewalCount: activeLoan.renewalCount,
          isOverdue,
          hasWaitingHold: !!waitingHold,
          patronOutstandingFines,
        },
        rule,
        settings,
      );

      if (!renewalEligibility.eligible) {
        // biome-ignore lint/suspicious/noExplicitAny: refusal error metadata
        const err: any = new Error(renewalEligibility.reason);
        err.isRefusal = true;
        err.refusalAudit = {
          actorType: "STAFF",
          actorId: actor.id,
          actorName: actor.fullName,
          action: "CIRC_REFUSAL",
          entity: "loans",
          entityId: String(activeLoan.id),
          details: `Renewal refused for patron ${patron.cardNo} on loan #${activeLoan.id}: ${renewalEligibility.reason}`,
          ipAddress: actor.ipAddress,
        };
        throw err;
      }

      // 5. Execute renewal: newDueDate = today + loanDays
      const newDueDate = calculateRenewalDueDate(today, rule.loanDays);
      const newRenewalCount = activeLoan.renewalCount + 1;

      const [updatedLoan] = await tx
        .update(schema.loans)
        .set({
          dueDate: sql`${formatDateIso(newDueDate)}::date`,
          renewalCount: newRenewalCount,
          updatedAt: new Date(),
        })
        .where(eq(schema.loans.id, activeLoan.id))
        .returning();

      await recordAuditLog(
        {
          actorType: "STAFF",
          actorId: actor.id,
          actorName: actor.fullName,
          action: "RENEW",
          entity: "loans",
          entityId: String(activeLoan.id),
          details: `Renewed loan #${activeLoan.id} for ${copy.accessionNo} ("${bib.title}"). New due date: ${formatDateIso(newDueDate)} (renewal ${newRenewalCount} of ${rule.maxRenewals})`,
          ipAddress: actor.ipAddress,
        },
        tx,
      );

      return {
        success: true,
        loan: updatedLoan,
        newDueDate: formatDateIso(newDueDate),
        renewalCount: newRenewalCount,
        maxRenewals: rule.maxRenewals,
      };
    });
  } catch (error: any) {
    if (error?.isRefusal && error.refusalAudit) {
      await recordAuditLog(error.refusalAudit, db);
    }
    throw error;
  }
}

/**
 * Marks an active loan and physical copy as LOST (FR-CI-05, UC-04, BR-07).
 * Charges copy price (fallback to title price) + processing fee + overdue fine to date.
 */
export async function markCopyLost(
  params: {
    loanId?: number;
    barcodeOrAccession?: string;
    remarks?: string;
    referenceDate?: string | Date;
  },
  actor: Actor,
  db: DbInstance = defaultDb,
) {
  const today = params.referenceDate ? new Date(params.referenceDate) : new Date();

  return await db.transaction(async (tx: DbInstance) => {
    // 1. Locate active loan
    let loanQuery = tx
      .select({
        id: schema.loans.id,
        itemId: schema.loans.itemId,
        patronId: schema.loans.patronId,
        libraryId: schema.loans.libraryId,
        dueDate: schema.loans.dueDate,
        status: schema.loans.status,
      })
      .from(schema.loans);

    if (params.loanId) {
      loanQuery = loanQuery.where(
        and(eq(schema.loans.id, params.loanId), eq(schema.loans.status, "ISSUED")),
      );
    } else if (params.barcodeOrAccession) {
      const term = params.barcodeOrAccession.trim().toUpperCase();
      loanQuery = loanQuery
        .innerJoin(schema.items, eq(schema.loans.itemId, schema.items.id))
        .where(
          and(
            or(eq(schema.items.barcode, term), eq(schema.items.accessionNo, term)),
            eq(schema.loans.status, "ISSUED"),
          ),
        );
    } else {
      throw new Error("Must provide loanId or barcodeOrAccession to mark lost");
    }

    const [activeLoan] = await loanQuery.limit(1);
    if (!activeLoan) {
      throw new Error("Active loan not found to mark lost");
    }

    // 2. Lock copy row
    const [copy] = await tx
      .select()
      .from(schema.items)
      .where(eq(schema.items.id, activeLoan.itemId))
      .for("update");

    // 3. Fetch Patron, Bib, Rules, Settings
    const [patron] = await tx
      .select()
      .from(schema.patrons)
      .where(eq(schema.patrons.id, activeLoan.patronId))
      .limit(1);

    const [bib] = await tx
      .select()
      .from(schema.bibRecords)
      .where(eq(schema.bibRecords.id, copy.bibId))
      .limit(1);

    const allRules = await tx.select().from(schema.circulationRules);
    const settings = await getSystemSettingsConfig(tx);

    const { rule } = selectRule(
      allRules,
      {
        libraryId: copy.libraryId,
        categoryId: patron.categoryId,
        itemTypeId: bib.itemTypeId,
      },
      settings,
    );

    // 4. Calculate overdue fine to date
    const overdueFineRes = calculateOverdueFine({
      dueDate: activeLoan.dueDate,
      returnDate: today,
      finePerDay: rule.finePerDay,
      graceDays: rule.graceDays,
      maxFine: rule.maxFine,
    });

    // 5. Calculate lost book replacement charge (BR-07, T-13)
    const lostCharge = calculateLostCharge({
      itemPrice: copy.price,
      bibPrice: bib.price,
      lostProcessingFee: settings.lostProcessingFee,
      overdueFineToDate: overdueFineRes.finalOverdueFine,
    });

    // 6. Update loan status to LOST
    await tx
      .update(schema.loans)
      .set({
        status: "LOST",
        updatedAt: new Date(),
      })
      .where(eq(schema.loans.id, activeLoan.id));

    // 7. Update copy status to LOST
    await tx
      .update(schema.items)
      .set({
        status: "LOST",
        updatedAt: new Date(),
      })
      .where(eq(schema.items.id, copy.id));

    // 8. Create fine record (fine_type = 'LOST', status = 'OUTSTANDING')
    const [fine] = await tx
      .insert(schema.fines)
      .values({
        patronId: activeLoan.patronId,
        loanId: activeLoan.id,
        amount: sql`${lostCharge.totalLostCharge.toFixed(2)}::numeric`,
        paidAmount: "0.00",
        fineType: "LOST",
        reason: `Lost book charge for ${copy.accessionNo} ("${bib.title}"). Replacement price: ₹${lostCharge.baseReplacementPrice.toFixed(2)}, Processing fee: ₹${lostCharge.processingFee.toFixed(2)}, Late fine: ₹${lostCharge.overdueFineToDate.toFixed(2)}`,
        status: "OUTSTANDING",
        createdBy: actor.id,
      })
      .returning();

    // 9. Audit
    await recordAuditLog(
      {
        actorType: "STAFF",
        actorId: actor.id,
        actorName: actor.fullName,
        action: "CIRC_LOST",
        entity: "loans",
        entityId: String(activeLoan.id),
        details: `Marked copy ${copy.accessionNo} ("${bib.title}") as LOST for patron ${patron.cardNo}. Levied fine #${fine.id} of ₹${lostCharge.totalLostCharge.toFixed(2)}`,
        ipAddress: actor.ipAddress,
      },
      tx,
    );

    return {
      success: true,
      copy: {
        ...copy,
        status: "LOST",
      },
      title: bib.title,
      loanId: activeLoan.id,
      fine,
      lostCharge,
      replacementFee: lostCharge.baseReplacementPrice + lostCharge.processingFee,
      overdueFine: lostCharge.overdueFineToDate,
      totalCharged: lostCharge.totalLostCharge,
    };
  });
}
