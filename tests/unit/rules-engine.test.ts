import { describe, expect, it } from "vitest";
import {
  calculateDueDate,
  calculateRenewalDueDate,
  calculateRuleScore,
  checkReferenceIssuable,
  checkRenewalEligibility,
  checkZeroLimits,
  selectRule,
} from "@/rules/engine";
import type { CirculationRule, RuleTarget } from "@/rules/types";

describe("Business Rules Engine: BR-01 to BR-05 (rules/engine.ts)", () => {
  // Test Fixtures based on SRS Section 5.1 & Section 10.4
  const CATEGORY_BTECH = 1;
  const CATEGORY_FACULTY = 2;
  const CATEGORY_GUEST = 3;

  const ITEM_TEXTBOOK = 1;
  const ITEM_REFERENCE = 2;
  const ITEM_GENERAL = 3;

  const LIBRARY_CENTRAL = 1;

  // Sample Circulation Rules matching SRS Section 5.1 Worked Examples
  const ruleBtechTextbook: CirculationRule = {
    id: 1,
    categoryId: CATEGORY_BTECH,
    itemTypeId: ITEM_TEXTBOOK,
    maxBooks: 4,
    loanDays: 14,
    maxRenewals: 2,
    finePerDay: 2.0,
    graceDays: 0,
    maxFine: 200.0,
    holdsAllowed: true,
  };

  const ruleRefDefault: CirculationRule = {
    id: 2,
    itemTypeId: ITEM_REFERENCE,
    maxBooks: 0,
    loanDays: 0,
    maxRenewals: 0,
    finePerDay: 5.0,
    graceDays: 0,
    maxFine: 500.0,
    holdsAllowed: false,
  };

  const ruleFacultyRef: CirculationRule = {
    id: 3,
    categoryId: CATEGORY_FACULTY,
    itemTypeId: ITEM_REFERENCE,
    maxBooks: 2,
    loanDays: 3,
    maxRenewals: 1,
    finePerDay: 5.0,
    graceDays: 0,
    maxFine: 300.0,
    holdsAllowed: true,
  };

  const ruleFacultyDefault: CirculationRule = {
    id: 4,
    categoryId: CATEGORY_FACULTY,
    maxBooks: 6,
    loanDays: 30,
    maxRenewals: 3,
    finePerDay: 1.0,
    graceDays: 2,
    maxFine: 300.0,
    holdsAllowed: true,
  };

  const ruleGuestDefault: CirculationRule = {
    id: 5,
    categoryId: CATEGORY_GUEST,
    maxBooks: 1,
    loanDays: 7,
    maxRenewals: 0,
    finePerDay: 5.0,
    graceDays: 0,
    maxFine: 100.0,
    holdsAllowed: false,
  };

  const allRules: CirculationRule[] = [
    ruleBtechTextbook,
    ruleRefDefault,
    ruleFacultyRef,
    ruleFacultyDefault,
    ruleGuestDefault,
  ];

  describe("1. Scoring Algorithm & Worked Examples (BR-02, SRS §5.1)", () => {
    it("computes scores accurately: Library(4) + ItemType(2) + Category(1)", () => {
      const target: RuleTarget = {
        libraryId: LIBRARY_CENTRAL,
        categoryId: CATEGORY_FACULTY,
        itemTypeId: ITEM_REFERENCE,
      };

      // ruleFacultyRef has categoryId=2 (1 pt) and itemTypeId=2 (2 pts) -> Score 3
      expect(calculateRuleScore(ruleFacultyRef, target)).toBe(3);

      // ruleFacultyDefault has categoryId=2 (1 pt) -> Score 1
      expect(calculateRuleScore(ruleFacultyDefault, target)).toBe(1);

      // ruleRefDefault has itemTypeId=2 (2 pts) -> Score 2
      expect(calculateRuleScore(ruleRefDefault, target)).toBe(2);

      // Full match with library
      const fullMatchRule: CirculationRule = {
        libraryId: LIBRARY_CENTRAL,
        categoryId: CATEGORY_FACULTY,
        itemTypeId: ITEM_REFERENCE,
        maxBooks: 5,
        loanDays: 14,
        maxRenewals: 1,
        finePerDay: 2.0,
        graceDays: 0,
        holdsAllowed: true,
      };
      expect(calculateRuleScore(fullMatchRule, target)).toBe(7);
    });

    it("Worked Example 1: B.Tech student + Textbook -> Rule #1 (score 3 or category match)", () => {
      const target: RuleTarget = {
        libraryId: LIBRARY_CENTRAL,
        categoryId: CATEGORY_BTECH,
        itemTypeId: ITEM_TEXTBOOK,
      };

      const result = selectRule(allRules, target);
      expect(result.rule.id).toBe(1);
      expect(result.rule.maxBooks).toBe(4);
      expect(result.rule.loanDays).toBe(14);
      expect(result.rule.maxRenewals).toBe(2);
      expect(Number(result.rule.finePerDay)).toBe(2.0);
      expect(Number(result.rule.maxFine)).toBe(200.0);
      expect(result.isFallback).toBe(false);
    });

    it("Worked Example 2: B.Tech student + Reference book -> Reference item not issued (BR-04)", () => {
      const target: RuleTarget = {
        libraryId: LIBRARY_CENTRAL,
        categoryId: CATEGORY_BTECH,
        itemTypeId: ITEM_REFERENCE,
      };

      const result = selectRule(allRules, target);
      // ruleRefDefault wins with score 2
      expect(result.rule.id).toBe(2);

      // Check BR-03 zero limits: maxBooks = 0, loanDays = 0
      const zeroCheck = checkZeroLimits(result.rule);
      expect(zeroCheck.isZeroLimit).toBe(true);

      // Check BR-04 reference restriction: rule does not authorize B.Tech
      const refCheck = checkReferenceIssuable(result.rule, target, true);
      // Although rule #2 has itemTypeId = 2, its limits are 0
      expect(refCheck.isIssuable).toBe(true); // explicitly names item type 2
    });

    it("Worked Example 3: Faculty + Reference book -> Rule #3 wins with score 3 (T-07)", () => {
      const target: RuleTarget = {
        libraryId: LIBRARY_CENTRAL,
        categoryId: CATEGORY_FACULTY,
        itemTypeId: ITEM_REFERENCE,
      };

      const result = selectRule(allRules, target);
      expect(result.rule.id).toBe(3); // Faculty + Reference wins
      expect(result.score).toBe(3);
      expect(result.rule.maxBooks).toBe(2);
      expect(result.rule.loanDays).toBe(3);
      expect(Number(result.rule.finePerDay)).toBe(5.0);

      // Verify reference check passes because rule #3 explicitly names item type 2
      const refCheck = checkReferenceIssuable(result.rule, target, true);
      expect(refCheck.isIssuable).toBe(true);
    });

    it("Worked Example 4: Guest + General book -> Rule #5 wins (1 book, 7 days, 0 renewals, no holds)", () => {
      const target: RuleTarget = {
        libraryId: LIBRARY_CENTRAL,
        categoryId: CATEGORY_GUEST,
        itemTypeId: ITEM_GENERAL,
      };

      const result = selectRule(allRules, target);
      expect(result.rule.id).toBe(5);
      expect(result.rule.maxBooks).toBe(1);
      expect(result.rule.loanDays).toBe(7);
      expect(result.rule.maxRenewals).toBe(0);
      expect(result.rule.holdsAllowed).toBe(false);
    });

    it("Worked Example 5: Unmatched category & item type -> Fallback to system defaults", () => {
      const target: RuleTarget = {
        libraryId: 999,
        categoryId: 999, // Unmatched
        itemTypeId: 999, // Unmatched
      };

      const result = selectRule([], target);
      expect(result.isFallback).toBe(true);
      expect(result.score).toBe(0);
      expect(result.rule.loanDays).toBe(14);
      expect(result.rule.maxBooks).toBe(3);
      expect(result.rule.maxRenewals).toBe(1);
      expect(result.rule.finePerDay).toBe(2.0);
      expect(result.rule.graceDays).toBe(0);
      expect(result.rule.maxFine).toBeNull();
      expect(result.rule.holdsAllowed).toBe(true);
    });

    it("breaks ties by picking the highest rule ID (most recent/specific)", () => {
      const ruleA: CirculationRule = {
        id: 10,
        categoryId: 5,
        maxBooks: 2,
        loanDays: 14,
        maxRenewals: 1,
        finePerDay: 2.0,
        graceDays: 0,
        holdsAllowed: true,
      };
      const ruleB: CirculationRule = {
        id: 20,
        categoryId: 5,
        maxBooks: 3,
        loanDays: 21,
        maxRenewals: 2,
        finePerDay: 2.0,
        graceDays: 0,
        holdsAllowed: true,
      };

      const target: RuleTarget = { categoryId: 5, itemTypeId: 1 };
      const result = selectRule([ruleA, ruleB], target);
      expect(result.rule.id).toBe(20);
    });
  });

  describe("2. Zero-Limit Enforcement (BR-03)", () => {
    it("refuses issuance when maxBooks is 0", () => {
      const rule: CirculationRule = {
        id: 42,
        maxBooks: 0,
        loanDays: 14,
        maxRenewals: 1,
        finePerDay: 2.0,
        graceDays: 0,
        holdsAllowed: false,
      };

      const check = checkZeroLimits(rule);
      expect(check.isZeroLimit).toBe(true);
      expect(check.reason).toContain("rule #42");
    });

    it("refuses issuance when loanDays is 0", () => {
      const rule: CirculationRule = {
        id: 43,
        maxBooks: 5,
        loanDays: 0,
        maxRenewals: 0,
        finePerDay: 2.0,
        graceDays: 0,
        holdsAllowed: false,
      };

      const check = checkZeroLimits(rule);
      expect(check.isZeroLimit).toBe(true);
      expect(check.reason).toContain("rule #43");
    });

    it("permits issuance when both limits are positive", () => {
      const rule: CirculationRule = {
        maxBooks: 2,
        loanDays: 7,
        maxRenewals: 1,
        finePerDay: 2.0,
        graceDays: 0,
        holdsAllowed: true,
      };

      const check = checkZeroLimits(rule);
      expect(check.isZeroLimit).toBe(false);
    });
  });

  describe("3. Reference Item Restriction (BR-04, T-06)", () => {
    it("allows non-reference items regardless of rule binding", () => {
      const rule: CirculationRule = {
        maxBooks: 4,
        loanDays: 14,
        maxRenewals: 1,
        finePerDay: 2.0,
        graceDays: 0,
        holdsAllowed: true,
      };
      const check = checkReferenceIssuable(rule, { categoryId: 1, itemTypeId: 1 }, false);
      expect(check.isIssuable).toBe(true);
    });

    it("refuses reference items if rule does not explicitly name the item type (T-06)", () => {
      // General student rule matching category only
      const studentRule: CirculationRule = {
        id: 16,
        categoryId: CATEGORY_BTECH,
        itemTypeId: null, // Wildcard / not explicit
        maxBooks: 4,
        loanDays: 14,
        maxRenewals: 1,
        finePerDay: 2.0,
        graceDays: 0,
        holdsAllowed: true,
      };

      const check = checkReferenceIssuable(
        studentRule,
        { categoryId: CATEGORY_BTECH, itemTypeId: ITEM_REFERENCE },
        true, // isReference
      );

      expect(check.isIssuable).toBe(false);
      expect(check.reason).toBe("Reference items are not issued to this category");
    });

    it("allows reference item if winning rule explicitly names the item type (T-07)", () => {
      const explicitRule: CirculationRule = {
        id: 3,
        categoryId: CATEGORY_FACULTY,
        itemTypeId: ITEM_REFERENCE, // Explicitly named!
        maxBooks: 2,
        loanDays: 3,
        maxRenewals: 1,
        finePerDay: 5.0,
        graceDays: 0,
        holdsAllowed: true,
      };

      const check = checkReferenceIssuable(
        explicitRule,
        { categoryId: CATEGORY_FACULTY, itemTypeId: ITEM_REFERENCE },
        true,
      );

      expect(check.isIssuable).toBe(true);
    });
  });

  describe("4. Due Date & Renewal Limits (BR-05, T-05, T-12)", () => {
    it("calculates initial issue due date: issueDate + loanDays (T-05)", () => {
      const issueDate = new Date("2026-10-01");
      const dueDate = calculateDueDate(issueDate, 14);

      expect(dueDate.getFullYear()).toBe(2026);
      expect(dueDate.getMonth()).toBe(9); // October (0-indexed)
      expect(dueDate.getDate()).toBe(15); // 1 + 14 = 15
    });

    it("calculates renewal due date: today + loanDays", () => {
      const today = new Date("2026-10-15");
      const newDue = calculateRenewalDueDate(today, 14);

      expect(newDue.getDate()).toBe(29);
    });

    it("refuses renewal when overdue (BR-05, BR-08)", () => {
      const result = checkRenewalEligibility(
        {
          currentRenewalCount: 0,
          isOverdue: true,
          hasWaitingHold: false,
          patronOutstandingFines: 0,
        },
        ruleBtechTextbook,
      );

      expect(result.eligible).toBe(false);
      expect(result.reason).toBe("Loan is overdue");
    });

    it("refuses renewal when consecutive limit reached (BR-05, T-12)", () => {
      const result = checkRenewalEligibility(
        {
          currentRenewalCount: 2, // maxRenewals = 2
          isOverdue: false,
          hasWaitingHold: false,
          patronOutstandingFines: 0,
        },
        ruleBtechTextbook,
      );

      expect(result.eligible).toBe(false);
      expect(result.reason).toBe("Maximum renewals (2) already used");
    });

    it("refuses renewal when patron fines >= limit (BR-08)", () => {
      const result = checkRenewalEligibility(
        {
          currentRenewalCount: 0,
          isOverdue: false,
          hasWaitingHold: false,
          patronOutstandingFines: 120.0, // >= 100.00
        },
        ruleBtechTextbook,
      );

      expect(result.eligible).toBe(false);
      expect(result.reason).toContain("Outstanding fines (₹120.00) at or above limit");
    });

    it("refuses renewal when title has a waiting hold (BR-08)", () => {
      const result = checkRenewalEligibility(
        {
          currentRenewalCount: 0,
          isOverdue: false,
          hasWaitingHold: true,
          patronOutstandingFines: 0,
        },
        ruleBtechTextbook,
      );

      expect(result.eligible).toBe(false);
      expect(result.reason).toBe("Title is reserved by another patron");
    });

    it("permits renewal when all conditions are satisfied", () => {
      const result = checkRenewalEligibility(
        {
          currentRenewalCount: 1, // 1 < 2
          isOverdue: false,
          hasWaitingHold: false,
          patronOutstandingFines: 25.0, // < 100
        },
        ruleBtechTextbook,
      );

      expect(result.eligible).toBe(true);
    });
  });
});
