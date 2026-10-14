import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { setTestDb } from "@/db/client";
import * as schema from "@/db/schema";
import { verifyPassword } from "@/lib/crypto";
import { commitPatronImport, validatePatronCsv } from "@/services/patron-import";

describe("Phase 13: Student & Faculty CSV Import Integration Suite (FR-PI-01 to FR-PI-05, T-19)", () => {
  let pglite: PGlite;
  // biome-ignore lint/suspicious/noExplicitAny: generic DB instance
  let db: any;
  const testActor = { id: 1, fullName: "Librarian In-Charge", ipAddress: "127.0.0.1" };

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

  it("1. Validates student CSV in preview stage without any database writes (FR-PI-02)", async () => {
    const studentCsv = [
      "roll_no,first_name,last_name,gender,dob,institute,course,department,academic_year,semester,mobile,email",
      "240101,Aarav,Sharma,M,15-08-2005,RBMI-ENG,BTECH-CS,CSE,1,1,9876543210,aarav@rbmi.in",
      "240102,Diya,Verma,F,20-09-2005,RBMI-ENG,BTECH-CS,CSE,1,1,9876543211,diya@rbmi.in",
    ].join("\n");

    const buffer = Buffer.from(studentCsv, "utf8");
    const preview = await validatePatronCsv(
      buffer,
      "STUDENT",
      { fileName: "students_batch1.csv" },
      db,
    );

    expect(preview.summary.totalRows).toBe(2);
    expect(preview.summary.okCount).toBe(2);
    expect(preview.summary.errorCount).toBe(0);
    expect(preview.summary.validCount).toBe(2);

    // Verify ZERO database writes occurred
    const [p1] = await db.select().from(schema.patrons).where(eq(schema.patrons.rollNo, "240101"));
    expect(p1).toBeUndefined();
    const [p2] = await db.select().from(schema.patrons).where(eq(schema.patrons.rollNo, "240102"));
    expect(p2).toBeUndefined();
  });

  it("2. Commits valid student rows with card_no = roll_no, Argon2id initial hash, and batch record (FR-PI-04, FR-AU-05)", async () => {
    const studentCsv = [
      "roll_no,first_name,last_name,gender,dob,institute,course,department,academic_year,semester,mobile,email",
      "240101,Aarav,Sharma,M,15-08-2005,RBMI-ENG,BTECH-CS,CSE,1,1,9876543210,aarav@rbmi.in",
      "240102,Diya,Verma,F,20-09-2005,RBMI-ENG,BTECH-CS,CSE,1,1,9876543211,diya@rbmi.in",
    ].join("\n");

    const buffer = Buffer.from(studentCsv, "utf8");
    const preview = await validatePatronCsv(
      buffer,
      "STUDENT",
      { fileName: "students_batch1.csv" },
      db,
    );
    const result = await commitPatronImport(preview, testActor, db);

    expect(result.importedCount).toBe(2);
    expect(result.skippedCount).toBe(0);
    expect(result.cardNumbers).toEqual(["240101", "240102"]);

    // Verify DB state for imported patron 240101
    const [savedAarav] = await db
      .select()
      .from(schema.patrons)
      .where(eq(schema.patrons.rollNo, "240101"));
    expect(savedAarav).toBeDefined();
    expect(savedAarav.cardNo).toBe("240101"); // card_no = roll_no
    expect(savedAarav.status).toBe("ACTIVE");
    expect(savedAarav.mustChangePassword).toBe(true);

    // Initial password equals card number (Argon2id verified)
    const isPassValid = verifyPassword("240101", savedAarav.passwordHash);
    expect(isPassValid).toBe(true);

    // Verify import_batches entry
    const [batchRow] = await db
      .select()
      .from(schema.importBatches)
      .where(eq(schema.importBatches.id, result.batchId));
    expect(batchRow).toBeDefined();
    expect(batchRow.importType).toBe("STUDENT");
    expect(batchRow.importedRows).toBe(2);
    expect(batchRow.skippedRows).toBe(0);
  });

  it("3. Re-importing the same CSV triggers duplicate protection with 0 rows inserted (FR-PI-05, T-19)", async () => {
    const studentCsv = [
      "roll_no,first_name,last_name,gender,dob,institute,course,department,academic_year,semester,mobile,email",
      "240101,Aarav,Sharma,M,15-08-2005,RBMI-ENG,BTECH-CS,CSE,1,1,9876543210,aarav@rbmi.in",
      "240102,Diya,Verma,F,20-09-2005,RBMI-ENG,BTECH-CS,CSE,1,1,9876543211,diya@rbmi.in",
    ].join("\n");

    const buffer = Buffer.from(studentCsv, "utf8");
    const preview = await validatePatronCsv(
      buffer,
      "STUDENT",
      { fileName: "students_batch1_dup.csv" },
      db,
    );

    // Both rows must be flagged as duplicates in DB
    expect(preview.summary.totalRows).toBe(2);
    expect(preview.summary.okCount).toBe(0);
    expect(preview.summary.errorCount).toBe(2);
    expect(preview.summary.validCount).toBe(0);
    expect(preview.rows[0].messages[0]).toContain("already registered in database");
    expect(preview.rows[1].messages[0]).toContain("already registered in database");

    // Commit results in 0 imports and 2 skipped
    const result = await commitPatronImport(preview, testActor, db);
    expect(result.importedCount).toBe(0);
    expect(result.skippedCount).toBe(2);
    expect(result.skippedRows[0].reason).toContain("Duplicate roll_no");
  });

  it("4. Partial failures skip ERROR rows while successfully committing valid rows (NFR-R-02)", async () => {
    const mixedCsv = [
      "roll_no,first_name,last_name,gender,dob,category",
      "240103,Rohan,Gupta,M,10-10-2005,BTECH", // Valid
      ",Missing,RollNo,F,11-11-2005,BTECH", // Error: missing roll_no
      "240104,Sneha,Singh,F,12-12-2005,BTECH", // Valid
    ].join("\n");

    const buffer = Buffer.from(mixedCsv, "utf8");
    const preview = await validatePatronCsv(buffer, "STUDENT", { fileName: "mixed.csv" }, db);

    expect(preview.summary.totalRows).toBe(3);
    expect(preview.summary.validCount).toBe(2);
    expect(preview.summary.errorCount).toBe(1);
    expect(preview.rows[1].status).toBe("ERROR");

    const result = await commitPatronImport(preview, testActor, db);
    expect(result.importedCount).toBe(2);
    expect(result.skippedCount).toBe(1);
    expect(result.skippedRows[0].rowNumber).toBe(3);

    // Verify valid patrons exist in DB
    const [p3] = await db.select().from(schema.patrons).where(eq(schema.patrons.rollNo, "240103"));
    expect(p3).toBeDefined();
    const [p4] = await db.select().from(schema.patrons).where(eq(schema.patrons.rollNo, "240104"));
    expect(p4).toBeDefined();
  });

  it("5. Flags duplicate roll_no within the same CSV file as an error", async () => {
    const fileDupCsv = [
      "roll_no,first_name,last_name",
      "240105,First,Instance",
      "240105,Second,Instance", // Duplicate in file
    ].join("\n");

    const buffer = Buffer.from(fileDupCsv, "utf8");
    const preview = await validatePatronCsv(buffer, "STUDENT", { fileName: "file_dup.csv" }, db);

    expect(preview.summary.totalRows).toBe(2);
    expect(preview.rows[0].status).toBe("OK");
    expect(preview.rows[1].status).toBe("ERROR");
    expect(preview.rows[1].messages[0]).toContain("appears multiple times in file");
  });

  it("6. Imports faculty roster with employee_id and card_no defaults", async () => {
    const facultyCsv = [
      "employee_id,first_name,last_name,gender,category,department,mobile,email,joining_date",
      "FAC-2026-01,Dr. Rajesh,Mishra,M,FACULTY,CSE,9811223344,rajesh@rbmi.in,01-08-2022",
    ].join("\n");

    const buffer = Buffer.from(facultyCsv, "utf8");
    const preview = await validatePatronCsv(buffer, "FACULTY", { fileName: "faculty.csv" }, db);

    expect(preview.summary.totalRows).toBe(1);
    expect(preview.summary.okCount).toBe(1);
    expect(preview.rows[0].data?.employeeId).toBe("FAC-2026-01");
    expect(preview.rows[0].data?.cardNo).toBe("FAC-2026-01");

    const result = await commitPatronImport(preview, testActor, db);
    expect(result.importedCount).toBe(1);

    const [savedFaculty] = await db
      .select()
      .from(schema.patrons)
      .where(eq(schema.patrons.employeeId, "FAC-2026-01"));
    expect(savedFaculty).toBeDefined();
    expect(savedFaculty.patronType).toBe("FACULTY");
    expect(savedFaculty.cardNo).toBe("FAC-2026-01");
    expect(verifyPassword("FAC-2026-01", savedFaculty.passwordHash)).toBe(true);
  });

  it("7. Automatically detects 'B.Tech' as BTech and auto-assigns college to RBCeT when college is omitted", async () => {
    const studentCsv = [
      "roll_no,first_name,last_name,gender,dob,course,department,academic_year,semester,mobile,email",
      "240201,Aman,Gupta,M,10-01-2005,B.Tech,CSE,1,1,9876543290,aman@rbmi.in",
      "240202,Sneha,Patel,F,12-02-2005,B. Tech,ME,1,1,9876543291,sneha@rbmi.in",
    ].join("\n");

    const buffer = Buffer.from(studentCsv, "utf8");
    const preview = await validatePatronCsv(
      buffer,
      "STUDENT",
      { fileName: "students_btech_no_college.csv" },
      db,
    );

    expect(preview.summary.totalRows).toBe(2);
    expect(preview.summary.okCount).toBe(2);
    expect(preview.summary.errorCount).toBe(0);

    // Row 1: Course "B.Tech" -> BTech, college automatically set to RBCeT (id 1, code RBCeT)
    const row1 = preview.rows[0];
    expect(row1.status).toBe("OK");
    expect(row1.messages).toHaveLength(0);
    expect(row1.data?.institutionCode).toBe("RBCeT");
    expect(row1.data?.courseCode).toContain("BTECH");

    // Row 2: Course "B. Tech" -> BTech, college automatically set to RBCeT
    const row2 = preview.rows[1];
    expect(row2.status).toBe("OK");
    expect(row2.messages).toHaveLength(0);
    expect(row2.data?.institutionCode).toBe("RBCeT");
    expect(row2.data?.courseCode).toContain("BTECH");

    // Commit and verify in DB
    const result = await commitPatronImport(preview, testActor, db);
    expect(result.importedCount).toBe(2);

    const [savedAman] = await db
      .select()
      .from(schema.patrons)
      .where(eq(schema.patrons.rollNo, "240201"));
    expect(savedAman).toBeDefined();
    expect(savedAman.institutionId).toBe(1); // RBCeT / RBMI-ENG
  });

  it("8. Automatically detects 'B.Tech' with college explicitly written as 'RBCeT'", async () => {
    const studentCsv = [
      "roll_no,first_name,last_name,course,college",
      "240203,Karan,Mehra,B.Tech,RBCeT",
    ].join("\n");

    const buffer = Buffer.from(studentCsv, "utf8");
    const preview = await validatePatronCsv(
      buffer,
      "STUDENT",
      { fileName: "students_rbcet_explicit.csv" },
      db,
    );

    expect(preview.summary.totalRows).toBe(1);
    expect(preview.summary.okCount).toBe(1);
    expect(preview.rows[0].data?.institutionCode).toBe("RBCeT");
    expect(preview.rows[0].data?.institutionId).toBe(1);
    expect(preview.rows[0].data?.courseCode).toBe("BTECH");
  });
});

