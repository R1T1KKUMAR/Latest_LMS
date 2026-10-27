import { eq } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import * as schema from "@/db/schema";
import { decodeCsvBuffer, getFieldValue, parseCsvDate, parseCsvText } from "@/imports/csv-parser";
import { DB_TEXT_LIMITS, truncate, truncateWithDefault } from "@/imports/truncate";
import { formatAccessionNumber, normalizeIsbn } from "@/lib/numbering";
import { recordAuditLog } from "./audit";
import { DEFAULT_FORMATS, type ImportColumnDef } from "./import-format";

// biome-ignore lint/suspicious/noExplicitAny: Generic DB instance support
type DbInstance = any;

export interface Actor {
  id: number;
  fullName: string;
  ipAddress?: string;
}

export interface BookImportOptions {
  defaultLibraryId?: number;
  defaultItemTypeId?: number;
  encoding?: string;
  fileName?: string;
  formatColumns?: ImportColumnDef[];
}

export interface ValidatedBookCopyData {
  accessionNo: string;
  barcode: string;
}

export interface ValidatedBookData {
  rowNumber: number;
  action: "NEW_TITLE" | "ADD_COPIES";
  existingBibId?: number;
  title: string;
  subtitle?: string | null;
  authors: string;
  editors?: string | null;
  isbn?: string | null;
  edition?: string | null;
  publisher?: string | null;
  placeOfPublication?: string | null;
  pubYear?: number | null;
  pages?: string | null;
  language: string;
  subject?: string | null;
  keywords?: string | null;
  ddcNumber?: string | null;
  callNumber?: string | null;
  summary?: string | null;
  price: string;
  itemTypeId: number;
  itemTypeCode: string;
  isReference: boolean;
  departmentId?: number | null;
  libraryId: number;
  libraryCode: string;
  copiesCount: number;
  customCopies?: ValidatedBookCopyData[];
  vendorId?: number | null;
  invoiceNo?: string | null;
  acquisitionDate: string;
  location?: string | null;
}

export interface BookRowPreview {
  rowNumber: number;
  status: "OK" | "WARN" | "ERROR";
  action: "NEW_TITLE" | "ADD_COPIES";
  messages: string[];
  data?: ValidatedBookData;
  raw: Record<string, string>;
}

export interface BookImportPreview {
  importType: "CATALOGUE";
  fileName: string;
  summary: {
    totalRows: number;
    okCount: number;
    warnCount: number;
    errorCount: number;
    validCount: number;
    newTitlesCount: number;
    addCopiesCount: number;
    totalCopiesExpected: number;
  };
  rows: BookRowPreview[];
}

export interface BookImportResult {
  batchId: number;
  importType: "CATALOGUE";
  fileName: string;
  totalRows: number;
  importedCount: number;
  skippedCount: number;
  titles: Array<{
    bibId: number;
    title: string;
    action: "NEW_TITLE" | "ADD_COPIES";
    copiesAdded: number;
    accessionRange?: string;
    accessionNumbers: string[];
  }>;
  totalCopiesAdded: number;
  allAccessionNumbers: string[];
  labelPrintUrl: string;
  skippedRows: Array<{
    rowNumber: number;
    reason: string;
  }>;
}

/**
 * Validates a book catalogue CSV stream without performing ANY database writes (FR-BI-02).
 */
export async function validateBookCsv(
  buffer: Buffer | Uint8Array,
  options: BookImportOptions = {},
  db: DbInstance = defaultDb,
): Promise<BookImportPreview> {
  const fileName = options.fileName ?? "books.csv";
  const decodedText = decodeCsvBuffer(buffer, options.encoding);
  const parsedRows = parseCsvText(decodedText);

  // 1. Fetch reference lookup data
  const libraries = await db.select().from(schema.libraries);
  const itemTypes = await db.select().from(schema.itemTypes);
  const departments = await db.select().from(schema.departments);
  const vendors = await db.select().from(schema.vendors);

  const libraryByCode = new Map<string, typeof schema.libraries.$inferSelect>();
  for (const lib of libraries) {
    libraryByCode.set(lib.code.toUpperCase(), lib);
  }

  const itemTypeByCode = new Map<string, typeof schema.itemTypes.$inferSelect>();
  for (const it of itemTypes) {
    itemTypeByCode.set(it.code.toUpperCase(), it);
  }

  const departmentByCode = new Map<string, typeof schema.departments.$inferSelect>();
  for (const d of departments) {
    departmentByCode.set(d.code.toUpperCase(), d);
  }

  const vendorByName = new Map<string, typeof schema.vendors.$inferSelect>();
  for (const v of vendors) {
    vendorByName.set(v.name.trim().toLowerCase(), v);
  }

  const cleanAlphaNum = (str: string): string => {
    if (!str) return "";
    return str.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  };

  const resolveDepartment = (raw: string): typeof schema.departments.$inferSelect | undefined => {
    if (!raw) return undefined;
    const clean = cleanAlphaNum(raw);
    const norm = raw.trim().toUpperCase();

    // 1. Direct code lookup
    const direct = departmentByCode.get(norm);
    if (direct) return direct;

    // 2. Exact workbook worksheet mappings
    if (norm === "DENGGDDP") return departmentByCode.get("DIPLOMA");
    if (norm === "DENGGDM") return departmentByCode.get("MBA");
    if (norm === "DENGGD") return departmentByCode.get("BTECH");
    if (norm === "AM") return departmentByCode.get("BBA");
    if (norm === "B.COM" || clean === "BCOM") return departmentByCode.get("BCOM");
    if (norm.startsWith("B.ED") || clean.startsWith("BED")) return departmentByCode.get("BED");
    if (norm === "BSCS" || norm === "BSCH" || clean === "BSCS" || clean === "BSCH")
      return departmentByCode.get("BSC");
    if (norm === "C") return departmentByCode.get("BCA");
    if (norm === "M" || norm === "PG" || norm === "S") return departmentByCode.get("MBA");

    // 3. Cleaned alphanumeric code match (e.g. "B_TECH", "B.TECH", "btech", "B-Tech" -> "BTECH")
    for (const d of departments) {
      if (cleanAlphaNum(d.code) === clean) return d;
    }

    // 3. Cleaned alphanumeric name match (e.g. "B.Tech" matches department name "B.Tech")
    for (const d of departments) {
      if (cleanAlphaNum(d.name) === clean) return d;
    }

    // 4. B.Tech aliases
    if (
      clean === "BTECH" ||
      clean.startsWith("BTECH") ||
      clean === "BACHELOROFTECHNOLOGY" ||
      clean.startsWith("BACHELOROFTECHNOLOGY") ||
      /\bb[\.\s\-]?tech\b/i.test(raw)
    ) {
      const btech = departments.find(
        (d: { code: string; name: string }) =>
          d.code.toUpperCase() === "BTECH" ||
          d.name.toUpperCase().includes("B.TECH") ||
          d.name.toUpperCase().includes("TECHNOLOGY"),
      );
      if (btech) return btech;
    }

    // 5. Diploma / Polytechnic aliases
    if (clean.includes("DIPLOMA") || clean.includes("POLYTECHNIC")) {
      const dip = departments.find(
        (d: { code: string; name: string }) =>
          d.code.toUpperCase() === "DIPLOMA" ||
          d.name.toUpperCase().includes("DIPLOMA") ||
          d.name.toUpperCase().includes("POLYTECHNIC"),
      );
      if (dip) return dip;
    }

    // 6. Substring in department name or code
    for (const d of departments) {
      if (d.name.toUpperCase().includes(norm) || norm.includes(d.name.toUpperCase())) {
        return d;
      }
    }

    // 7. College / Institution aliases fallback
    type DeptRecord = typeof schema.departments.$inferSelect;
    if (clean.includes("RBCET") || clean.includes("ENGINEERING")) {
      const eng = (departments as DeptRecord[]).find(
        (d: DeptRecord) => d.code.toUpperCase() === "BTECH" || d.code.toUpperCase() === "CSE",
      );
      if (eng) return eng;
    }
    if (clean.includes("RBCP") || clean.includes("PHARMACY")) {
      const pharm = (departments as DeptRecord[]).find(
        (d: DeptRecord) => d.code.toUpperCase() === "BPHARM" || d.code.toUpperCase() === "PHARM",
      );
      if (pharm) return pharm;
    }
    if (clean.includes("RBCN") || clean.includes("NURSING")) {
      const nurs = (departments as DeptRecord[]).find(
        (d: DeptRecord) => d.code.toUpperCase() === "BSCNURS" || d.code.toUpperCase() === "NURS",
      );
      if (nurs) return nurs;
    }
    if (clean.includes("RBTTI") || clean.includes("TEACHER") || clean.includes("EDUCATION")) {
      const edu = (departments as DeptRecord[]).find(
        (d: DeptRecord) => d.code.toUpperCase() === "BED",
      );
      if (edu) return edu;
    }
    if (clean.includes("RBMI") || clean.includes("MANAGEMENT") || clean.includes("BUSINESS")) {
      const mgmt = (departments as DeptRecord[]).find(
        (d: DeptRecord) => d.code.toUpperCase() === "BBA" || d.code.toUpperCase() === "MBA",
      );
      if (mgmt) return mgmt;
    }

    return undefined;
  };

  // Resolve default library and item type
  let defaultLibrary = libraries.find((l: { id: number }) => l.id === options.defaultLibraryId);
  if (!defaultLibrary) {
    defaultLibrary =
      libraryByCode.get("CL") ?? libraries.find((l: { isActive: boolean }) => l.isActive);
  }

  let defaultItemType = itemTypes.find((it: { id: number }) => it.id === options.defaultItemTypeId);
  if (!defaultItemType) {
    defaultItemType = itemTypeByCode.get("BOOK") ?? itemTypeByCode.get("GEN") ?? itemTypes[0];
  }

  // 2. Fetch existing bib records to detect ISBN / Title matches (FR-BI-03)
  const existingBibs = await db
    .select({
      id: schema.bibRecords.id,
      isbn: schema.bibRecords.isbn,
      title: schema.bibRecords.title,
      authors: schema.bibRecords.authors,
    })
    .from(schema.bibRecords);

  const bibsByIsbn = new Map<string, (typeof existingBibs)[0]>();
  for (const b of existingBibs) {
    if (b.isbn) {
      const norm = normalizeIsbn(b.isbn);
      if (norm) bibsByIsbn.set(norm, b);
    }
  }

  // 3. Fetch existing accession numbers and barcodes
  const existingItems = await db
    .select({
      accessionNo: schema.items.accessionNo,
      barcode: schema.items.barcode,
    })
    .from(schema.items);

  const existingAccessions = new Set<string>();
  const existingBarcodes = new Set<string>();
  for (const item of existingItems) {
    if (item.accessionNo) existingAccessions.add(item.accessionNo.toUpperCase());
    if (item.barcode) existingBarcodes.add(item.barcode.toUpperCase());
  }

  // File-internal deduplication trackers
  const fileAccessions = new Set<string>();
  const fileBarcodes = new Set<string>();
  const fileBibsByIsbn = new Map<string, { id: number; title: string; authors: string }>();
  const fileBibsByTitleAuthor = new Map<string, { id: number; title: string; authors: string }>();

  const rows: BookRowPreview[] = [];
  let okCount = 0;
  let warnCount = 0;
  let errorCount = 0;
  let newTitlesCount = 0;
  let addCopiesCount = 0;
  let totalCopiesExpected = 0;

  const formatMap = options.formatColumns
    ? new Map(options.formatColumns.map((c) => [c.dbField, c]))
    : null;

  for (const parsedRow of parsedRows) {
    const raw = parsedRow.raw;
    const rowNumber = parsedRow.rowNumber;
    const messages: string[] = [];
    let isError = false;

    const resolveField = (dbField: string, defaultAliases: string[] = []): string | undefined => {
      if (formatMap) {
        const isKnownField = DEFAULT_FORMATS.CATALOGUE.some((d) => d.dbField === dbField);
        if (isKnownField && !formatMap.has(dbField)) {
          return undefined;
        }
      }
      const configured = formatMap?.get(dbField);
      const aliases = [dbField, ...defaultAliases];
      if (configured?.csvHeader && configured.csvHeader !== dbField) {
        aliases.unshift(configured.csvHeader);
      }
      return getFieldValue(raw, configured?.csvHeader || dbField, aliases);
    };

    // --- Title (REQUIRED) ---
    const rawTitle = resolveField("title", ["book_title", "title_name", "bookname", "book_name"]);
    if (!rawTitle) {
      messages.push("Missing required field: title");
      isError = true;
    }
    const title = truncateWithDefault(rawTitle, DB_TEXT_LIMITS.TITLE, "Untitled");

    // --- ISBN & Deduplication / Matching (FR-BI-03) ---
    const rawIsbn = resolveField("isbn", ["isbn_number", "isbn_13", "isbn_10", "isbn13", "isbn10"]);
    let normalizedIsbn: string | null = null;
    let matchedBib:
      | { id: number; title: string; authors: string; isbn?: string | null }
      | undefined;

    if (rawIsbn) {
      normalizedIsbn = normalizeIsbn(rawIsbn);
      if (normalizedIsbn) {
        if (normalizedIsbn.length !== 10 && normalizedIsbn.length !== 13) {
          messages.push(`ISBN "${rawIsbn}" is neither 10 nor 13 digits; retained`);
        }
        matchedBib = bibsByIsbn.get(normalizedIsbn) ?? fileBibsByIsbn.get(normalizedIsbn);
      } else {
        messages.push(`Could not normalize ISBN "${rawIsbn}"`);
      }
    }

    // Authors
    const rawAuthors = resolveField("authors", ["author", "writer", "creators", "creator"]);
    const authors = truncateWithDefault(rawAuthors, DB_TEXT_LIMITS.AUTHORS, "Unknown");

    // If not matched by ISBN, check match by Title + Authors
    if (!matchedBib && rawTitle) {
      const matchDb = existingBibs.find(
        (b: { title: string; authors: string }) =>
          b.title.trim().toLowerCase() === title.trim().toLowerCase() &&
          b.authors.trim().toLowerCase() === authors.trim().toLowerCase(),
      );
      if (matchDb) {
        matchedBib = matchDb;
      } else {
        const key = `${title.trim().toLowerCase()}:::${authors.trim().toLowerCase()}`;
        if (fileBibsByTitleAuthor.has(key)) {
          matchedBib = fileBibsByTitleAuthor.get(key);
        }
      }
    }

    const action: "NEW_TITLE" | "ADD_COPIES" = matchedBib ? "ADD_COPIES" : "NEW_TITLE";
    if (matchedBib) {
      messages.push(
        matchedBib.id > 0
          ? `Matching title found (ID #${matchedBib.id}): will add copies to existing title`
          : "Matching title found in file: will add copies to existing title",
      );
    }

    // Subtitle & Editors
    const subtitle = truncate(resolveField("subtitle"), DB_TEXT_LIMITS.SUBTITLE);
    const editors = truncate(resolveField("editors", ["editor"]), DB_TEXT_LIMITS.EDITORS);

    // Edition & Publisher
    const edition = truncate(resolveField("edition"), DB_TEXT_LIMITS.EDITION);
    const publisher = truncate(
      resolveField("publisher", ["publishercode", "publisher_code", "pub", "press"]),
      DB_TEXT_LIMITS.PUBLISHER,
    );
    const placeOfPublication = truncate(
      resolveField("place", ["place_of_publication", "publication_place"]),
      DB_TEXT_LIMITS.PLACE,
    );

    // Pub Year
    let pubYear: number | null = null;
    const rawYear = resolveField("pub_year", [
      "year",
      "publication_year",
      "copyrightdate",
      "copyright_date",
      "pubdate",
      "pub_date",
    ]);
    if (rawYear) {
      const y = parseInt(rawYear, 10);
      const currentYear = new Date().getFullYear();
      if (!isNaN(y) && y >= 1500 && y <= currentYear + 1) {
        pubYear = y;
      } else {
        messages.push(
          `Publication year "${rawYear}" is outside 1500–${currentYear + 1}; set to null`,
        );
      }
    }

    // Pages & Language
    const pages = truncate(resolveField("pages"), DB_TEXT_LIMITS.PAGES);
    const language = truncateWithDefault(
      resolveField("language"),
      DB_TEXT_LIMITS.LANGUAGE,
      "English",
    );

    // Classification & Subject
    const subject = truncate(resolveField("subject"), DB_TEXT_LIMITS.SUBJECT);
    const keywords = truncate(resolveField("keywords"), DB_TEXT_LIMITS.KEYWORDS);
    const ddcNumber = truncate(resolveField("ddc_number", ["ddc"]), DB_TEXT_LIMITS.DDC);
    const callNumber = truncate(
      resolveField("call_number", ["call_no"]),
      DB_TEXT_LIMITS.CALL_NUMBER,
    );
    const summary = truncate(resolveField("summary"), DB_TEXT_LIMITS.SUMMARY);

    // Price
    let price = "0.00";
    const rawPrice = resolveField("price", ["cost", "rate"]);
    if (rawPrice) {
      const p = parseFloat(rawPrice);
      if (!isNaN(p) && p >= 0) {
        price = p.toFixed(2);
      } else {
        messages.push(`Invalid price "${rawPrice}"; defaulting to 0.00`);
      }
    }

    // Item Type
    let itemType = defaultItemType;
    const rawItemType = resolveField("item_type", ["type", "itype", "itemtype"]);
    if (rawItemType) {
      const itUpper = rawItemType.trim().toUpperCase();
      const found =
        itemTypeByCode.get(itUpper) ||
        (itUpper === "BK" ? itemTypeByCode.get("BOOK") : undefined) ||
        (itUpper === "REF" || itUpper === "REFERENCE" ? itemTypeByCode.get("REF") : undefined) ||
        (itUpper === "JOURNAL" || itUpper === "JRNL" ? itemTypeByCode.get("JOURNAL") : undefined) ||
        (itUpper === "MAG" || itUpper === "MAGAZINE"
          ? itemTypeByCode.get("MAGAZINE")
          : undefined) ||
        (itUpper === "PROJECT" || itUpper === "PROJ" ? itemTypeByCode.get("PROJECT") : undefined) ||
        (itUpper === "THESIS" ? itemTypeByCode.get("THESIS") : undefined) ||
        (itUpper === "GEN" ? itemTypeByCode.get("GEN") : undefined);
      if (found) {
        itemType = found;
      } else if (defaultItemType) {
        itemType = defaultItemType;
        messages.push(
          `Item type "${rawItemType}" not recognized; defaulted to ${defaultItemType.name}`,
        );
      } else {
        messages.push(`Unknown item type "${rawItemType}"`);
        isError = true;
      }
    }

    if (!itemType) {
      messages.push("Could not resolve item type");
      isError = true;
    }

    // Library
    let library = defaultLibrary;
    const rawLib = resolveField("library", [
      "lib",
      "library_code",
      "library_name",
      "branch",
      "branch_code",
    ]);
    if (rawLib) {
      const found = libraryByCode.get(rawLib.toUpperCase());
      if (found) {
        library = found;
      } else if (!library) {
        messages.push(`Unknown library "${rawLib}"`);
        isError = true;
      }
    }

    if (!library) {
      messages.push("Could not resolve target library");
      isError = true;
    }

    // Department / Course / Stream / College
    let departmentId: number | null = null;
    const rawDept = resolveField("department", [
      "dept",
      "department_code",
      "department_name",
      "dept_code",
      "dept_name",
      "course",
      "course_code",
      "course_name",
      "branch",
      "stream",
      "program",
      "discipline",
      "b_tech",
      "btech",
    ]);
    if (rawDept) {
      const found = resolveDepartment(rawDept);
      if (found) {
        departmentId = found.id;
      } else {
        messages.push(`Unknown department "${rawDept}"; field set to null`);
      }
    }

    // Fallback to college if department is still null
    if (!departmentId) {
      const rawCollege = getFieldValue(raw, "college", [
        "college_code",
        "college_name",
        "institution",
        "institution_code",
        "institution_name",
      ]);
      if (rawCollege) {
        const found = resolveDepartment(rawCollege);
        if (found) {
          departmentId = found.id;
        }
      }
    }

    // Fallback to sheet_name if department is still null
    if (!departmentId) {
      const rawSheet = getFieldValue(raw, "sheet_name", ["sheet", "sheetname"]);
      if (rawSheet) {
        const found = resolveDepartment(rawSheet);
        if (found) {
          departmentId = found.id;
        }
      }
    }

    // Fallback to barcode or accession number prefix
    if (!departmentId) {
      const rawBarcode = (
        getFieldValue(raw, "barcode", ["barcodes", "barcode_no"]) ||
        getFieldValue(raw, "accession_number", ["accession_no", "accession", "acc_no", "accno"]) ||
        ""
      )
        .trim()
        .toUpperCase();
      if (rawBarcode.startsWith("DENGGDDP")) {
        departmentId = departmentByCode.get("DIPLOMA")?.id ?? null;
      } else if (rawBarcode.startsWith("DENGGDM")) {
        departmentId = departmentByCode.get("MBA")?.id ?? null;
      } else if (rawBarcode.startsWith("DENGGD")) {
        departmentId = departmentByCode.get("BTECH")?.id ?? null;
      } else if (rawBarcode.startsWith("AM-") || rawBarcode.startsWith("AM")) {
        departmentId = departmentByCode.get("BBA")?.id ?? null;
      } else if (rawBarcode.startsWith("C-") || rawBarcode.startsWith("C")) {
        departmentId = departmentByCode.get("BCA")?.id ?? null;
      } else if (
        rawBarcode.startsWith("M-") ||
        rawBarcode.startsWith("PG-") ||
        rawBarcode.startsWith("S-") ||
        rawBarcode.startsWith("PG") ||
        rawBarcode.startsWith("M") ||
        rawBarcode.startsWith("S")
      ) {
        departmentId = departmentByCode.get("MBA")?.id ?? null;
      } else if (rawBarcode.startsWith("MCA-")) {
        departmentId = departmentByCode.get("MCA")?.id ?? null;
      } else if (
        rawBarcode.startsWith("BC-") ||
        rawBarcode.startsWith("B.C-") ||
        rawBarcode.startsWith("B.C") ||
        rawBarcode.startsWith("BC") ||
        rawBarcode.startsWith("B.COM") ||
        rawBarcode.startsWith("BCOM")
      ) {
        departmentId = departmentByCode.get("BCOM")?.id ?? null;
      } else if (
        rawBarcode.startsWith("BSCS-") ||
        rawBarcode.startsWith("BSCH-") ||
        rawBarcode.startsWith("BSCS") ||
        rawBarcode.startsWith("BSCH")
      ) {
        departmentId = departmentByCode.get("BSC")?.id ?? null;
      } else if (
        rawBarcode.startsWith("BEDE") ||
        rawBarcode.startsWith("BEDUBB") ||
        rawBarcode.startsWith("BED") ||
        rawBarcode.startsWith("B.ED")
      ) {
        departmentId = departmentByCode.get("BED")?.id ?? null;
      } else if (rawBarcode.startsWith("BPH")) {
        departmentId = departmentByCode.get("BPHARM")?.id ?? null;
      } else if (rawBarcode.startsWith("DPH")) {
        departmentId = departmentByCode.get("DPHARM")?.id ?? null;
      } else if (rawBarcode.startsWith("NURS")) {
        departmentId = departmentByCode.get("BSCNURS")?.id ?? null;
      }
    }

    // Vendor
    let vendorId: number | null = null;
    const rawVendor = resolveField("vendor", ["supplier"]);
    if (rawVendor) {
      const found = vendorByName.get(rawVendor.trim().toLowerCase());
      if (found) {
        vendorId = found.id;
      } else {
        messages.push(`Unknown vendor "${rawVendor}"; field set to null`);
      }
    }

    // Invoice & Location
    const invoiceNo = truncate(resolveField("invoice_no"), DB_TEXT_LIMITS.INVOICE_NO);
    const location = truncate(resolveField("location"), DB_TEXT_LIMITS.LOCATION);
    const acquisitionDate =
      parseCsvDate(resolveField("acquisition_date")) || new Date().toISOString().split("T")[0];

    // Copies count
    let copiesCount = 1;
    const rawCopies = resolveField("copies", ["qty", "quantity", "no_of_copies"]);
    if (rawCopies) {
      const parsedCopies = parseInt(rawCopies, 10);
      if (!isNaN(parsedCopies) && parsedCopies >= 0 && parsedCopies <= 500) {
        copiesCount = parsedCopies;
      } else {
        messages.push(`Invalid copies count "${rawCopies}"; must be 0–500`);
        isError = true;
      }
    }

    // Accession Numbers & Barcodes (Pipe-delimited lists per FR-BI-04)
    const customCopies: ValidatedBookCopyData[] = [];
    const rawAccessions = resolveField("accession_no", [
      "accession",
      "accession_number",
      "accession_numbers",
      "acc_no",
    ]);
    const rawBarcodes = resolveField("barcode", ["barcodes", "barcode_no"]);

    const effectiveAccessions = rawAccessions || rawBarcodes;
    const effectiveBarcodes = rawBarcodes || rawAccessions;

    if (effectiveAccessions) {
      const accList = effectiveAccessions
        .split("|")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);

      if (copiesCount > 0 && accList.length !== copiesCount) {
        messages.push(
          `Number of accession numbers (${accList.length}) does not match copies count (${copiesCount})`,
        );
        isError = true;
      }

      const barList = effectiveBarcodes
        ? effectiveBarcodes
            .split("|")
            .map((s) => s.trim().toUpperCase())
            .filter(Boolean)
        : accList;

      if (barList.length !== accList.length) {
        messages.push("Barcode count does not match accession count");
        isError = true;
      }

      for (let i = 0; i < accList.length; i++) {
        const acc = accList[i];
        const bar = barList[i] || acc;

        if (existingAccessions.has(acc)) {
          messages.push(`Duplicate accession number: "${acc}" already exists in database`);
          isError = true;
        } else if (fileAccessions.has(acc)) {
          messages.push(`Duplicate accession number: "${acc}" appears multiple times in file`);
          isError = true;
        } else {
          fileAccessions.add(acc);
        }

        if (existingBarcodes.has(bar)) {
          messages.push(`Duplicate barcode: "${bar}" already exists in database`);
          isError = true;
        } else if (fileBarcodes.has(bar)) {
          messages.push(`Duplicate barcode: "${bar}" appears multiple times in file`);
          isError = true;
        } else {
          fileBarcodes.add(bar);
        }

        customCopies.push({ accessionNo: acc, barcode: bar });
      }
    }

    // Status classification
    let status: "OK" | "WARN" | "ERROR";
    if (isError || !title || !library || !itemType) {
      status = "ERROR";
      errorCount++;
    } else if (messages.length > 0) {
      status = "WARN";
      warnCount++;
    } else {
      status = "OK";
      okCount++;
    }

    if (status !== "ERROR") {
      if (action === "NEW_TITLE") {
        newTitlesCount++;
        const dummyBib = { id: -rowNumber, title, authors };
        if (normalizedIsbn) {
          fileBibsByIsbn.set(normalizedIsbn, dummyBib);
        }
        const key = `${title.trim().toLowerCase()}:::${authors.trim().toLowerCase()}`;
        fileBibsByTitleAuthor.set(key, dummyBib);
      } else {
        addCopiesCount++;
      }
      totalCopiesExpected += copiesCount;
    }

    let data: ValidatedBookData | undefined;
    if (status !== "ERROR" && library && itemType) {
      data = {
        rowNumber,
        action,
        existingBibId: matchedBib?.id,
        title,
        subtitle,
        authors,
        editors,
        isbn: normalizedIsbn,
        edition,
        publisher,
        placeOfPublication,
        pubYear,
        pages,
        language,
        subject,
        keywords,
        ddcNumber,
        callNumber,
        summary,
        price,
        itemTypeId: itemType.id,
        itemTypeCode: itemType.code,
        isReference: itemType.isReference ?? false,
        departmentId,
        libraryId: library.id,
        libraryCode: library.code,
        copiesCount,
        customCopies: customCopies.length > 0 ? customCopies : undefined,
        vendorId,
        invoiceNo,
        acquisitionDate,
        location,
      };
    }

    rows.push({
      rowNumber,
      status,
      action,
      messages,
      data,
      raw,
    });
  }

  return {
    importType: "CATALOGUE",
    fileName,
    summary: {
      totalRows: parsedRows.length,
      okCount,
      warnCount,
      errorCount,
      validCount: okCount + warnCount,
      newTitlesCount,
      addCopiesCount,
      totalCopiesExpected,
    },
    rows,
  };
}

/**
 * Commits pre-validated book catalogue rows in independent row-level transactions (FR-BI-05, NFR-R-02).
 * Writes batch record to import_batches and logs append-only audit entry.
 */
export async function commitBookImport(
  preview: BookImportPreview,
  actor: Actor,
  db: DbInstance = defaultDb,
): Promise<BookImportResult> {
  const titlesResult: BookImportResult["titles"] = [];
  const skippedRows: BookImportResult["skippedRows"] = [];
  const allAccessionNumbers: string[] = [];
  let totalCopiesAdded = 0;

  // Initial batch record creation
  const [batch] = await db
    .insert(schema.importBatches)
    .values({
      importType: "CATALOGUE",
      fileName: preview.fileName,
      totalRows: preview.summary.totalRows,
      importedRows: 0,
      skippedRows: 0,
      importedBy: actor.id,
    })
    .returning();

  // 1. Collect skipped error rows
  for (const row of preview.rows) {
    if (row.status === "ERROR" || !row.data) {
      skippedRows.push({
        rowNumber: row.rowNumber,
        reason: row.messages.join("; ") || "Fatal validation errors",
      });
    }
  }

  const validRows = preview.rows.filter((r) => r.status !== "ERROR" && r.data);

  // 2. Load libraries for accession sequence handling
  const libraries = await db.select().from(schema.libraries);
  type LibraryRecord = typeof schema.libraries.$inferSelect;
  const libraryMap = new Map<number, LibraryRecord>(
    (libraries as LibraryRecord[]).map((l: LibraryRecord) => [l.id, l]),
  );

  // Track created bibIds by rowNumber, ISBN, and title/authors
  const rowToBibIdMap = new Map<number, number>();
  const isbnToBibIdMap = new Map<string, number>();
  const titleAuthorToBibIdMap = new Map<string, number>();

  const BATCH_SIZE = 250;

  for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
    const chunk = validRows.slice(i, i + BATCH_SIZE);

    try {
      await db.transaction(async (tx: DbInstance) => {
        const newTitleRows: typeof chunk = [];
        const pendingChunkRows: Array<{ row: (typeof chunk)[0]; targetIndex: number }> = [];
        const chunkBibsByTitleAuthor = new Map<string, number>();
        const chunkBibsByIsbn = new Map<string, number>();

        for (const row of chunk) {
          const bd = row.data!;
          if (bd.action === "ADD_COPIES" && bd.existingBibId && bd.existingBibId > 0) {
            rowToBibIdMap.set(bd.rowNumber, bd.existingBibId);
          } else {
            const key = `${bd.title.trim().toLowerCase()}:::${bd.authors.trim().toLowerCase()}`;
            const prevBibId = bd.isbn
              ? isbnToBibIdMap.get(bd.isbn)
              : titleAuthorToBibIdMap.get(key);
            if (prevBibId) {
              rowToBibIdMap.set(bd.rowNumber, prevBibId);
            } else if (bd.isbn && chunkBibsByIsbn.has(bd.isbn)) {
              const targetIdx = chunkBibsByIsbn.get(bd.isbn)!;
              pendingChunkRows.push({ row, targetIndex: targetIdx });
            } else if (chunkBibsByTitleAuthor.has(key)) {
              const targetIdx = chunkBibsByTitleAuthor.get(key)!;
              pendingChunkRows.push({ row, targetIndex: targetIdx });
            } else {
              const newIdx = newTitleRows.length;
              newTitleRows.push(row);
              if (bd.isbn) chunkBibsByIsbn.set(bd.isbn, newIdx);
              chunkBibsByTitleAuthor.set(key, newIdx);
            }
          }
        }

        // Bulk insert new titles in this chunk
        if (newTitleRows.length > 0) {
          const bibInserts = newTitleRows.map((r) => {
            const bd = r.data!;
            return {
              title: bd.title,
              subtitle: bd.subtitle,
              authors: bd.authors,
              editors: bd.editors,
              isbn: bd.isbn,
              edition: bd.edition,
              publisher: bd.publisher,
              placeOfPublication: bd.placeOfPublication,
              pubYear: bd.pubYear,
              pages: bd.pages,
              language: bd.language,
              subject: bd.subject,
              keywords: bd.keywords,
              ddcNumber: bd.ddcNumber,
              callNumber: bd.callNumber,
              summary: bd.summary,
              price: bd.price,
              itemTypeId: bd.itemTypeId,
              departmentId: bd.departmentId,
              importBatchId: batch.id,
            };
          });

          const insertedBibs = await tx.insert(schema.bibRecords).values(bibInserts).returning();

          for (let j = 0; j < newTitleRows.length; j++) {
            const row = newTitleRows[j];
            const bibId = insertedBibs[j].id;
            const bd = row.data!;
            rowToBibIdMap.set(bd.rowNumber, bibId);
            if (bd.isbn) isbnToBibIdMap.set(bd.isbn, bibId);
            const key = `${bd.title.trim().toLowerCase()}:::${bd.authors.trim().toLowerCase()}`;
            titleAuthorToBibIdMap.set(key, bibId);
          }

          for (const pending of pendingChunkRows) {
            const bibId = insertedBibs[pending.targetIndex].id;
            rowToBibIdMap.set(pending.row.data!.rowNumber, bibId);
          }
        }

        // Prepare physical copies (items)
        const itemsToInsert: Array<typeof schema.items.$inferInsert> = [];
        const libSequencesAdvanced = new Map<number, number>();

        for (const row of chunk) {
          const bd = row.data!;
          const bibId = rowToBibIdMap.get(bd.rowNumber);
          if (!bibId) continue;

          if (bd.copiesCount > 0) {
            const lib = libraryMap.get(bd.libraryId);
            let currentSeq = libSequencesAdvanced.get(bd.libraryId) ?? lib?.nextAccessionNo ?? 1;
            const defaultStatus = bd.isReference ? "REFERENCE_ONLY" : "AVAILABLE";
            const rowAccessions: string[] = [];

            for (let c = 0; c < bd.copiesCount; c++) {
              let accNo: string;
              let barcode: string;

              if (bd.customCopies && bd.customCopies[c]) {
                accNo = bd.customCopies[c].accessionNo;
                barcode = bd.customCopies[c].barcode;
              } else {
                const prefix = lib?.accessionPrefix ?? "CL";
                accNo = formatAccessionNumber(prefix, currentSeq);
                barcode = accNo;
                currentSeq++;
              }

              rowAccessions.push(accNo);
              allAccessionNumbers.push(accNo);

              itemsToInsert.push({
                bibId,
                libraryId: bd.libraryId,
                accessionNo: accNo,
                barcode,
                callNumber: bd.callNumber,
                location: bd.location,
                price: bd.price,
                vendorId: bd.vendorId,
                invoiceNo: bd.invoiceNo,
                acquisitionDate: bd.acquisitionDate,
                status: defaultStatus,
              });
            }

            libSequencesAdvanced.set(bd.libraryId, currentSeq);
            totalCopiesAdded += bd.copiesCount;

            titlesResult.push({
              bibId,
              title: bd.title,
              action: bd.action,
              copiesAdded: bd.copiesCount,
              accessionNumbers: rowAccessions,
              accessionRange:
                rowAccessions.length > 0
                  ? `${rowAccessions[0]} - ${rowAccessions[rowAccessions.length - 1]}`
                  : undefined,
            });
          }
        }

        // Bulk insert items for this chunk
        if (itemsToInsert.length > 0) {
          await tx.insert(schema.items).values(itemsToInsert);
          for (const item of itemsToInsert) {
            const libTable = schema.getLibraryItemsTable(item.libraryId);
            await tx.insert(libTable).values(item).onConflictDoNothing();
          }
        }

        // Update library nextAccessionNo
        for (const [libId, newSeq] of libSequencesAdvanced.entries()) {
          const lib = libraryMap.get(libId);
          if (lib && newSeq !== lib.nextAccessionNo) {
            await tx
              .update(schema.libraries)
              .set({ nextAccessionNo: newSeq, updatedAt: new Date() })
              .where(eq(schema.libraries.id, libId));
            lib.nextAccessionNo = newSeq;
          }
        }
      });
    } catch (err: unknown) {
      // Graceful fallback to row-by-row on chunk failure
      for (const row of chunk) {
        const bd = row.data!;
        try {
          await db.transaction(async (tx: DbInstance) => {
            let bibId: number;
            if (bd.action === "ADD_COPIES" && bd.existingBibId && bd.existingBibId > 0) {
              bibId = bd.existingBibId;
            } else {
              const [newBib] = await tx
                .insert(schema.bibRecords)
                .values({
                  title: bd.title,
                  subtitle: bd.subtitle,
                  authors: bd.authors,
                  editors: bd.editors,
                  isbn: bd.isbn,
                  edition: bd.edition,
                  publisher: bd.publisher,
                  placeOfPublication: bd.placeOfPublication,
                  pubYear: bd.pubYear,
                  pages: bd.pages,
                  language: bd.language,
                  subject: bd.subject,
                  keywords: bd.keywords,
                  ddcNumber: bd.ddcNumber,
                  callNumber: bd.callNumber,
                  summary: bd.summary,
                  price: bd.price,
                  itemTypeId: bd.itemTypeId,
                  departmentId: bd.departmentId,
                  importBatchId: batch.id,
                })
                .returning();
              bibId = newBib.id;
            }

            if (bd.copiesCount > 0) {
              const [lib] = await tx
                .select()
                .from(schema.libraries)
                .where(eq(schema.libraries.id, bd.libraryId))
                .limit(1);

              let currentSeq = lib.nextAccessionNo;
              const defaultStatus = bd.isReference ? "REFERENCE_ONLY" : "AVAILABLE";
              const copiesToInsert: Array<typeof schema.items.$inferInsert> = [];
              const rowAccessions: string[] = [];

              for (let c = 0; c < bd.copiesCount; c++) {
                let accNo: string;
                let barcode: string;
                if (bd.customCopies && bd.customCopies[c]) {
                  accNo = bd.customCopies[c].accessionNo;
                  barcode = bd.customCopies[c].barcode;
                } else {
                  accNo = formatAccessionNumber(lib.accessionPrefix, currentSeq);
                  barcode = accNo;
                  currentSeq++;
                }

                rowAccessions.push(accNo);
                allAccessionNumbers.push(accNo);

                copiesToInsert.push({
                  bibId,
                  libraryId: bd.libraryId,
                  accessionNo: accNo,
                  barcode,
                  callNumber: bd.callNumber,
                  location: bd.location,
                  price: bd.price,
                  vendorId: bd.vendorId,
                  invoiceNo: bd.invoiceNo,
                  acquisitionDate: bd.acquisitionDate,
                  status: defaultStatus,
                  importBatchId: batch.id,
                });
              }

              if (currentSeq !== lib.nextAccessionNo) {
                await tx
                  .update(schema.libraries)
                  .set({ nextAccessionNo: currentSeq, updatedAt: new Date() })
                  .where(eq(schema.libraries.id, lib.id));
              }

              await tx.insert(schema.items).values(copiesToInsert);
              const libTable = schema.getLibraryItemsTable(bd.libraryId);
              for (const copy of copiesToInsert) {
                await tx.insert(libTable).values(copy).onConflictDoNothing();
              }

              totalCopiesAdded += bd.copiesCount;
              titlesResult.push({
                bibId,
                title: bd.title,
                action: bd.action,
                copiesAdded: bd.copiesCount,
                accessionNumbers: rowAccessions,
                accessionRange:
                  rowAccessions.length > 0
                    ? `${rowAccessions[0]} - ${rowAccessions[rowAccessions.length - 1]}`
                    : undefined,
              });
            }
          });
        } catch (singleErr: unknown) {
          const msg = singleErr instanceof Error ? singleErr.message : String(singleErr);
          skippedRows.push({
            rowNumber: row.rowNumber,
            reason: `Row insert failure: ${msg}`,
          });
        }
      }
    }
  }

  // Update batch metadata with final counts
  await db
    .update(schema.importBatches)
    .set({
      importedRows: titlesResult.length,
      skippedRows: skippedRows.length,
    })
    .where(eq(schema.importBatches.id, batch.id));

  // Audit entry
  await recordAuditLog(
    {
      actorType: "STAFF",
      actorId: actor.id,
      actorName: actor.fullName,
      action: "IMPORT",
      entity: "bib_records",
      entityId: String(batch?.id ?? 0),
      details: `Imported ${titlesResult.length} catalogue titles (${totalCopiesAdded} copies) from "${preview.fileName}" (${skippedRows.length} skipped)`,
      ipAddress: actor.ipAddress,
    },
    db,
  );

  const labelPrintUrl = `/catalogue?accessions=${encodeURIComponent(allAccessionNumbers.slice(0, 100).join(","))}`;

  return {
    batchId: batch?.id ?? 0,
    importType: "CATALOGUE",
    fileName: preview.fileName,
    totalRows: preview.summary.totalRows,
    importedCount: titlesResult.length,
    skippedCount: skippedRows.length,
    titles: titlesResult,
    totalCopiesAdded,
    allAccessionNumbers,
    labelPrintUrl,
    skippedRows,
  };
}
