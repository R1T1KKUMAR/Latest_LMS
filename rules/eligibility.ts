/**
 * Circulation Issue Eligibility & Blocking Rules (BR-08, BR-09, FR-CI-02).
 * Executes the exact 9 issue checks in sequence.
 */

import { isBeforeDay } from "./dates";
import { checkReferenceIssuable, checkZeroLimits, selectRule } from "./engine";
import {
  type CirculationRule,
  type CopyCirculationContext,
  DEFAULT_SYSTEM_SETTINGS,
  type EligibilityResult,
  type PatronCirculationContext,
  type RuleTarget,
  type SystemSettingsConfig,
} from "./types";

export interface IssueEligibilityParams {
  patron: PatronCirculationContext;
  copy: CopyCirculationContext;
  target: RuleTarget;
  rules: CirculationRule[];
  settings?: Partial<SystemSettingsConfig>;
  referenceDate?: string | Date;
}

/**
 * Executes the exact 9 issue validation checks in order (FR-CI-02, BR-02 to BR-09).
 */
export function evaluateIssueEligibility(params: IssueEligibilityParams): EligibilityResult {
  const settings = { ...DEFAULT_SYSTEM_SETTINGS, ...params.settings };
  const today = params.referenceDate ?? new Date();

  // 1. Patron Active Check
  if (params.patron.status !== "ACTIVE") {
    return {
      eligible: false,
      reason: `Patron account is not active (${params.patron.status})`,
      stepFailed: 1,
    };
  }

  // 2. Card Validity Check (today <= cardExpiry)
  if (isBeforeDay(params.patron.cardExpiry, today)) {
    return {
      eligible: false,
      reason: "Patron library card has expired",
      stepFailed: 2,
    };
  }

  // 3. Copy Available or Reserved Check
  if (params.copy.status === "RESERVED") {
    // If copy is reserved, it can ONLY be issued to the hold holder
    if (
      params.copy.reservedForPatronId &&
      params.patron.id &&
      params.copy.reservedForPatronId !== params.patron.id
    ) {
      return {
        eligible: false,
        reason: "Copy is reserved for another patron",
        stepFailed: 3,
      };
    }
  } else if (params.copy.status === "REFERENCE_ONLY") {
    // Reference items may only be issued if rule policy explicitly permits reference borrowing (checked in Step 6)
  } else if (params.copy.status !== "AVAILABLE") {
    return {
      eligible: false,
      reason: `Copy is not available for issue (status: ${params.copy.status})`,
      stepFailed: 3,
    };
  }

  // 4. Rule Resolution (BR-02)
  const { rule } = selectRule(params.rules, params.target, settings);

  // 5. Non-zero Limits Check (BR-03)
  const zeroCheck = checkZeroLimits(rule);
  if (zeroCheck.isZeroLimit) {
    return {
      eligible: false,
      reason: zeroCheck.reason,
      rule,
      stepFailed: 5,
    };
  }

  // 6. Reference Item Restriction (BR-04)
  const refCheck = checkReferenceIssuable(rule, params.target, params.copy.isReference);
  if (!refCheck.isIssuable) {
    return {
      eligible: false,
      reason: refCheck.reason,
      rule,
      stepFailed: 6,
    };
  }

  // 7. Max Books Quota Check (BR-08, BR-09)
  if (params.patron.activeLoansCount >= rule.maxBooks) {
    return {
      eligible: false,
      reason: `Maximum books reached (${params.patron.activeLoansCount} of ${rule.maxBooks})`,
      rule,
      stepFailed: 7,
    };
  }

  // 8. Overdue Block Check (BR-08)
  if (settings.blockIssueIfOverdue && params.patron.hasOverdueLoans) {
    return {
      eligible: false,
      reason: "Patron has overdue books. Return them before issuing new ones",
      rule,
      stepFailed: 8,
    };
  }

  // 9. Outstanding Fines Block Check (BR-08)
  if (params.patron.outstandingFinesTotal >= settings.fineBlockLimit) {
    return {
      eligible: false,
      reason: `Outstanding fines (₹${params.patron.outstandingFinesTotal.toFixed(2)}) at or above limit (₹${settings.fineBlockLimit.toFixed(2)})`,
      rule,
      stepFailed: 9,
    };
  }

  return {
    eligible: true,
    rule,
  };
}

/**
 * Validates global group-wide loan quota (BR-09).
 */
export function checkLoanQuota(
  activeLoansCount: number,
  maxBooks: number,
): { allowed: boolean; reason?: string } {
  if (activeLoansCount >= maxBooks) {
    return {
      allowed: false,
      reason: `Maximum books reached (${activeLoansCount} of ${maxBooks})`,
    };
  }
  return { allowed: true };
}
