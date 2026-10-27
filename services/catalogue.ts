import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import * as schema from "@/db/schema";
import { generateDepartmentBarcode } from "@/lib/department-barcodes";
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
    institutionId?: number;
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
        ilike(schema.items.barcode, term),
        ilike(schema.items.accessionNo, term),
      ),
    );
  }

  if (options.itemTypeId) {
    conditions.push(eq(schema.bibRecords.itemTypeId, options.itemTypeId));
  }

  if (options.departmentId) {
    conditions.push(eq(schema.bibRecords.departmentId, options.departmentId));
  }

  if (options.institutionId) {
    conditions.push(eq(schema.departments.institutionId, options.institutionId));
  }

  if (options.libraryId) {
    conditions.push(eq(schema.items.libraryId, options.libraryId));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const countQuery = db
    .select({ total: sql<number>`count(distinct ${schema.bibRecords.id})::int` })
    .from(schema.bibRecords)
    .leftJoin(schema.departments, eq(schema.bibRecords.departmentId, schema.departments.id));

  const shouldJoinItems = Boolean(options.search?.trim() || options.libraryId);

  const [countRes] = shouldJoinItems
    ? await countQuery
        .leftJoin(schema.items, eq(schema.bibRecords.id, schema.items.bibId))
        .where(whereClause)
    : await countQuery.where(whereClause);

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
      departmentId: schema.bibRecords.departmentId,
      departmentName: schema.departments.name,
      departmentCode: schema.departments.code,
      institutionId: schema.departments.institutionId,
      institutionCode: schema.institutions.code,
      institutionName: schema.institutions.name,
      barcode: sql<string | null>`max(${schema.items.barcode})`,
      accessionNo: sql<string | null>`max(${schema.items.accessionNo})`,
      copyId: sql<number | null>`max(${schema.items.id})`,
      totalCopies: sql<number>`count(${schema.items.id})::int`,
      availableCopies: sql<number>`count(case when ${schema.items.status} = 'AVAILABLE' then 1 end)::int`,
    })
    .from(schema.bibRecords)
    .innerJoin(schema.itemTypes, eq(schema.bibRecords.itemTypeId, schema.itemTypes.id))
    .leftJoin(schema.departments, eq(schema.bibRecords.departmentId, schema.departments.id))
    .leftJoin(schema.institutions, eq(schema.departments.institutionId, schema.institutions.id))
    .leftJoin(schema.items, eq(schema.bibRecords.id, schema.items.bibId))
    .where(whereClause)
    .groupBy(
      schema.bibRecords.id,
      schema.itemTypes.name,
      schema.departments.name,
      schema.departments.code,
      schema.departments.institutionId,
      schema.institutions.code,
      schema.institutions.name,
    )
    .orderBy(schema.bibRecords.id)
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
 * Searches and paginates individual book copies (all 26,072 physical volumes).
 * Each row corresponds to a specific physical book copy in `items` with its unique barcode and accession number.
 */
export async function listIndividualCopies(
  options: {
    search?: string;
    itemTypeId?: number;
    departmentId?: number;
    institutionId?: number;
    libraryId?: number;
    page?: number;
    limit?: number;
  } = {},
  db: DbInstance = defaultDb,
) {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 50));
  const offset = (page - 1) * limit;

  const conditions = [];

  if (options.search?.trim()) {
    const term = `%${options.search.trim()}%`;
    conditions.push(
      or(
        ilike(schema.items.barcode, term),
        ilike(schema.items.accessionNo, term),
        ilike(schema.bibRecords.title, term),
        ilike(schema.bibRecords.subtitle, term),
        ilike(schema.bibRecords.authors, term),
        ilike(schema.bibRecords.isbn, term),
        ilike(schema.bibRecords.callNumber, term),
        ilike(schema.bibRecords.publisher, term),
        ilike(schema.bibRecords.subject, term),
      ),
    );
  }

  if (options.itemTypeId) {
    conditions.push(eq(schema.bibRecords.itemTypeId, options.itemTypeId));
  }

  if (options.departmentId) {
    conditions.push(eq(schema.bibRecords.departmentId, options.departmentId));
  }

  if (options.institutionId) {
    conditions.push(eq(schema.departments.institutionId, options.institutionId));
  }

  if (options.libraryId) {
    conditions.push(eq(schema.items.libraryId, options.libraryId));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const countQuery = whereClause
    ? db
        .select({ total: sql<number>`count(${schema.items.id})::int` })
        .from(schema.items)
        .innerJoin(schema.bibRecords, eq(schema.items.bibId, schema.bibRecords.id))
        .leftJoin(schema.departments, eq(schema.bibRecords.departmentId, schema.departments.id))
        .where(whereClause)
    : db.select({ total: sql<number>`count(*)::int` }).from(schema.items);

  const [countRes] = await countQuery;
  const totalCount = countRes?.total ?? 0;
  const totalPages = Math.ceil(totalCount / limit);

  const records = await db
    .select({
      id: schema.bibRecords.id,
      copyId: schema.items.id,
      title: schema.bibRecords.title,
      subtitle: schema.bibRecords.subtitle,
      authors: schema.bibRecords.authors,
      isbn: schema.bibRecords.isbn,
      edition: schema.bibRecords.edition,
      pubYear: schema.bibRecords.pubYear,
      callNumber: sql<
        string | null
      >`coalesce(${schema.items.callNumber}, ${schema.bibRecords.callNumber})`,
      itemTypeId: schema.bibRecords.itemTypeId,
      itemTypeName: schema.itemTypes.name,
      departmentId: schema.bibRecords.departmentId,
      departmentName: schema.departments.name,
      departmentCode: schema.departments.code,
      institutionId: schema.departments.institutionId,
      institutionCode: schema.institutions.code,
      institutionName: schema.institutions.name,
      barcode: schema.items.barcode,
      accessionNo: schema.items.accessionNo,
      status: schema.items.status,
      location: schema.items.location,
      price: schema.items.price,
      totalCopies: sql<number>`1`,
      availableCopies: sql<number>`case when ${schema.items.status} = 'AVAILABLE' then 1 else 0 end`,
    })
    .from(schema.items)
    .innerJoin(schema.bibRecords, eq(schema.items.bibId, schema.bibRecords.id))
    .innerJoin(schema.itemTypes, eq(schema.bibRecords.itemTypeId, schema.itemTypes.id))
    .leftJoin(schema.departments, eq(schema.bibRecords.departmentId, schema.departments.id))
    .leftJoin(schema.institutions, eq(schema.departments.institutionId, schema.institutions.id))
    .where(whereClause)
    .orderBy(schema.items.id)
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
    const libTable = schema.getLibraryItemsTable(parsed.libraryId);
    for (const copy of copiesToInsert) {
      await tx.insert(libTable).values(copy).onConflictDoNothing();
    }
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

/**
 * Searches and paginates consolidated books grouped by Title and Author.
 */
export async function listConsolidatedBooks(
  options: {
    search?: string;
    itemTypeId?: number;
    departmentId?: number;
    institutionId?: number;
    libraryId?: number;
    page?: number;
    limit?: number;
  } = {},
  db: DbInstance = defaultDb,
) {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 50));
  const offset = (page - 1) * limit;

  const conditions = [];

  if (options.search?.trim()) {
    const term = `%${options.search.trim()}%`;
    conditions.push(
      or(
        ilike(schema.bibRecords.title, term),
        ilike(schema.bibRecords.authors, term),
        ilike(schema.bibRecords.isbn, term),
        ilike(schema.items.barcode, term),
        ilike(schema.items.accessionNo, term),
      ),
    );
  }

  if (options.itemTypeId) {
    conditions.push(eq(schema.bibRecords.itemTypeId, options.itemTypeId));
  }

  if (options.departmentId) {
    conditions.push(eq(schema.bibRecords.departmentId, options.departmentId));
  }

  if (options.institutionId) {
    conditions.push(eq(schema.departments.institutionId, options.institutionId));
  }

  if (options.libraryId) {
    conditions.push(eq(schema.items.libraryId, options.libraryId));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Count total consolidated groups efficiently
  const countInner = db
    .select({
      t: sql`lower(trim(${schema.bibRecords.title}))`,
      a: sql`lower(trim(${schema.bibRecords.authors}))`,
    })
    .from(schema.bibRecords)
    .leftJoin(schema.departments, eq(schema.bibRecords.departmentId, schema.departments.id));

  const shouldJoinItems = Boolean(options.search?.trim() || options.libraryId);

  const [countRes] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(
      (shouldJoinItems
        ? countInner.leftJoin(schema.items, eq(schema.bibRecords.id, schema.items.bibId))
        : countInner
      )
        .where(whereClause)
        .groupBy(
          sql`lower(trim(${schema.bibRecords.title}))`,
          sql`lower(trim(${schema.bibRecords.authors}))`,
        )
        .as("group_count"),
    );

  const totalCount = countRes?.total ?? 0;
  const totalPages = Math.ceil(totalCount / limit);

  const records = await db
    .select({
      id: sql<number>`min(${schema.bibRecords.id})`,
      title: sql<string>`min(${schema.bibRecords.title})`,
      authors: sql<string>`min(${schema.bibRecords.authors})`,
      isbn: sql<string | null>`max(${schema.bibRecords.isbn})`,
      itemTypeId: sql<number>`min(${schema.bibRecords.itemTypeId})`,
      itemTypeName: sql<string>`min(${schema.itemTypes.name})`,
      departmentId: sql<number | null>`min(${schema.bibRecords.departmentId})`,
      departmentName: sql<string | null>`min(${schema.departments.name})`,
      departmentCode: sql<string | null>`min(${schema.departments.code})`,
      institutionId: sql<number | null>`min(${schema.departments.institutionId})`,
      institutionCode: sql<string | null>`min(${schema.institutions.code})`,
      institutionName: sql<string | null>`min(${schema.institutions.name})`,
      barcode: sql<string | null>`min(${schema.items.barcode})`,
      totalCopies: sql<number>`count(${schema.items.id})::int`,
      availableCopies: sql<number>`count(case when ${schema.items.status} = 'AVAILABLE' then 1 end)::int`,
      bibCount: sql<number>`count(distinct ${schema.bibRecords.id})::int`,
    })
    .from(schema.bibRecords)
    .innerJoin(schema.itemTypes, eq(schema.bibRecords.itemTypeId, schema.itemTypes.id))
    .leftJoin(schema.departments, eq(schema.bibRecords.departmentId, schema.departments.id))
    .leftJoin(schema.institutions, eq(schema.departments.institutionId, schema.institutions.id))
    .leftJoin(schema.items, eq(schema.bibRecords.id, schema.items.bibId))
    .where(whereClause)
    .groupBy(
      sql`lower(trim(${schema.bibRecords.title}))`,
      sql`lower(trim(${schema.bibRecords.authors}))`,
      schema.bibRecords.itemTypeId,
    )
    .orderBy(sql`lower(trim(${schema.bibRecords.title}))`)
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
 * Retrieves all physical copies of books belonging to a consolidated title and author.
 */
export async function getConsolidatedBookCopies(
  title: string,
  authors?: string,
  libraryId?: number,
  db: DbInstance = defaultDb,
) {
  const conditions = [sql`lower(trim(${schema.bibRecords.title})) = lower(trim(${title}))`];
  if (authors) {
    conditions.push(sql`lower(trim(${schema.bibRecords.authors})) = lower(trim(${authors}))`);
  }
  if (libraryId) {
    conditions.push(eq(schema.items.libraryId, libraryId));
  }

  const copies = await db
    .select({
      id: schema.items.id,
      bibId: schema.items.bibId,
      accessionNo: schema.items.accessionNo,
      barcode: schema.items.barcode,
      callNumber: schema.items.callNumber,
      location: schema.items.location,
      price: schema.items.price,
      status: schema.items.status,
      acquisitionDate: schema.items.acquisitionDate,
      conditionNote: schema.items.conditionNote,
      libraryId: schema.items.libraryId,
      libraryName: schema.libraries.name,
      departmentId: schema.bibRecords.departmentId,
      departmentName: schema.departments.name,
      departmentCode: schema.departments.code,
      institutionId: schema.departments.institutionId,
      institutionCode: schema.institutions.code,
      institutionName: schema.institutions.name,
      title: schema.bibRecords.title,
      authors: schema.bibRecords.authors,
    })
    .from(schema.items)
    .innerJoin(schema.bibRecords, eq(schema.items.bibId, schema.bibRecords.id))
    .innerJoin(schema.libraries, eq(schema.items.libraryId, schema.libraries.id))
    .leftJoin(schema.departments, eq(schema.bibRecords.departmentId, schema.departments.id))
    .leftJoin(schema.institutions, eq(schema.departments.institutionId, schema.institutions.id))
    .where(and(...conditions))
    .orderBy(schema.items.barcode, schema.items.accessionNo);

  return copies;
}

/**
 * Deletes an individual book copy (item) safely.
 * If no copies remain for the bibliographic record, the bibRecord is also removed.
 */
export async function deleteBookCopy(copyId: number, actor: Actor, db: DbInstance = defaultDb) {
  const [copy] = await db
    .select({
      id: schema.items.id,
      bibId: schema.items.bibId,
      barcode: schema.items.barcode,
      accessionNo: schema.items.accessionNo,
      status: schema.items.status,
      title: schema.bibRecords.title,
    })
    .from(schema.items)
    .innerJoin(schema.bibRecords, eq(schema.items.bibId, schema.bibRecords.id))
    .where(eq(schema.items.id, copyId))
    .limit(1);

  if (!copy) {
    throw new Error(`Book copy #${copyId} not found`);
  }

  if (copy.status === "ISSUED") {
    throw new Error(
      `Cannot delete copy [${copy.barcode}] because it is currently issued to a patron.`,
    );
  }

  await db.transaction(async (tx: DbInstance) => {
    await tx.delete(schema.items).where(eq(schema.items.id, copyId));

    const remaining = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.items)
      .where(eq(schema.items.bibId, copy.bibId));

    if ((remaining[0]?.count ?? 0) === 0) {
      await tx.delete(schema.bibRecords).where(eq(schema.bibRecords.id, copy.bibId));
    }
  });

  await recordAuditLog(
    {
      actorType: "STAFF",
      actorId: actor.id,
      actorName: actor.fullName,
      action: "ITEM_DELETE",
      entity: "items",
      entityId: String(copyId),
      details: `Deleted book copy [Barcode: ${copy.barcode}, Accession: ${copy.accessionNo}] for "${copy.title}"`,
      ipAddress: actor.ipAddress,
    },
    db,
  );

  return { success: true, deletedBarcode: copy.barcode };
}

/**
 * Deletes an entire bibliographic title and all its physical copies.
 */
export async function deleteBibRecordWithCopies(
  bibId: number,
  actor: Actor,
  db: DbInstance = defaultDb,
) {
  const [bib] = await db
    .select()
    .from(schema.bibRecords)
    .where(eq(schema.bibRecords.id, bibId))
    .limit(1);

  if (!bib) {
    throw new Error(`Bibliographic record #${bibId} not found`);
  }

  const copies = await db.select().from(schema.items).where(eq(schema.items.bibId, bibId));

  const hasIssued = copies.some((c: { status: string }) => c.status === "ISSUED");
  if (hasIssued) {
    throw new Error(
      `Cannot delete book "${bib.title}" because one or more copies are currently issued.`,
    );
  }

  await db.transaction(async (tx: DbInstance) => {
    await tx.delete(schema.items).where(eq(schema.items.bibId, bibId));
    await tx.delete(schema.bibRecords).where(eq(schema.bibRecords.id, bibId));
  });

  await recordAuditLog(
    {
      actorType: "STAFF",
      actorId: actor.id,
      actorName: actor.fullName,
      action: "BIB_DELETE",
      entity: "bib_records",
      entityId: String(bibId),
      details: `Deleted title "${bib.title}" and ${copies.length} associated copies`,
      ipAddress: actor.ipAddress,
    },
    db,
  );

  return { success: true, deletedTitle: bib.title, deletedCopiesCount: copies.length };
}

/**
 * Transfers one or more book copies to another department.
 * Recalculates and updates each book's barcode automatically to match the target department's prefix convention.
 */
export async function transferBooksDepartment(
  itemIds: number[],
  targetDepartmentId: number,
  actor: Actor,
  db: DbInstance = defaultDb,
) {
  if (!itemIds || itemIds.length === 0) {
    throw new Error("No book items specified for department transfer");
  }

  // 1. Fetch target department and institution
  const [targetDept] = await db
    .select({
      id: schema.departments.id,
      name: schema.departments.name,
      code: schema.departments.code,
      institutionId: schema.departments.institutionId,
      institutionName: schema.institutions.name,
      institutionCode: schema.institutions.code,
    })
    .from(schema.departments)
    .innerJoin(schema.institutions, eq(schema.departments.institutionId, schema.institutions.id))
    .where(eq(schema.departments.id, targetDepartmentId))
    .limit(1);

  if (!targetDept) {
    throw new Error(`Target department #${targetDepartmentId} does not exist`);
  }

  // 2. Fetch the items to transfer
  const itemsToTransfer = await db
    .select({
      id: schema.items.id,
      bibId: schema.items.bibId,
      barcode: schema.items.barcode,
      accessionNo: schema.items.accessionNo,
      status: schema.items.status,
      title: schema.bibRecords.title,
      currentDeptId: schema.bibRecords.departmentId,
    })
    .from(schema.items)
    .innerJoin(schema.bibRecords, eq(schema.items.bibId, schema.bibRecords.id))
    .where(inArray(schema.items.id, itemIds));

  if (itemsToTransfer.length === 0) {
    throw new Error("None of the specified book items were found");
  }

  // 3. Fetch all existing barcodes to prevent collisions
  const allExistingItems = await db.select({ barcode: schema.items.barcode }).from(schema.items);
  const existingBarcodeSet = new Set<string>();
  for (const it of allExistingItems) {
    if (it.barcode) existingBarcodeSet.add(it.barcode.toUpperCase());
  }

  // 4. Perform department transfer and barcode updates in a transaction
  const transferResults: Array<{
    itemId: number;
    bibId: number;
    title: string;
    oldBarcode: string;
    newBarcode: string;
  }> = [];

  await db.transaction(async (tx: DbInstance) => {
    for (const item of itemsToTransfer) {
      const oldBarcode = item.barcode;
      const newBarcode = generateDepartmentBarcode(oldBarcode, targetDept.code, existingBarcodeSet);

      // Register new barcode in the set immediately to avoid collision with subsequent items in this batch
      existingBarcodeSet.add(newBarcode.toUpperCase());

      // Update item copy's barcode and accession number
      await tx
        .update(schema.items)
        .set({
          barcode: newBarcode,
          accessionNo: newBarcode,
          updatedAt: new Date(),
        })
        .where(eq(schema.items.id, item.id));

      // Update department link on bibRecords
      await tx
        .update(schema.bibRecords)
        .set({
          departmentId: targetDept.id,
          updatedAt: new Date(),
        })
        .where(eq(schema.bibRecords.id, item.bibId));

      transferResults.push({
        itemId: item.id,
        bibId: item.bibId,
        title: item.title,
        oldBarcode,
        newBarcode,
      });
    }
  });

  await recordAuditLog(
    {
      actorType: "STAFF",
      actorId: actor.id,
      actorName: actor.fullName,
      action: "ITEM_TRANSFER_DEPARTMENT",
      entity: "items",
      entityId: String(itemIds[0]),
      details: `Transferred ${transferResults.length} books to ${targetDept.name} (${targetDept.institutionCode}): ${transferResults.map((r) => `${r.oldBarcode} -> ${r.newBarcode}`).join(", ")}`,
      ipAddress: actor.ipAddress,
    },
    db,
  );

  return {
    success: true,
    targetDepartment: {
      id: targetDept.id,
      name: targetDept.name,
      code: targetDept.code,
      institutionCode: targetDept.institutionCode,
    },
    transferredCount: transferResults.length,
    transfers: transferResults,
  };
}
