/**
 * Reservation (Hold) Eligibility & Lifecycle Rules (FR-HO-01 to FR-HO-04).
 * Pure functions governing reservation queues, auto-assignment, and pickup deadlines.
 */

import { addCalendarDays, isBeforeDay } from "./dates";
import {
  DEFAULT_SYSTEM_SETTINGS,
  type EligibilityResult,
  type HoldPlacementParams,
  type WaitingHoldItem,
} from "./types";

/**
 * Evaluates whether a patron can place a reservation hold on a title (FR-HO-01).
 * Pre-conditions:
 * 1. Patron status is ACTIVE.
 * 2. Patron card is not expired.
 * 3. No copy of the title is currently AVAILABLE on shelf (T-16).
 * 4. Patron does not already hold or borrow that title.
 * 5. Circulation rule allows holds (holdsAllowed == true).
 * 6. System setting opacAllowHolds is true (if OPAC).
 */
export function evaluateHoldPlacementEligibility(
  params: HoldPlacementParams,
  referenceDate: string | Date = new Date(),
): EligibilityResult {
  const settings = { ...DEFAULT_SYSTEM_SETTINGS, ...params.settings };

  // 1. Patron status check
  if (params.patron.status !== "ACTIVE") {
    return {
      eligible: false,
      reason: `Patron account is not active (${params.patron.status})`,
    };
  }

  // 2. Card expiry check
  if (isBeforeDay(params.patron.cardExpiry, referenceDate)) {
    return {
      eligible: false,
      reason: "Patron library card has expired",
    };
  }

  // 3. No copy available on shelf (T-16)
  if (params.title.availableCopiesCount > 0) {
    return {
      eligible: false,
      reason: "Copies are available on the shelf",
    };
  }

  // 4. Patron duplicate hold / loan check
  if (params.patronActiveLoansOnTitle > 0) {
    return {
      eligible: false,
      reason: "Patron already has an active loan for this title",
    };
  }

  if (params.patronActiveHoldsOnTitle > 0) {
    return {
      eligible: false,
      reason: "Patron already has an active hold for this title",
    };
  }

  // 5. Circulation rule hold allowance
  if (!params.rule.holdsAllowed) {
    return {
      eligible: false,
      reason: "Holds are not allowed for this category/item type",
    };
  }

  // 6. System settings OPAC hold permission
  if (!settings.opacAllowHolds) {
    return {
      eligible: false,
      reason: "Online holds are currently disabled",
    };
  }

  return {
    eligible: true,
    rule: params.rule,
  };
}

/**
 * Calculates pickup deadline when a held copy arrives at the desk (FR-HO-03).
 * expiry_date = available_date + HOLD_PICKUP_DAYS
 */
export function calculateHoldPickupExpiry(
  availableDate: string | Date,
  pickupDays: number = DEFAULT_SYSTEM_SETTINGS.holdPickupDays,
): Date {
  return addCalendarDays(availableDate, pickupDays);
}

/**
 * Checks if a hold pickup deadline has passed (FR-HO-04, FR-DB-03).
 */
export function isHoldExpired(
  expiryDate: string | Date,
  referenceDate: string | Date = new Date(),
): boolean {
  return isBeforeDay(expiryDate, referenceDate);
}

/**
 * Determines assignment of a returned book to waiting hold queue (FR-HO-03, FR-CI-03).
 * If a waiting hold exists, oldest request by date takes priority.
 * Otherwise, status restores to AVAILABLE (or REFERENCE_ONLY for reference items).
 */
export function resolveReturnedCopyHoldAssignment(params: {
  waitingHolds: WaitingHoldItem[];
  isReference: boolean;
}): {
  assignToHold: boolean;
  holdToFulfill?: WaitingHoldItem;
  nextCopyStatus: "RESERVED" | "AVAILABLE" | "REFERENCE_ONLY";
} {
  if (params.waitingHolds && params.waitingHolds.length > 0) {
    // Sort oldest request first (requestDate ASC)
    const sorted = [...params.waitingHolds].sort(
      (a, b) => new Date(a.requestDate).getTime() - new Date(b.requestDate).getTime(),
    );
    const oldest = sorted[0];

    return {
      assignToHold: true,
      holdToFulfill: oldest,
      nextCopyStatus: "RESERVED",
    };
  }

  return {
    assignToHold: false,
    nextCopyStatus: params.isReference ? "REFERENCE_ONLY" : "AVAILABLE",
  };
}
