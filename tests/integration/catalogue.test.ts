import { PGlite } from "@electric-sql/pglite";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync } from "fs";
import { resolve } from "path";
import { beforeAll, describe, expect, it } from "vitest";
import { setTestDb } from "@/db/client";
import * as schema from "@/db/schema";
import {
  addCopiesToTitle,
  createBibRecord,
  getBibRecordById,
  getItemCopyByAccession,
  listBibRecords,
  updateBibRecord,
  updateItemCopy,
} from "@/services/catalogue";

describe("Integration: Catalogue & Physical Copies (FR-CA-01 to FR-CA-08)", () => {
  let pglite: PGlite;
  // biome-ignore lint/suspicious/noExplicitAny: generic DB instance
  let db: any;
  const testActor = { id: 1, fullName: "Test Cataloger" };

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

  it("1. Creates a bibliographic title record and logs audit entry (FR-CA-01)", async () => {
    const title = await createBibRecord(
      {
        title: "Introduction to Algorithms",
        subtitle: "Third Edition",
        authors: "Thomas H. Cormen, Charles E. Leiserson, Ronald L. Rivest, Clifford Stein",
        isbn: "978-0262033848",
        edition: "3rd",
        publisher: "MIT Press",
        pubYear: 2009,
        itemTypeId: 1, // Textbook
        callNumber: "005.1 COR",
        price: 1200.0,
      },
      testActor,
      db,
    );

    expect(title.id).toBeDefined();
    expect(title.isbn).toBe("9780262033848");
    expect(title.title).toBe("Introduction to Algorithms");

    // Verify audit log entry
    const [audit] = await db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.action, "BIB_CREATE"))
      .orderBy(sql`${schema.auditLogs.id} DESC`)
      .limit(1);

    expect(audit).toBeDefined();
    expect(audit.entity).toBe("bib_records");
    expect(audit.actorName).toBe("Test Cataloger");
  });

  it("2. Adds 3 copies in an atomic transaction and auto-allocates consecutive accession numbers (FR-CA-02, FR-CA-03)", async () => {
    // Fetch Central Library (id: 1, prefix: CL)
    const [libBefore] = await db
      .select()
      .from(schema.libraries)
      .where(eq(schema.libraries.id, 1))
      .limit(1);

    const startCounter = libBefore.nextAccessionNo;

    const copies = await addCopiesToTitle(
      {
        bibId: 1,
        libraryId: 1,
        count: 3,
        location: "Rack B-2",
        price: 450.0,
      },
      testActor,
      db,
    );

    expect(copies.length).toBe(3);
    expect(copies[0].accessionNo).toBe(`CL${String(startCounter).padStart(6, "0")}`);
    expect(copies[1].accessionNo).toBe(`CL${String(startCounter + 1).padStart(6, "0")}`);
    expect(copies[2].accessionNo).toBe(`CL${String(startCounter + 2).padStart(6, "0")}`);

    // Barcode defaults to accession number per SRS Section 5.2
    expect(copies[0].barcode).toBe(copies[0].accessionNo);

    // Initial status for standard textbook is AVAILABLE
    expect(copies[0].status).toBe("AVAILABLE");

    // Verify library next_accession_no was incremented
    const [libAfter] = await db
      .select()
      .from(schema.libraries)
      .where(eq(schema.libraries.id, 1))
      .limit(1);

    expect(libAfter.nextAccessionNo).toBe(startCounter + 3);
  });

  it("3. Reference item type copy is created with REFERENCE_ONLY status (FR-CA-06)", async () => {
    // Find reference item type (e.g. isReference = true)
    const [refType] = await db
      .select()
      .from(schema.itemTypes)
      .where(eq(schema.itemTypes.isReference, true))
      .limit(1);

    expect(refType).toBeDefined();

    // Create reference title
    const refTitle = await createBibRecord(
      {
        title: "Oxford English Dictionary Vol 1",
        authors: "J. A. H. Murray",
        itemTypeId: refType.id,
      },
      testActor,
      db,
    );

    const copies = await addCopiesToTitle(
      {
        bibId: refTitle.id,
        libraryId: 1,
        count: 1,
        location: "Reference Section",
      },
      testActor,
      db,
    );

    expect(copies[0].status).toBe("REFERENCE_ONLY");
  });

  it("4. Enforces database UNIQUE constraint on accession_no and barcode (DR-01)", async () => {
    // Attempting to manually insert an item with an existing accession_no must fail at the DB level
    const existingCopy = await getItemCopyByAccession("CL000001", db);
    expect(existingCopy).toBeDefined();

    await expect(
      db.insert(schema.items).values({
        bibId: 1,
        libraryId: 1,
        accessionNo: "CL000001", // duplicate
        barcode: "BARCODE_UNIQUE_123",
        status: "AVAILABLE",
        price: "100.00",
      }),
    ).rejects.toThrow();
  });

  it("5. Enforces database CHECK constraint chk_item_status (DR-03)", async () => {
    await expect(
      db.insert(schema.items).values({
        bibId: 1,
        libraryId: 1,
        accessionNo: "CL999999",
        barcode: "CL999999",
        status: "INVALID_STATUS_CODE", // Not in allowed enum
        price: "100.00",
      }),
    ).rejects.toThrow();
  });

  it("6. Updates physical copy status and condition notes (FR-CA-03, FR-CA-08)", async () => {
    const [targetCopy] = await db.select().from(schema.items).limit(1);

    expect(targetCopy).toBeDefined();

    const updated = await updateItemCopy(
      targetCopy.id,
      {
        status: "DAMAGED",
        conditionNote: "Spine damaged, pages intact",
      },
      testActor,
      db,
    );

    expect(updated.status).toBe("DAMAGED");
    expect(updated.conditionNote).toBe("Spine damaged, pages intact");

    // Verify copy detail
    const details = await getBibRecordById(targetCopy.bibId, db);
    expect(
      details?.copies.some(
        (c: { id: number; status: string }) => c.id === targetCopy.id && c.status === "DAMAGED",
      ),
    ).toBe(true);
  });

  it("7. Searches and paginates bibliographic titles (FR-CA-04, UI-4)", async () => {
    const result = await listBibRecords(
      {
        search: "Algorithms",
        page: 1,
        limit: 10,
      },
      db,
    );

    expect(result.records.length).toBeGreaterThanOrEqual(1);
    expect(result.records[0].title).toContain("Algorithms");
    expect(result.pagination.totalCount).toBeGreaterThanOrEqual(1);
  });
});
