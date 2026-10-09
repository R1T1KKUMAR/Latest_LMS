import { describe, expect, it } from "vitest";
import {
  calculateHoldPickupExpiry,
  evaluateHoldPlacementEligibility,
  isHoldExpired,
  resolveReturnedCopyHoldAssignment,
} from "@/rules/reservations";
import type { CirculationRule } from "@/rules/types";

describe("Business Rules Engine: Reservations & Holds (FR-HO-01 to FR-HO-04)", () => {
  const referenceDate = new Date("2026-10-10");

  const activePatron = {
    id: 1,
    status: "ACTIVE",
    cardExpiry: "2027-06-30",
  };

  const allowedRule: CirculationRule = {
    maxBooks: 4,
    loanDays: 14,
    maxRenewals: 2,
    finePerDay: 2.0,
    graceDays: 0,
    holdsAllowed: true,
  };

  describe("1. Hold Placement Eligibility (FR-HO-01, T-16)", () => {
    it("refuses hold if copies are available on the shelf (T-16)", () => {
      const res = evaluateHoldPlacementEligibility(
        {
          patron: activePatron,
          title: { availableCopiesCount: 1 }, // Copy on shelf!
          patronActiveHoldsOnTitle: 0,
          patronActiveLoansOnTitle: 0,
          rule: allowedRule,
        },
        referenceDate,
      );

      expect(res.eligible).toBe(false);
      expect(res.reason).toBe("Copies are available on the shelf");
    });

    it("refuses hold if patron already has an active hold on this title (DR-01)", () => {
      const res = evaluateHoldPlacementEligibility(
        {
          patron: activePatron,
          title: { availableCopiesCount: 0 },
          patronActiveHoldsOnTitle: 1, // Already held
          patronActiveLoansOnTitle: 0,
          rule: allowedRule,
        },
        referenceDate,
      );

      expect(res.eligible).toBe(false);
      expect(res.reason).toBe("Patron already has an active hold for this title");
    });

    it("refuses hold if patron currently borrows this title", () => {
      const res = evaluateHoldPlacementEligibility(
        {
          patron: activePatron,
          title: { availableCopiesCount: 0 },
          patronActiveHoldsOnTitle: 0,
          patronActiveLoansOnTitle: 1, // Currently borrowed
          rule: allowedRule,
        },
        referenceDate,
      );

      expect(res.eligible).toBe(false);
      expect(res.reason).toBe("Patron already has an active loan for this title");
    });

    it("refuses hold if rule disallows holds", () => {
      const noHoldRule = { ...allowedRule, holdsAllowed: false };
      const res = evaluateHoldPlacementEligibility(
        {
          patron: activePatron,
          title: { availableCopiesCount: 0 },
          patronActiveHoldsOnTitle: 0,
          patronActiveLoansOnTitle: 0,
          rule: noHoldRule,
        },
        referenceDate,
      );

      expect(res.eligible).toBe(false);
      expect(res.reason).toBe("Holds are not allowed for this category/item type");
    });

    it("permits hold when all prerequisites are met (T-17)", () => {
      const res = evaluateHoldPlacementEligibility(
        {
          patron: activePatron,
          title: { availableCopiesCount: 0 }, // All copies out
          patronActiveHoldsOnTitle: 0,
          patronActiveLoansOnTitle: 0,
          rule: allowedRule,
        },
        referenceDate,
      );

      expect(res.eligible).toBe(true);
    });
  });

  describe("2. Hold Auto-Assignment Upon Return (FR-HO-03, T-10)", () => {
    it("assigns copy to oldest waiting hold in queue (T-10)", () => {
      const waitingHolds = [
        { id: 10, patronId: 5, requestDate: "2026-10-05T10:00:00Z" },
        { id: 11, patronId: 6, requestDate: "2026-10-02T09:00:00Z" }, // Oldest!
        { id: 12, patronId: 7, requestDate: "2026-10-08T14:00:00Z" },
      ];

      const res = resolveReturnedCopyHoldAssignment({
        waitingHolds,
        isReference: false,
      });

      expect(res.assignToHold).toBe(true);
      expect(res.holdToFulfill?.id).toBe(11); // Oldest hold wins
      expect(res.nextCopyStatus).toBe("RESERVED");
    });

    it("sets status to AVAILABLE when no waiting hold exists for standard copy", () => {
      const res = resolveReturnedCopyHoldAssignment({
        waitingHolds: [],
        isReference: false,
      });

      expect(res.assignToHold).toBe(false);
      expect(res.nextCopyStatus).toBe("AVAILABLE");
    });

    it("sets status to REFERENCE_ONLY when no waiting hold exists for reference copy", () => {
      const res = resolveReturnedCopyHoldAssignment({
        waitingHolds: [],
        isReference: true,
      });

      expect(res.assignToHold).toBe(false);
      expect(res.nextCopyStatus).toBe("REFERENCE_ONLY");
    });
  });

  describe("3. Hold Pickup Expiry & Housekeeping (FR-HO-04, FR-DB-03)", () => {
    it("calculates pickup expiry date: availableDate + HOLD_PICKUP_DAYS", () => {
      const availableDate = new Date("2026-10-10");
      const expiry = calculateHoldPickupExpiry(availableDate, 2);

      expect(expiry.getDate()).toBe(12); // 10 + 2
    });

    it("detects expired hold when current date is past expiry date", () => {
      const expiryDate = "2026-10-12";
      expect(isHoldExpired(expiryDate, "2026-10-13")).toBe(true);
      expect(isHoldExpired(expiryDate, "2026-10-12")).toBe(false); // On deadline is not expired
      expect(isHoldExpired(expiryDate, "2026-10-11")).toBe(false);
    });
  });
});
