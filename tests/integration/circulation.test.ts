import { PGlite } from "@electric-sql/pglite";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync } from "fs";
import { resolve } from "path";
import { beforeAll, describe, expect, it } from "vitest";
import { setTestDb } from "@/db/client";
import * as schema from "@/db/schema";
import {
  issueCopy,
  lookupCopyForCirculation,
  lookupPatronForCirculation,
  markCopyLost,
  renewLoan,
  returnCopy,
} from "@/services/circulation";

describe("Integration: Circulation Desk Workflow (FR-CI-01 to FR-CI-07, T-05 to T-13)", () => {
  let pglite: PGlite;
  // biome-ignore lint/suspicious/noExplicitAny: generic DB instance
  let db: any;
  const testStaff = { id: 3, fullName: "Test Circulation Librarian" };

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

  it("1. Patron and copy lookup returns active loans, fines, and item status (FR-CI-01)", async () => {
    const patron = await lookupPatronForCirculation("2301430100045", new Date(), db);
    expect(patron).toBeDefined();
    expect(patron?.cardNo).toBe("2301430100045");
    expect(patron?.firstName).toBe("Rahul");
    expect(patron?.activeLoansCount).toBe(1);
    expect(patron?.overdueLoansCount).toBe(1);
    expect(patron?.activeLoans[0].isOverdue).toBe(true);

    const copy = await lookupCopyForCirculation("CL000009", db);
    expect(copy).toBeDefined();
    expect(copy?.accessionNo).toBe("CL000009");
    expect(copy?.title).toBe("Database System Concepts");
    expect(copy?.status).toBe("AVAILABLE");
  });

  it("2. T-05: Standard checkout of textbook to student calculates due date and marks copy ISSUED", async () => {
    // Priya Sharma checks out available book CL000009
    const today = new Date("2026-10-10T10:00:00Z");
    const result = await issueCopy(
      {
        patronIdentifier: "2301430100062",
        barcodeOrAccession: "CL000009",
        referenceDate: today,
      },
      testStaff,
      db,
    );

    expect(result.success).toBe(true);
    expect(result.loan).toBeDefined();
    expect(result.loanDays).toBe(14);
    expect(result.dueDate).toBe("2026-10-24");
    expect(result.copy.status).toBe("ISSUED");

    // Verify copy in database is now ISSUED
    const [dbCopy] = await db
      .select()
      .from(schema.items)
      .where(eq(schema.items.accessionNo, "CL000009"));
    expect(dbCopy.status).toBe("ISSUED");

    // Verify audit log has ISSUE entry
    const [audit] = await db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.action, "ISSUE"))
      .orderBy(sql`${schema.auditLogs.id} DESC`)
      .limit(1);
    expect(audit).toBeDefined();
    expect(audit.actorName).toBe("Test Circulation Librarian");
  });

  it("3. T-06: Refuses issuance of reference item to student per BR-04 & writes refusal audit", async () => {
    // Try to issue reference item CL000021 to student Priya
    await expect(
      issueCopy(
        {
          patronIdentifier: "2301430100062",
          barcodeOrAccession: "CL000021",
        },
        testStaff,
        db,
      ),
    ).rejects.toThrow(/Reference items are not issued|Item type is not issued|0 books allowed/i);

    // Verify copy in database remains REFERENCE_ONLY
    const [refCopy] = await db
      .select()
      .from(schema.items)
      .where(eq(schema.items.accessionNo, "CL000021"));
    expect(refCopy.status).toBe("REFERENCE_ONLY");

    // Verify refusal audit log
    const [audit] = await db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.action, "CIRC_REFUSAL"))
      .orderBy(sql`${schema.auditLogs.id} DESC`)
      .limit(1);
    expect(audit).toBeDefined();
    expect(audit.details).toMatch(/Reference items are not issued|Item type is not issued/i);
  });

  it("4. T-07: Issues reference item to faculty member (Suresh Chandra) for 3 days per Rule #3", async () => {
    const today = new Date("2026-10-10T10:00:00Z");
    const result = await issueCopy(
      {
        patronIdentifier: "E1001",
        barcodeOrAccession: "CL000021",
        referenceDate: today,
      },
      testStaff,
      db,
    );

    expect(result.success).toBe(true);
    expect(result.loanDays).toBe(3);
    expect(result.dueDate).toBe("2026-10-13");
    expect(result.copy.status).toBe("ISSUED");
  });

  it("5. T-08: Refuses issue to patron with overdue materials (Rahul Kumar) per Check #3", async () => {
    // Create another available copy to test refusal
    const [newCopy] = await db
      .insert(schema.items)
      .values({
        bibId: 1,
        libraryId: 1,
        accessionNo: "CL000099",
        barcode: "CL000099",
        price: "500.00",
        status: "AVAILABLE",
      })
      .returning();

    await expect(
      issueCopy(
        {
          patronIdentifier: "2301430100045", // Rahul has overdue loan CL000001
          barcodeOrAccession: newCopy.accessionNo,
        },
        testStaff,
        db,
      ),
    ).rejects.toThrow(/overdue books|overdue loans/i);

    // Verify copy remains AVAILABLE
    const [checkCopy] = await db.select().from(schema.items).where(eq(schema.items.id, newCopy.id));
    expect(checkCopy.status).toBe("AVAILABLE");
  });

  it("6. T-09: Returning overdue book assesses ₹24.00 overdue fine (12 days late * ₹2/day)", async () => {
    // Rahul's loan on CL000001 is due 12 days ago in seed
    const result = await returnCopy(
      {
        barcodeOrAccession: "CL000001",
        referenceDate: new Date(),
      },
      testStaff,
      db,
    );

    expect(result.success).toBe(true);
    expect(result.daysLate).toBe(12);
    expect(result.fineAmount).toBe(24);
    expect(result.fineRecord).toBeDefined();
    expect(result.fineRecord?.amount).toBe("24.00");
    expect(result.copy.status).toBe("AVAILABLE");

    // Verify fine recorded in database
    const [fine] = await db
      .select()
      .from(schema.fines)
      .where(eq(schema.fines.id, result.fineRecord.id));
    expect(fine).toBeDefined();
    expect(fine.amount).toBe("24.00");
    expect(fine.fineType).toBe("OVERDUE");
    expect(fine.status).toBe("OUTSTANDING");
  });

  it("7. T-10: Returning book with waiting hold assigns it to next patron and sets copy RESERVED", async () => {
    // Copy CL000007 (Algorithms) is issued to Priya in seed.
    // Neha Gupta has a WAITING hold on Algorithms.
    const today = new Date("2026-10-10T10:00:00Z");
    const result = await returnCopy(
      {
        barcodeOrAccession: "CL000007",
        referenceDate: today,
      },
      testStaff,
      db,
    );

    expect(result.success).toBe(true);
    expect(result.copy.status).toBe("RESERVED");
    expect(result.holdAlert).toBeDefined();
    expect(result.holdAlert?.patronName).toContain("Neha");
    expect(result.holdAlert?.pickupExpiryDate).toBe("2026-10-12"); // +2 days pickup (HOLD_PICKUP_DAYS=2)

    // Verify hold in DB is now AVAILABLE_FOR_PICKUP
    const [hold] = await db
      .select()
      .from(schema.holds)
      .where(eq(schema.holds.id, result.holdAlert.holdId));
    expect(hold.status).toBe("AVAILABLE_FOR_PICKUP");
  });

  it("8. T-11: Refuses checkout of RESERVED copy to other patrons, but permits reserved patron", async () => {
    // 1. Another patron tries to checkout CL000007
    await expect(
      issueCopy(
        {
          patronIdentifier: "2301430100062", // Priya
          barcodeOrAccession: "CL000007",
          referenceDate: new Date("2026-05-01"),
        },
        testStaff,
        db,
      ),
    ).rejects.toThrow(/reserved for another patron/i);

    // 2. Reserved patron Neha Gupta (2201430100033) checks out the copy
    const result = await issueCopy(
      {
        patronIdentifier: "2201430100033",
        barcodeOrAccession: "CL000007",
        referenceDate: new Date("2026-05-01"),
      },
      testStaff,
      db,
    );

    expect(result.success).toBe(true);
    expect(result.reservationFulfilled).toBe(true);
    expect(result.copy.status).toBe("ISSUED");

    // Verify hold status in DB transitioned to COMPLETED
    const [hold] = await db
      .select()
      .from(schema.holds)
      .where(and(eq(schema.holds.patronId, 3), eq(schema.holds.status, "COMPLETED")));
    expect(hold).toBeDefined();
  });

  it("9. T-12: Enforces maximum consecutive renewal limits (max_renewals = 2)", async () => {
    // Locate active loan for Neha on CL000007
    const [loan] = await db
      .select()
      .from(schema.loans)
      .where(and(eq(schema.loans.patronId, 3), eq(schema.loans.status, "ISSUED")))
      .limit(1);

    expect(loan.renewalCount).toBe(0);

    // Renewal 1
    const r1 = await renewLoan(
      { loanId: loan.id, referenceDate: new Date("2026-05-01") },
      testStaff,
      db,
    );
    expect(r1.success).toBe(true);
    expect(r1.renewalCount).toBe(1);

    // Renewal 2
    const r2 = await renewLoan(
      { loanId: loan.id, referenceDate: new Date("2026-05-01") },
      testStaff,
      db,
    );
    expect(r2.success).toBe(true);
    expect(r2.renewalCount).toBe(2);

    // Renewal 3 -> Must be refused!
    await expect(
      renewLoan({ loanId: loan.id, referenceDate: new Date("2026-05-01") }, testStaff, db),
    ).rejects.toThrow(/Maximum renewals.*already used|Maximum renewal limit/i);

    // Verify refusal audit log
    const [refusalAudit] = await db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.action, "CIRC_REFUSAL"))
      .orderBy(sql`${schema.auditLogs.id} DESC`)
      .limit(1);
    expect(refusalAudit.details).toMatch(/Maximum renewals.*already used|Maximum renewal limit/i);
  });

  it("10. T-13: Declares material LOST and calculates replacement fee + processing charge (BR-07)", async () => {
    // Copy CL000009 (price ₹750) is issued to Priya Sharma
    const [priyaLoan] = await db
      .select({
        id: schema.loans.id,
        patronId: schema.loans.patronId,
      })
      .from(schema.loans)
      .innerJoin(schema.items, eq(schema.loans.itemId, schema.items.id))
      .where(and(eq(schema.items.accessionNo, "CL000009"), eq(schema.loans.status, "ISSUED")))
      .limit(1);

    expect(priyaLoan).toBeDefined();

    const result = await markCopyLost(
      {
        loanId: priyaLoan.id,
        referenceDate: new Date("2026-10-15"),
      },
      testStaff,
      db,
    );

    expect(result.success).toBe(true);
    expect(result.replacementFee).toBe(800); // 750 + 50 processing fee
    expect(result.totalCharged).toBe(800);

    // Verify copy is LOST
    const [lostCopy] = await db
      .select()
      .from(schema.items)
      .where(eq(schema.items.accessionNo, "CL000009"));
    expect(lostCopy.status).toBe("LOST");

    // Verify loan is LOST
    const [lostLoan] = await db
      .select()
      .from(schema.loans)
      .where(eq(schema.loans.id, priyaLoan.id));
    expect(lostLoan.status).toBe("LOST");

    // Verify fine assessed
    const [lostFine] = await db
      .select()
      .from(schema.fines)
      .where(and(eq(schema.fines.patronId, priyaLoan.patronId), eq(schema.fines.fineType, "LOST")));
    expect(lostFine).toBeDefined();
    expect(lostFine.amount).toBe("800.00");
  });

  it("11. Reference item returned transitions back to REFERENCE_ONLY status", async () => {
    // Reference copy CL000021 was issued to Faculty Suresh in test #4
    const result = await returnCopy(
      {
        barcodeOrAccession: "CL000021",
        referenceDate: new Date("2026-10-12"),
      },
      testStaff,
      db,
    );

    expect(result.success).toBe(true);
    expect(result.copy.status).toBe("REFERENCE_ONLY");

    const [dbRefCopy] = await db
      .select()
      .from(schema.items)
      .where(eq(schema.items.accessionNo, "CL000021"));
    expect(dbRefCopy.status).toBe("REFERENCE_ONLY");
  });
});
