/**
 * Text field truncation utilities per DR-05 and csv-import-spec.md Section 1.
 * Database maximum lengths enforced via silent truncation rather than row failures.
 */

export const DB_TEXT_LIMITS = {
  TITLE: 500,
  SUBTITLE: 500,
  AUTHORS: 500,
  EDITORS: 500,
  EDITION: 50,
  PUBLISHER: 200,
  PLACE: 100,
  PAGES: 50,
  LANGUAGE: 50,
  SUBJECT: 500,
  KEYWORDS: 500,
  DDC: 50,
  CALL_NUMBER: 100,
  SUMMARY: 4000,
  LOCATION: 100,
  INVOICE_NO: 100,
  NAME: 60,
  ROLL_NO: 50,
  EMPLOYEE_ID: 50,
  CARD_NO: 50,
  SECTION: 10,
  FATHER_NAME: 100,
  MOBILE: 20,
  EMAIL: 100,
  ADDRESS: 500,
  CONDITION_NOTE: 500,
} as const;

/**
 * Truncates text if it exceeds maxLength. Returns null for empty/nullish values.
 */
export function truncate(val: string | null | undefined, maxLen: number): string | null {
  if (val == null) return null;
  const trimmed = String(val).trim();
  if (!trimmed) return null;
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

/**
 * Truncates text with fallback to a default value if empty.
 */
export function truncateWithDefault(
  val: string | null | undefined,
  maxLen: number,
  fallback: string,
): string {
  const res = truncate(val, maxLen);
  return res != null && res.length > 0 ? res : fallback;
}
