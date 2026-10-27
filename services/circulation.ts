/**
 * Circulation Desk Service (Phase 8).
 * Pure transaction orchestration integrating the rules engine (rules/).
 * Enforces atomic transactions and SELECT ... FOR UPDATE row-level locking (NFR-R-01).
 */

import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
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
import { getHolidayDateSet } from "./holidays";

// biome-ignore lint/suspicious/noExplicitAny: Generic database instance support for testing
type DbInstance = any;

interface Actor {
  id: number;
  fullName: string;
  ipAddress?: string;
  libraryId?: number;
  roleCode?: string;
}

let cachedSettingsConfig: { data: SystemSettingsConfig; cachedAt: number } | null = null;
const SETTINGS_CONFIG_CACHE_MS = 60 * 1000;

export function invalidateSystemSettingsConfigCache() {
  cachedSettingsConfig = null;
}

/**
 * Loads system settings from database into strongly typed SystemSettingsConfig.
 */
export async function getSystemSettingsConfig(
  db: DbInstance = defaultDb,
): Promise<SystemSettingsConfig> {
  const now = Date.now();
  if (cachedSettingsConfig && now - cachedSettingsConfig.cachedAt < SETTINGS_CONFIG_CACHE_MS) {
    return cachedSettingsConfig.data;
  }

  const rows = await db.select().from(schema.systemSettings);
  const map = new Map<string, string>();
  for (const r of rows) {
    map.set(r.settingKey, r.settingValue);
  }

  const config: SystemSettingsConfig = {
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

  cachedSettingsConfig = { data: config, cachedAt: now };
  return config;
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
      employeeId: schema.patrons.employeeId,
      username: schema.patrons.username,
      firstName: schema.patrons.firstName,
      lastName: schema.patrons.lastName,
      patronType: schema.patrons.patronType,
      categoryId: schema.patrons.categoryId,
      categoryName: schema.patronCategories.name,
      institutionId: schema.patrons.institutionId,
      institutionCode: schema.institutions.code,
      institutionName: schema.institutions.name,
      departmentId: schema.patrons.departmentId,
      departmentName: schema.departments.name,
      courseId: schema.patrons.courseId,
      courseCode: schema.courses.code,
      courseName: schema.courses.name,
      academicYear: schema.patrons.academicYear,
      semester: schema.patrons.semester,
      cardExpiry: schema.patrons.cardExpiry,
      status: schema.patrons.status,
      mobile: schema.patrons.mobile,
      email: schema.patrons.email,
    })
    .from(schema.patrons)
    .innerJoin(schema.patronCategories, eq(schema.patrons.categoryId, schema.patronCategories.id))
    .leftJoin(schema.institutions, eq(schema.patrons.institutionId, schema.institutions.id))
    .leftJoin(schema.departments, eq(schema.patrons.departmentId, schema.departments.id))
    .leftJoin(schema.courses, eq(schema.patrons.courseId, schema.courses.id))
    .where(
      or(
        eq(schema.patrons.cardNo, term),
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
  const holidayDates = await getHolidayDateSet(db);

  const enrichedLoans = activeLoans.map((l: any) => {
    const daysDiff = calendarDaysBetween(today, l.dueDate);
    const isOverdue = daysDiff < 0;
    let daysOverdue = isOverdue ? Math.abs(daysDiff) : 0;
    let holidayExemptDays = 0;

    if (isOverdue && holidayDates.size > 0) {
      const fineCalc = calculateOverdueFine({
        dueDate: l.dueDate,
        returnDate: today,
        finePerDay: 0,
        holidays: holidayDates,
      });
      holidayExemptDays = fineCalc.holidayExemptDays ?? 0;
      daysOverdue = Math.max(0, daysOverdue - holidayExemptDays);
    }

    return {
      ...l,
      daysRemaining: daysDiff,
      isOverdue,
      daysOverdue,
      holidayExemptDays,
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
          libraryId: schema.patrons.libraryId,
          patronType: schema.patrons.patronType,
          status: schema.patrons.status,
          cardExpiry: schema.patrons.cardExpiry,
          firstName: schema.patrons.firstName,
          lastName: schema.patrons.lastName,
        })
        .from(schema.patrons)
        .where(
          or(
            eq(schema.patrons.cardNo, patronTerm),
            eq(schema.patrons.employeeId, patronTerm),
            eq(schema.patrons.username, patronTerm),
          ),
        )
        .limit(1);

      if (!patron) {
        throw new Error(`Patron "${params.patronIdentifier}" not found`);
      }

      // Enforce Multi-Library Boundary: Students can borrow books from their assigned library only
      if (patron.libraryId && copy.libraryId && patron.libraryId !== copy.libraryId) {
        const libRows = await tx
          .select({ id: schema.libraries.id, name: schema.libraries.name })
          .from(schema.libraries)
          .where(inArray(schema.libraries.id, [patron.libraryId, copy.libraryId]));

        const patronLib =
          libRows.find((l: any) => l.id === patron.libraryId)?.name ??
          `Library #${patron.libraryId}`;
        const copyLib =
          libRows.find((l: any) => l.id === copy.libraryId)?.name ?? `Library #${copy.libraryId}`;

        const reason = `Patron is assigned to ${patronLib} and can only borrow books from their assigned library (this copy belongs to ${copyLib}).`;
        // biome-ignore lint/suspicious/noExplicitAny: refusal error metadata
        const err: any = new Error(reason);
        err.isRefusal = true;
        err.refusalAudit = {
          actorType: "STAFF",
          actorId: actor.id,
          actorName: actor.fullName,
          action: "CIRC_REFUSAL",
          entity: "loans",
          entityId: String(copy.id),
          details: `Issue refused for patron ${patron.cardNo} on copy ${copy.accessionNo}: ${reason}`,
          ipAddress: actor.ipAddress,
        };
        throw err;
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
    deskLibraryId?: number;
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
        libraryId: schema.loans.libraryId,
        dueDate: schema.loans.dueDate,
        renewalCount: schema.loans.renewalCount,
      })
      .from(schema.loans)
      .where(and(eq(schema.loans.itemId, copy.id), eq(schema.loans.status, "ISSUED")))
      .for("update");

    if (!activeLoan) {
      throw new Error(`Copy "${copy.accessionNo}" is not currently issued`);
    }

    // Enforce Return Boundary: Books must be returned to the same library from which they were issued
    const returnDeskLibId =
      params.deskLibraryId ??
      (actor.roleCode !== "SUPER_ADMIN" && actor.libraryId ? actor.libraryId : undefined);
    if (returnDeskLibId && activeLoan.libraryId && returnDeskLibId !== activeLoan.libraryId) {
      const libRows = await tx
        .select({ id: schema.libraries.id, name: schema.libraries.name })
        .from(schema.libraries)
        .where(inArray(schema.libraries.id, [activeLoan.libraryId, returnDeskLibId]));

      const issuedLibName =
        libRows.find((l: any) => l.id === activeLoan.libraryId)?.name ??
        `Library #${activeLoan.libraryId}`;
      const returnLibName =
        libRows.find((l: any) => l.id === returnDeskLibId)?.name ??
        `Library #${returnDeskLibId}`;

      throw new Error(
        `This book was issued by ${issuedLibName}. Books must be returned to the same library from which they were issued (current desk: ${returnLibName}).`,
      );
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

    const holidayDates = await getHolidayDateSet(tx, copy.libraryId);

    const fineResult = calculateOverdueFine({
      dueDate: activeLoan.dueDate,
      returnDate: today,
      finePerDay: rule.finePerDay,
      graceDays: rule.graceDays,
      maxFine: rule.maxFine,
      holidays: holidayDates,
    });

    // Check librarian availability in the loan library (fine exemption policy)
    const [loanLibRow] = await tx
      .select({
        id: schema.libraries.id,
        name: schema.libraries.name,
        isLibrarianAvailable: schema.libraries.isLibrarianAvailable,
      })
      .from(schema.libraries)
      .where(eq(schema.libraries.id, activeLoan.libraryId))
      .limit(1);

    const isLibrarianAvailable = loanLibRow ? loanLibRow.isLibrarianAvailable : true;
    let fineExempted = false;
    let fineExemptReason = "";

    if (!isLibrarianAvailable && fineResult.finalOverdueFine > 0) {
      fineExempted = true;
      fineExemptReason = `Librarian marked away/unavailable in ${loanLibRow?.name ?? "library"} — fine exempted`;
      fineResult.finalOverdueFine = 0;
    }

    let fineRecord = null;
    if (fineResult.finalOverdueFine > 0) {
      const exemptNote =
        fineResult.holidayExemptDays && fineResult.holidayExemptDays > 0
          ? `, ${fineResult.holidayExemptDays} holiday days exempted`
          : "";

      const [createdFine] = await tx
        .insert(schema.fines)
        .values({
          patronId: activeLoan.patronId,
          loanId: activeLoan.id,
          amount: sql`${fineResult.finalOverdueFine.toFixed(2)}::numeric`,
          paidAmount: "0.00",
          fineType: "OVERDUE",
          reason: `Overdue return of ${copy.accessionNo} (${fineResult.daysLate} days late${exemptNote}, ${fineResult.chargeableDays} chargeable days)`,
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
            : fineExempted
              ? `. Overdue fine exempted (${fineExemptReason})`
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
      fineExempted,
      fineExemptReason,
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

    // 4. Calculate overdue fine to date (exempting college holidays)
    const holidayDates = await getHolidayDateSet(tx, copy.libraryId);
    const overdueFineRes = calculateOverdueFine({
      dueDate: activeLoan.dueDate,
      returnDate: today,
      finePerDay: rule.finePerDay,
      graceDays: rule.graceDays,
      maxFine: rule.maxFine,
      holidays: holidayDates,
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

export interface CirculationPatronSearchResult {
  id: number;
  cardNo: string;
  employeeId: string | null;
  fullName: string;
  patronType: string;
  categoryId: number;
  categoryName: string;
  departmentId: number | null;
  departmentName: string | null;
  courseId: number | null;
  courseName: string | null;
  institutionId: number | null;
  institutionCode: string | null;
  status: string;
  activeLoansCount: number;
  overdueLoansCount: number;
  totalOutstandingFines: number;
}

/**
 * Searches patrons for circulation desk dropdowns with real-time active loan & fine statistics.
 */
export async function searchPatronsForCirculation(
  options: {
    query?: string;
    identifier?: string;
    patronType?: string;
    institutionId?: number;
    courseId?: number;
    departmentId?: number;
    hasActiveLoans?: boolean;
    limit?: number;
  } = {},
  db: DbInstance = defaultDb,
): Promise<CirculationPatronSearchResult[]> {
  const limit = Math.min(100, Math.max(1, options.limit ?? 30));
  const conditions = [];

  // Match exact or case-insensitive identifier (Card No or Employee ID)
  if (options.identifier?.trim()) {
    const term = options.identifier.trim();
    conditions.push(
      or(
        eq(schema.patrons.cardNo, term),
        eq(schema.patrons.employeeId, term),
        eq(schema.patrons.username, term),
        ilike(schema.patrons.cardNo, term),
        ilike(schema.patrons.employeeId, term),
      ),
    );
  }

  if (options.query?.trim()) {
    const term = `%${options.query.trim()}%`;
    conditions.push(
      or(
        ilike(schema.patrons.cardNo, term),
        ilike(schema.patrons.firstName, term),
        ilike(schema.patrons.lastName, term),
        ilike(schema.patrons.employeeId, term),
        ilike(schema.patrons.email, term),
        ilike(schema.patrons.username, term),
      ),
    );
  }

  // Patron type filter (STUDENT, FACULTY, STAFF)
  if (options.patronType && options.patronType !== "ALL") {
    conditions.push(eq(schema.patrons.patronType, options.patronType));
  }

  // College / Institution filter
  if (options.institutionId) {
    conditions.push(eq(schema.patrons.institutionId, options.institutionId));
  }

  // Course filter
  if (options.courseId) {
    conditions.push(eq(schema.patrons.courseId, options.courseId));
  }

  // Branch / Department filter
  if (options.departmentId) {
    conditions.push(eq(schema.patrons.departmentId, options.departmentId));
  }

  // Active loans subquery
  const activeLoansSq = db
    .select({
      patronId: schema.loans.patronId,
      activeCount: sql<number>`count(*)::int`.as("active_count"),
      overdueCount:
        sql<number>`count(case when ${schema.loans.dueDate} < CURRENT_DATE then 1 end)::int`.as(
          "overdue_count",
        ),
    })
    .from(schema.loans)
    .where(eq(schema.loans.status, "ISSUED"))
    .groupBy(schema.loans.patronId)
    .as("active_loans_sq");

  // Outstanding fines subquery
  const finesSq = db
    .select({
      patronId: schema.fines.patronId,
      finesTotal:
        sql<number>`coalesce(sum(${schema.fines.amount} - ${schema.fines.paidAmount}), 0)::numeric`.as(
          "fines_total",
        ),
    })
    .from(schema.fines)
    .where(eq(schema.fines.status, "OUTSTANDING"))
    .groupBy(schema.fines.patronId)
    .as("fines_sq");

  let query = db
    .select({
      id: schema.patrons.id,
      cardNo: schema.patrons.cardNo,
      employeeId: schema.patrons.employeeId,
      firstName: schema.patrons.firstName,
      lastName: schema.patrons.lastName,
      patronType: schema.patrons.patronType,
      categoryId: schema.patrons.categoryId,
      categoryName: schema.patronCategories.name,
      departmentId: schema.patrons.departmentId,
      departmentName: schema.departments.name,
      courseId: schema.patrons.courseId,
      courseName: schema.courses.name,
      institutionId: schema.patrons.institutionId,
      institutionCode: schema.institutions.code,
      status: schema.patrons.status,
      activeLoansCount: sql<number>`coalesce(${activeLoansSq.activeCount}, 0)::int`,
      overdueLoansCount: sql<number>`coalesce(${activeLoansSq.overdueCount}, 0)::int`,
      totalOutstandingFines: sql<number>`coalesce(${finesSq.finesTotal}, 0)::float`,
    })
    .from(schema.patrons)
    .innerJoin(schema.patronCategories, eq(schema.patrons.categoryId, schema.patronCategories.id))
    .leftJoin(schema.departments, eq(schema.patrons.departmentId, schema.departments.id))
    .leftJoin(schema.courses, eq(schema.patrons.courseId, schema.courses.id))
    .leftJoin(schema.institutions, eq(schema.patrons.institutionId, schema.institutions.id))
    .leftJoin(activeLoansSq, eq(schema.patrons.id, activeLoansSq.patronId))
    .leftJoin(finesSq, eq(schema.patrons.id, finesSq.patronId));

  if (options.hasActiveLoans) {
    conditions.push(sql`coalesce(${activeLoansSq.activeCount}, 0) > 0`);
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  const rows = await query
    .orderBy(desc(sql`coalesce(${activeLoansSq.activeCount}, 0)`), schema.patrons.firstName)
    .limit(limit);

  // biome-ignore lint/suspicious/noExplicitAny: generic row shape
  return rows.map((r: any) => ({
    id: r.id,
    cardNo: r.cardNo,
    employeeId: r.employeeId,
    fullName: [r.firstName, r.lastName].filter(Boolean).join(" "),
    patronType: r.patronType,
    categoryId: r.categoryId,
    categoryName: r.categoryName,
    departmentId: r.departmentId ?? null,
    departmentName: r.departmentName,
    courseId: r.courseId ?? null,
    courseName: r.courseName,
    institutionId: r.institutionId ?? null,
    institutionCode: r.institutionCode,
    status: r.status,
    activeLoansCount: Number(r.activeLoansCount || 0),
    overdueLoansCount: Number(r.overdueLoansCount || 0),
    totalOutstandingFines: Number(r.totalOutstandingFines || 0),
  }));
}

export interface CirculationBookSearchResult {
  itemId: number;
  bibId: number;
  accessionNo: string;
  barcode: string;
  title: string;
  authors: string;
  isbn: string | null;
  callNumber: string | null;
  status: string;
  location: string | null;
  departmentId?: number | null;
  departmentName: string | null;
  // If issued:
  loanId?: number;
  patronId?: number;
  patronName?: string;
  patronCard?: string;
  issueDate?: string;
  dueDate?: string;
  daysOverdue?: number;
  isOverdue?: boolean;
}

/**
 * Searches physical book copies for circulation desk issue & return dropdowns.
 */
export async function searchBooksForCirculation(
  options: {
    query?: string;
    status?: string;
    patronId?: number;
    departmentId?: number;
    institutionId?: number;
    courseId?: number;
    limit?: number;
  } = {},
  db: DbInstance = defaultDb,
): Promise<CirculationBookSearchResult[]> {
  const limit = Math.min(100, Math.max(1, options.limit ?? 30));
  const conditions = [];

  if (options.query?.trim()) {
    const term = `%${options.query.trim()}%`;
    conditions.push(
      or(
        ilike(schema.items.accessionNo, term),
        ilike(schema.items.barcode, term),
        ilike(schema.items.callNumber, term),
        ilike(schema.bibRecords.title, term),
        ilike(schema.bibRecords.authors, term),
        ilike(schema.bibRecords.isbn, term),
      ),
    );
  }

  if (options.status && options.status !== "ALL") {
    conditions.push(eq(schema.items.status, options.status));
  }

  // Active loan subquery
  const activeLoanSq = db
    .select({
      id: schema.loans.id,
      itemId: schema.loans.itemId,
      patronId: schema.loans.patronId,
      issueDate: schema.loans.issueDate,
      dueDate: schema.loans.dueDate,
      patronCard: schema.patrons.cardNo,
      patronFirstName: schema.patrons.firstName,
      patronLastName: schema.patrons.lastName,
    })
    .from(schema.loans)
    .innerJoin(schema.patrons, eq(schema.loans.patronId, schema.patrons.id))
    .where(eq(schema.loans.status, "ISSUED"))
    .as("active_loan_sq");

  if (options.patronId) {
    conditions.push(eq(activeLoanSq.patronId, options.patronId));
  } else {
    // Branch / Department filter on books (only when not querying by specific patron)
    if (options.departmentId) {
      // Engineering branches mapping:
      // If departmentId is an engineering department (CSE: 1, IT: 2, ME: 3, CE: 4, ECE: 5, EE: 6, AI&DS: 49),
      // also include BTECH (13) and DIPLOMA (14) where cataloged engineering books reside.
      const engBranchIds = [1, 2, 3, 4, 5, 6, 49];
      if (engBranchIds.includes(options.departmentId)) {
        conditions.push(inArray(schema.bibRecords.departmentId, [options.departmentId, 13, 14]));
      } else {
        conditions.push(eq(schema.bibRecords.departmentId, options.departmentId));
      }
    } else if (options.institutionId) {
      conditions.push(eq(schema.departments.institutionId, options.institutionId));
    }
  }

  let query = db
    .select({
      itemId: schema.items.id,
      bibId: schema.bibRecords.id,
      accessionNo: schema.items.accessionNo,
      barcode: schema.items.barcode,
      title: schema.bibRecords.title,
      authors: schema.bibRecords.authors,
      isbn: schema.bibRecords.isbn,
      callNumber: sql<
        string | null
      >`coalesce(${schema.items.callNumber}, ${schema.bibRecords.callNumber})`,
      status: schema.items.status,
      location: schema.items.location,
      departmentId: schema.bibRecords.departmentId,
      departmentName: schema.departments.name,
      loanId: activeLoanSq.id,
      loanPatronId: activeLoanSq.patronId,
      loanPatronCard: activeLoanSq.patronCard,
      loanPatronFirstName: activeLoanSq.patronFirstName,
      loanPatronLastName: activeLoanSq.patronLastName,
      issueDate: activeLoanSq.issueDate,
      dueDate: activeLoanSq.dueDate,
    })
    .from(schema.items)
    .innerJoin(schema.bibRecords, eq(schema.items.bibId, schema.bibRecords.id))
    .leftJoin(schema.departments, eq(schema.bibRecords.departmentId, schema.departments.id))
    .leftJoin(activeLoanSq, eq(schema.items.id, activeLoanSq.itemId));

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  const rows = await query
    .orderBy(
      options.status === "ISSUED" ? desc(activeLoanSq.issueDate) : schema.bibRecords.title,
      schema.items.accessionNo,
    )
    .limit(limit);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // biome-ignore lint/suspicious/noExplicitAny: generic row shape
  return rows.map((r: any) => {
    let daysOverdue = 0;
    let isOverdue = false;
    if (r.dueDate) {
      const due = new Date(r.dueDate);
      due.setHours(0, 0, 0, 0);
      const diffMs = today.getTime() - due.getTime();
      if (diffMs > 0) {
        daysOverdue = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        isOverdue = true;
      }
    }

    const patronName = r.loanPatronFirstName
      ? [r.loanPatronFirstName, r.loanPatronLastName].filter(Boolean).join(" ")
      : undefined;

    return {
      itemId: r.itemId,
      bibId: r.bibId,
      accessionNo: r.accessionNo,
      barcode: r.barcode,
      title: r.title,
      authors: r.authors,
      isbn: r.isbn,
      callNumber: r.callNumber,
      status: r.status,
      location: r.location,
      departmentId: r.departmentId ?? null,
      departmentName: r.departmentName,
      loanId: r.loanId ?? undefined,
      patronId: r.loanPatronId ?? undefined,
      patronName,
      patronCard: r.loanPatronCard ?? undefined,
      issueDate: r.issueDate ? String(r.issueDate) : undefined,
      dueDate: r.dueDate ? String(r.dueDate) : undefined,
      daysOverdue,
      isOverdue,
    };
  });
}
