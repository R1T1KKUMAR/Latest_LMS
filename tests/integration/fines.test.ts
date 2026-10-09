import { PGlite } from "@electric-sql/pglite";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync } from "fs";
import { resolve } from "path";
import { beforeAll, describe, expect, it } from "vitest";
import { setTestDb } from "@/db/client";
import * as schema from "@/db/schema";
import { returnCopy } from "@/services/circulation";
import {
  collectPayment,
  generateReceiptNumber,
  getReceiptDetails,
  listFines,
  waiveFine,
} from "@/services/fines";

describe("Phase 10: Fines & Payments Integration Suite (FR-FI-01 to FR-FI-05, UC-08, BR-06, BR-07, T-14, T-15)", () => {
  let pglite: PGlite;
  // biome-ignore lint/suspicious/noExplicitAny: generic DB instance
  let db: any;

  const staffActor = {
    id: 1,
    fullName: "Super Administrator",
    actorType: "STAFF" as const,
  };

  beforeAll(async () => {
    pglite = new PGlite();
    db = drizzle(pglite, { schema });
    setTestDb(db);

    const migrationPath = resolve(process.cwd(), "db/migrations/0000_abnormal_the_fallen.sql");
    const migrationSql = readFileSync(migrationPath, "utf-8");
    await pglite.exec(migrationSql);

    const { seedDatabase } = await import("@/db/seed");
    await seedDatabase(db);
  });

  it("1. Creates overdue fine upon late return (BR-06, FR-FI-01)", async () => {
    // Rahul Kumar has copy CL000001 (Fluid Mechanics), due 12 days ago in seed data.
    // Return copy: 12 days late * ₹2.00 = ₹24.00 fine
    const returnRes = await returnCopy(
      {
        barcodeOrAccession: "CL000001",
        referenceDate: new Date(),
      },
      staffActor,
      db,
    );

    expect(returnRes.success).toBe(true);
    expect(returnRes.fineRecord).toBeDefined();
    expect(Number(returnRes.fineRecord?.amount)).toBe(24.0);
    expect(returnRes.fineRecord?.status).toBe("OUTSTANDING");
    expect(returnRes.fineRecord?.fineType).toBe("OVERDUE");

    // Verify listFines lists the newly assessed overdue fine
    const result = await listFines({ cardNo: "2301430100045" }, db);
    expect(result.fines.length).toBeGreaterThanOrEqual(1);
    const fine = result.fines.find((f) => f.id === returnRes.fineRecord?.id);
    expect(fine).toBeDefined();
    expect(fine?.amount).toBe("24.00");
    expect(fine?.paidAmount).toBe("0.00");
    expect(fine?.balanceAmount).toBe("24.00");
    expect(fine?.status).toBe("OUTSTANDING");
  });

  it("2. Partial payment updates paid amount and leaves status OUTSTANDING (FR-FI-02, T-14)", async () => {
    // Find Rahul's outstanding fine
    const [fine] = await db
      .select()
      .from(schema.fines)
      .where(sql`${schema.fines.patronId} = 1 AND ${schema.fines.status} = 'OUTSTANDING'`)
      .limit(1);

    expect(fine).toBeDefined();

    // Make partial payment of ₹10.00 (balance is ₹24.00)
    const payRes = await collectPayment(
      {
        fineId: fine.id,
        amount: 10.0,
        paymentMethod: "CASH",
        remarks: "Cash payment counter slip #101",
        referenceDate: new Date("2026-10-10T11:00:00Z"),
      },
      staffActor,
      db,
    );

    expect(payRes.success).toBe(true);
    expect(payRes.isFullPayment).toBe(false);
    expect(payRes.remainingBalance).toBe(14.0);
    expect(payRes.fine.status).toBe("OUTSTANDING");
    expect(Number(payRes.fine.paidAmount)).toBe(10.0);
    expect(payRes.receiptNo).toMatch(/^RCPT-\d{4}-\d{5}$/);

    // Verify payment record in payments table
    const [pmt] = await db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.id, payRes.payment.id));

    expect(pmt).toBeDefined();
    expect(Number(pmt.amount)).toBe(10.0);
    expect(pmt.paymentMethod).toBe("CASH");
    expect(pmt.receiptNo).toBe(payRes.receiptNo);
    expect(pmt.remarks).toBe("Cash payment counter slip #101");
  });

  it("3. Second payment completes remaining balance and transitions fine to PAID (FR-FI-02, T-14)", async () => {
    // Find the partially paid fine
    const [fine] = await db
      .select()
      .from(schema.fines)
      .where(sql`${schema.fines.patronId} = 1 AND ${schema.fines.status} = 'OUTSTANDING'`)
      .limit(1);

    expect(Number(fine.amount) - Number(fine.paidAmount)).toBe(14.0);

    // Pay remaining ₹14.00 via UPI
    const payRes = await collectPayment(
      {
        fineId: fine.id,
        amount: 14.0,
        paymentMethod: "UPI",
        remarks: "UPI Ref: 987654321012",
        referenceDate: new Date("2026-10-10T12:00:00Z"),
      },
      staffActor,
      db,
    );

    expect(payRes.success).toBe(true);
    expect(payRes.isFullPayment).toBe(true);
    expect(payRes.remainingBalance).toBe(0.0);
    expect(payRes.fine.status).toBe("PAID");
    expect(Number(payRes.fine.paidAmount)).toBe(24.0);
    expect(payRes.receiptNo).toMatch(/^RCPT-\d{4}-\d{5}$/);

    // Fine is now PAID
    const [updatedFine] = await db.select().from(schema.fines).where(eq(schema.fines.id, fine.id));

    expect(updatedFine.status).toBe("PAID");
    expect(Number(updatedFine.paidAmount)).toBe(24.0);
  });

  it("4. Overpayment is strictly rejected", async () => {
    // Insert a new fine of ₹50.00 for Patron 2 (Priya)
    const [fine] = await db
      .insert(schema.fines)
      .values({
        patronId: 2,
        amount: "50.00",
        paidAmount: "0.00",
        fineType: "MANUAL",
        reason: "Administrative penalty for book defacement",
        status: "OUTSTANDING",
        createdBy: 1,
      })
      .returning();

    // Attempt to pay ₹60.00 on a ₹50.00 fine
    await expect(
      collectPayment(
        {
          fineId: fine.id,
          amount: 60.0,
          paymentMethod: "CASH",
        },
        staffActor,
        db,
      ),
    ).rejects.toThrow(/exceeds outstanding balance/);

    // Verify fine state remains unchanged
    const [fineAfter] = await db.select().from(schema.fines).where(eq(schema.fines.id, fine.id));
    expect(Number(fineAfter.paidAmount)).toBe(0.0);
    expect(fineAfter.status).toBe("OUTSTANDING");
  });

  it("5. Zero, negative, and invalid payments are rejected", async () => {
    const [fine] = await db
      .select()
      .from(schema.fines)
      .where(eq(schema.fines.status, "OUTSTANDING"))
      .limit(1);

    // Zero payment
    await expect(
      collectPayment(
        {
          fineId: fine.id,
          amount: 0,
          paymentMethod: "CASH",
        },
        staffActor,
        db,
      ),
    ).rejects.toThrow(/greater than zero/);

    // Negative payment
    await expect(
      collectPayment(
        {
          fineId: fine.id,
          amount: -25.0,
          paymentMethod: "CASH",
        },
        staffActor,
        db,
      ),
    ).rejects.toThrow(/greater than zero/);

    // Invalid method
    await expect(
      collectPayment(
        {
          fineId: fine.id,
          amount: 10.0,
          // biome-ignore lint/suspicious/noExplicitAny: test invalid method
          paymentMethod: "BITCOIN" as any,
        },
        staffActor,
        db,
      ),
    ).rejects.toThrow(/Invalid payment method/);
  });

  it("6. Payment on already settled fine is rejected", async () => {
    // Find settled PAID fine from test 3
    const [paidFine] = await db
      .select()
      .from(schema.fines)
      .where(eq(schema.fines.status, "PAID"))
      .limit(1);

    await expect(
      collectPayment(
        {
          fineId: paidFine.id,
          amount: 10.0,
          paymentMethod: "CASH",
        },
        staffActor,
        db,
      ),
    ).rejects.toThrow(/cannot accept payment/);
  });

  it("7. Authorized fine waiver writes off balance and creates WAIVED payment record (FR-FI-04, T-15)", async () => {
    // Create a lost fine of ₹700.00 for Patron 3 (Neha)
    const [lostFine] = await db
      .insert(schema.fines)
      .values({
        patronId: 3,
        amount: "700.00",
        paidAmount: "0.00",
        fineType: "LOST",
        reason: "Lost item replacement charge for Algorithms textbook",
        status: "OUTSTANDING",
        createdBy: 1,
      })
      .returning();

    // Super Admin / Librarian waives the lost fine
    const waiveRes = await waiveFine(
      {
        fineId: lostFine.id,
        remarks: "Approved by Principal due to documented medical emergency",
      },
      staffActor,
      db,
    );

    expect(waiveRes.success).toBe(true);
    expect(waiveRes.fine.status).toBe("WAIVED");
    expect(waiveRes.waivedAmount).toBe(700.0);
    expect(waiveRes.receiptNo).toMatch(/^RCPT-\d{4}-\d{5}$/);

    // Verify payment record has method WAIVED
    const [waivedPmt] = await db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.id, waiveRes.payment.id));

    expect(waivedPmt).toBeDefined();
    expect(Number(waivedPmt.amount)).toBe(700.0);
    expect(waivedPmt.paymentMethod).toBe("WAIVED");
    expect(waivedPmt.remarks).toContain("medical emergency");
  });

  it("8. Waiver on already settled fine is rejected", async () => {
    const [waivedFine] = await db
      .select()
      .from(schema.fines)
      .where(eq(schema.fines.status, "WAIVED"))
      .limit(1);

    await expect(
      waiveFine(
        {
          fineId: waivedFine.id,
          remarks: "Attempt duplicate waiver",
        },
        staffActor,
        db,
      ),
    ).rejects.toThrow(/Cannot waive fine/);
  });

  it("9. Receipt sequence numbers increment monotonically and printable receipt details resolve correctly (FR-FI-03)", async () => {
    const r1 = await generateReceiptNumber(db);
    const r2 = await generateReceiptNumber(db);

    expect(r1).toMatch(/^RCPT-\d{4}-\d{5}$/);
    expect(r2).toMatch(/^RCPT-\d{4}-\d{5}$/);

    const seq1 = parseInt(r1.split("-")[2], 10);
    const seq2 = parseInt(r2.split("-")[2], 10);
    expect(seq2).toBe(seq1 + 1);

    // Fetch printable receipt details for payment in test 2
    const [anyPayment] = await db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.paymentMethod, "CASH"))
      .limit(1);

    const receiptDetails = await getReceiptDetails(anyPayment.receiptNo, db);
    expect(receiptDetails).toBeDefined();
    expect(receiptDetails?.receiptNo).toBe(anyPayment.receiptNo);
    expect(receiptDetails?.paymentMethod).toBe("CASH");
    expect(receiptDetails?.patron.cardNo).toBe("2301430100045");
    expect(receiptDetails?.institutionName).toContain("RBMI");
    expect(receiptDetails?.libraryName).toContain("RBMI Central Library");
  });

  it("10. Payment and waiver audit logs are recorded in audit_logs (FR-AT-01, FR-FI-02, FR-FI-04)", async () => {
    const auditLogs = await db
      .select()
      .from(schema.auditLogs)
      .where(sql`${schema.auditLogs.action} IN ('PAYMENT', 'FINE_WAIVE')`);

    expect(auditLogs.length).toBeGreaterThanOrEqual(3);

    const paymentAudits = auditLogs.filter((a: any) => a.action === "PAYMENT");
    const waiverAudits = auditLogs.filter((a: any) => a.action === "FINE_WAIVE");

    expect(paymentAudits.length).toBeGreaterThanOrEqual(2);
    expect(waiverAudits.length).toBeGreaterThanOrEqual(1);

    expect(paymentAudits[0].details).toContain("Payment of ₹");
    expect(waiverAudits[0].details).toContain("Waived ₹");
  });
});
