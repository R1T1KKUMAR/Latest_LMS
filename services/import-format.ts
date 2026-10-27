/**
 * Import Format Configuration Service.
 * Allows administrators to customize, rename, and manage CSV/Excel column definitions
 * for bulk imports (Students, Faculty, Catalogue/Books).
 *
 * Persists format configurations into the `system_settings` table as JSON.
 * Validates dependencies and checks for non-null database records before column removal.
 */

import { and, count, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import * as schema from "@/db/schema";
import {
  type Actor,
  DEFAULT_FORMATS,
  getDefaultImportFormat,
  IMPORT_SETTING_KEYS,
  type ImportColumnDef,
  type ImportType,
} from "@/types/import-format";
import { recordAuditLog } from "./audit";

export * from "@/types/import-format";

// biome-ignore lint/suspicious/noExplicitAny: generic DB instance support
type DbInstance = any;

/**
 * Loads the active import format from `system_settings`.
 * Falls back to built-in defaults if not configured.
 */
export async function getImportFormat(
  type: ImportType,
  db: DbInstance = defaultDb,
): Promise<ImportColumnDef[]> {
  const key = IMPORT_SETTING_KEYS[type];
  const rows = await db
    .select()
    .from(schema.systemSettings)
    .where(eq(schema.systemSettings.settingKey, key))
    .limit(1);

  if (rows.length > 0 && rows[0]?.settingValue) {
    try {
      const parsed = JSON.parse(rows[0].settingValue);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed as ImportColumnDef[];
      }
    } catch (_err) {
      // JSON parse error, fall back to default
    }
  }

  return getDefaultImportFormat(type);
}

/**
 * Updates the import format in `system_settings` with full validation
 * and append-only audit trail.
 */
export async function updateImportFormat(
  type: ImportType,
  columns: ImportColumnDef[],
  actor: Actor,
  db: DbInstance = defaultDb,
): Promise<ImportColumnDef[]> {
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new Error("Import format must contain at least one column definition.");
  }

  const defaultDefs = DEFAULT_FORMATS[type];
  const defaultByDbField = new Map(defaultDefs.map((d) => [d.dbField, d]));

  // Ensure all required fields for this import type are present
  const requiredDbFields = defaultDefs.filter((d) => d.required).map((d) => d.dbField);
  const suppliedDbFields = new Set(columns.map((c) => c.dbField));

  for (const reqField of requiredDbFields) {
    if (!suppliedDbFields.has(reqField)) {
      const def = defaultByDbField.get(reqField);
      throw new Error(
        `Mandatory column "${def?.label ?? reqField}" (${reqField}) cannot be removed from the import format.`,
      );
    }
  }

  // Validate individual column definitions and header uniqueness
  const seenHeaders = new Set<string>();
  const sanitizedColumns: ImportColumnDef[] = [];

  for (const col of columns) {
    const rawHeader = (col.csvHeader || "").trim();
    if (!rawHeader) {
      throw new Error(`Column "${col.label || col.dbField}" must have a valid header name.`);
    }

    // Header name validation: alphanumeric and underscore, max 50 chars
    const normalizedHeader = rawHeader.toLowerCase().replace(/\s+/g, "_");
    if (!/^[a-z0-9_]+$/i.test(normalizedHeader)) {
      throw new Error(
        `Invalid header name "${rawHeader}". Only letters, numbers, and underscores are allowed.`,
      );
    }

    if (seenHeaders.has(normalizedHeader)) {
      throw new Error(`Duplicate column header "${normalizedHeader}" found in format definition.`);
    }
    seenHeaders.add(normalizedHeader);

    const defaultDef = defaultByDbField.get(col.dbField);
    sanitizedColumns.push({
      csvHeader: normalizedHeader,
      dbField: col.dbField,
      label: col.label || defaultDef?.label || col.dbField,
      required: defaultDef?.required ?? false,
      sampleValue: col.sampleValue || defaultDef?.sampleValue || "",
      description: col.description || defaultDef?.description || "",
    });
  }

  const key = IMPORT_SETTING_KEYS[type];
  const jsonValue = JSON.stringify(sanitizedColumns);

  const existing = await db
    .select()
    .from(schema.systemSettings)
    .where(eq(schema.systemSettings.settingKey, key))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(schema.systemSettings)
      .set({
        settingValue: jsonValue,
        updatedAt: new Date(),
      })
      .where(eq(schema.systemSettings.id, existing[0].id));
  } else {
    await db.insert(schema.systemSettings).values({
      settingKey: key,
      settingValue: jsonValue,
      description: `Configurable CSV import format definition for ${type}`,
    });
  }

  await recordAuditLog(
    {
      actorType: actor.actorType ?? "STAFF",
      actorId: actor.id,
      actorName: actor.fullName,
      action: "SETTINGS_UPDATE",
      entity: "system_settings",
      entityId: key,
      details: `Updated ${type} bulk import format (${sanitizedColumns.length} columns: ${sanitizedColumns.map((c) => c.csvHeader).join(", ")})`,
      ipAddress: actor.ipAddress,
    },
    db,
  );

  return sanitizedColumns;
}

/**
 * Resets an import format back to institutional defaults.
 */
export async function resetImportFormat(
  type: ImportType,
  actor: Actor,
  db: DbInstance = defaultDb,
): Promise<ImportColumnDef[]> {
  const defaults = getDefaultImportFormat(type);
  const key = IMPORT_SETTING_KEYS[type];
  const jsonValue = JSON.stringify(defaults);

  const existing = await db
    .select()
    .from(schema.systemSettings)
    .where(eq(schema.systemSettings.settingKey, key))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(schema.systemSettings)
      .set({
        settingValue: jsonValue,
        updatedAt: new Date(),
      })
      .where(eq(schema.systemSettings.id, existing[0].id));
  } else {
    await db.insert(schema.systemSettings).values({
      settingKey: key,
      settingValue: jsonValue,
      description: `Configurable CSV import format definition for ${type}`,
    });
  }

  await recordAuditLog(
    {
      actorType: actor.actorType ?? "STAFF",
      actorId: actor.id,
      actorName: actor.fullName,
      action: "SETTINGS_UPDATE",
      entity: "system_settings",
      entityId: key,
      details: `Reset ${type} bulk import format to institutional defaults (${defaults.length} columns)`,
      ipAddress: actor.ipAddress,
    },
    db,
  );

  return defaults;
}

/**
 * Checks whether a given attribute (dbField) currently has non-null/non-empty data in the database.
 * Used before deleting a column from the import format to prompt the admin with a safety warning.
 */
export async function checkColumnHasData(
  type: ImportType,
  dbField: string,
  db: DbInstance = defaultDb,
): Promise<{ hasData: boolean; count: number }> {
  try {
    let nonNullCount = 0;

    if (type === "STUDENT") {
      const studentFilter = eq(schema.patrons.patronType, "STUDENT");

      switch (dbField) {
        case "name": {
          const res = await db
            .select({ val: count() })
            .from(schema.patrons)
            .where(and(studentFilter, isNotNull(schema.patrons.firstName)));
          nonNullCount = Number(res[0]?.val ?? 0);
          break;
        }
        case "card_no": {
          const res = await db
            .select({ val: count() })
            .from(schema.patrons)
            .where(
              and(studentFilter, isNotNull(schema.patrons.cardNo), ne(schema.patrons.cardNo, "")),
            );
          nonNullCount = Number(res[0]?.val ?? 0);
          break;
        }
        case "gender": {
          const res = await db
            .select({ val: count() })
            .from(schema.patrons)
            .where(
              and(studentFilter, isNotNull(schema.patrons.gender), ne(schema.patrons.gender, "")),
            );
          nonNullCount = Number(res[0]?.val ?? 0);
          break;
        }
        case "dob": {
          const res = await db
            .select({ val: count() })
            .from(schema.patrons)
            .where(and(studentFilter, isNotNull(schema.patrons.dob)));
          nonNullCount = Number(res[0]?.val ?? 0);
          break;
        }
        case "institute": {
          const res = await db
            .select({ val: count() })
            .from(schema.patrons)
            .where(and(studentFilter, isNotNull(schema.patrons.institutionId)));
          nonNullCount = Number(res[0]?.val ?? 0);
          break;
        }
        case "course": {
          const res = await db
            .select({ val: count() })
            .from(schema.patrons)
            .where(and(studentFilter, isNotNull(schema.patrons.courseId)));
          nonNullCount = Number(res[0]?.val ?? 0);
          break;
        }
        case "department": {
          const res = await db
            .select({ val: count() })
            .from(schema.patrons)
            .where(and(studentFilter, isNotNull(schema.patrons.departmentId)));
          nonNullCount = Number(res[0]?.val ?? 0);
          break;
        }
        case "year": {
          const res = await db
            .select({ val: count() })
            .from(schema.patrons)
            .where(and(studentFilter, isNotNull(schema.patrons.academicYear)));
          nonNullCount = Number(res[0]?.val ?? 0);
          break;
        }
        case "semester": {
          const res = await db
            .select({ val: count() })
            .from(schema.patrons)
            .where(and(studentFilter, isNotNull(schema.patrons.semester)));
          nonNullCount = Number(res[0]?.val ?? 0);
          break;
        }
        case "section": {
          const res = await db
            .select({ val: count() })
            .from(schema.patrons)
            .where(
              and(studentFilter, isNotNull(schema.patrons.section), ne(schema.patrons.section, "")),
            );
          nonNullCount = Number(res[0]?.val ?? 0);
          break;
        }
        case "mobile": {
          const res = await db
            .select({ val: count() })
            .from(schema.patrons)
            .where(
              and(studentFilter, isNotNull(schema.patrons.mobile), ne(schema.patrons.mobile, "")),
            );
          nonNullCount = Number(res[0]?.val ?? 0);
          break;
        }
        case "email": {
          const res = await db
            .select({ val: count() })
            .from(schema.patrons)
            .where(
              and(studentFilter, isNotNull(schema.patrons.email), ne(schema.patrons.email, "")),
            );
          nonNullCount = Number(res[0]?.val ?? 0);
          break;
        }
        case "father_name": {
          const res = await db
            .select({ val: count() })
            .from(schema.patrons)
            .where(
              and(
                studentFilter,
                isNotNull(schema.patrons.fatherName),
                ne(schema.patrons.fatherName, ""),
              ),
            );
          nonNullCount = Number(res[0]?.val ?? 0);
          break;
        }
        case "admission_date": {
          const res = await db
            .select({ val: count() })
            .from(schema.patrons)
            .where(and(studentFilter, isNotNull(schema.patrons.admissionDate)));
          nonNullCount = Number(res[0]?.val ?? 0);
          break;
        }
        default:
          nonNullCount = 0;
      }
    } else if (type === "FACULTY") {
      const facultyFilter = inArray(schema.patrons.patronType, ["FACULTY", "STAFF"]);

      switch (dbField) {
        case "employee_id": {
          const res = await db
            .select({ val: count() })
            .from(schema.patrons)
            .where(
              and(
                facultyFilter,
                isNotNull(schema.patrons.employeeId),
                ne(schema.patrons.employeeId, ""),
              ),
            );
          nonNullCount = Number(res[0]?.val ?? 0);
          break;
        }
        case "name": {
          const res = await db
            .select({ val: count() })
            .from(schema.patrons)
            .where(and(facultyFilter, isNotNull(schema.patrons.firstName)));
          nonNullCount = Number(res[0]?.val ?? 0);
          break;
        }
        case "card_no": {
          const res = await db
            .select({ val: count() })
            .from(schema.patrons)
            .where(
              and(facultyFilter, isNotNull(schema.patrons.cardNo), ne(schema.patrons.cardNo, "")),
            );
          nonNullCount = Number(res[0]?.val ?? 0);
          break;
        }
        case "gender": {
          const res = await db
            .select({ val: count() })
            .from(schema.patrons)
            .where(
              and(facultyFilter, isNotNull(schema.patrons.gender), ne(schema.patrons.gender, "")),
            );
          nonNullCount = Number(res[0]?.val ?? 0);
          break;
        }
        case "dob": {
          const res = await db
            .select({ val: count() })
            .from(schema.patrons)
            .where(and(facultyFilter, isNotNull(schema.patrons.dob)));
          nonNullCount = Number(res[0]?.val ?? 0);
          break;
        }
        case "institute": {
          const res = await db
            .select({ val: count() })
            .from(schema.patrons)
            .where(and(facultyFilter, isNotNull(schema.patrons.institutionId)));
          nonNullCount = Number(res[0]?.val ?? 0);
          break;
        }
        case "department": {
          const res = await db
            .select({ val: count() })
            .from(schema.patrons)
            .where(and(facultyFilter, isNotNull(schema.patrons.departmentId)));
          nonNullCount = Number(res[0]?.val ?? 0);
          break;
        }
        case "category": {
          const res = await db
            .select({ val: count() })
            .from(schema.patrons)
            .where(and(facultyFilter, isNotNull(schema.patrons.categoryId)));
          nonNullCount = Number(res[0]?.val ?? 0);
          break;
        }
        case "mobile": {
          const res = await db
            .select({ val: count() })
            .from(schema.patrons)
            .where(
              and(facultyFilter, isNotNull(schema.patrons.mobile), ne(schema.patrons.mobile, "")),
            );
          nonNullCount = Number(res[0]?.val ?? 0);
          break;
        }
        case "email": {
          const res = await db
            .select({ val: count() })
            .from(schema.patrons)
            .where(
              and(facultyFilter, isNotNull(schema.patrons.email), ne(schema.patrons.email, "")),
            );
          nonNullCount = Number(res[0]?.val ?? 0);
          break;
        }
        case "joining_date": {
          const res = await db
            .select({ val: count() })
            .from(schema.patrons)
            .where(and(facultyFilter, isNotNull(schema.patrons.admissionDate)));
          nonNullCount = Number(res[0]?.val ?? 0);
          break;
        }
        default:
          nonNullCount = 0;
      }
    } else if (type === "CATALOGUE") {
      switch (dbField) {
        case "title": {
          const res = await db
            .select({ val: count() })
            .from(schema.bibRecords)
            .where(and(isNotNull(schema.bibRecords.title), ne(schema.bibRecords.title, "")));
          nonNullCount = Number(res[0]?.val ?? 0);
          break;
        }
        case "authors": {
          const res = await db
            .select({ val: count() })
            .from(schema.bibRecords)
            .where(and(isNotNull(schema.bibRecords.authors), ne(schema.bibRecords.authors, "")));
          nonNullCount = Number(res[0]?.val ?? 0);
          break;
        }
        case "isbn": {
          const res = await db
            .select({ val: count() })
            .from(schema.bibRecords)
            .where(and(isNotNull(schema.bibRecords.isbn), ne(schema.bibRecords.isbn, "")));
          nonNullCount = Number(res[0]?.val ?? 0);
          break;
        }
        case "publisher": {
          const res = await db
            .select({ val: count() })
            .from(schema.bibRecords)
            .where(
              and(isNotNull(schema.bibRecords.publisher), ne(schema.bibRecords.publisher, "")),
            );
          nonNullCount = Number(res[0]?.val ?? 0);
          break;
        }
        case "pub_year": {
          const res = await db
            .select({ val: count() })
            .from(schema.bibRecords)
            .where(isNotNull(schema.bibRecords.pubYear));
          nonNullCount = Number(res[0]?.val ?? 0);
          break;
        }
        case "item_type": {
          const res = await db
            .select({ val: count() })
            .from(schema.bibRecords)
            .where(isNotNull(schema.bibRecords.itemTypeId));
          nonNullCount = Number(res[0]?.val ?? 0);
          break;
        }
        case "library": {
          const res = await db
            .select({ val: count() })
            .from(schema.items)
            .where(isNotNull(schema.items.libraryId));
          nonNullCount = Number(res[0]?.val ?? 0);
          break;
        }
        case "copies": {
          const res = await db.select({ val: count() }).from(schema.items);
          nonNullCount = Number(res[0]?.val ?? 0);
          break;
        }
        case "accession_no": {
          const res = await db
            .select({ val: count() })
            .from(schema.items)
            .where(and(isNotNull(schema.items.accessionNo), ne(schema.items.accessionNo, "")));
          nonNullCount = Number(res[0]?.val ?? 0);
          break;
        }
        case "barcode": {
          const res = await db
            .select({ val: count() })
            .from(schema.items)
            .where(and(isNotNull(schema.items.barcode), ne(schema.items.barcode, "")));
          nonNullCount = Number(res[0]?.val ?? 0);
          break;
        }
        case "price": {
          const res = await db
            .select({ val: count() })
            .from(schema.bibRecords)
            .where(and(isNotNull(schema.bibRecords.price), sql`${schema.bibRecords.price} > 0`));
          nonNullCount = Number(res[0]?.val ?? 0);
          break;
        }
        case "location": {
          const res = await db
            .select({ val: count() })
            .from(schema.items)
            .where(and(isNotNull(schema.items.location), ne(schema.items.location, "")));
          nonNullCount = Number(res[0]?.val ?? 0);
          break;
        }
        case "edition": {
          const res = await db
            .select({ val: count() })
            .from(schema.bibRecords)
            .where(and(isNotNull(schema.bibRecords.edition), ne(schema.bibRecords.edition, "")));
          nonNullCount = Number(res[0]?.val ?? 0);
          break;
        }
        case "subject": {
          const res = await db
            .select({ val: count() })
            .from(schema.bibRecords)
            .where(and(isNotNull(schema.bibRecords.subject), ne(schema.bibRecords.subject, "")));
          nonNullCount = Number(res[0]?.val ?? 0);
          break;
        }
        case "ddc_number": {
          const res = await db
            .select({ val: count() })
            .from(schema.bibRecords)
            .where(
              and(isNotNull(schema.bibRecords.ddcNumber), ne(schema.bibRecords.ddcNumber, "")),
            );
          nonNullCount = Number(res[0]?.val ?? 0);
          break;
        }
        default:
          nonNullCount = 0;
      }
    }

    return {
      hasData: nonNullCount > 0,
      count: nonNullCount,
    };
  } catch (error) {
    console.error(`Error checking DB data for ${type} - ${dbField}:`, error);
    return { hasData: false, count: 0 };
  }
}
