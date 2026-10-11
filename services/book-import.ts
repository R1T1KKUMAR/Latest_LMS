import { eq } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import * as schema from "@/db/schema";
import { decodeCsvBuffer, getFieldValue, parseCsvDate, parseCsvText } from "@/imports/csv-parser";
import { DB_TEXT_LIMITS, truncate, truncateWithDefault } from "@/imports/truncate";
import { formatAccessionNumber, normalizeIsbn } from "@/lib/numbering";
import { recordAuditLog } from "./audit";

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

  const rows: BookRowPreview[] = [];
  let okCount = 0;
  let warnCount = 0;
  let errorCount = 0;
  let newTitlesCount = 0;
  let addCopiesCount = 0;
  let totalCopiesExpected = 0;

  for (const parsedRow of parsedRows) {
    const raw = parsedRow.raw;
    const rowNumber = parsedRow.rowNumber;
    const messages: string[] = [];
    let isError = false;

    // --- Title (REQUIRED) ---
    const rawTitle = getFieldValue(raw, "title", ["book_title", "title_name"]);
    if (!rawTitle) {
      messages.push("Missing required field: title");
      isError = true;
    }
    const title = truncateWithDefault(rawTitle, DB_TEXT_LIMITS.TITLE, "Untitled");

    // --- ISBN & Deduplication / Matching (FR-BI-03) ---
    const rawIsbn = getFieldValue(raw, "isbn", ["isbn_number", "isbn_13", "isbn_10"]);
    let normalizedIsbn: string | null = null;
    let matchedBib: (typeof existingBibs)[0] | undefined;

    if (rawIsbn) {
      normalizedIsbn = normalizeIsbn(rawIsbn);
      if (normalizedIsbn) {
        if (normalizedIsbn.length !== 10 && normalizedIsbn.length !== 13) {
          messages.push(`ISBN "${rawIsbn}" is neither 10 nor 13 digits; retained`);
        }
        matchedBib = bibsByIsbn.get(normalizedIsbn);
      } else {
        messages.push(`Could not normalize ISBN "${rawIsbn}"`);
      }
    }

    // Authors
    const rawAuthors = getFieldValue(raw, "authors", ["author", "writer", "creators"]);
    const authors = truncateWithDefault(rawAuthors, DB_TEXT_LIMITS.AUTHORS, "Unknown");

    // If not matched by ISBN, check match by Title + Authors
    if (!matchedBib && rawTitle) {
      const match = existingBibs.find(
        (b: { title: string; authors: string }) =>
          b.title.trim().toLowerCase() === title.trim().toLowerCase() &&
          b.authors.trim().toLowerCase() === authors.trim().toLowerCase(),
      );
      if (match) {
        matchedBib = match;
      }
    }

    const action: "NEW_TITLE" | "ADD_COPIES" = matchedBib ? "ADD_COPIES" : "NEW_TITLE";
    if (matchedBib) {
      messages.push(
        `Matching title found (ID #${matchedBib.id}): will add copies to existing title`,
      );
    }

    // Subtitle & Editors
    const subtitle = truncate(getFieldValue(raw, "subtitle"), DB_TEXT_LIMITS.SUBTITLE);
    const editors = truncate(getFieldValue(raw, "editors", ["editor"]), DB_TEXT_LIMITS.EDITORS);

    // Edition & Publisher
    const edition = truncate(getFieldValue(raw, "edition"), DB_TEXT_LIMITS.EDITION);
    const publisher = truncate(getFieldValue(raw, "publisher"), DB_TEXT_LIMITS.PUBLISHER);
    const placeOfPublication = truncate(
      getFieldValue(raw, "place", ["place_of_publication"]),
      DB_TEXT_LIMITS.PLACE,
    );

    // Pub Year
    let pubYear: number | null = null;
    const rawYear = getFieldValue(raw, "pub_year", ["year", "publication_year"]);
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
    const pages = truncate(getFieldValue(raw, "pages"), DB_TEXT_LIMITS.PAGES);
    const language = truncateWithDefault(
      getFieldValue(raw, "language"),
      DB_TEXT_LIMITS.LANGUAGE,
      "English",
    );

    // Classification & Subject
    const subject = truncate(getFieldValue(raw, "subject"), DB_TEXT_LIMITS.SUBJECT);
    const keywords = truncate(getFieldValue(raw, "keywords"), DB_TEXT_LIMITS.KEYWORDS);
    const ddcNumber = truncate(getFieldValue(raw, "ddc", ["ddc_number"]), DB_TEXT_LIMITS.DDC);
    const callNumber = truncate(
      getFieldValue(raw, "call_number", ["call_no"]),
      DB_TEXT_LIMITS.CALL_NUMBER,
    );
    const summary = truncate(getFieldValue(raw, "summary"), DB_TEXT_LIMITS.SUMMARY);

    // Price
    let price = "0.00";
    const rawPrice = getFieldValue(raw, "price", ["cost", "rate"]);
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
    const rawItemType = getFieldValue(raw, "item_type", ["type"]);
    if (rawItemType) {
      const found = itemTypeByCode.get(rawItemType.toUpperCase());
      if (found) {
        itemType = found;
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
    const rawLib = getFieldValue(raw, "library", ["lib", "branch"]);
    if (rawLib) {
      const found = libraryByCode.get(rawLib.toUpperCase());
      if (found) {
        library = found;
      } else {
        messages.push(`Unknown library "${rawLib}"`);
        isError = true;
      }
    }

    if (!library) {
      messages.push("Could not resolve target library");
      isError = true;
    }

    // Department
    let departmentId: number | null = null;
    const rawDept = getFieldValue(raw, "department", ["dept"]);
    if (rawDept) {
      const found = departmentByCode.get(rawDept.toUpperCase());
      if (found) {
        departmentId = found.id;
      } else {
        messages.push(`Unknown department "${rawDept}"; field set to null`);
      }
    }

    // Vendor
    let vendorId: number | null = null;
    const rawVendor = getFieldValue(raw, "vendor", ["supplier"]);
    if (rawVendor) {
      const found = vendorByName.get(rawVendor.trim().toLowerCase());
      if (found) {
        vendorId = found.id;
      } else {
        messages.push(`Unknown vendor "${rawVendor}"; field set to null`);
      }
    }

    // Invoice & Location
    const invoiceNo = truncate(getFieldValue(raw, "invoice_no"), DB_TEXT_LIMITS.INVOICE_NO);
    const location = truncate(getFieldValue(raw, "location"), DB_TEXT_LIMITS.LOCATION);
    const acquisitionDate =
      parseCsvDate(getFieldValue(raw, "acquisition_date")) ||
      new Date().toISOString().split("T")[0];

    // Copies count
    let copiesCount = 1;
    const rawCopies = getFieldValue(raw, "copies", ["qty", "quantity", "no_of_copies"]);
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
    const rawAccessions = getFieldValue(raw, "accession_no", [
      "accession",
      "accession_number",
      "accession_numbers",
    ]);
    const rawBarcodes = getFieldValue(raw, "barcode", ["barcodes"]);

    if (rawAccessions) {
      const accList = rawAccessions
        .split("|")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);

      if (copiesCount > 0 && accList.length !== copiesCount) {
        messages.push(
          `Number of accession numbers (${accList.length}) does not match copies count (${copiesCount})`,
        );
        isError = true;
      }

      const barList = rawBarcodes
        ? rawBarcodes
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
      if (action === "NEW_TITLE") newTitlesCount++;
      else addCopiesCount++;
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

  for (const row of preview.rows) {
    if (row.status === "ERROR" || !row.data) {
      skippedRows.push({
        rowNumber: row.rowNumber,
        reason: row.messages.join("; ") || "Fatal validation errors",
      });
      continue;
    }

    const bookData = row.data;

    try {
      // Row-level transaction isolation (FR-BI-05, NFR-R-02)
      const rowResult = await db.transaction(async (tx: DbInstance) => {
        let bibId: number;

        // 1. Resolve or Create Bibliographic Record
        if (bookData.action === "ADD_COPIES" && bookData.existingBibId) {
          bibId = bookData.existingBibId;
        } else {
          const [newBib] = await tx
            .insert(schema.bibRecords)
            .values({
              title: bookData.title,
              subtitle: bookData.subtitle,
              authors: bookData.authors,
              editors: bookData.editors,
              isbn: bookData.isbn,
              edition: bookData.edition,
              publisher: bookData.publisher,
              placeOfPublication: bookData.placeOfPublication,
              pubYear: bookData.pubYear,
              pages: bookData.pages,
              language: bookData.language,
              subject: bookData.subject,
              keywords: bookData.keywords,
              ddcNumber: bookData.ddcNumber,
              callNumber: bookData.callNumber,
              summary: bookData.summary,
              price: bookData.price,
              itemTypeId: bookData.itemTypeId,
              departmentId: bookData.departmentId,
            })
            .returning();
          bibId = newBib.id;
        }

        // 2. Add Physical Copies if count > 0
        const rowAccessions: string[] = [];
        if (bookData.copiesCount > 0) {
          const [lib] = await tx
            .select()
            .from(schema.libraries)
            .where(eq(schema.libraries.id, bookData.libraryId))
            .limit(1);

          let currentSeq = lib.nextAccessionNo;
          const defaultStatus = bookData.isReference ? "REFERENCE_ONLY" : "AVAILABLE";
          const copiesToInsert: Array<typeof schema.items.$inferInsert> = [];

          for (let i = 0; i < bookData.copiesCount; i++) {
            let accNo: string;
            let barcode: string;

            if (bookData.customCopies && bookData.customCopies[i]) {
              accNo = bookData.customCopies[i].accessionNo;
              barcode = bookData.customCopies[i].barcode;
            } else {
              accNo = formatAccessionNumber(lib.accessionPrefix, currentSeq);
              barcode = accNo;
              currentSeq++;
            }

            rowAccessions.push(accNo);

            copiesToInsert.push({
              bibId,
              libraryId: bookData.libraryId,
              accessionNo: accNo,
              barcode,
              callNumber: bookData.callNumber,
              location: bookData.location,
              price: bookData.price,
              vendorId: bookData.vendorId,
              invoiceNo: bookData.invoiceNo,
              acquisitionDate: bookData.acquisitionDate,
              status: defaultStatus,
            });
          }

          // Update library's nextAccessionNo if sequence was advanced
          if (currentSeq !== lib.nextAccessionNo) {
            await tx
              .update(schema.libraries)
              .set({ nextAccessionNo: currentSeq, updatedAt: new Date() })
              .where(eq(schema.libraries.id, lib.id));
          }

          await tx.insert(schema.items).values(copiesToInsert);
        }

        return {
          bibId,
          title: bookData.title,
          action: bookData.action,
          copiesAdded: bookData.copiesCount,
          accessionNumbers: rowAccessions,
        };
      });

      const accRange =
        rowResult.accessionNumbers.length > 0
          ? `${rowResult.accessionNumbers[0]} - ${rowResult.accessionNumbers[rowResult.accessionNumbers.length - 1]}`
          : undefined;

      titlesResult.push({
        ...rowResult,
        accessionRange: accRange,
      });

      allAccessionNumbers.push(...rowResult.accessionNumbers);
      totalCopiesAdded += rowResult.copiesAdded;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      skippedRows.push({
        rowNumber: row.rowNumber,
        reason: `Transaction insertion failure: ${errorMsg}`,
      });
    }
  }

  // Record batch in import_batches
  const [batch] = await db
    .insert(schema.importBatches)
    .values({
      importType: "CATALOGUE",
      fileName: preview.fileName,
      totalRows: preview.summary.totalRows,
      importedRows: titlesResult.length,
      skippedRows: skippedRows.length,
      importedBy: actor.id,
    })
    .returning();

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
