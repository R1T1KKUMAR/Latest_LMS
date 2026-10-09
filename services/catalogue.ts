import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import * as schema from "@/db/schema";
import { formatAccessionNumber, normalizeIsbn } from "@/lib/numbering";
import {
  type AddCopiesInput,
  addCopiesSchema,
  type CreateBibRecordInput,
  createBibRecordSchema,
  type UpdateBibRecordInput,
  type UpdateItemCopyInput,
  updateBibRecordSchema,
  updateItemCopySchema,
} from "@/lib/validations/catalogue";
import { recordAuditLog } from "./audit";

// biome-ignore lint/suspicious/noExplicitAny: generic DB instance support
type DbInstance = any;

interface Actor {
  id: number;
  fullName: string;
  ipAddress?: string;
}

/**
 * Creates a new bibliographic title record in bib_records (FR-CA-01).
 * Audited per NFR-S-01.
 */
export async function createBibRecord(
  input: CreateBibRecordInput,
  actor: Actor,
  db: DbInstance = defaultDb,
) {
  const parsed = createBibRecordSchema.parse(input);
  const normalizedIsbn = normalizeIsbn(parsed.isbn);

  const [created] = await db
    .insert(schema.bibRecords)
    .values({
      title: parsed.title,
      subtitle: parsed.subtitle,
      authors: parsed.authors,
      editors: parsed.editors,
      isbn: normalizedIsbn,
      edition: parsed.edition,
      publisher: parsed.publisher,
      placeOfPublication: parsed.placeOfPublication,
      pubYear: parsed.pubYear,
      pages: parsed.pages,
      language: parsed.language,
      subject: parsed.subject,
      keywords: parsed.keywords,
      ddcNumber: parsed.ddcNumber,
      callNumber: parsed.callNumber,
      itemTypeId: parsed.itemTypeId,
      departmentId: parsed.departmentId,
      summary: parsed.summary,
      price: parsed.price,
    })
    .returning();

  await recordAuditLog(
    {
      actorType: "STAFF",
      actorId: actor.id,
      actorName: actor.fullName,
      action: "BIB_CREATE",
      entity: "bib_records",
      entityId: String(created.id),
      details: `Created bibliographic record "${created.title}" (ISBN: ${created.isbn || "N/A"})`,
      ipAddress: actor.ipAddress,
    },
    db,
  );

  return created;
}

/**
 * Updates an existing bibliographic title record (FR-CA-01).
 */
export async function updateBibRecord(
  id: number,
  input: UpdateBibRecordInput,
  actor: Actor,
  db: DbInstance = defaultDb,
) {
  const parsed = updateBibRecordSchema.parse(input);
  const normalizedIsbn = parsed.isbn !== undefined ? normalizeIsbn(parsed.isbn) : undefined;

  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (parsed.title !== undefined) updateData.title = parsed.title;
  if (parsed.subtitle !== undefined) updateData.subtitle = parsed.subtitle;
  if (parsed.authors !== undefined) updateData.authors = parsed.authors;
  if (parsed.editors !== undefined) updateData.editors = parsed.editors;
  if (normalizedIsbn !== undefined) updateData.isbn = normalizedIsbn;
  if (parsed.edition !== undefined) updateData.edition = parsed.edition;
  if (parsed.publisher !== undefined) updateData.publisher = parsed.publisher;
  if (parsed.placeOfPublication !== undefined)
    updateData.placeOfPublication = parsed.placeOfPublication;
  if (parsed.pubYear !== undefined) updateData.pubYear = parsed.pubYear;
  if (parsed.pages !== undefined) updateData.pages = parsed.pages;
  if (parsed.language !== undefined) updateData.language = parsed.language;
  if (parsed.subject !== undefined) updateData.subject = parsed.subject;
  if (parsed.keywords !== undefined) updateData.keywords = parsed.keywords;
  if (parsed.ddcNumber !== undefined) updateData.ddcNumber = parsed.ddcNumber;
  if (parsed.callNumber !== undefined) updateData.callNumber = parsed.callNumber;
  if (parsed.itemTypeId !== undefined) updateData.itemTypeId = parsed.itemTypeId;
  if (parsed.departmentId !== undefined) updateData.departmentId = parsed.departmentId;
  if (parsed.summary !== undefined) updateData.summary = parsed.summary;
  if (parsed.price !== undefined) updateData.price = parsed.price;

  const [updated] = await db
    .update(schema.bibRecords)
    .set(updateData)
    .where(eq(schema.bibRecords.id, id))
    .returning();

  if (!updated) {
    throw new Error(`Bibliographic record #${id} not found`);
  }

  await recordAuditLog(
    {
      actorType: "STAFF",
      actorId: actor.id,
      actorName: actor.fullName,
      action: "BIB_UPDATE",
      entity: "bib_records",
      entityId: String(id),
      details: `Updated bibliographic record "${updated.title}"`,
      ipAddress: actor.ipAddress,
    },
    db,
  );

  return updated;
}

/**
 * Retrieves a bibliographic record with its item copies and summary counts (FR-CA-05).
 */
export async function getBibRecordById(id: number, db: DbInstance = defaultDb) {
  const [bib] = await db
    .select({
      id: schema.bibRecords.id,
      isbn: schema.bibRecords.isbn,
      title: schema.bibRecords.title,
      subtitle: schema.bibRecords.subtitle,
      authors: schema.bibRecords.authors,
      editors: schema.bibRecords.editors,
      edition: schema.bibRecords.edition,
      publisher: schema.bibRecords.publisher,
      placeOfPublication: schema.bibRecords.placeOfPublication,
      pubYear: schema.bibRecords.pubYear,
      pages: schema.bibRecords.pages,
      language: schema.bibRecords.language,
      subject: schema.bibRecords.subject,
      keywords: schema.bibRecords.keywords,
      ddcNumber: schema.bibRecords.ddcNumber,
      callNumber: schema.bibRecords.callNumber,
      itemTypeId: schema.bibRecords.itemTypeId,
      departmentId: schema.bibRecords.departmentId,
      summary: schema.bibRecords.summary,
      price: schema.bibRecords.price,
      createdAt: schema.bibRecords.createdAt,
      itemTypeName: schema.itemTypes.name,
      isReference: schema.itemTypes.isReference,
      departmentName: schema.departments.name,
    })
    .from(schema.bibRecords)
    .innerJoin(schema.itemTypes, eq(schema.bibRecords.itemTypeId, schema.itemTypes.id))
    .leftJoin(schema.departments, eq(schema.bibRecords.departmentId, schema.departments.id))
    .where(eq(schema.bibRecords.id, id))
    .limit(1);

  if (!bib) return null;

  const copies = await db
    .select({
      id: schema.items.id,
      accessionNo: schema.items.accessionNo,
      barcode: schema.items.barcode,
      callNumber: schema.items.callNumber,
      location: schema.items.location,
      price: schema.items.price,
      status: schema.items.status,
      acquisitionDate: schema.items.acquisitionDate,
      conditionNote: schema.items.conditionNote,
      libraryId: schema.items.libraryId,
      libraryCode: schema.libraries.code,
      libraryName: schema.libraries.name,
    })
    .from(schema.items)
    .innerJoin(schema.libraries, eq(schema.items.libraryId, schema.libraries.id))
    .where(eq(schema.items.bibId, id))
    .orderBy(schema.items.accessionNo);

  const totalCopies = copies.length;
  const availableCopies = copies.filter((c: { status: string }) => c.status === "AVAILABLE").length;
  const issuedCopies = copies.filter((c: { status: string }) => c.status === "ISSUED").length;
  const reservedCopies = copies.filter((c: { status: string }) => c.status === "RESERVED").length;
  const referenceCopies = copies.filter(
    (c: { status: string }) => c.status === "REFERENCE_ONLY",
  ).length;

  return {
    ...bib,
    copies,
    stats: {
      totalCopies,
      availableCopies,
      issuedCopies,
      reservedCopies,
      referenceCopies,
    },
  };
}

/**
 * Searches and paginates bibliographic titles (FR-CA-04, UI-4).
 */
export async function listBibRecords(
  options: {
    search?: string;
    itemTypeId?: number;
    departmentId?: number;
    libraryId?: number;
    page?: number;
    limit?: number;
  } = {},
  db: DbInstance = defaultDb,
) {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 25));
  const offset = (page - 1) * limit;

  const conditions = [];

  if (options.search?.trim()) {
    const term = `%${options.search.trim()}%`;
    conditions.push(
      or(
        ilike(schema.bibRecords.title, term),
        ilike(schema.bibRecords.subtitle, term),
        ilike(schema.bibRecords.authors, term),
        ilike(schema.bibRecords.isbn, term),
        ilike(schema.bibRecords.subject, term),
        ilike(schema.bibRecords.callNumber, term),
        ilike(schema.bibRecords.publisher, term),
      ),
    );
  }

  if (options.itemTypeId) {
    conditions.push(eq(schema.bibRecords.itemTypeId, options.itemTypeId));
  }

  if (options.departmentId) {
    conditions.push(eq(schema.bibRecords.departmentId, options.departmentId));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [countRes] = await db
    .select({ total: sql<number>`count(distinct ${schema.bibRecords.id})::int` })
    .from(schema.bibRecords)
    .where(whereClause);

  const totalCount = countRes?.total ?? 0;
  const totalPages = Math.ceil(totalCount / limit);

  const records = await db
    .select({
      id: schema.bibRecords.id,
      title: schema.bibRecords.title,
      subtitle: schema.bibRecords.subtitle,
      authors: schema.bibRecords.authors,
      isbn: schema.bibRecords.isbn,
      edition: schema.bibRecords.edition,
      pubYear: schema.bibRecords.pubYear,
      callNumber: schema.bibRecords.callNumber,
      itemTypeId: schema.bibRecords.itemTypeId,
      itemTypeName: schema.itemTypes.name,
      totalCopies: sql<number>`count(${schema.items.id})::int`,
      availableCopies: sql<number>`count(case when ${schema.items.status} = 'AVAILABLE' then 1 end)::int`,
    })
    .from(schema.bibRecords)
    .innerJoin(schema.itemTypes, eq(schema.bibRecords.itemTypeId, schema.itemTypes.id))
    .leftJoin(schema.items, eq(schema.bibRecords.id, schema.items.bibId))
    .where(whereClause)
    .groupBy(schema.bibRecords.id, schema.itemTypes.name)
    .orderBy(desc(schema.bibRecords.createdAt))
    .limit(limit)
    .offset(offset);

  return {
    records,
    pagination: {
      page,
      limit,
      totalCount,
      totalPages,
    },
  };
}

/**
 * Adds 1–200 copies to a title in an atomic transaction (FR-CA-02, FR-CA-03, FR-CA-06).
 * Auto-allocates consecutive accession numbers from library.next_accession_no.
 */
export async function addCopiesToTitle(
  input: AddCopiesInput,
  actor: Actor,
  db: DbInstance = defaultDb,
) {
  const parsed = addCopiesSchema.parse(input);

  // 1. Fetch title and item type to determine default status (FR-CA-06: Reference items default to REFERENCE_ONLY)
  const [bib] = await db
    .select({
      id: schema.bibRecords.id,
      title: schema.bibRecords.title,
      callNumber: schema.bibRecords.callNumber,
      price: schema.bibRecords.price,
      isReference: schema.itemTypes.isReference,
    })
    .from(schema.bibRecords)
    .innerJoin(schema.itemTypes, eq(schema.bibRecords.itemTypeId, schema.itemTypes.id))
    .where(eq(schema.bibRecords.id, parsed.bibId))
    .limit(1);

  if (!bib) {
    throw new Error(`Bibliographic record #${parsed.bibId} does not exist`);
  }

  // 2. Fetch library to allocate accession numbers
  const [lib] = await db
    .select()
    .from(schema.libraries)
    .where(eq(schema.libraries.id, parsed.libraryId))
    .limit(1);

  if (!lib || !lib.isActive) {
    throw new Error(`Library branch #${parsed.libraryId} is inactive or does not exist`);
  }

  const defaultStatus = bib.isReference ? "REFERENCE_ONLY" : "AVAILABLE";
  const itemPrice = parsed.price ?? bib.price ?? "0.00";
  const callNumber = parsed.callNumber ?? bib.callNumber;

  const copiesToInsert: Array<typeof schema.items.$inferInsert> = [];
  let currentCounter = lib.nextAccessionNo;

  for (let i = 0; i < parsed.count; i++) {
    let accessionNo: string;
    if (parsed.customAccessionNumbers && parsed.customAccessionNumbers[i]) {
      accessionNo = parsed.customAccessionNumbers[i].trim().toUpperCase();
    } else {
      accessionNo = formatAccessionNumber(lib.accessionPrefix, currentCounter);
      currentCounter++;
    }

    const barcode = accessionNo; // Barcode defaults to accession number per SRS Section 5.2

    copiesToInsert.push({
      bibId: parsed.bibId,
      libraryId: parsed.libraryId,
      accessionNo,
      barcode,
      callNumber,
      location: parsed.location,
      price: itemPrice,
      vendorId: parsed.vendorId,
      invoiceNo: parsed.invoiceNo,
      acquisitionDate: parsed.acquisitionDate || new Date().toISOString().split("T")[0],
      status: defaultStatus,
      conditionNote: parsed.conditionNote,
    });
  }

  // Atomic insertion & counter increment
  const insertedCopies = await db.transaction(async (tx: DbInstance) => {
    // Update nextAccessionNo
    if (currentCounter !== lib.nextAccessionNo) {
      await tx
        .update(schema.libraries)
        .set({ nextAccessionNo: currentCounter, updatedAt: new Date() })
        .where(eq(schema.libraries.id, lib.id));
    }

    const rows = await tx.insert(schema.items).values(copiesToInsert).returning();
    return rows;
  });

  const firstAcc = insertedCopies[0]?.accessionNo;
  const lastAcc = insertedCopies[insertedCopies.length - 1]?.accessionNo;

  await recordAuditLog(
    {
      actorType: "STAFF",
      actorId: actor.id,
      actorName: actor.fullName,
      action: "ITEM_CREATE",
      entity: "items",
      entityId: String(parsed.bibId),
      details: `Accessioned ${insertedCopies.length} copies of "${bib.title}" (${firstAcc}..${lastAcc}) at library ${lib.code}`,
      ipAddress: actor.ipAddress,
    },
    db,
  );

  return insertedCopies;
}

/**
 * Updates an individual physical copy status, location, or notes (FR-CA-03, FR-CA-08).
 * Note: Copies are never deleted per FR-CA-08; WITHDRAWN status is used instead.
 */
export async function updateItemCopy(
  id: number,
  input: UpdateItemCopyInput,
  actor: Actor,
  db: DbInstance = defaultDb,
) {
  const parsed = updateItemCopySchema.parse(input);

  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (parsed.status !== undefined) updateData.status = parsed.status;
  if (parsed.location !== undefined) updateData.location = parsed.location;
  if (parsed.callNumber !== undefined) updateData.callNumber = parsed.callNumber;
  if (parsed.conditionNote !== undefined) updateData.conditionNote = parsed.conditionNote;
  if (parsed.price !== undefined) updateData.price = parsed.price;

  const [updated] = await db
    .update(schema.items)
    .set(updateData)
    .where(eq(schema.items.id, id))
    .returning();

  if (!updated) {
    throw new Error(`Item copy #${id} not found`);
  }

  await recordAuditLog(
    {
      actorType: "STAFF",
      actorId: actor.id,
      actorName: actor.fullName,
      action: "ITEM_UPDATE_STATUS",
      entity: "items",
      entityId: String(id),
      details: `Updated copy [${updated.accessionNo}] status to ${updated.status}`,
      ipAddress: actor.ipAddress,
    },
    db,
  );

  return updated;
}

/**
 * Looks up a copy by its accession number.
 */
export async function getItemCopyByAccession(accessionNo: string, db: DbInstance = defaultDb) {
  const [copy] = await db
    .select({
      id: schema.items.id,
      bibId: schema.items.bibId,
      accessionNo: schema.items.accessionNo,
      barcode: schema.items.barcode,
      status: schema.items.status,
      location: schema.items.location,
      price: schema.items.price,
      title: schema.bibRecords.title,
      authors: schema.bibRecords.authors,
      callNumber: schema.items.callNumber,
      libraryId: schema.items.libraryId,
      libraryName: schema.libraries.name,
      libraryCode: schema.libraries.code,
    })
    .from(schema.items)
    .innerJoin(schema.bibRecords, eq(schema.items.bibId, schema.bibRecords.id))
    .innerJoin(schema.libraries, eq(schema.items.libraryId, schema.libraries.id))
    .where(eq(schema.items.accessionNo, accessionNo.trim().toUpperCase()))
    .limit(1);

  return copy || null;
}
