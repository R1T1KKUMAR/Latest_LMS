import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { setTestDb } from "@/db/client";
import * as schema from "@/db/schema";
import { commitBookImport, validateBookCsv } from "@/services/book-import";

describe("Phase 13: Book Catalogue CSV Import Integration Suite (FR-BI-01 to FR-BI-05, T-18)", () => {
  let pglite: PGlite;
  // biome-ignore lint/suspicious/noExplicitAny: generic DB instance
  let db: any;
  const testActor = { id: 1, fullName: "Cataloguing Librarian", ipAddress: "127.0.0.1" };

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

  it("1. Validates book CSV in preview stage without any database writes (FR-BI-02)", async () => {
    const bookCsv = [
      "title,isbn,authors,publisher,pub_year,copies,price,library,item_type",
      "Structure and Interpretation of Computer Programs,9780262510875,Harold Abelson,MIT Press,1996,2,750.00,CL,BOOK",
    ].join("\n");

    const buffer = Buffer.from(bookCsv, "utf8");
    const preview = await validateBookCsv(buffer, { fileName: "sicp.csv" }, db);

    expect(preview.summary.totalRows).toBe(1);
    expect(preview.summary.okCount).toBe(1);
    expect(preview.summary.newTitlesCount).toBe(1);
    expect(preview.summary.totalCopiesExpected).toBe(2);

    // Verify ZERO database writes occurred
    const [existing] = await db
      .select()
      .from(schema.bibRecords)
      .where(eq(schema.bibRecords.title, "Structure and Interpretation of Computer Programs"));
    expect(existing).toBeUndefined();
  });

  it("2. Commits new title with auto-allocated accession numbers from library sequence (FR-BI-04, FR-BI-05)", async () => {
    const bookCsv = [
      "title,isbn,authors,publisher,pub_year,copies,price,library,item_type",
      "Structure and Interpretation of Computer Programs,9780262510875,Harold Abelson,MIT Press,1996,2,750.00,CL,BOOK",
    ].join("\n");

    const buffer = Buffer.from(bookCsv, "utf8");
    const preview = await validateBookCsv(buffer, { fileName: "sicp.csv" }, db);
    const result = await commitBookImport(preview, testActor, db);

    expect(result.importedCount).toBe(1);
    expect(result.totalCopiesAdded).toBe(2);
    expect(result.titles[0].action).toBe("NEW_TITLE");
    expect(result.titles[0].copiesAdded).toBe(2);
    expect(result.allAccessionNumbers).toHaveLength(2);
    expect(result.titles[0].accessionRange).toBeDefined();
    expect(result.labelPrintUrl).toContain("/catalogue?accessions=");

    // Verify DB bib_record
    const [savedBib] = await db
      .select()
      .from(schema.bibRecords)
      .where(eq(schema.bibRecords.isbn, "9780262510875"));
    expect(savedBib).toBeDefined();
    expect(savedBib.title).toBe("Structure and Interpretation of Computer Programs");

    // Verify copies created in items
    const savedItems = await db
      .select()
      .from(schema.items)
      .where(eq(schema.items.bibId, savedBib.id));
    expect(savedItems).toHaveLength(2);
    expect(savedItems[0].status).toBe("AVAILABLE");
    expect(savedItems[0].accessionNo).toMatch(/^CL\d{6}$/);

    // Verify batch record
    const [batch] = await db
      .select()
      .from(schema.importBatches)
      .where(eq(schema.importBatches.id, result.batchId));
    expect(batch).toBeDefined();
    expect(batch.importType).toBe("CATALOGUE");
    expect(batch.importedRows).toBe(1);
  });

  it("3. Row matching existing ISBN adds copies to existing title instead of creating new title (FR-BI-03)", async () => {
    // 9780262510875 was created in test 2
    const addCopiesCsv = [
      "title,isbn,authors,copies,library",
      "SICP Second Edition,9780262510875,Harold Abelson,3,CL",
    ].join("\n");

    const buffer = Buffer.from(addCopiesCsv, "utf8");
    const preview = await validateBookCsv(buffer, { fileName: "sicp_extra.csv" }, db);

    expect(preview.summary.totalRows).toBe(1);
    expect(preview.rows[0].action).toBe("ADD_COPIES");
    expect(preview.rows[0].messages[0]).toContain("will add copies to existing title");

    const result = await commitBookImport(preview, testActor, db);
    expect(result.importedCount).toBe(1);
    expect(result.titles[0].action).toBe("ADD_COPIES");
    expect(result.totalCopiesAdded).toBe(3);

    // Verify only 1 bib_record exists for this ISBN
    const allMatchingBibs = await db
      .select()
      .from(schema.bibRecords)
      .where(eq(schema.bibRecords.isbn, "9780262510875"));
    expect(allMatchingBibs).toHaveLength(1);

    // Verify total copies under this bib is now 2 + 3 = 5
    const allItems = await db
      .select()
      .from(schema.items)
      .where(eq(schema.items.bibId, allMatchingBibs[0].id));
    expect(allItems).toHaveLength(5);
  });

  it("4. Accepts custom pipe-delimited accession numbers and barcodes (FR-BI-04)", async () => {
    const customAccCsv = [
      "title,authors,copies,accession_no,barcode,library",
      '"Compilers: Principles, Techniques, and Tools",Alfred Aho,2,CUSTOM-001|CUSTOM-002,BAR-001|BAR-002,CL',
    ].join("\n");

    const buffer = Buffer.from(customAccCsv, "utf8");
    const preview = await validateBookCsv(buffer, { fileName: "dragon_book.csv" }, db);

    expect(preview.summary.okCount).toBe(1);
    expect(preview.rows[0].data?.customCopies).toHaveLength(2);
    expect(preview.rows[0].data?.customCopies?.[0].accessionNo).toBe("CUSTOM-001");
    expect(preview.rows[0].data?.customCopies?.[0].barcode).toBe("BAR-001");

    const result = await commitBookImport(preview, testActor, db);
    expect(result.importedCount).toBe(1);

    const [item1] = await db
      .select()
      .from(schema.items)
      .where(eq(schema.items.accessionNo, "CUSTOM-001"));
    expect(item1).toBeDefined();
    expect(item1.barcode).toBe("BAR-001");
  });

  it("5. Re-importing same custom accession numbers triggers duplicate protection", async () => {
    const customAccCsv = [
      "title,authors,copies,accession_no,barcode,library",
      "Compilers: Duplicate Test,Alfred Aho,1,CUSTOM-001,BAR-001,CL",
    ].join("\n");

    const buffer = Buffer.from(customAccCsv, "utf8");
    const preview = await validateBookCsv(buffer, { fileName: "dragon_dup.csv" }, db);

    expect(preview.summary.totalRows).toBe(1);
    expect(preview.summary.errorCount).toBe(1);
    expect(preview.rows[0].status).toBe("ERROR");
    expect(preview.rows[0].messages[0]).toContain("already exists in database");

    const result = await commitBookImport(preview, testActor, db);
    expect(result.importedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
  });

  it("6. Copies of reference item types are created with REFERENCE_ONLY status (FR-CA-06)", async () => {
    const refCsv = [
      "title,authors,copies,item_type,library",
      "Encyclopedia of Computer Science,Anthony Ralston,1,REF,CL",
    ].join("\n");

    const buffer = Buffer.from(refCsv, "utf8");
    const preview = await validateBookCsv(buffer, { fileName: "ref_book.csv" }, db);
    const result = await commitBookImport(preview, testActor, db);

    expect(result.importedCount).toBe(1);

    const [refBib] = await db
      .select()
      .from(schema.bibRecords)
      .where(eq(schema.bibRecords.title, "Encyclopedia of Computer Science"));
    expect(refBib).toBeDefined();

    const [refCopy] = await db.select().from(schema.items).where(eq(schema.items.bibId, refBib.id));
    expect(refCopy).toBeDefined();
    expect(refCopy.status).toBe("REFERENCE_ONLY");
  });
});
