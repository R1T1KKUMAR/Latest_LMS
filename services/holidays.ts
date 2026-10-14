/**
 * Holiday & Academic Calendar Service.
 * Manages institutional annual holiday calendars, ad-hoc college closure declarations,
 * CSV calendar imports, and provides date sets for fine exemption enforcement.
 */

import { eq } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import * as schema from "@/db/schema";
import { recordAuditLog } from "./audit";

// biome-ignore lint/suspicious/noExplicitAny: generic DB instance support
type DbInstance = any;

export interface Actor {
  id: number;
  fullName: string;
  actorType?: "STAFF" | "PATRON";
  ipAddress?: string;
}

export interface HolidayRecord {
  id: string;
  date: string; // YYYY-MM-DD
  name: string;
  type: "ANNUAL" | "AD_HOC" | "WEEKLY_OFF";
  description?: string | null;
  libraryId?: number | null; // null = all libraries / campus branches
  createdAt: string;
  createdBy?: string | null;
}

const SETTING_KEY_HOLIDAYS = "HOLIDAY_CALENDAR";

/**
 * Normalizes any date string (YYYY-MM-DD or DD-MM-YYYY or DD/MM/YYYY) to YYYY-MM-DD.
 */
export function normalizeDateString(dateStr: string): string | null {
  const trimmed = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [_y, m, d] = trimmed.split("-").map(Number);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return trimmed;
  }

  // DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    const year = Number(y);
    const month = Number(m);
    const day = Number(d);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  return null;
}

/**
 * Retrieves all stored holidays from system_settings.
 */
export async function getHolidays(db: DbInstance = defaultDb): Promise<HolidayRecord[]> {
  const [row] = await db
    .select()
    .from(schema.systemSettings)
    .where(eq(schema.systemSettings.settingKey, SETTING_KEY_HOLIDAYS))
    .limit(1);

  if (!row?.settingValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(row.settingValue);
    if (!Array.isArray(parsed)) return [];
    return parsed.sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

/**
 * Returns a Set of ISO date strings ('YYYY-MM-DD') for fast O(1) fine exemption lookups.
 */
export async function getHolidayDateSet(
  db: DbInstance = defaultDb,
  libraryId?: number | null,
): Promise<Set<string>> {
  const holidays = await getHolidays(db);
  const dateSet = new Set<string>();

  for (const h of holidays) {
    // If holiday is branch-specific and libraryId is given, only include if matches
    if (libraryId && h.libraryId && h.libraryId !== libraryId) {
      continue;
    }
    dateSet.add(h.date);
  }

  return dateSet;
}

/**
 * Saves the entire holiday array into system_settings.
 */
async function saveHolidays(holidays: HolidayRecord[], db: DbInstance = defaultDb): Promise<void> {
  const jsonValue = JSON.stringify(holidays);

  const [existing] = await db
    .select({ id: schema.systemSettings.id })
    .from(schema.systemSettings)
    .where(eq(schema.systemSettings.settingKey, SETTING_KEY_HOLIDAYS))
    .limit(1);

  if (existing) {
    await db
      .update(schema.systemSettings)
      .set({
        settingValue: jsonValue,
        description: "Official institutional holiday & college closure calendar",
        updatedAt: new Date(),
      })
      .where(eq(schema.systemSettings.id, existing.id));
  } else {
    await db.insert(schema.systemSettings).values({
      settingKey: SETTING_KEY_HOLIDAYS,
      settingValue: jsonValue,
      description: "Official institutional holiday & college closure calendar",
    });
  }
}

/**
 * Adds an ad-hoc or annual holiday (e.g., college off due to weather, event, election, emergency closure).
 */
export async function addHoliday(
  params: {
    date: string;
    name: string;
    type?: "ANNUAL" | "AD_HOC" | "WEEKLY_OFF";
    description?: string | null;
    libraryId?: number | null;
  },
  actor: Actor,
  db: DbInstance = defaultDb,
): Promise<HolidayRecord> {
  const normalizedDate = normalizeDateString(params.date);
  if (!normalizedDate) {
    throw new Error(`Invalid date format "${params.date}". Expected YYYY-MM-DD.`);
  }

  const holidayName = params.name.trim();
  if (!holidayName) {
    throw new Error("Holiday name or closure reason is required.");
  }

  const holidayType = params.type || "AD_HOC";
  const holidays = await getHolidays(db);

  // Check for duplicate date on same library scope
  const existingIdx = holidays.findIndex(
    (h) => h.date === normalizedDate && (h.libraryId ?? null) === (params.libraryId ?? null),
  );

  const newRecord: HolidayRecord = {
    id: `hol_${normalizedDate.replace(/-/g, "")}_${Date.now().toString(36)}`,
    date: normalizedDate,
    name: holidayName,
    type: holidayType,
    description: params.description?.trim() || null,
    libraryId: params.libraryId ?? null,
    createdAt: new Date().toISOString(),
    createdBy: actor.fullName,
  };

  if (existingIdx >= 0) {
    // Update existing record for that date
    holidays[existingIdx] = newRecord;
  } else {
    holidays.push(newRecord);
  }

  holidays.sort((a, b) => a.date.localeCompare(b.date));
  await saveHolidays(holidays, db);

  // Audit log
  await recordAuditLog(
    {
      actorType: actor.actorType ?? "STAFF",
      actorId: actor.id,
      actorName: actor.fullName,
      action: "SETTINGS_UPDATE",
      entity: "system_settings",
      entityId: SETTING_KEY_HOLIDAYS,
      details: `Added ${holidayType} holiday: "${holidayName}" on ${normalizedDate}. Reason: ${params.description || "N/A"}. Fine exemption active.`,
      ipAddress: actor.ipAddress,
    },
    db,
  );

  return newRecord;
}

/**
 * Deletes a holiday by ID.
 */
export async function deleteHoliday(
  id: string,
  actor: Actor,
  db: DbInstance = defaultDb,
): Promise<boolean> {
  const holidays = await getHolidays(db);
  const target = holidays.find((h) => h.id === id);

  if (!target) {
    return false;
  }

  const filtered = holidays.filter((h) => h.id !== id);
  await saveHolidays(filtered, db);

  await recordAuditLog(
    {
      actorType: actor.actorType ?? "STAFF",
      actorId: actor.id,
      actorName: actor.fullName,
      action: "SETTINGS_UPDATE",
      entity: "system_settings",
      entityId: SETTING_KEY_HOLIDAYS,
      details: `Removed holiday: "${target.name}" on ${target.date} (ID: ${id}).`,
      ipAddress: actor.ipAddress,
    },
    db,
  );

  return true;
}

/**
 * Imports holiday calendar records (with merge or replace options).
 */
export async function importHolidayCalendar(
  items: Array<{
    date: string;
    name: string;
    type?: "ANNUAL" | "AD_HOC" | "WEEKLY_OFF";
    description?: string | null;
  }>,
  mode: "MERGE" | "REPLACE",
  actor: Actor,
  db: DbInstance = defaultDb,
): Promise<{ importedCount: number; totalCount: number }> {
  const existingHolidays = mode === "REPLACE" ? [] : await getHolidays(db);

  // Map existing by date
  const mapByDate = new Map<string, HolidayRecord>();
  for (const h of existingHolidays) {
    mapByDate.set(h.date, h);
  }

  let importedCount = 0;
  for (const item of items) {
    const normalized = normalizeDateString(item.date);
    if (!normalized || !item.name.trim()) continue;

    const record: HolidayRecord = {
      id: `hol_${normalized.replace(/-/g, "")}_${Math.random().toString(36).slice(2, 7)}`,
      date: normalized,
      name: item.name.trim(),
      type: item.type || "ANNUAL",
      description: item.description?.trim() || null,
      libraryId: null,
      createdAt: new Date().toISOString(),
      createdBy: actor.fullName,
    };

    mapByDate.set(normalized, record);
    importedCount++;
  }

  const combined = Array.from(mapByDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  await saveHolidays(combined, db);

  await recordAuditLog(
    {
      actorType: actor.actorType ?? "STAFF",
      actorId: actor.id,
      actorName: actor.fullName,
      action: "SETTINGS_UPDATE",
      entity: "system_settings",
      entityId: SETTING_KEY_HOLIDAYS,
      details: `Imported annual holiday calendar: ${importedCount} items (${mode} mode). Total active holidays: ${combined.length}.`,
      ipAddress: actor.ipAddress,
    },
    db,
  );

  return { importedCount, totalCount: combined.length };
}

/**
 * Parses a CSV string containing holiday calendar data.
 * Supported headers:
 * Date,Name,Type,Description
 * or Holiday Date,Holiday Name,Description
 */
export function parseHolidayCalendarCsv(csvText: string): {
  valid: Array<{ date: string; name: string; type: "ANNUAL" | "AD_HOC"; description?: string }>;
  errors: Array<{ row: number; error: string }>;
} {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { valid: [], errors: [{ row: 1, error: "CSV file is empty" }] };
  }

  // Parse header
  const headerLine = lines[0];
  const headers = parseCsvLine(headerLine).map((h) =>
    h
      .toLowerCase()
      .trim()
      .replace(/[\s_-]+/g, ""),
  );

  let dateIdx = headers.findIndex((h) => h.includes("date"));
  let nameIdx = headers.findIndex(
    (h) =>
      h.includes("name") || h.includes("title") || h.includes("holiday") || h.includes("reason"),
  );
  let typeIdx = headers.findIndex((h) => h.includes("type") || h.includes("category"));
  let descIdx = headers.findIndex(
    (h) => h.includes("desc") || h.includes("remarks") || h.includes("note"),
  );

  // Default index fallbacks if headers couldn't be matched
  if (dateIdx === -1) dateIdx = 0;
  if (nameIdx === -1) nameIdx = 1;
  if (typeIdx === -1) typeIdx = 2;
  if (descIdx === -1) descIdx = 3;

  const valid: Array<{
    date: string;
    name: string;
    type: "ANNUAL" | "AD_HOC";
    description?: string;
  }> = [];
  const errors: Array<{ row: number; error: string }> = [];

  for (let i = 1; i < lines.length; i++) {
    const rowNum = i + 1;
    const cols = parseCsvLine(lines[i]);
    if (cols.length === 0 || cols.every((c) => !c.trim())) continue;

    const rawDate = cols[dateIdx] ?? "";
    const rawName = cols[nameIdx] ?? "";
    const rawType = cols[typeIdx] ?? "ANNUAL";
    const rawDesc = cols[descIdx] ?? "";

    const date = normalizeDateString(rawDate);
    if (!date) {
      errors.push({
        row: rowNum,
        error: `Invalid date "${rawDate}". Use YYYY-MM-DD or DD-MM-YYYY format.`,
      });
      continue;
    }

    const name = rawName.trim();
    if (!name) {
      errors.push({ row: rowNum, error: "Holiday name is required." });
      continue;
    }

    const typeUpper = rawType.toUpperCase().trim();
    const type: "ANNUAL" | "AD_HOC" = typeUpper.includes("AD") ? "AD_HOC" : "ANNUAL";

    valid.push({
      date,
      name,
      type,
      description: rawDesc.trim() || undefined,
    });
  }

  return { valid, errors };
}

/**
 * Standard RFC-4180 compliant CSV line tokenizer for handling quoted fields.
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (insideQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === "," && !insideQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

/**
 * Generates a downloadable annual holiday calendar CSV template with standard holidays.
 */
export function generateSampleCalendarCsv(): string {
  const currentYear = new Date().getFullYear();
  return `Date,Holiday Name,Type,Description
${currentYear}-01-26,Republic Day,ANNUAL,National Holiday
${currentYear}-03-14,Holi,ANNUAL,Festival Holiday
${currentYear}-03-31,Eid-ul-Fitr,ANNUAL,Religious Holiday
${currentYear}-04-14,Dr. B.R. Ambedkar Jayanti,ANNUAL,Gazetted Holiday
${currentYear}-08-15,Independence Day,ANNUAL,National Holiday
${currentYear}-10-02,Mahatma Gandhi Jayanti,ANNUAL,National Holiday
${currentYear}-10-20,Dussehra (Maha Navami / Vijayadashami),ANNUAL,Festival Holiday
${currentYear}-11-08,Diwali (Deepavali),ANNUAL,Festival Holiday
${currentYear}-11-09,Govardhan Puja,ANNUAL,Festival Holiday
${currentYear}-11-10,Bhai Dooj,ANNUAL,Festival Holiday
${currentYear}-12-25,Christmas Day,ANNUAL,Gazetted Holiday
`;
}
