import { PGlite } from "@electric-sql/pglite";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync } from "fs";
import { resolve } from "path";
import { beforeAll, describe, expect, it } from "vitest";
import { setTestDb } from "@/db/client";
import * as schema from "@/db/schema";
import { verifyPassword } from "@/lib/crypto";
import {
  changePatronStatus,
  getPatronById,
  listPatrons,
  registerPatron,
  resetPatronPassword,
  updatePatron,
} from "@/services/patron";
import { createSession, getSession } from "@/services/session";

describe("Integration: Patron Master Data & Lifecycle (FR-PA-01 to FR-PA-08, BR-02, DR-01, DR-03)", () => {
  let pglite: PGlite;
  // biome-ignore lint/suspicious/noExplicitAny: generic DB instance
  let db: any;
  const testActor = { id: 1, fullName: "Test Registrar", ipAddress: "127.0.0.1" };

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

  it("1. Registers a student with roll_no defaulting to card_no and Argon2id initial password (FR-PA-01, FR-PA-02, FR-AU-05)", async () => {
    const student = await registerPatron(
      {
        patronType: "STUDENT",
        categoryId: 1, // B.Tech Student (4 years validity)
        institutionId: 1,
        departmentId: 1, // Computer Science
        courseId: 1, // B.Tech CSE
        rollNo: "21CS001",
        firstName: "Aarav",
        lastName: "Sharma",
        email: "aarav.sharma@rbmi.in",
        mobile: "9876543210",
        academicYear: 2021,
        semester: 6,
        admissionDate: "2021-08-01",
        courseEndDate: "2025-06-30",
      },
      testActor,
      db,
    );

    expect(student.id).toBeDefined();
    // Card number defaults to roll_no (FR-PA-02)
    expect(student.cardNo).toBe("21CS001");
    expect(student.status).toBe("ACTIVE");
    expect(student.mustChangePassword).toBe(true);

    // Initial password equals card number (FR-AU-05)
    expect(verifyPassword("21CS001", student.passwordHash)).toBe(true);

    // Card expiry should match courseEndDate
    expect(student.cardExpiry).toBe("2025-06-30");

    // Verify audit log entry
    const [audit] = await db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.action, "PATRON_CREATE"))
      .orderBy(sql`${schema.auditLogs.id} DESC`)
      .limit(1);

    expect(audit).toBeDefined();
    expect(audit.entity).toBe("patrons");
    expect(audit.actorName).toBe("Test Registrar");
    expect(audit.details).toContain("21CS001");
  });

  it("2. Registers a faculty member with employee_id defaulting to card_no (FR-PA-02)", async () => {
    const [facultyCategory] = await db
      .select()
      .from(schema.patronCategories)
      .where(eq(schema.patronCategories.code, "FACULTY"))
      .limit(1);

    expect(facultyCategory).toBeDefined();

    const faculty = await registerPatron(
      {
        patronType: "FACULTY",
        categoryId: facultyCategory.id, // Faculty Category (5 years validity)
        institutionId: 1,
        departmentId: 1,
        employeeId: "FAC001",
        firstName: "Dr. Vikram",
        lastName: "Verma",
        email: "vikram.verma@rbmi.in",
        mobile: "9876543211",
      },
      testActor,
      db,
    );

    expect(faculty.id).toBeDefined();
    expect(faculty.cardNo).toBe("FAC001");
    expect(faculty.employeeId).toBe("FAC001");
    expect(verifyPassword("FAC001", faculty.passwordHash)).toBe(true);

    // Expiry calculated automatically from category.cardValidityYears (5 years)
    const expectedYear = new Date().getFullYear() + 5;
    expect(new Date(faculty.cardExpiry).getFullYear()).toBe(expectedYear);
  });

  it("3. Falls back to seq_card_no sequence when neither roll_no nor employee_id is present (FR-PA-02)", async () => {
    const [staffCategory] = await db
      .select()
      .from(schema.patronCategories)
      .where(eq(schema.patronCategories.code, "STAFF"))
      .limit(1);

    const staffPatron = await registerPatron(
      {
        patronType: "STAFF",
        categoryId: staffCategory.id,
        institutionId: 1,
        firstName: "Ramesh",
        lastName: "Kumar",
        email: "ramesh.kumar@rbmi.in",
        mobile: "9876543212",
      },
      testActor,
      db,
    );

    expect(staffPatron.id).toBeDefined();
    // Card number generated from seq_card_no: LIB + 6 digits
    expect(staffPatron.cardNo).toMatch(/^LIB\d{6}$/);
    expect(verifyPassword(staffPatron.cardNo, staffPatron.passwordHash)).toBe(true);
  });

  it("4. Enforces database UNIQUE constraints on roll_no, employee_id, and card_no (DR-01)", async () => {
    // Duplicate roll_no
    await expect(
      registerPatron(
        {
          patronType: "STUDENT",
          categoryId: 1,
          institutionId: 1,
          departmentId: 1,
          rollNo: "21CS001", // Already exists
          firstName: "Duplicate",
          lastName: "Roll",
        },
        testActor,
        db,
      ),
    ).rejects.toThrow(/already registered/);

    // Duplicate employee_id
    const [facultyCategory] = await db
      .select()
      .from(schema.patronCategories)
      .where(eq(schema.patronCategories.code, "FACULTY"))
      .limit(1);

    await expect(
      registerPatron(
        {
          patronType: "FACULTY",
          categoryId: facultyCategory.id,
          institutionId: 1,
          employeeId: "FAC001", // Already exists
          firstName: "Duplicate",
          lastName: "Employee",
        },
        testActor,
        db,
      ),
    ).rejects.toThrow(/already registered/);

    // Direct database duplicate card_no violation
    await expect(
      db.insert(schema.patrons).values({
        cardNo: "21CS001", // Duplicate card number
        patronType: "STUDENT",
        categoryId: 1,
        firstName: "Direct",
        lastName: "Insert",
        passwordHash: "dummyhash",
        cardExpiry: "2025-01-01",
        status: "ACTIVE",
        username: "direct_dup_card",
      }),
    ).rejects.toThrow();
  });

  it("5. Enforces database CHECK constraint chk_patron_status (DR-03)", async () => {
    await expect(
      db.insert(schema.patrons).values({
        cardNo: "CHK_TEST_CARD",
        patronType: "STUDENT",
        categoryId: 1,
        firstName: "Check",
        lastName: "Constraint",
        passwordHash: "dummyhash",
        cardExpiry: "2025-01-01",
        status: "INVALID_STATUS", // Not in ACTIVE, BLOCKED, EXPIRED, GRADUATED, LEFT
        username: "chk_test_card",
      }),
    ).rejects.toThrow();
  });

  it("6. Changes patron status to BLOCKED and invalidates active patron sessions (FR-PA-06)", async () => {
    // 1. Fetch patron
    const [patron] = await db
      .select()
      .from(schema.patrons)
      .where(eq(schema.patrons.cardNo, "21CS001"))
      .limit(1);

    expect(patron).toBeDefined();

    // 2. Create active session for patron
    const session = await createSession({ userType: "PATRON", userId: patron.id }, db);
    expect(session.id).toBeDefined();

    // Verify session is active
    const activeBefore = await getSession(session.id, db);
    expect(activeBefore).not.toBeNull();

    // 3. Block patron
    const updated = await changePatronStatus(
      patron.id,
      "BLOCKED",
      "Overdue books exceeding limit",
      testActor,
      db,
    );

    expect(updated.status).toBe("BLOCKED");

    // 4. Session must be invalidated
    const activeAfter = await getSession(session.id, db);
    expect(activeAfter).toBeNull();

    // 5. Verify audit log
    const [audit] = await db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.action, "PATRON_STATUS_CHANGE"))
      .orderBy(sql`${schema.auditLogs.id} DESC`)
      .limit(1);

    expect(audit).toBeDefined();
    expect(audit.details).toContain("BLOCKED");
    expect(audit.details).toContain("Overdue books exceeding limit");
  });

  it("7. Resets patron password to default card number and forces change (FR-PA-06)", async () => {
    const [patron] = await db
      .select()
      .from(schema.patrons)
      .where(eq(schema.patrons.cardNo, "FAC001"))
      .limit(1);

    expect(patron).toBeDefined();

    // Reset password
    const result = await resetPatronPassword(patron.id, testActor, db);
    expect(result.success).toBe(true);
    expect(result.cardNo).toBe("FAC001");

    // Verify reset in DB
    const [refreshed] = await db
      .select()
      .from(schema.patrons)
      .where(eq(schema.patrons.id, patron.id))
      .limit(1);

    expect(refreshed.mustChangePassword).toBe(true);
    expect(verifyPassword("FAC001", refreshed.passwordHash)).toBe(true);

    // Verify audit log
    const [audit] = await db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.action, "PATRON_PASSWORD_RESET"))
      .orderBy(sql`${schema.auditLogs.id} DESC`)
      .limit(1);

    expect(audit).toBeDefined();
    expect(audit.details).toContain("FAC001");
  });

  it("8. Updates patron profile information (FR-PA-06)", async () => {
    const [patron] = await db
      .select()
      .from(schema.patrons)
      .where(eq(schema.patrons.cardNo, "21CS001"))
      .limit(1);

    const updated = await updatePatron(
      patron.id,
      {
        mobile: "9112233445",
        address: "Hostel 3, Room 204, RBMI Campus",
        semester: 7,
      },
      testActor,
      db,
    );

    expect(updated.mobile).toBe("9112233445");
    expect(updated.address).toBe("Hostel 3, Room 204, RBMI Campus");
    expect(updated.semester).toBe(7);
  });

  it("9. Retrieves patron details and loan/fine stats (FR-PA-05)", async () => {
    const [patron] = await db
      .select()
      .from(schema.patrons)
      .where(eq(schema.patrons.cardNo, "21CS001"))
      .limit(1);

    const details = await getPatronById(patron.id, db);
    expect(details).toBeDefined();
    expect(details?.cardNo).toBe("21CS001");
    expect(details?.categoryName).toBe("B.Tech Student");
    expect(details?.departmentName).toBe("Computer Science and Engineering");
    expect(details?.stats.activeLoans).toBe(0);
    expect(details?.stats.outstandingFines).toBe(0);
  });

  it("10. Searches and paginates patrons (FR-PA-04, UI-4)", async () => {
    const searchRes = await listPatrons(
      {
        search: "Aarav",
        page: 1,
        limit: 10,
      },
      db,
    );

    expect(searchRes.records.length).toBeGreaterThanOrEqual(1);
    expect(searchRes.records.some((r: { firstName: string }) => r.firstName === "Aarav")).toBe(
      true,
    );
    expect(searchRes.pagination.totalCount).toBeGreaterThanOrEqual(1);
  });
});
