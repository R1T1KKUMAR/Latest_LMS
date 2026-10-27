import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync } from "fs";
import { resolve } from "path";
import { beforeAll, describe, expect, it } from "vitest";
import { setTestDb } from "@/db/client";
import * as schema from "@/db/schema";
import { issueCopy, returnCopy } from "@/services/circulation";

describe("Multi-Library Boundary & Librarian Availability Tests", () => {
  let pglite: PGlite;
  // biome-ignore lint/suspicious/noExplicitAny: generic DB instance
  let db: any;
  const centralLibrarian = {
    id: 2,
    fullName: "Central Librarian",
    libraryId: 1,
    roleCode: "LIBRARIAN",
  };
  const gnLibrarian = {
    id: 7,
    fullName: "Greater Noida Librarian",
    libraryId: 2,
    roleCode: "LIBRARIAN",
  };
  const rbcpLibrarian = {
    id: 6,
    fullName: "RBCP Librarian",
    libraryId: 3,
    roleCode: "LIBRARIAN",
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

    // Ensure test libraries 1, 2, 3, 4 are present
    await db
      .update(schema.libraries)
      .set({ isLibrarianAvailable: true })
      .where(eq(schema.libraries.id, 1));
  });

  it("1. Student cannot borrow books from an unassigned library", async () => {
    // Set patron (2301430100062 - Priya Sharma) libraryId to 1 (Central Library)
    await db
      .update(schema.patrons)
      .set({ libraryId: 1 })
      .where(eq(schema.patrons.cardNo, "2301430100062"));

    // Set copy CL000009 libraryId to 3 (RBCP)
    await db
      .update(schema.items)
      .set({ libraryId: 3, status: "AVAILABLE" })
      .where(eq(schema.items.accessionNo, "CL000009"));

    // Attempt checkout should be refused due to library boundary mismatch
    await expect(
      issueCopy(
        {
          patronIdentifier: "2301430100062",
          barcodeOrAccession: "CL000009",
          referenceDate: new Date("2026-10-15T10:00:00Z"),
        },
        centralLibrarian,
        db,
      ),
    ).rejects.toThrow(/can only borrow books from their assigned library/i);
  });

  it("2. Student can borrow books from their assigned library", async () => {
    // Align patron and copy both to Library 1 (Central Library)
    await db
      .update(schema.patrons)
      .set({ libraryId: 1 })
      .where(eq(schema.patrons.cardNo, "2301430100062"));

    await db
      .update(schema.items)
      .set({ libraryId: 1, status: "AVAILABLE" })
      .where(eq(schema.items.accessionNo, "CL000009"));

    const result = await issueCopy(
      {
        patronIdentifier: "2301430100062",
        barcodeOrAccession: "CL000009",
        referenceDate: new Date("2026-10-15T10:00:00Z"),
      },
      centralLibrarian,
      db,
    );

    expect(result.success).toBe(true);
    expect(result.copy.status).toBe("ISSUED");
  });

  it("3. Books cannot be returned to a different library than the one issued from", async () => {
    // CL000009 was issued from Library 1. Attempting return at Greater Noida (Library 2) desk
    await expect(
      returnCopy(
        {
          barcodeOrAccession: "CL000009",
          referenceDate: new Date("2026-10-16T10:00:00Z"),
          deskLibraryId: 2,
        },
        gnLibrarian,
        db,
      ),
    ).rejects.toThrow(/Books must be returned to the same library from which they were issued/i);
  });

  it("4. Books can be returned to the same library from which they were issued", async () => {
    // Returning at Central Library desk (Library 1)
    const result = await returnCopy(
      {
        barcodeOrAccession: "CL000009",
        referenceDate: new Date("2026-10-16T10:00:00Z"),
        deskLibraryId: 1,
      },
      centralLibrarian,
      db,
    );

    expect(result.success).toBe(true);
    expect(result.copy.status).toBe("AVAILABLE");
  });

  it("5. If librarian is marked unavailable, overdue fines are exempted on return", async () => {
    // Issue copy CL000009 on 2026-09-01 (due 2026-09-15)
    await issueCopy(
      {
        patronIdentifier: "2301430100062",
        barcodeOrAccession: "CL000009",
        referenceDate: new Date("2026-09-01T10:00:00Z"),
      },
      centralLibrarian,
      db,
    );

    // Mark Central Library librarian as unavailable (Away)
    await db
      .update(schema.libraries)
      .set({ isLibrarianAvailable: false })
      .where(eq(schema.libraries.id, 1));

    // Return 30 days overdue on 2026-10-15
    const returnResult = await returnCopy(
      {
        barcodeOrAccession: "CL000009",
        referenceDate: new Date("2026-10-15T10:00:00Z"),
        deskLibraryId: 1,
      },
      centralLibrarian,
      db,
    );

    expect(returnResult.success).toBe(true);
    // Overdue fine must be waived / exempted (₹0)
    expect(returnResult.fineAmount).toBe(0);
    expect(returnResult.fineExempted).toBe(true);
    expect(returnResult.fineRecord).toBeNull();
  });
});
