import { describe, expect, it } from "vitest";
import {
  validateFineStatusTransition,
  validateHoldStatusTransition,
  validateItemStatusTransition,
  validateLoanStatusTransition,
  validatePatronStatusTransition,
} from "@/rules/transitions";

describe("Business Rules Engine: Status Transitions (docs/status-transition-spec.md)", () => {
  describe("1. Copy (Item) Transitions (§2)", () => {
    it("allows desk issue from AVAILABLE, REFERENCE_ONLY, or RESERVED to ISSUED", () => {
      expect(validateItemStatusTransition("AVAILABLE", "ISSUED").valid).toBe(true);
      expect(validateItemStatusTransition("REFERENCE_ONLY", "ISSUED").valid).toBe(true);
      expect(validateItemStatusTransition("RESERVED", "ISSUED").valid).toBe(true);
    });

    it("refuses desk issue from DAMAGED, LOST, or WITHDRAWN to ISSUED", () => {
      expect(validateItemStatusTransition("DAMAGED", "ISSUED").valid).toBe(false);
      expect(validateItemStatusTransition("LOST", "ISSUED").valid).toBe(false);
      expect(validateItemStatusTransition("WITHDRAWN", "ISSUED").valid).toBe(false);
    });

    it("requires returned copy with waiting hold to transition to RESERVED", () => {
      expect(
        validateItemStatusTransition("ISSUED", "RESERVED", { hasWaitingHold: true }).valid,
      ).toBe(true);
      expect(
        validateItemStatusTransition("ISSUED", "RESERVED", { hasWaitingHold: false }).valid,
      ).toBe(false);
    });

    it("enforces reference copies returning to REFERENCE_ONLY, not AVAILABLE", () => {
      expect(validateItemStatusTransition("ISSUED", "AVAILABLE", { isReference: true }).valid).toBe(
        false,
      );
      expect(
        validateItemStatusTransition("ISSUED", "REFERENCE_ONLY", { isReference: true }).valid,
      ).toBe(true);
    });

    it("allows administrative transitions between AVAILABLE and DAMAGED/REPAIR/WITHDRAWN", () => {
      expect(validateItemStatusTransition("AVAILABLE", "DAMAGED").valid).toBe(true);
      expect(validateItemStatusTransition("AVAILABLE", "REPAIR").valid).toBe(true);
      expect(validateItemStatusTransition("AVAILABLE", "WITHDRAWN").valid).toBe(true);
      expect(validateItemStatusTransition("REPAIR", "AVAILABLE").valid).toBe(true);
    });
  });

  describe("2. Patron Status Transitions (§3)", () => {
    it("allows transitions from ACTIVE to BLOCKED, EXPIRED, GRADUATED, or LEFT", () => {
      expect(validatePatronStatusTransition("ACTIVE", "BLOCKED").valid).toBe(true);
      expect(validatePatronStatusTransition("ACTIVE", "EXPIRED").valid).toBe(true);
      expect(validatePatronStatusTransition("ACTIVE", "GRADUATED").valid).toBe(true);
      expect(validatePatronStatusTransition("ACTIVE", "LEFT").valid).toBe(true);
    });

    it("allows reactivating from BLOCKED or EXPIRED back to ACTIVE", () => {
      expect(validatePatronStatusTransition("BLOCKED", "ACTIVE").valid).toBe(true);
      expect(validatePatronStatusTransition("EXPIRED", "ACTIVE").valid).toBe(true);
    });

    it("refuses transitions out of terminal states GRADUATED and LEFT", () => {
      expect(validatePatronStatusTransition("GRADUATED", "ACTIVE").valid).toBe(false);
      expect(validatePatronStatusTransition("GRADUATED", "BLOCKED").valid).toBe(false);
      expect(validatePatronStatusTransition("LEFT", "ACTIVE").valid).toBe(false);
    });
  });

  describe("3. Hold (Reservation) Transitions (§4)", () => {
    it("allows WAITING to transition to AVAILABLE_FOR_PICKUP or CANCELLED", () => {
      expect(validateHoldStatusTransition("WAITING", "AVAILABLE_FOR_PICKUP").valid).toBe(true);
      expect(validateHoldStatusTransition("WAITING", "CANCELLED").valid).toBe(true);
      expect(validateHoldStatusTransition("WAITING", "COMPLETED").valid).toBe(false);
    });

    it("allows AVAILABLE_FOR_PICKUP to transition to COMPLETED, EXPIRED, or CANCELLED", () => {
      expect(validateHoldStatusTransition("AVAILABLE_FOR_PICKUP", "COMPLETED").valid).toBe(true);
      expect(validateHoldStatusTransition("AVAILABLE_FOR_PICKUP", "EXPIRED").valid).toBe(true);
      expect(validateHoldStatusTransition("AVAILABLE_FOR_PICKUP", "CANCELLED").valid).toBe(true);
    });

    it("refuses transitions out of terminal states (COMPLETED, EXPIRED, CANCELLED)", () => {
      expect(validateHoldStatusTransition("COMPLETED", "WAITING").valid).toBe(false);
      expect(validateHoldStatusTransition("EXPIRED", "AVAILABLE_FOR_PICKUP").valid).toBe(false);
      expect(validateHoldStatusTransition("CANCELLED", "WAITING").valid).toBe(false);
    });
  });

  describe("4. Loan Transitions (§1)", () => {
    it("allows ISSUED to transition to RETURNED or LOST", () => {
      expect(validateLoanStatusTransition("ISSUED", "RETURNED").valid).toBe(true);
      expect(validateLoanStatusTransition("ISSUED", "LOST").valid).toBe(true);
    });

    it("refuses transitions from closed loans", () => {
      expect(validateLoanStatusTransition("RETURNED", "ISSUED").valid).toBe(false);
      expect(validateLoanStatusTransition("LOST", "ISSUED").valid).toBe(false);
    });
  });

  describe("5. Fine Transitions & Immutability (§5, FR-FI-05)", () => {
    it("allows OUTSTANDING to remain OUTSTANDING on partial payment", () => {
      expect(validateFineStatusTransition("OUTSTANDING", "OUTSTANDING").valid).toBe(true);
    });

    it("allows OUTSTANDING to transition to PAID when balance is zero", () => {
      expect(validateFineStatusTransition("OUTSTANDING", "PAID", 0.0).valid).toBe(true);
      expect(validateFineStatusTransition("OUTSTANDING", "PAID", 10.0).valid).toBe(false);
    });

    it("allows OUTSTANDING to transition to WAIVED", () => {
      expect(validateFineStatusTransition("OUTSTANDING", "WAIVED").valid).toBe(true);
    });

    it("refuses mutations on terminal states PAID and WAIVED (FR-FI-05)", () => {
      expect(validateFineStatusTransition("PAID", "OUTSTANDING").valid).toBe(false);
      expect(validateFineStatusTransition("WAIVED", "OUTSTANDING").valid).toBe(false);
      expect(validateFineStatusTransition("PAID", "WAIVED").valid).toBe(false);
    });
  });
});
