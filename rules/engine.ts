/**
 * Core Circulation Rules Engine (BR-01 to BR-05).
 * Pure TypeScript functions with zero database dependencies.
 */

import { addCalendarDays } from "./dates";
import {
  type CirculationRule,
  DEFAULT_SYSTEM_SETTINGS,
  type EligibilityResult,
  type RenewalContext,
  type RuleResolutionResult,
  type RuleTarget,
  type SystemSettingsConfig,
} from "./types";

/**
 * Checks if a circulation rule matches the target or uses wildcards (NULL) (BR-01, BR-02).
 */
export function isRuleCandidate(rule: CirculationRule, target: RuleTarget): boolean {
  // Library match: must match target library or be wildcard null/undefined
  if (rule.libraryId !== null && rule.libraryId !== undefined && target.libraryId) {
    if (rule.libraryId !== target.libraryId) return false;
  } else if (rule.libraryId !== null && rule.libraryId !== undefined && !target.libraryId) {
    return false;
  }

  // Item type match: must match target item type or be wildcard null/undefined
  if (rule.itemTypeId !== null && rule.itemTypeId !== undefined) {
    if (rule.itemTypeId !== target.itemTypeId) return false;
  }

  // Category match: must match target category or be wildcard null/undefined
  if (rule.categoryId !== null && rule.categoryId !== undefined) {
    if (rule.categoryId !== target.categoryId) return false;
  }

  return true;
}

/**
 * Computes match score for a rule against a target tuple (BR-02).
 * Score = (Library Match * 4) + (Item Type Match * 2) + (Category Match * 1)
 */
export function calculateRuleScore(rule: CirculationRule, target: RuleTarget): number {
  let score = 0;

  if (target.libraryId && rule.libraryId === target.libraryId) {
    score += 4;
  }
  if (
    rule.itemTypeId !== null &&
    rule.itemTypeId !== undefined &&
    rule.itemTypeId === target.itemTypeId
  ) {
    score += 2;
  }
  if (
    rule.categoryId !== null &&
    rule.categoryId !== undefined &&
    rule.categoryId === target.categoryId
  ) {
    score += 1;
  }

  return score;
}

/**
 * Resolves the winning circulation rule from candidates using scoring algorithm (BR-02).
 * Falls back to system settings defaults if no candidate rule exists.
 */
export function selectRule(
  rules: CirculationRule[],
  target: RuleTarget,
  customSettings?: Partial<SystemSettingsConfig>,
): RuleResolutionResult {
  const settings = { ...DEFAULT_SYSTEM_SETTINGS, ...customSettings };

  // 1. Filter candidates
  // Per BR-04: If the item is marked as reference, it shall NEVER be issued unless the
  // selected winning rule explicitly names that item type (rule.item_type_id == target.item_type_id),
  // regardless of score or category match.
  const candidates = rules.filter((rule) => {
    if (!isRuleCandidate(rule, target)) return false;
    if (target.isReference && rule.itemTypeId !== target.itemTypeId) return false;
    return true;
  });

  if (candidates.length === 0) {
    if (target.isReference) {
      return {
        rule: {
          maxBooks: 0,
          loanDays: 0,
          maxRenewals: 0,
          finePerDay: settings.defaultFinePerDay,
          graceDays: settings.defaultGraceDays,
          maxFine: null,
          holdsAllowed: false,
        },
        score: 0,
        isFallback: true,
      };
    }

    // Fallback rule from system defaults
    const fallbackRule: CirculationRule = {
      maxBooks: settings.defaultMaxBooks,
      loanDays: settings.defaultLoanDays,
      maxRenewals: settings.defaultMaxRenewals,
      finePerDay: settings.defaultFinePerDay,
      graceDays: settings.defaultGraceDays,
      maxFine: null,
      holdsAllowed: true,
    };

    return {
      rule: fallbackRule,
      score: 0,
      isFallback: true,
    };
  }

  // 2. Score candidates
  const scored = candidates.map((rule) => ({
    rule,
    score: calculateRuleScore(rule, target),
  }));

  // 3. Sort by score descending; if tied, sort by id descending (most specific / recent)
  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return (b.rule.id ?? 0) - (a.rule.id ?? 0);
  });

  const winner = scored[0];

  return {
    rule: winner.rule,
    score: winner.score,
    isFallback: false,
  };
}

/**
 * Zero-Limit Enforcement (BR-03):
 * If max_books == 0 or loan_days == 0, the item type is not eligible for issuance.
 */
export function checkZeroLimits(rule: CirculationRule): { isZeroLimit: boolean; reason?: string } {
  if (rule.maxBooks === 0 || rule.loanDays === 0) {
    const idNotice = rule.id ? ` (rule #${rule.id})` : "";
    return {
      isZeroLimit: true,
      reason: `Item type is not issued to this category${idNotice}`,
    };
  }

  return { isZeroLimit: false };
}

/**
 * Reference Item Restriction (BR-04):
 * If the item is marked as reference, it shall NEVER be issued unless the selected winning rule
 * explicitly names that item type (rule.item_type_id == target.item_type_id).
 */
export function checkReferenceIssuable(
  rule: CirculationRule,
  target: RuleTarget,
  isReference: boolean,
): { isIssuable: boolean; reason?: string } {
  if (!isReference) {
    return { isIssuable: true };
  }

  // Winning rule must explicitly bind to the item type (rule.item_type_id == target.item_type_id)
  const explicitlyNamesItemType =
    rule.itemTypeId !== null &&
    rule.itemTypeId !== undefined &&
    rule.itemTypeId === target.itemTypeId;

  if (!explicitlyNamesItemType) {
    return {
      isIssuable: false,
      reason: "Reference items are not issued to this category",
    };
  }

  return { isIssuable: true };
}

/**
 * Computes due date for initial loan (BR-05):
 * due_date = issue_date + loan_days
 */
export function calculateDueDate(issueDate: string | Date, loanDays: number): Date {
  return addCalendarDays(issueDate, loanDays);
}

/**
 * Computes due date for renewal (BR-05):
 * new_due_date = today + loan_days
 */
export function calculateRenewalDueDate(baseDate: string | Date, loanDays: number): Date {
  return addCalendarDays(baseDate, loanDays);
}

/**
 * Evaluates renewal eligibility and blocks (BR-05, BR-08).
 */
export function checkRenewalEligibility(
  context: RenewalContext,
  rule: CirculationRule,
  customSettings?: Partial<SystemSettingsConfig>,
): EligibilityResult {
  const settings = { ...DEFAULT_SYSTEM_SETTINGS, ...customSettings };

  // 1. Overdue block
  if (context.isOverdue) {
    return {
      eligible: false,
      reason: "Loan is overdue",
    };
  }

  // 2. Renewal count cap (BR-05)
  if (context.currentRenewalCount >= rule.maxRenewals) {
    return {
      eligible: false,
      reason: `Maximum renewals (${rule.maxRenewals}) already used`,
    };
  }

  // 3. Outstanding fines block (BR-08)
  if (context.patronOutstandingFines >= settings.fineBlockLimit) {
    return {
      eligible: false,
      reason: `Outstanding fines (₹${context.patronOutstandingFines.toFixed(2)}) at or above limit (₹${settings.fineBlockLimit.toFixed(2)})`,
    };
  }

  // 4. Hold queue block (BR-08)
  if (context.hasWaitingHold) {
    return {
      eligible: false,
      reason: "Title is reserved by another patron",
    };
  }

  return {
    eligible: true,
    rule,
  };
}
