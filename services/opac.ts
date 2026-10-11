/**
 * OPAC (Online Public Access Catalogue) and Patron Account Service (Phase 12).
 * Implements public catalogue search without staff authentication (FR-OP-01),
 * title details and copy availability with shelf locations (FR-OP-01, FR-CA-04),
 * new arrivals discovery (NEW_ARRIVAL_DAYS), most borrowed titles, departments browsing,
 * and complete patron account data retrieval (FR-OP-02, FR-OP-03, FR-AU-05).
 */

import { and, asc, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import * as schema from "@/db/schema";
import { listHolds } from "./holds";

// biome-ignore lint/suspicious/noExplicitAny: generic DB instance support
type DbInstance = any;

export interface OpacBookItem {
  id: number;
  title: string;
  subtitle: string | null;
  authors: string;
  isbn: string | null;
  edition: string | null;
  pubYear: number | null;
  publisher: string | null;
  subject: string | null;
  callNumber: string | null;
  departmentId: number | null;
  departmentName: string | null;
  itemTypeId: number;
  itemTypeName: string | null;
  totalCopies: number;
  availableCopies: number;
  issuedCopies: number;
  reservedCopies: number;
  referenceCopies: number;
}

export interface OpacCopyItem {
  id: number;
  accessionNo: string;
  barcode: string;
  callNumber: string | null;
  libraryId: number;
  libraryName: string;
  shelfLocation: string | null;
  status: string;
  conditionNote: string | null;
  price: string;
}

export interface OpacTitleDetail extends OpacBookItem {
  editors: string | null;
  summary: string | null;
  ddcNumber: string | null;
  placeOfPublication: string | null;
  pages: string | null;
  language: string | null;
  keywords: string | null;
  waitingHolds: number;
  copies: OpacCopyItem[];
}

export interface OpacDepartmentItem {
  id: number;
  code: string;
  name: string;
  titleCount: number;
  totalCopies: number;
}

export interface SearchOpacParams {
  q?: string;
  field?: "all" | "title" | "author" | "isbn" | "call" | "subject" | "publisher";
  departmentId?: number;
  onlyAvailable?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Searches the public catalogue without staff authentication (FR-OP-01, FR-CA-04).
 */
export async function searchOpac(
  params: SearchOpacParams = {},
  db: DbInstance = defaultDb,
): Promise<{ books: OpacBookItem[]; total: number }> {
  const query = params.q?.trim().toLowerCase();
  const field = params.field || "all";
  const departmentId = params.departmentId;
  const onlyAvailable = params.onlyAvailable ?? false;
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const offset = Math.max(params.offset ?? 0, 0);

  // Subquery: Aggregate copy counts per bib record
  const itemsAgg = db
    .select({
      bibId: schema.items.bibId,
      totalCopies: sql<number>`count(*)::int`.as("total_copies"),
      availableCopies:
        sql<number>`count(case when ${schema.items.status} = 'AVAILABLE' then 1 end)::int`.as(
          "available_copies",
        ),
      issuedCopies:
        sql<number>`count(case when ${schema.items.status} = 'ISSUED' then 1 end)::int`.as(
          "issued_copies",
        ),
      reservedCopies:
        sql<number>`count(case when ${schema.items.status} = 'RESERVED' then 1 end)::int`.as(
          "reserved_copies",
        ),
      referenceCopies:
        sql<number>`count(case when ${schema.items.status} = 'REFERENCE_ONLY' then 1 end)::int`.as(
          "reference_copies",
        ),
    })
    .from(schema.items)
    .groupBy(schema.items.bibId)
    .as("items_agg");

  let baseQuery = db
    .select({
      id: schema.bibRecords.id,
      title: schema.bibRecords.title,
      subtitle: schema.bibRecords.subtitle,
      authors: schema.bibRecords.authors,
      isbn: schema.bibRecords.isbn,
      edition: schema.bibRecords.edition,
      pubYear: schema.bibRecords.pubYear,
      publisher: schema.bibRecords.publisher,
      subject: schema.bibRecords.subject,
      callNumber: schema.bibRecords.callNumber,
      departmentId: schema.bibRecords.departmentId,
      departmentName: schema.departments.name,
      itemTypeId: schema.bibRecords.itemTypeId,
      itemTypeName: schema.itemTypes.name,
      totalCopies: sql<number>`coalesce(${itemsAgg.totalCopies}, 0)::int`,
      availableCopies: sql<number>`coalesce(${itemsAgg.availableCopies}, 0)::int`,
      issuedCopies: sql<number>`coalesce(${itemsAgg.issuedCopies}, 0)::int`,
      reservedCopies: sql<number>`coalesce(${itemsAgg.reservedCopies}, 0)::int`,
      referenceCopies: sql<number>`coalesce(${itemsAgg.referenceCopies}, 0)::int`,
    })
    .from(schema.bibRecords)
    .leftJoin(schema.departments, eq(schema.bibRecords.departmentId, schema.departments.id))
    .leftJoin(schema.itemTypes, eq(schema.bibRecords.itemTypeId, schema.itemTypes.id))
    .leftJoin(itemsAgg, eq(schema.bibRecords.id, itemsAgg.bibId));

  const conditions = [];

  if (departmentId) {
    conditions.push(eq(schema.bibRecords.departmentId, departmentId));
  }

  if (onlyAvailable) {
    conditions.push(sql`coalesce(${itemsAgg.availableCopies}, 0) > 0`);
  }

  if (query) {
    const pattern = `%${query}%`;
    if (field === "title") {
      conditions.push(
        or(
          sql`lower(${schema.bibRecords.title}) LIKE ${pattern}`,
          sql`lower(coalesce(${schema.bibRecords.subtitle}, '')) LIKE ${pattern}`,
        ),
      );
    } else if (field === "author") {
      conditions.push(sql`lower(${schema.bibRecords.authors}) LIKE ${pattern}`);
    } else if (field === "isbn") {
      conditions.push(sql`lower(coalesce(${schema.bibRecords.isbn}, '')) LIKE ${pattern}`);
    } else if (field === "call") {
      conditions.push(sql`lower(coalesce(${schema.bibRecords.callNumber}, '')) LIKE ${pattern}`);
    } else if (field === "subject") {
      conditions.push(
        or(
          sql`lower(coalesce(${schema.bibRecords.subject}, '')) LIKE ${pattern}`,
          sql`lower(coalesce(${schema.bibRecords.keywords}, '')) LIKE ${pattern}`,
        ),
      );
    } else if (field === "publisher") {
      conditions.push(sql`lower(coalesce(${schema.bibRecords.publisher}, '')) LIKE ${pattern}`);
    } else {
      // "all" matches title, subtitle, authors, subject, keywords, publisher, callNumber, isbn, accessionNo, barcode (FR-CA-04)
      conditions.push(
        or(
          sql`lower(${schema.bibRecords.title}) LIKE ${pattern}`,
          sql`lower(coalesce(${schema.bibRecords.subtitle}, '')) LIKE ${pattern}`,
          sql`lower(${schema.bibRecords.authors}) LIKE ${pattern}`,
          sql`lower(coalesce(${schema.bibRecords.isbn}, '')) LIKE ${pattern}`,
          sql`lower(coalesce(${schema.bibRecords.subject}, '')) LIKE ${pattern}`,
          sql`lower(coalesce(${schema.bibRecords.keywords}, '')) LIKE ${pattern}`,
          sql`lower(coalesce(${schema.bibRecords.publisher}, '')) LIKE ${pattern}`,
          sql`lower(coalesce(${schema.bibRecords.callNumber}, '')) LIKE ${pattern}`,
          // Match accession number or barcode on physical copies
          sql`exists (
            select 1 from ${schema.items} i 
            where i.bib_id = ${schema.bibRecords.id} 
              and (lower(i.accession_no) LIKE ${pattern} or lower(i.barcode) LIKE ${pattern})
          )`,
        ),
      );
    }
  }

  if (conditions.length > 0) {
    baseQuery = baseQuery.where(and(...conditions)) as any;
  }

  const rows = await baseQuery.orderBy(asc(schema.bibRecords.title)).limit(limit).offset(offset);

  return {
    books: rows.map((r: any) => ({
      id: r.id,
      title: r.title,
      subtitle: r.subtitle,
      authors: r.authors,
      isbn: r.isbn,
      edition: r.edition,
      pubYear: r.pubYear,
      publisher: r.publisher,
      subject: r.subject,
      callNumber: r.callNumber,
      departmentId: r.departmentId,
      departmentName: r.departmentName,
      itemTypeId: r.itemTypeId,
      itemTypeName: r.itemTypeName,
      totalCopies: Number(r.totalCopies || 0),
      availableCopies: Number(r.availableCopies || 0),
      issuedCopies: Number(r.issuedCopies || 0),
      reservedCopies: Number(r.reservedCopies || 0),
      referenceCopies: Number(r.referenceCopies || 0),
    })),
    total: rows.length,
  };
}

/**
 * Retrieves full title details with copy availability and physical shelf locations (FR-OP-01).
 */
export async function getOpacTitleDetails(
  bibId: number,
  db: DbInstance = defaultDb,
): Promise<OpacTitleDetail | null> {
  const bibRows = await db
    .select({
      id: schema.bibRecords.id,
      title: schema.bibRecords.title,
      subtitle: schema.bibRecords.subtitle,
      authors: schema.bibRecords.authors,
      editors: schema.bibRecords.editors,
      isbn: schema.bibRecords.isbn,
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
      itemTypeName: schema.itemTypes.name,
      departmentId: schema.bibRecords.departmentId,
      departmentName: schema.departments.name,
      summary: schema.bibRecords.summary,
      price: schema.bibRecords.price,
    })
    .from(schema.bibRecords)
    .leftJoin(schema.departments, eq(schema.bibRecords.departmentId, schema.departments.id))
    .leftJoin(schema.itemTypes, eq(schema.bibRecords.itemTypeId, schema.itemTypes.id))
    .where(eq(schema.bibRecords.id, bibId))
    .limit(1);

  const bib = bibRows[0];
  if (!bib) return null;

  // Query physical copies
  const copyRows = await db
    .select({
      id: schema.items.id,
      accessionNo: schema.items.accessionNo,
      barcode: schema.items.barcode,
      callNumber: schema.items.callNumber,
      libraryId: schema.items.libraryId,
      libraryName: schema.libraries.name,
      shelfLocation: schema.items.location,
      status: schema.items.status,
      conditionNote: schema.items.conditionNote,
      price: schema.items.price,
    })
    .from(schema.items)
    .innerJoin(schema.libraries, eq(schema.items.libraryId, schema.libraries.id))
    .where(eq(schema.items.bibId, bibId))
    .orderBy(asc(schema.items.accessionNo));

  // Count waiting holds
  const [holdsCountRes] = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(schema.holds)
    .where(and(eq(schema.holds.bibId, bibId), eq(schema.holds.status, "WAITING")));

  const waitingHolds = holdsCountRes?.count ?? 0;

  const totalCopies = copyRows.length;
  const availableCopies = copyRows.filter((c: any) => c.status === "AVAILABLE").length;
  const issuedCopies = copyRows.filter((c: any) => c.status === "ISSUED").length;
  const reservedCopies = copyRows.filter((c: any) => c.status === "RESERVED").length;
  const referenceCopies = copyRows.filter((c: any) => c.status === "REFERENCE_ONLY").length;

  return {
    id: bib.id,
    title: bib.title,
    subtitle: bib.subtitle,
    authors: bib.authors,
    editors: bib.editors,
    isbn: bib.isbn,
    edition: bib.edition,
    pubYear: bib.pubYear,
    publisher: bib.publisher,
    subject: bib.subject,
    callNumber: bib.callNumber,
    departmentId: bib.departmentId,
    departmentName: bib.departmentName,
    itemTypeId: bib.itemTypeId,
    itemTypeName: bib.itemTypeName,
    summary: bib.summary,
    ddcNumber: bib.ddcNumber,
    placeOfPublication: bib.placeOfPublication,
    pages: bib.pages,
    language: bib.language,
    keywords: bib.keywords,
    totalCopies,
    availableCopies,
    issuedCopies,
    reservedCopies,
    referenceCopies,
    waitingHolds,
    copies: copyRows.map((c: any) => ({
      id: c.id,
      accessionNo: c.accessionNo,
      barcode: c.barcode,
      callNumber: c.callNumber,
      libraryId: c.libraryId,
      libraryName: c.libraryName,
      shelfLocation: c.shelfLocation,
      status: c.status,
      conditionNote: c.conditionNote,
      price: c.price,
    })),
  };
}

/**
 * Retrieves new arrivals based on NEW_ARRIVAL_DAYS system setting (FR-OP-01).
 */
export async function getNewArrivals(
  options: { days?: number; limit?: number } = {},
  db: DbInstance = defaultDb,
): Promise<OpacBookItem[]> {
  const limit = options.limit ?? 20;

  // Resolve NEW_ARRIVAL_DAYS setting (defaults to 30)
  let days = options.days;
  if (!days) {
    const settingRows = await db
      .select({ val: schema.systemSettings.settingValue })
      .from(schema.systemSettings)
      .where(eq(schema.systemSettings.settingKey, "NEW_ARRIVAL_DAYS"))
      .limit(1);
    days = settingRows[0]?.val ? parseInt(settingRows[0].val, 10) : 30;
    if (Number.isNaN(days) || days <= 0) days = 30;
  }

  // Subquery: Aggregate copy counts and latest acquisition date per bib
  const itemsAgg = db
    .select({
      bibId: schema.items.bibId,
      latestAcquisition: sql`max(${schema.items.acquisitionDate})`.as("latest_acq"),
      totalCopies: sql<number>`count(*)::int`.as("total_copies"),
      availableCopies:
        sql<number>`count(case when ${schema.items.status} = 'AVAILABLE' then 1 end)::int`.as(
          "available_copies",
        ),
      issuedCopies:
        sql<number>`count(case when ${schema.items.status} = 'ISSUED' then 1 end)::int`.as(
          "issued_copies",
        ),
      reservedCopies:
        sql<number>`count(case when ${schema.items.status} = 'RESERVED' then 1 end)::int`.as(
          "reserved_copies",
        ),
      referenceCopies:
        sql<number>`count(case when ${schema.items.status} = 'REFERENCE_ONLY' then 1 end)::int`.as(
          "reference_copies",
        ),
    })
    .from(schema.items)
    .groupBy(schema.items.bibId)
    .as("items_agg");

  const rows = await db
    .select({
      id: schema.bibRecords.id,
      title: schema.bibRecords.title,
      subtitle: schema.bibRecords.subtitle,
      authors: schema.bibRecords.authors,
      isbn: schema.bibRecords.isbn,
      edition: schema.bibRecords.edition,
      pubYear: schema.bibRecords.pubYear,
      publisher: schema.bibRecords.publisher,
      subject: schema.bibRecords.subject,
      callNumber: schema.bibRecords.callNumber,
      departmentId: schema.bibRecords.departmentId,
      departmentName: schema.departments.name,
      itemTypeId: schema.bibRecords.itemTypeId,
      itemTypeName: schema.itemTypes.name,
      createdAt: schema.bibRecords.createdAt,
      totalCopies: sql<number>`coalesce(${itemsAgg.totalCopies}, 0)::int`,
      availableCopies: sql<number>`coalesce(${itemsAgg.availableCopies}, 0)::int`,
      issuedCopies: sql<number>`coalesce(${itemsAgg.issuedCopies}, 0)::int`,
      reservedCopies: sql<number>`coalesce(${itemsAgg.reservedCopies}, 0)::int`,
      referenceCopies: sql<number>`coalesce(${itemsAgg.referenceCopies}, 0)::int`,
    })
    .from(schema.bibRecords)
    .leftJoin(schema.departments, eq(schema.bibRecords.departmentId, schema.departments.id))
    .leftJoin(schema.itemTypes, eq(schema.bibRecords.itemTypeId, schema.itemTypes.id))
    .innerJoin(itemsAgg, eq(schema.bibRecords.id, itemsAgg.bibId))
    .where(
      or(
        sql`${itemsAgg.latestAcquisition} >= CURRENT_DATE - ${days}::int`,
        sql`${schema.bibRecords.createdAt} >= CURRENT_TIMESTAMP - (${days} || ' days')::interval`,
      ),
    )
    .orderBy(desc(schema.bibRecords.createdAt))
    .limit(limit);

  return rows.map((r: any) => ({
    id: r.id,
    title: r.title,
    subtitle: r.subtitle,
    authors: r.authors,
    isbn: r.isbn,
    edition: r.edition,
    pubYear: r.pubYear,
    publisher: r.publisher,
    subject: r.subject,
    callNumber: r.callNumber,
    departmentId: r.departmentId,
    departmentName: r.departmentName,
    itemTypeId: r.itemTypeId,
    itemTypeName: r.itemTypeName,
    totalCopies: Number(r.totalCopies || 0),
    availableCopies: Number(r.availableCopies || 0),
    issuedCopies: Number(r.issuedCopies || 0),
    reservedCopies: Number(r.reservedCopies || 0),
    referenceCopies: Number(r.referenceCopies || 0),
  }));
}

/**
 * Retrieves the most borrowed titles across the library system (FR-OP-01).
 */
export async function getMostBorrowedTitles(
  options: { limit?: number } = {},
  db: DbInstance = defaultDb,
): Promise<(OpacBookItem & { borrowCount: number })[]> {
  const limit = options.limit ?? 10;

  // Subquery: loan count per bib record
  const loanAgg = db
    .select({
      bibId: schema.items.bibId,
      borrowCount: sql<number>`count(${schema.loans.id})::int`.as("borrow_count"),
    })
    .from(schema.loans)
    .innerJoin(schema.items, eq(schema.loans.itemId, schema.items.id))
    .groupBy(schema.items.bibId)
    .as("loan_agg");

  // Subquery: Copy availability
  const itemsAgg = db
    .select({
      bibId: schema.items.bibId,
      totalCopies: sql<number>`count(*)::int`.as("total_copies"),
      availableCopies:
        sql<number>`count(case when ${schema.items.status} = 'AVAILABLE' then 1 end)::int`.as(
          "available_copies",
        ),
      issuedCopies:
        sql<number>`count(case when ${schema.items.status} = 'ISSUED' then 1 end)::int`.as(
          "issued_copies",
        ),
      reservedCopies:
        sql<number>`count(case when ${schema.items.status} = 'RESERVED' then 1 end)::int`.as(
          "reserved_copies",
        ),
      referenceCopies:
        sql<number>`count(case when ${schema.items.status} = 'REFERENCE_ONLY' then 1 end)::int`.as(
          "reference_copies",
        ),
    })
    .from(schema.items)
    .groupBy(schema.items.bibId)
    .as("items_agg");

  const rows = await db
    .select({
      id: schema.bibRecords.id,
      title: schema.bibRecords.title,
      subtitle: schema.bibRecords.subtitle,
      authors: schema.bibRecords.authors,
      isbn: schema.bibRecords.isbn,
      edition: schema.bibRecords.edition,
      pubYear: schema.bibRecords.pubYear,
      publisher: schema.bibRecords.publisher,
      subject: schema.bibRecords.subject,
      callNumber: schema.bibRecords.callNumber,
      departmentId: schema.bibRecords.departmentId,
      departmentName: schema.departments.name,
      itemTypeId: schema.bibRecords.itemTypeId,
      itemTypeName: schema.itemTypes.name,
      borrowCount: sql<number>`coalesce(${loanAgg.borrowCount}, 0)::int`,
      totalCopies: sql<number>`coalesce(${itemsAgg.totalCopies}, 0)::int`,
      availableCopies: sql<number>`coalesce(${itemsAgg.availableCopies}, 0)::int`,
      issuedCopies: sql<number>`coalesce(${itemsAgg.issuedCopies}, 0)::int`,
      reservedCopies: sql<number>`coalesce(${itemsAgg.reservedCopies}, 0)::int`,
      referenceCopies: sql<number>`coalesce(${itemsAgg.referenceCopies}, 0)::int`,
    })
    .from(schema.bibRecords)
    .innerJoin(loanAgg, eq(schema.bibRecords.id, loanAgg.bibId))
    .leftJoin(schema.departments, eq(schema.bibRecords.departmentId, schema.departments.id))
    .leftJoin(schema.itemTypes, eq(schema.bibRecords.itemTypeId, schema.itemTypes.id))
    .leftJoin(itemsAgg, eq(schema.bibRecords.id, itemsAgg.bibId))
    .orderBy(desc(loanAgg.borrowCount))
    .limit(limit);

  return rows.map((r: any) => ({
    id: r.id,
    title: r.title,
    subtitle: r.subtitle,
    authors: r.authors,
    isbn: r.isbn,
    edition: r.edition,
    pubYear: r.pubYear,
    publisher: r.publisher,
    subject: r.subject,
    callNumber: r.callNumber,
    departmentId: r.departmentId,
    departmentName: r.departmentName,
    itemTypeId: r.itemTypeId,
    itemTypeName: r.itemTypeName,
    borrowCount: Number(r.borrowCount || 0),
    totalCopies: Number(r.totalCopies || 0),
    availableCopies: Number(r.availableCopies || 0),
    issuedCopies: Number(r.issuedCopies || 0),
    reservedCopies: Number(r.reservedCopies || 0),
    referenceCopies: Number(r.referenceCopies || 0),
  }));
}

/**
 * Retrieves departments with catalogued title counts and total copies (FR-OP-01).
 */
export async function getDepartmentsWithCounts(
  db: DbInstance = defaultDb,
): Promise<OpacDepartmentItem[]> {
  const rows = await db
    .select({
      id: schema.departments.id,
      code: schema.departments.code,
      name: schema.departments.name,
      titleCount: sql<number>`count(distinct ${schema.bibRecords.id})::int`,
      totalCopies: sql<number>`count(${schema.items.id})::int`,
    })
    .from(schema.departments)
    .leftJoin(schema.bibRecords, eq(schema.departments.id, schema.bibRecords.departmentId))
    .leftJoin(schema.items, eq(schema.bibRecords.id, schema.items.bibId))
    .where(eq(schema.departments.isActive, true))
    .groupBy(schema.departments.id, schema.departments.code, schema.departments.name)
    .orderBy(asc(schema.departments.name));

  return rows.map((r: any) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    titleCount: Number(r.titleCount || 0),
    totalCopies: Number(r.totalCopies || 0),
  }));
}

export interface PatronAccountData {
  profile: {
    id: number;
    cardNo: string;
    rollNo: string | null;
    employeeId: string | null;
    fullName: string;
    firstName: string;
    lastName: string | null;
    patronType: string;
    categoryName: string;
    departmentName: string | null;
    institutionName: string | null;
    cardExpiry: string;
    status: string;
    mustChangePassword: boolean;
    email: string | null;
    mobile: string | null;
  };
  currentLoans: {
    id: number;
    bibId: number;
    title: string;
    accessionNo: string;
    barcode: string;
    libraryName: string;
    issueDate: string;
    dueDate: string;
    renewalCount: number;
    isOverdue: boolean;
    daysOverdue: number;
    daysRemaining: number;
  }[];
  loanHistory: {
    id: number;
    bibId: number;
    title: string;
    accessionNo: string;
    issueDate: string;
    dueDate: string;
    returnDate: string | null;
    status: string;
  }[];
  holds: {
    id: number;
    bibId: number;
    title: string;
    authors: string;
    requestDate: string;
    status: string;
    queuePosition: number;
    pickupExpiryDate: string | null;
    isReadyForPickup: boolean;
    isCancellable: boolean;
  }[];
  fines: {
    id: number;
    loanId: number | null;
    reason: string;
    amount: string;
    paidAmount: string;
    balance: string;
    status: string;
    createdAt: string;
  }[];
  totalOutstandingFines: number;
}

/**
 * Retrieves full patron account portal data (FR-OP-02, FR-OP-03, FR-AU-05).
 */
export async function getPatronAccountData(
  patronId: number,
  db: DbInstance = defaultDb,
): Promise<PatronAccountData | null> {
  // 1. Patron Profile
  const patronRows = await db
    .select({
      id: schema.patrons.id,
      cardNo: schema.patrons.cardNo,
      rollNo: schema.patrons.rollNo,
      employeeId: schema.patrons.employeeId,
      firstName: schema.patrons.firstName,
      middleName: schema.patrons.middleName,
      lastName: schema.patrons.lastName,
      patronType: schema.patrons.patronType,
      categoryName: schema.patronCategories.name,
      departmentName: schema.departments.name,
      institutionName: schema.institutions.name,
      cardExpiry: schema.patrons.cardExpiry,
      status: schema.patrons.status,
      mustChangePassword: schema.patrons.mustChangePassword,
      email: schema.patrons.email,
      mobile: schema.patrons.mobile,
    })
    .from(schema.patrons)
    .innerJoin(schema.patronCategories, eq(schema.patrons.categoryId, schema.patronCategories.id))
    .leftJoin(schema.departments, eq(schema.patrons.departmentId, schema.departments.id))
    .leftJoin(schema.institutions, eq(schema.patrons.institutionId, schema.institutions.id))
    .where(eq(schema.patrons.id, patronId))
    .limit(1);

  const p = patronRows[0];
  if (!p) return null;

  const fullName = [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ");

  // 2. Current Active Loans (status = 'ISSUED')
  const activeLoanRows = await db
    .select({
      id: schema.loans.id,
      bibId: schema.bibRecords.id,
      title: schema.bibRecords.title,
      accessionNo: schema.items.accessionNo,
      barcode: schema.items.barcode,
      libraryName: schema.libraries.name,
      issueDate: schema.loans.issueDate,
      dueDate: schema.loans.dueDate,
      renewalCount: schema.loans.renewalCount,
    })
    .from(schema.loans)
    .innerJoin(schema.items, eq(schema.loans.itemId, schema.items.id))
    .innerJoin(schema.bibRecords, eq(schema.items.bibId, schema.bibRecords.id))
    .innerJoin(schema.libraries, eq(schema.loans.libraryId, schema.libraries.id))
    .where(and(eq(schema.loans.patronId, patronId), eq(schema.loans.status, "ISSUED")))
    .orderBy(asc(schema.loans.dueDate));

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayMs = new Date(todayStr).getTime();

  const currentLoans = activeLoanRows.map((l: any) => {
    const dueStr = String(l.dueDate);
    const dueMs = new Date(dueStr).getTime();
    const diffDays = Math.round((dueMs - todayMs) / (1000 * 60 * 60 * 24));
    const isOverdue = diffDays < 0;
    const daysOverdue = isOverdue ? Math.abs(diffDays) : 0;
    const daysRemaining = !isOverdue ? diffDays : 0;

    return {
      id: l.id,
      bibId: l.bibId,
      title: l.title,
      accessionNo: l.accessionNo,
      barcode: l.barcode,
      libraryName: l.libraryName,
      issueDate: String(l.issueDate),
      dueDate: dueStr,
      renewalCount: l.renewalCount,
      isOverdue,
      daysOverdue,
      daysRemaining,
    };
  });

  // 3. Loan History (status IN ('RETURNED', 'LOST'))
  const historyRows = await db
    .select({
      id: schema.loans.id,
      bibId: schema.bibRecords.id,
      title: schema.bibRecords.title,
      accessionNo: schema.items.accessionNo,
      issueDate: schema.loans.issueDate,
      dueDate: schema.loans.dueDate,
      returnDate: schema.loans.returnDate,
      status: schema.loans.status,
    })
    .from(schema.loans)
    .innerJoin(schema.items, eq(schema.loans.itemId, schema.items.id))
    .innerJoin(schema.bibRecords, eq(schema.items.bibId, schema.bibRecords.id))
    .where(
      and(eq(schema.loans.patronId, patronId), inArray(schema.loans.status, ["RETURNED", "LOST"])),
    )
    .orderBy(desc(schema.loans.returnDate), desc(schema.loans.issueDate))
    .limit(50);

  const loanHistory = historyRows.map((h: any) => ({
    id: h.id,
    bibId: h.bibId,
    title: h.title,
    accessionNo: h.accessionNo,
    issueDate: String(h.issueDate),
    dueDate: String(h.dueDate),
    returnDate: h.returnDate ? String(h.returnDate) : null,
    status: h.status,
  }));

  // 4. Reservations / Holds
  const holdsList = await listHolds({ patronId, limit: 50 }, db);
  const holds = holdsList.map((h) => ({
    id: h.id,
    bibId: h.bibId,
    title: h.title,
    authors: h.authors,
    requestDate: String(h.requestDate),
    status: h.status,
    queuePosition: h.queuePosition ?? 1,
    pickupExpiryDate: h.pickupExpiryDate,
    isReadyForPickup: h.status === "AVAILABLE_FOR_PICKUP",
    isCancellable: h.status === "WAITING" || h.status === "AVAILABLE_FOR_PICKUP",
  }));

  // 5. Fines & Dues
  const fineRows = await db
    .select({
      id: schema.fines.id,
      loanId: schema.fines.loanId,
      reason: schema.fines.reason,
      amount: schema.fines.amount,
      paidAmount: schema.fines.paidAmount,
      status: schema.fines.status,
      createdAt: schema.fines.createdAt,
    })
    .from(schema.fines)
    .where(eq(schema.fines.patronId, patronId))
    .orderBy(desc(schema.fines.createdAt))
    .limit(50);

  let totalOutstanding = 0;
  const fines = fineRows.map((f: any) => {
    const amt = Number(f.amount || 0);
    const paid = Number(f.paidAmount || 0);
    const bal = Math.max(0, amt - paid);
    if (f.status === "OUTSTANDING") {
      totalOutstanding += bal;
    }
    return {
      id: f.id,
      loanId: f.loanId,
      reason: f.reason,
      amount: amt.toFixed(2),
      paidAmount: paid.toFixed(2),
      balance: bal.toFixed(2),
      status: f.status,
      createdAt: String(f.createdAt),
    };
  });

  return {
    profile: {
      id: p.id,
      cardNo: p.cardNo,
      rollNo: p.rollNo,
      employeeId: p.employeeId,
      fullName,
      firstName: p.firstName,
      lastName: p.lastName,
      patronType: p.patronType,
      categoryName: p.categoryName,
      departmentName: p.departmentName,
      institutionName: p.institutionName,
      cardExpiry: String(p.cardExpiry),
      status: p.status,
      mustChangePassword: Boolean(p.mustChangePassword),
      email: p.email,
      mobile: p.mobile,
    },
    currentLoans,
    loanHistory,
    holds,
    fines,
    totalOutstandingFines: totalOutstanding,
  };
}
