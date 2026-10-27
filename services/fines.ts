/**
 * Fines & Payments Service (Phase 10).
 * Orchestrates fine queries, payment collection, partial/full settlements,
 * authorized waivers, receipt sequence generation, and printable receipts (FR-FI-01 to FR-FI-05, UC-08).
 */

import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import * as schema from "@/db/schema";
import { formatDateIso } from "@/rules";
import { recordAuditLog } from "./audit";

// biome-ignore lint/suspicious/noExplicitAny: generic DB instance support
type DbInstance = any;

export interface Actor {
  id: number;
  fullName: string;
  actorType: "STAFF" | "PATRON";
  ipAddress?: string;
}

export type PaymentMethod = "CASH" | "UPI" | "CARD" | "ONLINE";

export interface CollectPaymentParams {
  fineId: number;
  amount: number;
  paymentMethod: PaymentMethod;
  remarks?: string;
  referenceDate?: string | Date;
}

export interface WaiveFineParams {
  fineId: number;
  remarks?: string;
  referenceDate?: string | Date;
}

export interface FineListItem {
  id: number;
  patronId: number;
  patronName: string;
  patronCard: string;
  patronMobile: string | null;
  loanId: number | null;
  fineType: string;
  reason: string;
  amount: string;
  paidAmount: string;
  balanceAmount: string;
  status: string;
  createdAt: Date | string;
  createdByName: string;
}

export interface ReceiptDetails {
  paymentId: number;
  receiptNo: string;
  paymentDate: Date | string;
  paymentMethod: string;
  amount: string;
  remarks: string | null;
  receivedByName: string;
  patron: {
    id: number;
    name: string;
    cardNo: string;
    employeeId: string | null;
    patronType: string;
    mobile: string | null;
  };
  fine: {
    id: number;
    fineType: string;
    reason: string;
    originalAmount: string;
    totalPaid: string;
    remainingBalance: string;
    status: string;
  };
  institutionName: string;
  libraryName: string;
}

/**
 * Generates the next sequential receipt number per SRS format:
 * <RECEIPT_PREFIX>-<YYYY>-<5-digit sequence> (e.g., RCPT-2026-00001) from seq_receipt_no.
 */
export async function generateReceiptNumber(
  db: DbInstance = defaultDb,
  referenceDate: string | Date = new Date(),
): Promise<string> {
  const dateObj = new Date(referenceDate);
  const year = dateObj.getFullYear();

  // Get RECEIPT_PREFIX from system_settings
  const [prefixRow] = await db
    .select({ val: schema.systemSettings.settingValue })
    .from(schema.systemSettings)
    .where(eq(schema.systemSettings.settingKey, "RECEIPT_PREFIX"))
    .limit(1);

  const prefix = prefixRow?.val || "RCPT";

  // Next value from PostgreSQL sequence seq_receipt_no
  const seqRes = await db.execute(sql`SELECT nextval('seq_receipt_no') AS seq;`);
  const seqNum = Number(seqRes?.rows?.[0]?.seq ?? 1);
  const paddedSeq = String(seqNum).padStart(5, "0");

  return `${prefix}-${year}-${paddedSeq}`;
}

let cachedDefaultFines: {
  limit: number;
  data: {
    fines: FineListItem[];
    totalCount: number;
    totalOutstandingAmount: number;
  };
  cachedAt: number;
} | null = null;

export function invalidateFinesCache() {
  cachedDefaultFines = null;
}

/**
 * Lists fines with patron details, amounts, and remaining balances (FR-FI-01).
 */
export async function listFines(
  filters: {
    patronId?: number;
    cardNo?: string;
    status?: string | string[];
    fineType?: string;
    search?: string;
    limit?: number;
    offset?: number;
  } = {},
  db: DbInstance = defaultDb,
): Promise<{
  fines: FineListItem[];
  totalCount: number;
  totalOutstandingAmount: number;
}> {
  const isDefault =
    !filters.patronId &&
    !filters.cardNo &&
    !filters.status &&
    !filters.fineType &&
    !filters.search &&
    (!filters.offset || filters.offset === 0);
  const limit = filters.limit ?? 100;
  const now = Date.now();

  if (isDefault && cachedDefaultFines && cachedDefaultFines.limit === limit && now - cachedDefaultFines.cachedAt < 15000) {
    return cachedDefaultFines.data;
  }
  let query = db
    .select({
      id: schema.fines.id,
      patronId: schema.fines.patronId,
      loanId: schema.fines.loanId,
      fineType: schema.fines.fineType,
      reason: schema.fines.reason,
      amount: schema.fines.amount,
      paidAmount: schema.fines.paidAmount,
      status: schema.fines.status,
      createdAt: schema.fines.createdAt,
      patronFirstName: schema.patrons.firstName,
      patronLastName: schema.patrons.lastName,
      patronCardNo: schema.patrons.cardNo,
      patronMobile: schema.patrons.mobile,
      createdByName: schema.users.fullName,
    })
    .from(schema.fines)
    .innerJoin(schema.patrons, eq(schema.fines.patronId, schema.patrons.id))
    .innerJoin(schema.users, eq(schema.fines.createdBy, schema.users.id));

  const conditions = [];

  if (filters.patronId) {
    conditions.push(eq(schema.fines.patronId, filters.patronId));
  }

  if (filters.cardNo) {
    conditions.push(eq(schema.patrons.cardNo, filters.cardNo));
  }

  if (filters.status) {
    if (Array.isArray(filters.status)) {
      conditions.push(inArray(schema.fines.status, filters.status));
    } else {
      conditions.push(eq(schema.fines.status, filters.status));
    }
  }

  if (filters.fineType) {
    conditions.push(eq(schema.fines.fineType, filters.fineType));
  }

  if (filters.search && filters.search.trim()) {
    const term = `%${filters.search.trim().toLowerCase()}%`;
    conditions.push(
      or(
        sql`lower(${schema.patrons.firstName}) LIKE ${term}`,
        sql`lower(${schema.patrons.lastName}) LIKE ${term}`,
        sql`lower(${schema.patrons.cardNo}) LIKE ${term}`,
        sql`lower(${schema.fines.reason}) LIKE ${term}`,
      ),
    );
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  const rawRows = await query
    .orderBy(desc(schema.fines.id))
    .limit(filters.limit ?? 100)
    .offset(filters.offset ?? 0);

  let totalOutstandingAmount = 0;

  const fines: FineListItem[] = rawRows.map((r: any) => {
    const amountNum = Number(r.amount);
    const paidNum = Number(r.paidAmount);
    const balanceNum = Math.max(0, Number((amountNum - paidNum).toFixed(2)));

    if (r.status === "OUTSTANDING") {
      totalOutstandingAmount += balanceNum;
    }

    return {
      id: r.id,
      patronId: r.patronId,
      patronName: [r.patronFirstName, r.patronLastName].filter(Boolean).join(" "),
      patronCard: r.patronCardNo,
      patronMobile: r.patronMobile,
      loanId: r.loanId,
      fineType: r.fineType,
      reason: r.reason,
      amount: Number(r.amount).toFixed(2),
      paidAmount: Number(r.paidAmount).toFixed(2),
      balanceAmount: balanceNum.toFixed(2),
      status: r.status,
      createdAt: r.createdAt,
      createdByName: r.createdByName,
    };
  });

  const result = {
    fines,
    totalCount: fines.length,
    totalOutstandingAmount: Number(totalOutstandingAmount.toFixed(2)),
  };

  if (isDefault) {
    cachedDefaultFines = { limit, data: result, cachedAt: now };
  }

  return result;
}

/**
 * Collects a fine payment (partial or full) against an outstanding fine (FR-FI-02, UC-08).
 * Executes in a strict database transaction with row locking on the target fine.
 */
export async function collectPayment(
  params: CollectPaymentParams,
  actor: Actor,
  db: DbInstance = defaultDb,
) {
  const paymentAmount = Number(params.amount);

  if (Number.isNaN(paymentAmount) || paymentAmount <= 0) {
    throw new Error("Payment amount must be greater than zero");
  }

  const validMethods: PaymentMethod[] = ["CASH", "UPI", "CARD", "ONLINE"];
  if (!validMethods.includes(params.paymentMethod)) {
    throw new Error(
      `Invalid payment method '${params.paymentMethod}'. Allowed methods: ${validMethods.join(", ")}`,
    );
  }

  const today = params.referenceDate ? new Date(params.referenceDate) : new Date();

  return await db.transaction(async (tx: DbInstance) => {
    // 1. Fetch Target Fine with Row Lock
    const [fine] = await tx
      .select()
      .from(schema.fines)
      .where(eq(schema.fines.id, params.fineId))
      .for("update");

    if (!fine) {
      throw new Error(`Fine #${params.fineId} not found`);
    }

    if (fine.status !== "OUTSTANDING") {
      throw new Error(`Fine #${params.fineId} cannot accept payment (status: '${fine.status}')`);
    }

    const currentTotal = Number(fine.amount);
    const currentPaid = Number(fine.paidAmount);
    const currentBalance = Number((currentTotal - currentPaid).toFixed(2));

    if (paymentAmount > currentBalance) {
      throw new Error(
        `Payment amount (₹${paymentAmount.toFixed(2)}) exceeds outstanding balance (₹${currentBalance.toFixed(2)})`,
      );
    }

    // 2. Generate Unique Sequential Receipt Number
    const receiptNo = await generateReceiptNumber(tx, today);

    // 3. Calculate New Balances and State Transition
    const newPaidAmount = Number((currentPaid + paymentAmount).toFixed(2));
    const nextStatus = newPaidAmount >= currentTotal ? "PAID" : "OUTSTANDING";
    const remainingBalance = Number((currentTotal - newPaidAmount).toFixed(2));

    // 4. Update Fine Record
    const [updatedFine] = await tx
      .update(schema.fines)
      .set({
        paidAmount: sql`${newPaidAmount.toFixed(2)}::numeric`,
        status: nextStatus,
        updatedAt: new Date(),
      })
      .where(eq(schema.fines.id, fine.id))
      .returning();

    // 5. Insert Payment Record
    const [createdPayment] = await tx
      .insert(schema.payments)
      .values({
        fineId: fine.id,
        patronId: fine.patronId,
        amount: sql`${paymentAmount.toFixed(2)}::numeric`,
        paymentMethod: params.paymentMethod,
        receiptNo,
        remarks: params.remarks?.trim() || null,
        receivedBy: actor.id,
        paymentDate: today,
      })
      .returning();

    // 6. Fetch Patron Card for Audit Log
    const [patron] = await tx
      .select({ cardNo: schema.patrons.cardNo })
      .from(schema.patrons)
      .where(eq(schema.patrons.id, fine.patronId))
      .limit(1);

    // 7. Audit Log Entry
    await recordAuditLog(
      {
        actorType: actor.actorType,
        actorId: actor.id,
        actorName: actor.fullName,
        action: "PAYMENT",
        entity: "payments",
        entityId: String(createdPayment.id),
        details: `Payment of ₹${paymentAmount.toFixed(2)} received via ${params.paymentMethod} for fine #${fine.id} (Receipt: ${receiptNo}). Patron: ${patron?.cardNo ?? fine.patronId}. Fine status: ${nextStatus}. Remaining balance: ₹${remainingBalance.toFixed(2)}.`,
        ipAddress: actor.ipAddress,
      },
      tx,
    );

    invalidateFinesCache();
    return {
      success: true,
      payment: createdPayment,
      fine: updatedFine,
      receiptNo,
      paidAmount: paymentAmount,
      remainingBalance,
      isFullPayment: nextStatus === "PAID",
    };
  });
}

/**
 * Waives the remaining balance of an outstanding fine with authorized remarks (FR-FI-04, UC-08).
 * Executes in a database transaction, updates fine status to WAIVED, creates a WAIVED payment record, and audits.
 */
export async function waiveFine(params: WaiveFineParams, actor: Actor, db: DbInstance = defaultDb) {
  const today = params.referenceDate ? new Date(params.referenceDate) : new Date();

  return await db.transaction(async (tx: DbInstance) => {
    // 1. Fetch Target Fine with Row Lock
    const [fine] = await tx
      .select()
      .from(schema.fines)
      .where(eq(schema.fines.id, params.fineId))
      .for("update");

    if (!fine) {
      throw new Error(`Fine #${params.fineId} not found`);
    }

    if (fine.status !== "OUTSTANDING") {
      throw new Error(`Cannot waive fine #${params.fineId} with status '${fine.status}'`);
    }

    const currentTotal = Number(fine.amount);
    const currentPaid = Number(fine.paidAmount);
    const waivedAmount = Number((currentTotal - currentPaid).toFixed(2));

    if (waivedAmount <= 0) {
      throw new Error(`Fine #${params.fineId} has zero outstanding balance to waive`);
    }

    // 2. Generate Receipt Number for Waiver Audit Trail
    const receiptNo = await generateReceiptNumber(tx, today);

    // 3. Transition Fine to WAIVED
    const [updatedFine] = await tx
      .update(schema.fines)
      .set({
        status: "WAIVED",
        updatedAt: new Date(),
      })
      .where(eq(schema.fines.id, fine.id))
      .returning();

    // 4. Insert Waiver Record in payments table (method 'WAIVED')
    const waiverRemarks =
      params.remarks?.trim() || "Fine balance waived by authorized library administrator";

    const [createdPayment] = await tx
      .insert(schema.payments)
      .values({
        fineId: fine.id,
        patronId: fine.patronId,
        amount: sql`${waivedAmount.toFixed(2)}::numeric`,
        paymentMethod: "WAIVED",
        receiptNo,
        remarks: waiverRemarks,
        receivedBy: actor.id,
        paymentDate: today,
      })
      .returning();

    // 5. Fetch Patron Card for Audit Log
    const [patron] = await tx
      .select({ cardNo: schema.patrons.cardNo })
      .from(schema.patrons)
      .where(eq(schema.patrons.id, fine.patronId))
      .limit(1);

    // 6. Audit Log Entry
    await recordAuditLog(
      {
        actorType: actor.actorType,
        actorId: actor.id,
        actorName: actor.fullName,
        action: "FINE_WAIVE",
        entity: "fines",
        entityId: String(fine.id),
        details: `Waived ₹${waivedAmount.toFixed(2)} on fine #${fine.id} (Receipt: ${receiptNo}). Reason: ${waiverRemarks}. Patron: ${patron?.cardNo ?? fine.patronId}.`,
        ipAddress: actor.ipAddress,
      },
      tx,
    );

    invalidateFinesCache();
    return {
      success: true,
      payment: createdPayment,
      fine: updatedFine,
      receiptNo,
      waivedAmount,
    };
  });
}

/**
 * Retrieves full receipt details for printing or audit review (FR-FI-03, FR-PR-02).
 */
export async function getReceiptDetails(
  receiptNoOrId: string | number,
  db: DbInstance = defaultDb,
): Promise<ReceiptDetails | null> {
  let paymentQuery = db
    .select({
      paymentId: schema.payments.id,
      receiptNo: schema.payments.receiptNo,
      paymentDate: schema.payments.paymentDate,
      paymentMethod: schema.payments.paymentMethod,
      amount: schema.payments.amount,
      remarks: schema.payments.remarks,
      receivedByName: schema.users.fullName,
      fineId: schema.fines.id,
      fineType: schema.fines.fineType,
      fineReason: schema.fines.reason,
      originalAmount: schema.fines.amount,
      totalPaid: schema.fines.paidAmount,
      fineStatus: schema.fines.status,
      patronId: schema.patrons.id,
      patronFirstName: schema.patrons.firstName,
      patronLastName: schema.patrons.lastName,
      patronCardNo: schema.patrons.cardNo,
      patronEmployeeId: schema.patrons.employeeId,
      patronType: schema.patrons.patronType,
      patronMobile: schema.patrons.mobile,
    })
    .from(schema.payments)
    .innerJoin(schema.fines, eq(schema.payments.fineId, schema.fines.id))
    .innerJoin(schema.patrons, eq(schema.payments.patronId, schema.patrons.id))
    .innerJoin(schema.users, eq(schema.payments.receivedBy, schema.users.id));

  if (typeof receiptNoOrId === "number") {
    paymentQuery = paymentQuery.where(eq(schema.payments.id, receiptNoOrId));
  } else {
    paymentQuery = paymentQuery.where(eq(schema.payments.receiptNo, String(receiptNoOrId)));
  }

  const [row] = await paymentQuery.limit(1);
  if (!row) return null;

  const settingRows = await db.select().from(schema.systemSettings);
  const settingsMap = new Map<string, string>();
  for (const s of settingRows) {
    settingsMap.set(s.settingKey, s.settingValue);
  }

  const remainingBalance = Math.max(
    0,
    Number((Number(row.originalAmount) - Number(row.totalPaid)).toFixed(2)),
  );

  return {
    paymentId: row.paymentId,
    receiptNo: row.receiptNo,
    paymentDate: row.paymentDate,
    paymentMethod: row.paymentMethod,
    amount: Number(row.amount).toFixed(2),
    remarks: row.remarks,
    receivedByName: row.receivedByName,
    patron: {
      id: row.patronId,
      name: [row.patronFirstName, row.patronLastName].filter(Boolean).join(" "),
      cardNo: row.patronCardNo,
      employeeId: row.patronEmployeeId,
      patronType: row.patronType,
      mobile: row.patronMobile,
    },
    fine: {
      id: row.fineId,
      fineType: row.fineType,
      reason: row.fineReason,
      originalAmount: Number(row.originalAmount).toFixed(2),
      totalPaid: Number(row.totalPaid).toFixed(2),
      remainingBalance: remainingBalance.toFixed(2),
      status: row.fineStatus,
    },
    institutionName: settingsMap.get("INSTITUTE_NAME") || "RBMI Group of Institutions, Bareilly",
    libraryName: settingsMap.get("LIBRARY_NAME") || "RBMI Central Library",
  };
}

/**
 * Dynamically adjusts an outstanding fine amount with administrative justification (FR-FI-04, FR-AD-02).
 * Allows admin to reduce or calibrate fine amounts, transition status if fully cleared, and audit changes.
 */
export async function adjustFineAmount(
  params: {
    fineId: number;
    newAmount: number;
    reason: string;
  },
  actor: Actor,
  db: DbInstance = defaultDb,
) {
  const newAmount = Number(params.newAmount);
  if (Number.isNaN(newAmount) || newAmount < 0) {
    throw new Error("Adjusted fine amount must be zero or a positive number");
  }

  const reason = params.reason?.trim();
  if (!reason) {
    throw new Error("A justification reason is required for dynamic fine adjustment");
  }

  return await db.transaction(async (tx: DbInstance) => {
    const [fine] = await tx
      .select()
      .from(schema.fines)
      .where(eq(schema.fines.id, params.fineId))
      .for("update");

    if (!fine) {
      throw new Error(`Fine #${params.fineId} not found`);
    }

    if (fine.status !== "OUTSTANDING") {
      throw new Error(`Cannot adjust fine #${params.fineId} with status '${fine.status}'`);
    }

    const previousAmount = Number(fine.amount);
    const currentPaid = Number(fine.paidAmount);

    if (newAmount < currentPaid) {
      throw new Error(
        `New fine amount (₹${newAmount.toFixed(2)}) cannot be lower than already collected payment (₹${currentPaid.toFixed(2)})`,
      );
    }

    let nextStatus: string;
    let updatedFine: typeof schema.fines.$inferSelect;

    if (newAmount <= 0) {
      nextStatus = "WAIVED";
      const [res] = await tx
        .update(schema.fines)
        .set({
          status: "WAIVED",
          reason: `${fine.reason} [Fully waived via dynamic adjustment: ${reason}]`,
          updatedAt: new Date(),
        })
        .where(eq(schema.fines.id, fine.id))
        .returning();
      updatedFine = res;
    } else {
      nextStatus = newAmount <= currentPaid ? "PAID" : "OUTSTANDING";
      const [res] = await tx
        .update(schema.fines)
        .set({
          amount: sql`${newAmount.toFixed(2)}::numeric`,
          status: nextStatus,
          reason: `${fine.reason} [Adjusted from ₹${previousAmount.toFixed(2)} to ₹${newAmount.toFixed(2)}: ${reason}]`,
          updatedAt: new Date(),
        })
        .where(eq(schema.fines.id, fine.id))
        .returning();
      updatedFine = res;
    }

    await recordAuditLog(
      {
        actorType: actor.actorType ?? "STAFF",
        actorId: actor.id,
        actorName: actor.fullName,
        action: "FINE_ADJUST",
        entity: "fines",
        entityId: String(fine.id),
        details: `Fine #${fine.id} dynamically adjusted from ₹${previousAmount.toFixed(2)} to ₹${newAmount.toFixed(2)}. Justification: ${reason}. Status: ${nextStatus}.`,
        ipAddress: actor.ipAddress,
      },
      tx,
    );

    return {
      success: true,
      fine: updatedFine,
      previousAmount,
      newAmount,
      status: nextStatus,
    };
  });
}
