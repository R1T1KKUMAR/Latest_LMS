/**
 * Pure date calculations for circulation and fine logic.
 * Avoids timezone variance by calculating on UTC midnight boundaries.
 */

export function parseDate(d: string | Date): Date {
  if (d instanceof Date) return d;
  return new Date(d);
}

/**
 * Returns signed difference in calendar days (d2 - d1).
 * If d2 is after d1, result is positive.
 */
export function calendarDaysBetween(d1: string | Date, d2: string | Date): number {
  const date1 = parseDate(d1);
  const date2 = parseDate(d2);

  const utc1 = Date.UTC(date1.getFullYear(), date1.getMonth(), date1.getDate());
  const utc2 = Date.UTC(date2.getFullYear(), date2.getMonth(), date2.getDate());

  return Math.floor((utc2 - utc1) / (1000 * 60 * 60 * 24));
}

/**
 * Adds an integer number of calendar days to a base date.
 */
export function addCalendarDays(d: string | Date, days: number): Date {
  const base = parseDate(d);
  const result = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
  return result;
}

/**
 * Formats a date object to ISO YYYY-MM-DD.
 */
export function formatDateIso(d: string | Date): string {
  const date = parseDate(d);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Returns true if target date is strictly in the past compared to reference date (calendar day).
 */
export function isBeforeDay(target: string | Date, reference: string | Date = new Date()): boolean {
  return calendarDaysBetween(reference, target) < 0;
}
