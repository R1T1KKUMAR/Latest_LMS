/**
 * No-Dues Clearance Service (Phase 11).
 * Verifies borrowing liabilities and unpaid fines, issues clearance certificates,
 * and manages optional account graduation/closure (FR-ND-01, FR-ND-02, UC-09, T-21).
 */

import { and, desc, eq, or, sql } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import * as schema from "@/db/schema";
import { recordAuditLog } from "./audit";

// biome-ignore lint/suspicious/noExplicitAny: generic DB instance support
type DbInstance = any;

export interface StaffActor {
  id: number;
  fullName: string;
  actorType?: "STAFF";
  ipAddress?: string;
}

export interface PendingLoanItem {
  id: number;
  itemId: number;
  accessionNo: string;
  barcode: string;
  title: string;
  issueDate: string;
  dueDate: string;
  returnShortcutUrl: string;
}

export interface PendingFineItem {
  id: number;
  loanId: number | null;
  fineType: string;
  reason: string;
  amount: string;
  paidAmount: string;
  remainingBalance: number;
  finesShortcutUrl: string;
}

export interface NoDuesEligibilityResult {
  patron: {
    id: number;
    cardNo: string;
    employeeId: string | null;
    firstName: string;
    lastName: string | null;
    fullName: string;
    patronType: string;
    categoryName: string;
    departmentName: string | null;
    institutionName: string | null;
    status: string;
    cardExpiry: string;
    email: string | null;
    mobile: string | null;
  };
  pendingLoans: PendingLoanItem[];
  pendingFines: PendingFineItem[];
  activeLoansCount: number;
  totalUnpaidFines: number;
  isEligible: boolean;
  refusalReasons: string[];
}

export interface IssueCertificateParams {
  patronId: number;
  closeAccount?: boolean; // Defaults to true (marks status as GRADUATED)
  remarks?: string;
  referenceDate?: Date;
}

export interface IssuedCertificateResult {
  success: boolean;
  certificateNo: string;
  patronId: number;
  patronCardNo: string;
  patronName: string;
  issueDate: string;
  issuedByName: string;
  accountStatus: string;
  closedAccount: boolean;
  remarks?: string;
}

export interface CertificateDetails {
  certificateNo: string;
  issueDate: string;
  academicSession: string;
  institutionName: string;
  libraryName: string;
  patron: {
    id: number;
    cardNo: string;
    employeeId: string | null;
    fullName: string;
    patronType: string;
    categoryName: string;
    departmentName: string;
    courseName: string;
    institutionName: string;
    status: string;
    mobile: string | null;
    email: string | null;
  };
  issuedByName: string;
  remarks?: string;
}

export interface RecentClearanceRecord {
  id: number;
  certificateNo: string;
  patronId: number;
  patronName: string;
  patronCardNo: string;
  issuedByName: string;
  issuedAt: Date;
  status: string;
}

/**
 * Checks a patron's borrowing balance and penalty liabilities for No-Dues clearance (FR-ND-01).
 */
export async function checkNoDuesEligibility(
  identifier: string | number,
  db: DbInstance = defaultDb,
): Promise<NoDuesEligibilityResult> {
  const term = String(identifier).trim();
  const parsedInt = Number(term);
  const isValidIntegerId = Number.isInteger(parsedInt) && parsedInt > 0 && parsedInt <= 2147483647;

  // 1. Lookup Patron with related category, department, and institution
  const patronQuery = db
    .select({
      id: schema.patrons.id,
      cardNo: schema.patrons.cardNo,
      employeeId: schema.patrons.employeeId,
      firstName: schema.patrons.firstName,
      lastName: schema.patrons.lastName,
      patronType: schema.patrons.patronType,
      status: schema.patrons.status,
      cardExpiry: schema.patrons.cardExpiry,
      email: schema.patrons.email,
      mobile: schema.patrons.mobile,
      categoryName: schema.patronCategories.name,
      departmentName: schema.departments.name,
      institutionName: schema.institutions.name,
    })
    .from(schema.patrons)
    .innerJoin(schema.patronCategories, eq(schema.patronCategories.id, schema.patrons.categoryId))
    .leftJoin(schema.departments, eq(schema.departments.id, schema.patrons.departmentId))
    .leftJoin(schema.institutions, eq(schema.institutions.id, schema.patrons.institutionId));

  const whereConditions = [
    eq(schema.patrons.cardNo, term),
    eq(schema.patrons.employeeId, term),
    eq(schema.patrons.username, term),
  ];

  if (isValidIntegerId) {
    whereConditions.push(eq(schema.patrons.id, parsedInt));
  }

  const [patron] = await patronQuery.where(or(...whereConditions)).limit(1);

  if (!patron) {
    throw new Error(`Patron '${identifier}' not found`);
  }

  // 2. Query active book loans (status = 'ISSUED')
  const loans = await db
    .select({
      id: schema.loans.id,
      itemId: schema.loans.itemId,
      accessionNo: schema.items.accessionNo,
      barcode: schema.items.barcode,
      title: schema.bibRecords.title,
      issueDate: schema.loans.issueDate,
      dueDate: schema.loans.dueDate,
    })
    .from(schema.loans)
    .innerJoin(schema.items, eq(schema.loans.itemId, schema.items.id))
    .innerJoin(schema.bibRecords, eq(schema.items.bibId, schema.bibRecords.id))
    .where(and(eq(schema.loans.patronId, patron.id), eq(schema.loans.status, "ISSUED")));

  const pendingLoans: PendingLoanItem[] = loans.map((l: any) => ({
    id: l.id,
    itemId: l.itemId,
    accessionNo: l.accessionNo,
    barcode: l.barcode,
    title: l.title,
    issueDate: String(l.issueDate),
    dueDate: String(l.dueDate),
    returnShortcutUrl: `/circulation/return?term=${encodeURIComponent(l.barcode || l.accessionNo)}`,
  }));

  // 3. Query outstanding fines (status = 'OUTSTANDING')
  const fines = await db
    .select({
      id: schema.fines.id,
      loanId: schema.fines.loanId,
      fineType: schema.fines.fineType,
      reason: schema.fines.reason,
      amount: schema.fines.amount,
      paidAmount: schema.fines.paidAmount,
    })
    .from(schema.fines)
    .where(and(eq(schema.fines.patronId, patron.id), eq(schema.fines.status, "OUTSTANDING")));

  let totalUnpaidFines = 0;
  const pendingFines: PendingFineItem[] = fines.map((f: any) => {
    const orig = Number(f.amount || 0);
    const paid = Number(f.paidAmount || 0);
    const remaining = Math.max(0, Number((orig - paid).toFixed(2)));
    totalUnpaidFines = Number((totalUnpaidFines + remaining).toFixed(2));
    return {
      id: f.id,
      loanId: f.loanId,
      fineType: f.fineType,
      reason: f.reason,
      amount: orig.toFixed(2),
      paidAmount: paid.toFixed(2),
      remainingBalance: remaining,
      finesShortcutUrl: `/fines?cardNo=${encodeURIComponent(patron.cardNo)}`,
    };
  });

  // 4. Determine eligibility and build refusal reasons
  const refusalReasons: string[] = [];

  if (pendingLoans.length > 0) {
    refusalReasons.push(
      `Patron has ${pendingLoans.length} active book loan(s) that must be returned before clearance.`,
    );
  }

  if (totalUnpaidFines > 0) {
    refusalReasons.push(
      `Patron has ₹${totalUnpaidFines.toFixed(2)} in outstanding fine liabilities that must be settled.`,
    );
  }

  if (patron.status === "GRADUATED") {
    refusalReasons.push(
      "Patron account is already marked as GRADUATED (clearance previously completed).",
    );
  } else if (patron.status === "LEFT") {
    refusalReasons.push("Patron account is marked as LEFT (discontinued).");
  }

  const isEligible =
    pendingLoans.length === 0 &&
    totalUnpaidFines === 0 &&
    patron.status !== "GRADUATED" &&
    patron.status !== "LEFT";

  return {
    patron: {
      id: patron.id,
      cardNo: patron.cardNo,
      employeeId: patron.employeeId,
      firstName: patron.firstName,
      lastName: patron.lastName,
      fullName: [patron.firstName, patron.lastName].filter(Boolean).join(" "),
      patronType: patron.patronType,
      categoryName: patron.categoryName,
      departmentName: patron.departmentName,
      institutionName: patron.institutionName,
      status: patron.status,
      cardExpiry: String(patron.cardExpiry),
      email: patron.email,
      mobile: patron.mobile,
    },
    pendingLoans,
    pendingFines,
    activeLoansCount: pendingLoans.length,
    totalUnpaidFines,
    isEligible,
    refusalReasons,
  };
}

/**
 * Issues an official No-Dues Clearance Certificate and optionally graduates the patron account (FR-ND-02, UC-09, T-21).
 */
export async function issueNoDuesCertificate(
  params: IssueCertificateParams,
  actor: StaffActor,
  db: DbInstance = defaultDb,
): Promise<IssuedCertificateResult> {
  const closeAccount = params.closeAccount ?? true;

  return await db.transaction(async (tx: any) => {
    // 1. Lock patron row
    const [patron] = await tx
      .select()
      .from(schema.patrons)
      .where(eq(schema.patrons.id, params.patronId))
      .for("update");

    if (!patron) {
      throw new Error(`Patron with ID ${params.patronId} not found`);
    }

    if (patron.status === "GRADUATED") {
      throw new Error(
        `Patron ${patron.cardNo} is already GRADUATED. Clearance certificate has already been issued.`,
      );
    }

    // 2. Verify active loans = 0
    const [activeLoanCountResult] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.loans)
      .where(and(eq(schema.loans.patronId, patron.id), eq(schema.loans.status, "ISSUED")));

    const activeLoanCount = Number(activeLoanCountResult?.count ?? 0);
    if (activeLoanCount > 0) {
      throw new Error(
        `Cannot issue No-Dues clearance: Patron has ${activeLoanCount} active book loan(s) that must be returned first.`,
      );
    }

    // 3. Verify outstanding fines = 0
    const outstandingFines = await tx
      .select({
        amount: schema.fines.amount,
        paidAmount: schema.fines.paidAmount,
      })
      .from(schema.fines)
      .where(and(eq(schema.fines.patronId, patron.id), eq(schema.fines.status, "OUTSTANDING")));

    let totalBalance = 0;
    for (const f of outstandingFines) {
      const remaining = Number(f.amount || 0) - Number(f.paidAmount || 0);
      if (remaining > 0) {
        totalBalance += remaining;
      }
    }

    if (totalBalance > 0) {
      throw new Error(
        `Cannot issue No-Dues clearance: Patron has ₹${totalBalance.toFixed(2)} in outstanding fine(s) that must be settled first.`,
      );
    }

    // 4. Generate Certificate Reference Number: ND-<YYYY>-<5-digit patron ID>
    const refDate = params.referenceDate || new Date();
    const year = refDate.getFullYear();
    const certificateNo = `ND-${year}-${String(patron.id).padStart(5, "0")}`;
    const issueDateStr = refDate.toISOString().split("T")[0];

    // 5. Optionally update patron status to GRADUATED
    let newStatus = patron.status;
    if (closeAccount) {
      newStatus = "GRADUATED";
      await tx
        .update(schema.patrons)
        .set({
          status: "GRADUATED",
          updatedAt: new Date(),
        })
        .where(eq(schema.patrons.id, patron.id));
    }

    // 6. Record NODUES audit trail
    const patronName = [patron.firstName, patron.lastName].filter(Boolean).join(" ");
    await recordAuditLog(
      {
        actorType: "STAFF",
        actorId: actor.id,
        actorName: actor.fullName,
        action: "NODUES",
        entity: "patrons",
        entityId: String(patron.id),
        details: `Issued No-Dues Certificate ${certificateNo} for patron ${patron.cardNo} (${patronName}). Status: ${newStatus}.${params.remarks ? ` Remarks: ${params.remarks}` : ""}`,
        ipAddress: actor.ipAddress,
      },
      tx,
    );

    return {
      success: true,
      certificateNo,
      patronId: patron.id,
      patronCardNo: patron.cardNo,
      patronName,
      issueDate: issueDateStr,
      issuedByName: actor.fullName,
      accountStatus: newStatus,
      closedAccount: closeAccount,
      remarks: params.remarks,
    };
  });
}

/**
 * Retrieves full printable No-Dues Clearance Certificate details (FR-ND-02, FR-PR-02).
 */
export async function getNoDuesCertificateDetails(
  patronIdOrCertNo: string | number,
  db: DbInstance = defaultDb,
): Promise<CertificateDetails | null> {
  const term = String(patronIdOrCertNo).trim();
  let patronId: number | null = null;

  if (/^ND-\d{4}-\d+$/i.test(term)) {
    const parts = term.split("-");
    patronId = parseInt(parts[2], 10);
  } else if (/^\d+$/.test(term)) {
    const num = Number(term);
    if (num > 0 && num <= 2147483647) {
      patronId = num;
    }
  }

  // 1. Fetch patron with full relations
  const patronQuery = db
    .select({
      id: schema.patrons.id,
      cardNo: schema.patrons.cardNo,
      employeeId: schema.patrons.employeeId,
      firstName: schema.patrons.firstName,
      lastName: schema.patrons.lastName,
      patronType: schema.patrons.patronType,
      status: schema.patrons.status,
      mobile: schema.patrons.mobile,
      email: schema.patrons.email,
      categoryName: schema.patronCategories.name,
      departmentName: schema.departments.name,
      courseName: schema.courses.name,
      institutionName: schema.institutions.name,
    })
    .from(schema.patrons)
    .innerJoin(schema.patronCategories, eq(schema.patronCategories.id, schema.patrons.categoryId))
    .leftJoin(schema.departments, eq(schema.departments.id, schema.patrons.departmentId))
    .leftJoin(schema.courses, eq(schema.courses.id, schema.patrons.courseId))
    .leftJoin(schema.institutions, eq(schema.institutions.id, schema.patrons.institutionId));

  let patronsMatched = [];
  if (patronId) {
    patronsMatched = await patronQuery.where(eq(schema.patrons.id, patronId)).limit(1);
  } else {
    patronsMatched = await patronQuery
      .where(or(eq(schema.patrons.cardNo, term), eq(schema.patrons.employeeId, term)))
      .limit(1);
  }

  const patron = patronsMatched[0];
  if (!patron) return null;

  // 2. Fetch the latest NODUES audit log for this patron
  const [auditLog] = await db
    .select()
    .from(schema.auditLogs)
    .where(
      and(
        eq(schema.auditLogs.action, "NODUES"),
        eq(schema.auditLogs.entity, "patrons"),
        eq(schema.auditLogs.entityId, String(patron.id)),
      ),
    )
    .orderBy(desc(schema.auditLogs.id))
    .limit(1);

  // If no clearance was ever recorded and patron isn't GRADUATED, certificate does not exist
  if (!auditLog && patron.status !== "GRADUATED") {
    return null;
  }

  // 3. System settings
  const settingRows = await db.select().from(schema.systemSettings);
  const settingsMap = new Map<string, string>();
  for (const s of settingRows) {
    settingsMap.set(s.settingKey, s.settingValue);
  }

  const certYear = auditLog ? new Date(auditLog.createdAt).getFullYear() : new Date().getFullYear();
  const certificateNo = `ND-${certYear}-${String(patron.id).padStart(5, "0")}`;
  const issueDate = auditLog
    ? auditLog.createdAt.toISOString().split("T")[0]
    : new Date().toISOString().split("T")[0];

  return {
    certificateNo,
    issueDate,
    academicSession: settingsMap.get("ACADEMIC_SESSION") || "2026-27",
    institutionName:
      patron.institutionName ||
      settingsMap.get("INSTITUTE_NAME") ||
      "RBMI Group of Institutions, Bareilly",
    libraryName: settingsMap.get("LIBRARY_NAME") || "RBMI Central Library",
    patron: {
      id: patron.id,
      cardNo: patron.cardNo,
      employeeId: patron.employeeId,
      fullName: [patron.firstName, patron.lastName].filter(Boolean).join(" "),
      patronType: patron.patronType,
      categoryName: patron.categoryName,
      departmentName: patron.departmentName || "General Studies",
      courseName: patron.courseName || "Undergraduate / Postgraduate",
      institutionName: patron.institutionName || "RBMI",
      status: patron.status,
      mobile: patron.mobile,
      email: patron.email,
    },
    issuedByName: auditLog?.actorName || "Head Librarian",
    remarks: auditLog?.details || "All library materials returned and dues cleared.",
  };
}

/**
 * Lists historical/recent No-Dues clearances issued by staff.
 */
export async function listRecentClearances(
  limit = 20,
  db: DbInstance = defaultDb,
): Promise<RecentClearanceRecord[]> {
  const auditRows = await db
    .select({
      id: schema.auditLogs.id,
      entityId: schema.auditLogs.entityId,
      actorName: schema.auditLogs.actorName,
      createdAt: schema.auditLogs.createdAt,
      details: schema.auditLogs.details,
    })
    .from(schema.auditLogs)
    .where(and(eq(schema.auditLogs.action, "NODUES"), eq(schema.auditLogs.entity, "patrons")))
    .orderBy(desc(schema.auditLogs.id))
    .limit(limit);

  if (auditRows.length === 0) return [];

  const patronIds = auditRows
    .map((a: any) => parseInt(a.entityId || "0", 10))
    .filter((id: number) => id > 0);

  const patronRows = await db
    .select({
      id: schema.patrons.id,
      cardNo: schema.patrons.cardNo,
      firstName: schema.patrons.firstName,
      lastName: schema.patrons.lastName,
      status: schema.patrons.status,
    })
    .from(schema.patrons)
    .where(sql`${schema.patrons.id} IN ${patronIds}`);

  const patronMap = new Map<number, any>(patronRows.map((p: any) => [p.id, p]));

  return auditRows.map((a: any) => {
    const pid = parseInt(a.entityId || "0", 10);
    const p = patronMap.get(pid);
    const year = new Date(a.createdAt).getFullYear();
    const certNo = `ND-${year}-${String(pid).padStart(5, "0")}`;

    return {
      id: a.id,
      certificateNo: certNo,
      patronId: pid,
      patronName: p ? [p.firstName, p.lastName].filter(Boolean).join(" ") : `Patron #${pid}`,
      patronCardNo: p?.cardNo || "N/A",
      issuedByName: a.actorName,
      issuedAt: a.createdAt,
      status: p?.status || "GRADUATED",
    };
  });
}
