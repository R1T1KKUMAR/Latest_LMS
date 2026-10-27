import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync } from "fs";
import { resolve } from "path";
import { beforeAll, describe, expect, it } from "vitest";
import { setTestDb } from "@/db/client";
import * as schema from "@/db/schema";
import {
  addCopiesToTitle,
  listConsolidatedBooks,
  listIndividualCopies,
} from "@/services/catalogue";
import { listPatrons, registerPatron } from "@/services/patron";
import { commitPatronImport, validatePatronCsv } from "@/services/patron-import";

describe("Multi-Library Data Scoping Tests (Catalogue, Patrons, & Ingestion)", () => {
  let pglite: PGlite;
  // biome-ignore lint/suspicious/noExplicitAny: generic DB instance
  let db: any;

  const adminActor = {
    id: 1,
    fullName: "Super Admin",
    roleCode: "SUPER_ADMIN",
  };

  const gnLibrarian = {
    id: 7,
    fullName: "Greater Noida Librarian",
    libraryId: 2,
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
  });

  it("1. Branch library 2 (Greater Noida) starts with 0 physical copies and 0 consolidated titles", async () => {
    const gnCopies = await listIndividualCopies({ libraryId: 2, limit: 50 }, db);
    expect(gnCopies.pagination.totalCount).toBe(0);
    expect(gnCopies.records.length).toBe(0);

    const gnConsolidated = await listConsolidatedBooks({ libraryId: 2, limit: 50 }, db);
    expect(gnConsolidated.pagination.totalCount).toBe(0);
    expect(gnConsolidated.records.length).toBe(0);
  });

  it("2. Branch libraries 3 (RBCP) and 4 (RBCN) also start with 0 physical copies", async () => {
    const rbcpCopies = await listIndividualCopies({ libraryId: 3, limit: 50 }, db);
    expect(rbcpCopies.pagination.totalCount).toBe(0);

    const rbcnCopies = await listIndividualCopies({ libraryId: 4, limit: 50 }, db);
    expect(rbcnCopies.pagination.totalCount).toBe(0);
  });

  it("3. Central Library (libraryId: 1) contains seeded copies, completely isolated from branches", async () => {
    const clCopies = await listIndividualCopies({ libraryId: 1, limit: 50 }, db);
    expect(clCopies.pagination.totalCount).toBeGreaterThan(0);
    expect(clCopies.records.length).toBeGreaterThan(0);
  });

  it("4. Branch library 2 starts with 0 patrons in directory", async () => {
    const gnPatrons = await listPatrons({ libraryId: 2 }, db);
    expect(gnPatrons.pagination.totalCount).toBe(0);
    expect(gnPatrons.records.length).toBe(0);
  });

  it("5. Registering a patron into Library 2 assigns libraryId and scopes them strictly to Library 2", async () => {
    const newPatron = await registerPatron(
      {
        patronType: "STUDENT",
        categoryId: 1,
        libraryId: 2,
        firstName: "Anjali",
        lastName: "Verma",
        cardNo: "GN-STU-001",
        gender: "FEMALE",
      },
      gnLibrarian,
      db,
    );

    expect(newPatron.libraryId).toBe(2);

    // Verify Library 2 now has exactly 1 patron
    const gnPatrons = await listPatrons({ libraryId: 2 }, db);
    expect(gnPatrons.pagination.totalCount).toBe(1);
    expect(gnPatrons.records[0].cardNo).toBe("GN-STU-001");
    expect(gnPatrons.records[0].libraryId).toBe(2);

    // Verify Central Library does NOT see Anjali Verma
    const clPatrons = await listPatrons({ libraryId: 1, search: "GN-STU-001" }, db);
    expect(clPatrons.pagination.totalCount).toBe(0);
  });

  it("6. Accessioning copies into Library 2 scopes them strictly to Library 2", async () => {
    // Add 2 copies of title #1 to Library 2
    const added = await addCopiesToTitle(
      {
        bibId: 1,
        libraryId: 2,
        count: 2,
      },
      gnLibrarian,
      db,
    );

    expect(added.length).toBe(2);
    expect(added[0].libraryId).toBe(2);

    // Verify Library 2 catalogue now shows 2 copies
    const gnCopies = await listIndividualCopies({ libraryId: 2 }, db);
    expect(gnCopies.pagination.totalCount).toBe(2);

    // Verify Library 2 consolidated view now shows 1 title group with 2 copies
    const gnConsolidated = await listConsolidatedBooks({ libraryId: 2 }, db);
    expect(gnConsolidated.pagination.totalCount).toBe(1);
    expect(gnConsolidated.records[0].totalCopies).toBe(2);
  });

  it("7. Bulk importing student roster with defaultLibraryId scopes imported patrons to that library", async () => {
    const csvContent =
      "name, card_no, gender, dob, institute, course, department, year, semester, mobile, email\n" +
      "Vikram Singh, GN-STU-002, M, 10-05-2003, RBCET, B.Tech, CSE, 2, 3, 9811122233, vikram@example.com";
    const buffer = Buffer.from(csvContent, "utf-8");

    const preview = await validatePatronCsv(buffer, "STUDENT", { defaultLibraryId: 2 }, db);
    expect(preview.summary.errorCount).toBe(0);
    expect(preview.rows[0].data?.libraryId).toBe(2);

    const result = await commitPatronImport(preview, adminActor, db);
    expect(result.importedCount).toBe(1);

    // Verify Library 2 now has 2 patrons total
    const gnPatrons = await listPatrons({ libraryId: 2 }, db);
    expect(gnPatrons.pagination.totalCount).toBe(2);
    const vikram = gnPatrons.records.find((p: any) => p.cardNo === "GN-STU-002");
    expect(vikram).toBeDefined();
    expect(vikram?.libraryId).toBe(2);
  });

  it("8. Separate physical tables exist for libraries (items_cl, items_lib_gn, items_rbcp, items_rbcn)", async () => {
    // Verify items_lib_gn has the 2 copies added to Library 2
    const gnTableCopies = await db.select().from(schema.itemsLibGn);
    expect(gnTableCopies.length).toBe(2);
    expect(gnTableCopies[0].libraryId).toBe(2);

    // Verify items_rbcp and items_rbcn remain empty
    const rbcpTableCopies = await db.select().from(schema.itemsRbcp);
    expect(rbcpTableCopies.length).toBe(0);

    const rbcnTableCopies = await db.select().from(schema.itemsRbcn);
    expect(rbcnTableCopies.length).toBe(0);
  });
});
