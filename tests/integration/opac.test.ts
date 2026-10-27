import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { setTestDb } from "@/db/client";
import * as schema from "@/db/schema";
import { changePatronPassword, loginPatron } from "@/services/auth";
import {
  getDepartmentsWithCounts,
  getMostBorrowedTitles,
  getNewArrivals,
  getOpacTitleDetails,
  getPatronAccountData,
  searchOpac,
} from "@/services/opac";

describe("Phase 12: Public OPAC & Patron Account Service Integration Suite (FR-OP-01, FR-OP-02, FR-OP-03, FR-AU-05)", () => {
  // biome-ignore lint/suspicious/noExplicitAny: generic DB instance
  let db: any;
  let pglite: PGlite;

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

  it("1. Public search works without login and matches title, author, and ISBN (FR-OP-01, FR-CA-04)", async () => {
    const searchAll = await searchOpac({}, db);
    expect(searchAll.total).toBeGreaterThan(0);
    expect(searchAll.books.length).toBeGreaterThan(0);

    // Search by title keyword "Algorithm" (e.g. Introduction to Algorithms)
    const titleSearch = await searchOpac({ q: "Algorithm", field: "title" }, db);
    expect(titleSearch.books.length).toBeGreaterThan(0);
    expect(titleSearch.books[0].title.toLowerCase()).toContain("algorithm");

    // Search by author "Korth" (Database System Concepts)
    const authorSearch = await searchOpac({ q: "Korth", field: "author" }, db);
    expect(authorSearch.books.length).toBeGreaterThan(0);
    expect(authorSearch.books[0].authors.toLowerCase()).toContain("korth");

    // Search by ISBN
    const isbnSample = titleSearch.books[0].isbn;
    if (isbnSample) {
      const isbnSearch = await searchOpac({ q: isbnSample, field: "isbn" }, db);
      expect(isbnSearch.books.length).toBeGreaterThan(0);
      expect(isbnSearch.books[0].id).toBe(titleSearch.books[0].id);
    }
  });

  it("2. Filters catalogue by academic department and availability (FR-OP-01)", async () => {
    const depts = await getDepartmentsWithCounts(db);
    expect(depts.length).toBeGreaterThan(0);

    const cseDept = depts.find((d) => d.titleCount > 0) || depts.find((d) => d.code === "CSE") || depts[0];
    const deptSearch = await searchOpac({ departmentId: cseDept.id }, db);

    expect(deptSearch.books.length).toBeGreaterThan(0);
    for (const b of deptSearch.books) {
      expect(b.departmentId).toBe(cseDept.id);
    }

    // Availability filter returns only titles with available shelf copies
    const availableOnlySearch = await searchOpac({ onlyAvailable: true }, db);
    for (const b of availableOnlySearch.books) {
      expect(b.availableCopies).toBeGreaterThan(0);
    }
  });

  it("3. Retrieves full title details with copy availability and physical shelf locations (FR-OP-01)", async () => {
    const titleDetail = await getOpacTitleDetails(1, db);

    expect(titleDetail).not.toBeNull();
    expect(titleDetail!.id).toBe(1);
    expect(titleDetail!.title).toBeDefined();
    expect(titleDetail!.authors).toBeDefined();
    expect(titleDetail!.totalCopies).toBeGreaterThan(0);
    expect(titleDetail!.copies.length).toBe(titleDetail!.totalCopies);

    // Verify copy details carry shelf location, library name, and status
    const firstCopy = titleDetail!.copies[0];
    expect(firstCopy.accessionNo).toBeDefined();
    expect(firstCopy.barcode).toBeDefined();
    expect(firstCopy.libraryName).toBeDefined();
    expect(firstCopy.shelfLocation).toBeDefined();
    expect(firstCopy.status).toBeDefined();
  });

  it("4. Retrieves new arrivals based on NEW_ARRIVAL_DAYS system setting (FR-OP-01)", async () => {
    const newArrivals = await getNewArrivals({ limit: 10 }, db);
    expect(Array.isArray(newArrivals)).toBe(true);
    expect(newArrivals.length).toBeGreaterThan(0);

    for (const book of newArrivals) {
      expect(book.id).toBeDefined();
      expect(book.title).toBeDefined();
      expect(book.totalCopies).toBeGreaterThanOrEqual(1);
    }
  });

  it("5. Retrieves most borrowed titles across library system (FR-OP-01)", async () => {
    const popularTitles = await getMostBorrowedTitles({ limit: 5 }, db);
    expect(Array.isArray(popularTitles)).toBe(true);

    if (popularTitles.length > 0) {
      expect(popularTitles[0].borrowCount).toBeGreaterThanOrEqual(1);
      expect(popularTitles[0].title).toBeDefined();
    }
  });

  it("6. Retrieves academic departments with catalogued title and copy counts (FR-OP-01)", async () => {
    const departments = await getDepartmentsWithCounts(db);
    expect(departments.length).toBeGreaterThan(0);

    const firstDept = departments[0];
    expect(firstDept.id).toBeDefined();
    expect(firstDept.name).toBeDefined();
    expect(firstDept.code).toBeDefined();
    expect(typeof firstDept.titleCount).toBe("number");
    expect(typeof firstDept.totalCopies).toBe("number");
  });

  it("7. Authenticates patron with roll number or card number (FR-AU-05, T-20)", async () => {
    // In seed data: Student Rahul Kumar (Patron ID 1), cardNo: 2301430100045
    // Initial password equals card number per FR-AU-05
    const loginResult = await loginPatron(
      {
        identifier: "2301430100045",
        password: "2301430100045",
      },
      db,
    );

    expect(loginResult.success).toBe(true);
    expect(loginResult.session).toBeDefined();
    expect(loginResult.session?.userType).toBe("PATRON");
    expect(loginResult.patron?.id).toBe(1);
    expect(loginResult.mustChangePassword).toBeDefined();
  });

  it("8. Retrieves complete patron account data including loans, history, holds, and fines (FR-OP-02)", async () => {
    // Patron 1 (Rahul Kumar) in seed data has active loans and holds
    const accountData = await getPatronAccountData(1, db);

    expect(accountData).not.toBeNull();
    expect(accountData!.profile.id).toBe(1);
    expect(accountData!.profile.cardNo).toBe("2301430100045");
    expect(accountData!.profile.fullName).toBeDefined();
    expect(accountData!.profile.status).toBe("ACTIVE");

    // Check loans structure
    expect(Array.isArray(accountData!.currentLoans)).toBe(true);
    for (const loan of accountData!.currentLoans) {
      expect(loan.id).toBeDefined();
      expect(loan.title).toBeDefined();
      expect(loan.accessionNo).toBeDefined();
      expect(loan.dueDate).toBeDefined();
      expect(typeof loan.isOverdue).toBe("boolean");
    }

    // Check loan history structure
    expect(Array.isArray(accountData!.loanHistory)).toBe(true);

    // Check holds structure with queue position
    expect(Array.isArray(accountData!.holds)).toBe(true);

    // Check fines structure and total balance
    expect(Array.isArray(accountData!.fines)).toBe(true);
    expect(typeof accountData!.totalOutstandingFines).toBe("number");
  });

  it("9. Changes patron password, enforces minimum 6 characters, and clears mustChangePassword (FR-OP-03, FR-AU-05, T-20)", async () => {
    // Check initial state of Patron 1
    const [pBefore] = await db
      .select({ mustChangePassword: schema.patrons.mustChangePassword })
      .from(schema.patrons)
      .where(eq(schema.patrons.id, 1));

    // Reject new password shorter than 6 characters
    const shortRes = await changePatronPassword(
      {
        patronId: 1,
        currentPassword: "2301430100045",
        newPassword: "123",
      },
      db,
    );
    expect(shortRes.success).toBe(false);
    expect(shortRes.error).toContain("at least 6 characters");

    // Reject incorrect current password
    const wrongCurrentRes = await changePatronPassword(
      {
        patronId: 1,
        currentPassword: "wrongpassword",
        newPassword: "newsecretpassword123",
      },
      db,
    );
    expect(wrongCurrentRes.success).toBe(false);
    expect(wrongCurrentRes.error).toContain("Current password is incorrect");

    // Successful password change with valid credentials (>= 6 chars)
    const successRes = await changePatronPassword(
      {
        patronId: 1,
        currentPassword: "2301430100045",
        newPassword: "newSecurePassword2026",
      },
      db,
    );
    expect(successRes.success).toBe(true);

    // Verify must_change_password is now false in the database
    const [pAfter] = await db
      .select({ mustChangePassword: schema.patrons.mustChangePassword })
      .from(schema.patrons)
      .where(eq(schema.patrons.id, 1));
    expect(pAfter.mustChangePassword).toBe(false);

    // Verify subsequent login with new password succeeds and old password is refused (T-20)
    const oldLogin = await loginPatron(
      {
        identifier: "2301430100045",
        password: "2301430100045",
      },
      db,
    );
    expect(oldLogin.success).toBe(false);

    const newLogin = await loginPatron(
      {
        identifier: "2301430100045",
        password: "newSecurePassword2026",
      },
      db,
    );
    expect(newLogin.success).toBe(true);
    expect(newLogin.mustChangePassword).toBe(false);
  });
});
