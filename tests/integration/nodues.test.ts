import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { setTestDb } from "@/db/client";
import * as schema from "@/db/schema";
import {
  checkNoDuesEligibility,
  getNoDuesCertificateDetails,
  issueNoDuesCertificate,
  listRecentClearances,
  type StaffActor,
} from "@/services/nodues";

describe("Phase 11: No-Dues Clearance Integration Suite (FR-ND-01, FR-ND-02, UC-09, T-21)", () => {
  // biome-ignore lint/suspicious/noExplicitAny: generic DB instance
  let db: any;
  let pglite: PGlite;

  const staffLibrarian: StaffActor = {
    id: 2,
    fullName: "Head Librarian",
    actorType: "STAFF",
    ipAddress: "127.0.0.1",
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

  it("1. Refuses clearance and returns pending loan details when patron has active loan (FR-ND-01)", async () => {
    // In seed data: Suresh Chandra (Patron ID 4) has active loan on CL000008, 0 fines
    const check = await checkNoDuesEligibility(4, db);

    expect(check.isEligible).toBe(false);
    expect(check.activeLoansCount).toBeGreaterThanOrEqual(1);
    expect(check.totalUnpaidFines).toBe(0);
    expect(check.refusalReasons.some((r) => r.includes("active book loan"))).toBe(true);

    // Verify loan details and return shortcut URL
    expect(check.pendingLoans.length).toBeGreaterThanOrEqual(1);
    expect(check.pendingLoans[0].barcode).toBe("CL000008");
    expect(check.pendingLoans[0].returnShortcutUrl).toContain("/circulation/return?term=CL000008");

    // Attempting to issue certificate must be rejected
    await expect(issueNoDuesCertificate({ patronId: 4 }, staffLibrarian, db)).rejects.toThrow(
      /Cannot issue No-Dues clearance: Patron has \d+ active book loan/,
    );
  });

  it("2. Refuses clearance and returns outstanding fine details when patron has unpaid fines (FR-ND-01)", async () => {
    // Create clean patron with only an outstanding fine
    const [patron] = await db
      .insert(schema.patrons)
      .values({
        cardNo: "TEST-FINE-ONLY",
        rollNo: "ROLL-FINE-ONLY",
        patronType: "STUDENT",
        categoryId: 1,
        institutionId: 1,
        departmentId: 1,
        firstName: "Fine",
        lastName: "Pending",
        cardExpiry: "2028-06-30",
        status: "ACTIVE",
        username: "TEST-FINE-ONLY",
        passwordHash: "hash",
      })
      .returning();

    // Create an unpaid fine of ₹120.00
    await db.insert(schema.fines).values({
      patronId: patron.id,
      amount: "120.00",
      paidAmount: "20.00",
      fineType: "DAMAGE",
      reason: "Damaged textbook spine",
      status: "OUTSTANDING",
      createdBy: 2,
    });

    const check = await checkNoDuesEligibility(patron.id, db);

    expect(check.isEligible).toBe(false);
    expect(check.activeLoansCount).toBe(0);
    expect(check.totalUnpaidFines).toBe(100.0);
    expect(check.refusalReasons.some((r) => r.includes("outstanding fine liabilities"))).toBe(true);

    // Verify fine details and pay shortcut URL
    expect(check.pendingFines.length).toBe(1);
    expect(check.pendingFines[0].remainingBalance).toBe(100.0);
    expect(check.pendingFines[0].finesShortcutUrl).toContain(
      `/fines?cardNo=${encodeURIComponent(patron.cardNo)}`,
    );

    // Attempting to issue certificate must be rejected
    await expect(
      issueNoDuesCertificate({ patronId: patron.id }, staffLibrarian, db),
    ).rejects.toThrow(/Cannot issue No-Dues clearance: Patron has ₹100.00 in outstanding fine/);
  });

  it("3. Refuses clearance when patron has both active loans and unpaid fines (FR-ND-01)", async () => {
    // Rahul Kumar (Patron ID 1) in seed data has active loan on CL000001
    // Add an outstanding fine to Rahul Kumar
    await db.insert(schema.fines).values({
      patronId: 1,
      amount: "50.00",
      paidAmount: "0.00",
      fineType: "OVERDUE",
      reason: "Prior overdue fine",
      status: "OUTSTANDING",
      createdBy: 2,
    });

    const check = await checkNoDuesEligibility("2301430100045", db);

    expect(check.isEligible).toBe(false);
    expect(check.activeLoansCount).toBeGreaterThanOrEqual(1);
    expect(check.totalUnpaidFines).toBeGreaterThan(0);
    expect(check.refusalReasons.some((r) => r.includes("active book loan"))).toBe(true);
    expect(check.refusalReasons.some((r) => r.includes("outstanding fine liabilities"))).toBe(true);

    await expect(issueNoDuesCertificate({ patronId: 1 }, staffLibrarian, db)).rejects.toThrow(
      /Cannot issue No-Dues clearance/,
    );
  });

  it("4. Approves eligibility for clean patron with zero active loans and zero fines (FR-ND-01)", async () => {
    // Neha Gupta (Patron ID 3) in seed data has 0 active loans and 0 fines
    const check = await checkNoDuesEligibility("2201430100033", db);

    expect(check.isEligible).toBe(true);
    expect(check.activeLoansCount).toBe(0);
    expect(check.totalUnpaidFines).toBe(0);
    expect(check.pendingLoans.length).toBe(0);
    expect(check.pendingFines.length).toBe(0);
    expect(check.refusalReasons.length).toBe(0);
    expect(check.patron.status).toBe("ACTIVE");
  });

  it("5. Successfully issues No-Dues certificate, records NODUES audit log, and closes account to GRADUATED (FR-ND-02, UC-09, T-21)", async () => {
    // Neha Gupta (Patron ID 3) is eligible
    const result = await issueNoDuesCertificate(
      {
        patronId: 3,
        closeAccount: true,
        remarks: "Approved for B.Tech Convocation 2026",
        referenceDate: new Date("2026-10-15T10:00:00Z"),
      },
      staffLibrarian,
      db,
    );

    expect(result.success).toBe(true);
    expect(result.certificateNo).toBe("ND-2026-00003");
    expect(result.accountStatus).toBe("GRADUATED");
    expect(result.closedAccount).toBe(true);

    // Verify patron record in database was updated to GRADUATED
    const [patron] = await db.select().from(schema.patrons).where(eq(schema.patrons.id, 3));
    expect(patron.status).toBe("GRADUATED");

    // Verify audit log has action 'NODUES'
    const [audit] = await db
      .select()
      .from(schema.auditLogs)
      .where(sql`${schema.auditLogs.action} = 'NODUES' AND ${schema.auditLogs.entityId} = '3'`);

    expect(audit).toBeDefined();
    expect(audit.actorName).toBe("Head Librarian");
    expect(audit.details).toContain("ND-2026-00003");
    expect(audit.details).toContain("GRADUATED");
    expect(audit.details).toContain("Approved for B.Tech Convocation 2026");
  });

  it("6. Prevents issuing duplicate certificate once patron is marked GRADUATED", async () => {
    // Neha Gupta is now GRADUATED
    await expect(issueNoDuesCertificate({ patronId: 3 }, staffLibrarian, db)).rejects.toThrow(
      /already GRADUATED/i,
    );

    // Eligibility check marks ineligible
    const check = await checkNoDuesEligibility(3, db);
    expect(check.isEligible).toBe(false);
    expect(check.refusalReasons.some((r) => r.includes("GRADUATED"))).toBe(true);
  });

  it("7. Supports certificate issuance with account closure optional (closeAccount: false)", async () => {
    // Create another clean student
    const [patron] = await db
      .insert(schema.patrons)
      .values({
        cardNo: "TEST-LEAVE-OPEN",
        rollNo: "ROLL-LEAVE-OPEN",
        patronType: "STUDENT",
        categoryId: 1,
        institutionId: 1,
        departmentId: 1,
        firstName: "Semester",
        lastName: "Break",
        cardExpiry: "2028-06-30",
        status: "ACTIVE",
        username: "TEST-LEAVE-OPEN",
        passwordHash: "hash",
      })
      .returning();

    const result = await issueNoDuesCertificate(
      {
        patronId: patron.id,
        closeAccount: false,
        remarks: "Mid-term hostel clearance",
      },
      staffLibrarian,
      db,
    );

    expect(result.success).toBe(true);
    expect(result.closedAccount).toBe(false);
    expect(result.accountStatus).toBe("ACTIVE");

    // Patron in DB remains ACTIVE
    const [check] = await db.select().from(schema.patrons).where(eq(schema.patrons.id, patron.id));
    expect(check.status).toBe("ACTIVE");
  });

  it("8. Resolves full printable certificate details with institutional headers (FR-ND-02, FR-PR-02)", async () => {
    // Get certificate for Neha Gupta (Patron 3)
    const cert = await getNoDuesCertificateDetails(3, db);

    expect(cert).toBeDefined();
    expect(cert?.certificateNo).toBe("ND-2026-00003");
    expect(cert?.institutionName).toContain("RBMI");
    expect(cert?.libraryName).toContain("RBMI Central Library");
    expect(cert?.academicSession).toBe("2026-27");
    expect(cert?.patron.fullName).toBe("Neha Gupta");
    expect(cert?.patron.cardNo).toBe("2201430100033");
    expect(cert?.patron.status).toBe("GRADUATED");
    expect(cert?.issuedByName).toBe("Head Librarian");

    // Also look up by certificate reference number string
    const certByRef = await getNoDuesCertificateDetails("ND-2026-00003", db);
    expect(certByRef).toBeDefined();
    expect(certByRef?.patron.id).toBe(3);
  });

  it("9. Returns null certificate for patron who has never received clearance", async () => {
    // Suresh Chandra (Patron 4) is ACTIVE and has never been cleared
    const cert = await getNoDuesCertificateDetails(4, db);
    expect(cert).toBeNull();
  });

  it("10. Lists recent clearances in chronological descending order", async () => {
    const list = await listRecentClearances(10, db);

    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list.some((c) => c.certificateNo === "ND-2026-00003")).toBe(true);
    expect(list[0].issuedByName).toBe("Head Librarian");
  });
});
