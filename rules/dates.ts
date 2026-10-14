/**
 * Pure date calculations for circulation and fine logic.
 * Avoids timezone variance by calculating on UTC midnight boundaries.
 */

export function parseDate(d: string | Date): Date {
  if (d instanceof Date) return d;
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, day));
  }
  return new Date(d);
}

/**
 * Returns signed difference in calendar days (d2 - d1).
 * If d2 is after d1, result is positive.
 */
export function calendarDaysBetween(d1: string | Date, d2: string | Date): number {
  const date1 = parseDate(d1);
  const date2 = parseDate(d2);

  const utc1 = Date.UTC(date1.getUTCFullYear(), date1.getUTCMonth(), date1.getUTCDate());
  const utc2 = Date.UTC(date2.getUTCFullYear(), date2.getUTCMonth(), date2.getUTCDate());

  return Math.floor((utc2 - utc1) / (1000 * 60 * 60 * 24));
}

/**
 * Adds an integer number of calendar days to a base date.
 */
export function addCalendarDays(d: string | Date, days: number): Date {
  const base = parseDate(d);
  const result = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + days),
  );
  return result;
}

/**
 * Formats a date object to ISO YYYY-MM-DD.
 */
export function formatDateIso(d: string | Date): string {
  const date = parseDate(d);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Returns true if target date is strictly in the past compared to reference date (calendar day).
 */
export function isBeforeDay(target: string | Date, reference: string | Date = new Date()): boolean {
  return calendarDaysBetween(reference, target) < 0;
}

/**
 * Returns an array of ISO 'YYYY-MM-DD' strings for each day in the half-open interval (d1, d2].
 * If d2 <= d1, returns empty array.
 */
export function getCalendarDaysSequence(d1: string | Date, d2: string | Date): string[] {
  const daysDiff = calendarDaysBetween(d1, d2);
  if (daysDiff <= 0) return [];

  const result: string[] = [];
  const base = parseDate(d1);
  for (let i = 1; i <= daysDiff; i++) {
    const nextDay = new Date(
      Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + i),
    );
    result.push(formatDateIso(nextDay));
  }
  return result;
}
