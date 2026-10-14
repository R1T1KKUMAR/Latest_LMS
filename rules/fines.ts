/**
 * Financial & Fine Calculation Rules (BR-06, BR-07).
 * Pure mathematical functions for overdue and lost book charges.
 */

import { calendarDaysBetween, formatDateIso, getCalendarDaysSequence } from "./dates";
import type {
  LostChargeCalculationParams,
  LostChargeCalculationResult,
  OverdueFineCalculationParams,
  OverdueFineCalculationResult,
} from "./types";

/**
 * Calculates overdue fines dynamically at return or loss (BR-06).
 * Fines are NEVER accrued daily in the database.
 * College holidays are exempted from overdue charges.
 *
 * days_late = max(0, return_date - due_date)
 * effective_late = max(0, days_late - holiday_exempt_days)
 * chargeable_days = max(0, effective_late - grace_days)
 * calculated_fine = chargeable_days * fine_per_day
 * final_overdue_fine = min(calculated_fine, max_fine) if max_fine > 0 else calculated_fine
 */
export function calculateOverdueFine(
  params: OverdueFineCalculationParams,
): OverdueFineCalculationResult {
  const daysDiff = calendarDaysBetween(params.dueDate, params.returnDate);
  const daysLate = Math.max(0, daysDiff);
  const graceDays = Math.max(0, params.graceDays ?? 0);
  const finePerDay = Math.max(0, Number(params.finePerDay || 0));

  let holidayExemptDays = 0;
  const exemptHolidayDates: string[] = [];

  if (params.holidays && daysLate > 0) {
    const holidaySet: Set<string> =
      params.holidays instanceof Set
        ? params.holidays
        : new Set(
            (Array.isArray(params.holidays) ? params.holidays : []).map((h) =>
              typeof h === "string" ? h.slice(0, 10) : formatDateIso(h),
            ),
          );

    const daysSeq = getCalendarDaysSequence(params.dueDate, params.returnDate);
    for (const dayIso of daysSeq) {
      if (holidaySet.has(dayIso)) {
        holidayExemptDays++;
        exemptHolidayDates.push(dayIso);
      }
    }
  }

  const effectiveDaysLate = Math.max(0, daysLate - holidayExemptDays);
  const chargeableDays = Math.max(0, effectiveDaysLate - graceDays);
  const calculatedFine = Number((chargeableDays * finePerDay).toFixed(2));

  let finalOverdueFine = calculatedFine;
  let isCapped = false;

  if (params.maxFine !== null && params.maxFine !== undefined) {
    const maxFineNum = Number(params.maxFine);
    if (!Number.isNaN(maxFineNum) && maxFineNum > 0 && calculatedFine > maxFineNum) {
      finalOverdueFine = Number(maxFineNum.toFixed(2));
      isCapped = true;
    }
  }

  return {
    daysLate,
    chargeableDays,
    calculatedFine,
    finalOverdueFine,
    isCapped,
    holidayExemptDays,
    exemptHolidayDates,
  };
}

/**
 * Calculates replacement and administrative charge for lost books (BR-07).
 *
 * base_replacement_price = item.price > 0 ? item.price : bib_record.price
 * overdue_fine_to_date = BR-06 fine up to today
 * lost_charge = base_replacement_price + LOST_PROCESSING_FEE + overdue_fine_to_date
 */
export function calculateLostCharge(
  params: LostChargeCalculationParams,
): LostChargeCalculationResult {
  const itemPrice = Number(params.itemPrice || 0);
  const bibPrice = Number(params.bibPrice || 0);

  // Fallback to title price if item copy price is missing or zero
  const baseReplacementPrice = itemPrice > 0 ? itemPrice : bibPrice > 0 ? bibPrice : 0;

  const processingFee = Math.max(0, Number(params.lostProcessingFee ?? 50.0));
  const overdueFineToDate = Math.max(0, Number(params.overdueFineToDate ?? 0.0));

  const totalLostCharge = Number(
    (baseReplacementPrice + processingFee + overdueFineToDate).toFixed(2),
  );

  return {
    baseReplacementPrice: Number(baseReplacementPrice.toFixed(2)),
    processingFee: Number(processingFee.toFixed(2)),
    overdueFineToDate: Number(overdueFineToDate.toFixed(2)),
    totalLostCharge,
  };
}
