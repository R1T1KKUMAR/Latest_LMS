/**
 * Numbering Utilities for Accession Numbers, Barcodes, and Library Cards.
 * Implements SRS Section 5.2 and Business Rules BR-02, FR-PA-02, FR-CA-02.
 */

/**
 * Formats an accession number from library prefix and counter.
 * e.g., formatAccessionNumber("CL", 1) -> "CL000001"
 */
export function formatAccessionNumber(prefix: string, counter: number): string {
  const cleanPrefix = prefix.trim().toUpperCase();
  const padded = String(counter).padStart(6, "0");
  return `${cleanPrefix}${padded}`;
}

/**
 * Formats a generated library card number from card prefix and sequence value.
 * e.g., formatCardNumber("LIB", 42) -> "LIB000042"
 */
export function formatCardNumber(prefix: string, sequenceVal: number): string {
  const cleanPrefix = (prefix || "LIB").trim().toUpperCase();
  const padded = String(sequenceVal).padStart(6, "0");
  return `${cleanPrefix}${padded}`;
}

/**
 * Normalizes an ISBN string by stripping hyphens and whitespace.
 * Ensures ISBN is either 10 or 13 valid characters or null if empty.
 */
export function normalizeIsbn(isbn?: string | null): string | null {
  if (!isbn) return null;
  const cleaned = isbn.replace(/[-\s]/g, "").trim().toUpperCase();
  if (cleaned.length === 10 || cleaned.length === 13) {
    return cleaned;
  }
  return cleaned || null;
}

/**
 * Calculates card expiry date per FR-PA-03:
 * Defaults to course end date; if absent, defaults to admission date (or today) + category validity years.
 */
export function calculateCardExpiry(params: {
  courseEndDate?: string | Date | null;
  admissionDate?: string | Date | null;
  cardValidityYears: number;
}): Date {
  if (params.courseEndDate) {
    const end = new Date(params.courseEndDate);
    if (!Number.isNaN(end.getTime())) {
      return end;
    }
  }

  const baseDate = params.admissionDate ? new Date(params.admissionDate) : new Date();
  const validBase = Number.isNaN(baseDate.getTime()) ? new Date() : baseDate;

  const expiry = new Date(validBase);
  expiry.setFullYear(expiry.getFullYear() + Math.max(1, params.cardValidityYears));
  return expiry;
}
