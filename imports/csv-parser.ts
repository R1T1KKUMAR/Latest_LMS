import { parse } from "csv-parse/sync";
import iconv from "iconv-lite";

/**
 * Normalizes CSV header string: case-insensitive, punctuation/whitespace to underscores.
 * E.g., "Roll Number" -> "roll_number", "E-mail ID" -> "email_id", "Pub. Year" -> "pub_year"
 */
export function normalizeHeader(header: string): string {
  if (!header) return "";
  return header
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * Decodes raw binary CSV buffer supporting UTF-8 (with/without BOM) and Windows-1252.
 */
export function decodeCsvBuffer(
  buffer: Buffer | Uint8Array,
  encodingHint?: "utf-8" | "windows-1252" | "auto" | string,
): string {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

  // 1. Check for UTF-8 Byte Order Mark (0xEF, 0xBB, 0xBF)
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.subarray(3).toString("utf8");
  }

  // 2. Explicit Windows-1252 hint
  if (encodingHint === "windows-1252" || encodingHint === "win1252" || encodingHint === "cp1252") {
    return iconv.decode(buf, "windows-1252");
  }

  // 3. Explicit UTF-8 hint
  if (encodingHint === "utf-8" || encodingHint === "utf8") {
    return buf.toString("utf8");
  }

  // 4. Auto-detection: attempt strict UTF-8 decoding
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    return decoder.decode(buf);
  } catch {
    // Fallback to Windows-1252 if UTF-8 byte sequences are invalid
    return iconv.decode(buf, "windows-1252");
  }
}

export interface ParsedCsvRow {
  rowNumber: number;
  raw: Record<string, string>;
}

/**
 * Parses decoded CSV text into an array of row objects with normalized header keys.
 * Recovers gracefully from malformed inputs with unclosed quotes or irregular column counts.
 */
export function parseCsvText(content: string): ParsedCsvRow[] {
  // Strip UTF-8 BOM if present as a leading character
  const cleanContent = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;

  if (!cleanContent.trim()) {
    return [];
  }

  try {
    const rawRecords: Array<Record<string, string>> = parse(cleanContent, {
      columns: (headers: string[]) => headers.map(normalizeHeader),
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      relax_quotes: true,
      skip_records_with_error: false,
    });

    return rawRecords.map((raw, index) => ({
      rowNumber: index + 2, // Header is row 1, data starts at row 2
      raw,
    }));
  } catch (_parseError) {
    // Graceful line-by-line recovery for malformed CSVs (e.g. unclosed quotes)
    const lines = cleanContent.split(/\r?\n/);
    if (lines.length === 0) return [];

    let headerIndex = 0;
    while (headerIndex < lines.length && !lines[headerIndex].trim()) {
      headerIndex++;
    }
    if (headerIndex >= lines.length) return [];
    const headerLine = lines[headerIndex];

    let headers: string[] = [];
    try {
      const parsedHeader = parse(headerLine, { relax_quotes: true })[0] as string[];
      headers = parsedHeader.map(normalizeHeader);
    } catch {
      headers = headerLine.split(",").map(normalizeHeader);
    }

    const rows: ParsedCsvRow[] = [];
    for (let i = headerIndex + 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const record: Record<string, string> = {};
      try {
        const parsedLine = parse(line, {
          relax_quotes: true,
          relax_column_count: true,
        })[0] as string[];
        for (let h = 0; h < headers.length; h++) {
          record[headers[h]] = (parsedLine[h] ?? "").trim();
        }
      } catch {
        // Line with unclosed quote or syntax error: strip trailing unclosed quote or split by comma
        const sanitizedLine = line.replace(/(^|,)"+([^",]*)$/, "$1$2");
        try {
          const parsedLine = parse(sanitizedLine, {
            relax_quotes: true,
            relax_column_count: true,
          })[0] as string[];
          for (let h = 0; h < headers.length; h++) {
            record[headers[h]] = (parsedLine[h] ?? "").trim();
          }
        } catch {
          const parts = line.split(",").map((s) => s.replace(/^"|"$/g, "").trim());
          for (let h = 0; h < headers.length; h++) {
            record[headers[h]] = (parts[h] ?? "").trim();
          }
        }
      }

      rows.push({
        rowNumber: i + 1,
        raw: record,
      });
    }

    return rows;
  }
}

/**
 * Resolves a field from a raw row using a canonical key and its aliases.
 */
export function getFieldValue(
  raw: Record<string, string>,
  canonicalKey: string,
  aliases: string[] = [],
): string | undefined {
  const keysToTest = [canonicalKey, ...aliases].map(normalizeHeader);

  // 1. Direct normalized key match
  for (const k of keysToTest) {
    if (k in raw && raw[k] !== undefined) {
      const val = raw[k].trim();
      if (val.length > 0) return val;
    }
  }

  // 2. Fuzzy alphanumeric match (ignores underscores, dots, hyphens, spaces, and casing)
  // E.g., "b_tech" matches "btech", "B.Tech", "BTECH", "B-Tech", "roll_no" matches "rollno"
  const rawEntries = Object.entries(raw);
  for (const k of keysToTest) {
    const cleanK = k.replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (!cleanK) continue;

    for (const [rawKey, rawVal] of rawEntries) {
      const cleanRawKey = rawKey.replace(/[^a-z0-9]/gi, "").toLowerCase();
      if (cleanK === cleanRawKey && rawVal !== undefined) {
        const val = rawVal.trim();
        if (val.length > 0) return val;
      }
    }
  }

  return undefined;
}

/**
 * Parses date string in dd-mm-yyyy, dd/mm/yyyy, or yyyy-mm-dd format into YYYY-MM-DD.
 */
export function parseCsvDate(val: string | null | undefined): string | null {
  if (!val) return null;
  const s = val.trim();
  if (!s) return null;

  // Pattern 1: YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    if (isValidDate(year, month, day)) {
      return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
    }
  }

  // Pattern 2: DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10);
    const year = parseInt(dmyMatch[3], 10);
    if (isValidDate(year, month, day)) {
      return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
    }
  }

  // Fallback: JS Date parser
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split("T")[0];
  }

  return null;
}

function isValidDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

/**
 * Splits a full name string into first, middle, and last name components.
 */
export function splitFullName(name: string): {
  firstName: string;
  middleName?: string;
  lastName?: string;
} {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { firstName: "" };
  }
  if (parts.length === 1) {
    return { firstName: parts[0] };
  }
  if (parts.length === 2) {
    return { firstName: parts[0], lastName: parts[1] };
  }

  return {
    firstName: parts[0],
    middleName: parts.slice(1, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}

/**
 * Cleans phone number by stripping country codes like +91 and punctuation.
 * Returns cleaned number string and valid 10-digit flag.
 */
export function cleanPhoneNumber(phone: string | null | undefined): {
  number: string | null;
  isValid10Digit: boolean;
} {
  if (!phone) return { number: null, isValid10Digit: false };
  // Strip trailing float zeroes (.0, .00) common in Excel/pandas numeric exports
  const str = phone.trim().replace(/\.0+$/, "");
  let cleaned = str.replace(/[^\d+]/g, "").trim();

  // Strip +91 or 91 prefix if total length is 12 or 13
  if (cleaned.startsWith("+91")) {
    cleaned = cleaned.slice(3);
  } else if (cleaned.startsWith("91") && cleaned.length === 12) {
    cleaned = cleaned.slice(2);
  } else if (cleaned.startsWith("0") && cleaned.length === 11) {
    cleaned = cleaned.slice(1);
  }

  cleaned = cleaned.replace(/\D/g, "");

  if (!cleaned) return { number: null, isValid10Digit: false };
  return {
    number: cleaned,
    isValid10Digit: cleaned.length === 10,
  };
}
