import { describe, expect, it } from "vitest";
import { checkLoanQuota, evaluateIssueEligibility } from "@/rules/eligibility";
import type {
  CirculationRule,
  CopyCirculationContext,
  PatronCirculationContext,
  RuleTarget,
} from "@/rules/types";

describe("Business Rules Engine: Issue Eligibility & 9-Step Checks (BR-08, BR-09, FR-CI-02)", () => {
  const referenceDate = new Date("2026-10-10");

  const validPatron: PatronCirculationContext = {
    id: 101,
    status: "ACTIVE",
    cardExpiry: "2027-06-30",
    activeLoansCount: 1,
    hasOverdueLoans: false,
    outstandingFinesTotal: 0.0,
  };

  const validCopy: CopyCirculationContext = {
    id: 201,
    status: "AVAILABLE",
    isReference: false,
  };

  const standardTarget: RuleTarget = {
    libraryId: 1,
    categoryId: 1, // Student
    itemTypeId: 1, // Textbook
  };

  const standardRule: CirculationRule = {
    id: 1,
    categoryId: 1,
    itemTypeId: 1,
    maxBooks: 4,
    loanDays: 14,
    maxRenewals: 2,
    finePerDay: 2.0,
    graceDays: 0,
    maxFine: 200.0,
    holdsAllowed: true,
  };

  it("Passes all 9 checks for an eligible patron and copy (T-05)", () => {
    const result = evaluateIssueEligibility({
      patron: validPatron,
      copy: validCopy,
      target: standardTarget,
      rules: [standardRule],
      referenceDate,
    });

    expect(result.eligible).toBe(true);
    expect(result.rule?.id).toBe(1);
    expect(result.stepFailed).toBeUndefined();
  });

  it("Step 1: Refuses issue when patron status is not ACTIVE (BLOCKED, EXPIRED, GRADUATED, LEFT)", () => {
    const blockedPatron = { ...validPatron, status: "BLOCKED" };
    const res = evaluateIssueEligibility({
      patron: blockedPatron,
      copy: validCopy,
      target: standardTarget,
      rules: [standardRule],
      referenceDate,
    });

    expect(res.eligible).toBe(false);
    expect(res.stepFailed).toBe(1);
    expect(res.reason).toContain("Patron account is not active (BLOCKED)");
  });

  it("Step 2: Refuses issue when patron library card has expired", () => {
    const expiredCardPatron = { ...validPatron, cardExpiry: "2026-10-01" }; // Before 2026-10-10
    const res = evaluateIssueEligibility({
      patron: expiredCardPatron,
      copy: validCopy,
      target: standardTarget,
      rules: [standardRule],
      referenceDate,
    });

    expect(res.eligible).toBe(false);
    expect(res.stepFailed).toBe(2);
    expect(res.reason).toBe("Patron library card has expired");
  });

  it("Step 3: Refuses issue when copy is not AVAILABLE and not RESERVED for this patron", () => {
    // Copy in repair
    const repairCopy: CopyCirculationContext = { ...validCopy, status: "REPAIR" };
    const resRepair = evaluateIssueEligibility({
      patron: validPatron,
      copy: repairCopy,
      target: standardTarget,
      rules: [standardRule],
      referenceDate,
    });
    expect(resRepair.eligible).toBe(false);
    expect(resRepair.stepFailed).toBe(3);
    expect(resRepair.reason).toContain("status: REPAIR");

    // Copy RESERVED for a different patron (T-11)
    const heldForOther: CopyCirculationContext = {
      ...validCopy,
      status: "RESERVED",
      reservedForPatronId: 999, // Other patron
    };
    const resOther = evaluateIssueEligibility({
      patron: validPatron,
      copy: heldForOther,
      target: standardTarget,
      rules: [standardRule],
      referenceDate,
    });
    expect(resOther.eligible).toBe(false);
    expect(resOther.stepFailed).toBe(3);
    expect(resOther.reason).toBe("Copy is reserved for another patron");

    // Copy RESERVED for THIS patron succeeds step 3 (T-11)
    const heldForSelf: CopyCirculationContext = {
      ...validCopy,
      status: "RESERVED",
      reservedForPatronId: 101, // Matches validPatron.id
    };
    const resSelf = evaluateIssueEligibility({
      patron: validPatron,
      copy: heldForSelf,
      target: standardTarget,
      rules: [standardRule],
      referenceDate,
    });
    expect(resSelf.eligible).toBe(true);
  });

  it("Step 5: Refuses issue when rule has zero limits (BR-03)", () => {
    const zeroRule: CirculationRule = {
      id: 99,
      categoryId: 1,
      itemTypeId: 1,
      maxBooks: 0,
      loanDays: 0,
      maxRenewals: 0,
      finePerDay: 2.0,
      graceDays: 0,
      holdsAllowed: false,
    };

    const res = evaluateIssueEligibility({
      patron: validPatron,
      copy: validCopy,
      target: standardTarget,
      rules: [zeroRule],
      referenceDate,
    });

    expect(res.eligible).toBe(false);
    expect(res.stepFailed).toBe(5);
    expect(res.reason).toContain("Item type is not issued to this category");
  });

  it("Step 6: Refuses issue when reference item is not explicitly named in rule (BR-04, T-06)", () => {
    const generalRule: CirculationRule = {
      id: 50,
      categoryId: 1, // Student
      itemTypeId: null, // Wildcard
      maxBooks: 4,
      loanDays: 14,
      maxRenewals: 1,
      finePerDay: 2.0,
      graceDays: 0,
      holdsAllowed: true,
    };

    const refCopy: CopyCirculationContext = {
      ...validCopy,
      isReference: true,
    };

    const res = evaluateIssueEligibility({
      patron: validPatron,
      copy: refCopy,
      target: { libraryId: 1, categoryId: 1, itemTypeId: 2 }, // Reference item type
      rules: [generalRule],
      referenceDate,
    });

    expect(res.eligible).toBe(false);
    expect(res.stepFailed).toBe(6);
    expect(res.reason).toBe("Reference items are not issued to this category");
  });

  it("Step 7: Refuses issue when patron active loan quota is reached (BR-08, BR-09)", () => {
    const maxedPatron: PatronCirculationContext = {
      ...validPatron,
      activeLoansCount: 4, // maxBooks is 4
    };

    const res = evaluateIssueEligibility({
      patron: maxedPatron,
      copy: validCopy,
      target: standardTarget,
      rules: [standardRule],
      referenceDate,
    });

    expect(res.eligible).toBe(false);
    expect(res.stepFailed).toBe(7);
    expect(res.reason).toBe("Maximum books reached (4 of 4)");
  });

  it("Step 8: Refuses issue when patron has overdue books and BLOCK_ISSUE_IF_OVERDUE is true (BR-08, T-08)", () => {
    const overduePatron: PatronCirculationContext = {
      ...validPatron,
      hasOverdueLoans: true,
    };

    const res = evaluateIssueEligibility({
      patron: overduePatron,
      copy: validCopy,
      target: standardTarget,
      rules: [standardRule],
      settings: { blockIssueIfOverdue: true },
      referenceDate,
    });

    expect(res.eligible).toBe(false);
    expect(res.stepFailed).toBe(8);
    expect(res.reason).toBe("Patron has overdue books. Return them before issuing new ones");

    // When setting is disabled, overdue check passes
    const resAllowed = evaluateIssueEligibility({
      patron: overduePatron,
      copy: validCopy,
      target: standardTarget,
      rules: [standardRule],
      settings: { blockIssueIfOverdue: false },
      referenceDate,
    });

    expect(resAllowed.eligible).toBe(true);
  });

  it("Step 9: Refuses issue when patron fines reach FINE_BLOCK_LIMIT (BR-08)", () => {
    const fineBlockedPatron: PatronCirculationContext = {
      ...validPatron,
      outstandingFinesTotal: 100.0, // Default limit = 100.00
    };

    const res = evaluateIssueEligibility({
      patron: fineBlockedPatron,
      copy: validCopy,
      target: standardTarget,
      rules: [standardRule],
      settings: { fineBlockLimit: 100.0 },
      referenceDate,
    });

    expect(res.eligible).toBe(false);
    expect(res.stepFailed).toBe(9);
    expect(res.reason).toContain("Outstanding fines (₹100.00) at or above limit (₹100.00)");

    // Just below threshold succeeds
    const underLimitPatron: PatronCirculationContext = {
      ...validPatron,
      outstandingFinesTotal: 99.99,
    };

    const resOk = evaluateIssueEligibility({
      patron: underLimitPatron,
      copy: validCopy,
      target: standardTarget,
      rules: [standardRule],
      settings: { fineBlockLimit: 100.0 },
      referenceDate,
    });

    expect(resOk.eligible).toBe(true);
  });

  describe("Global Group Loan Quota (BR-09)", () => {
    it("enforces maxBooks against total active loans across all branches", () => {
      expect(checkLoanQuota(3, 4).allowed).toBe(true);
      expect(checkLoanQuota(4, 4).allowed).toBe(false);
      expect(checkLoanQuota(5, 4).allowed).toBe(false);
      expect(checkLoanQuota(4, 4).reason).toBe("Maximum books reached (4 of 4)");
    });
  });
});
