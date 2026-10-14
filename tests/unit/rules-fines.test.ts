import { describe, expect, it } from "vitest";
import { calculateLostCharge, calculateOverdueFine } from "@/rules/fines";

describe("Business Rules Engine: Fine Calculations (BR-06, BR-07)", () => {
  describe("1. Overdue Fine Calculation (BR-06, T-09)", () => {
    it("returns zero fine when returned on the due date", () => {
      const res = calculateOverdueFine({
        dueDate: "2026-10-15",
        returnDate: "2026-10-15",
        finePerDay: 2.0,
      });

      expect(res.daysLate).toBe(0);
      expect(res.chargeableDays).toBe(0);
      expect(res.finalOverdueFine).toBe(0.0);
      expect(res.isCapped).toBe(false);
    });

    it("returns zero fine when returned before the due date", () => {
      const res = calculateOverdueFine({
        dueDate: "2026-10-15",
        returnDate: "2026-10-10",
        finePerDay: 2.0,
      });

      expect(res.daysLate).toBe(0);
      expect(res.finalOverdueFine).toBe(0.0);
    });

    it("returns zero fine when returned within grace period", () => {
      const res = calculateOverdueFine({
        dueDate: "2026-10-10",
        returnDate: "2026-10-12", // 2 days late
        finePerDay: 2.0,
        graceDays: 2, // 2 grace days
      });

      expect(res.daysLate).toBe(2);
      expect(res.chargeableDays).toBe(0); // 2 - 2 = 0
      expect(res.finalOverdueFine).toBe(0.0);
    });

    it("calculates fine after grace days: (daysLate - graceDays) * finePerDay", () => {
      const res = calculateOverdueFine({
        dueDate: "2026-10-10",
        returnDate: "2026-10-15", // 5 days late
        finePerDay: 3.0,
        graceDays: 2, // 2 grace days
      });

      expect(res.daysLate).toBe(5);
      expect(res.chargeableDays).toBe(3); // 5 - 2 = 3
      expect(res.finalOverdueFine).toBe(9.0); // 3 * 3 = 9.00
      expect(res.isCapped).toBe(false);
    });

    it("SRS Acceptance Test T-09: 12 days overdue, ₹2.00/day, 0 grace -> ₹24.00", () => {
      const res = calculateOverdueFine({
        dueDate: "2026-10-01",
        returnDate: "2026-10-13", // 12 days late
        finePerDay: 2.0,
        graceDays: 0,
      });

      expect(res.daysLate).toBe(12);
      expect(res.chargeableDays).toBe(12);
      expect(res.finalOverdueFine).toBe(24.0);
      expect(res.isCapped).toBe(false);
    });

    it("caps fine at maxFine when calculated amount exceeds cap", () => {
      const res = calculateOverdueFine({
        dueDate: "2026-09-01",
        returnDate: "2026-10-01", // 30 days late
        finePerDay: 5.0, // 30 * 5 = 150.00
        maxFine: 100.0, // Capped at 100.00
      });

      expect(res.daysLate).toBe(30);
      expect(res.calculatedFine).toBe(150.0);
      expect(res.finalOverdueFine).toBe(100.0);
      expect(res.isCapped).toBe(true);
    });

    it("does not cap fine when maxFine is null or 0", () => {
      const res = calculateOverdueFine({
        dueDate: "2026-09-01",
        returnDate: "2026-10-01", // 30 days late
        finePerDay: 5.0,
        maxFine: null,
      });

      expect(res.finalOverdueFine).toBe(150.0);
      expect(res.isCapped).toBe(false);
    });

    it("exempts college holidays from overdue fine calculations", () => {
      // Due 2026-10-01, returned 2026-10-06 (5 days late: Oct 2, 3, 4, 5, 6)
      // Oct 2 (Gandhi Jayanti) and Oct 4 (Sunday/Holiday) are college holidays
      const res = calculateOverdueFine({
        dueDate: "2026-10-01",
        returnDate: "2026-10-06",
        finePerDay: 2.0,
        graceDays: 0,
        holidays: ["2026-10-02", "2026-10-04"],
      });

      expect(res.daysLate).toBe(5);
      expect(res.holidayExemptDays).toBe(2);
      expect(res.exemptHolidayDates).toEqual(["2026-10-02", "2026-10-04"]);
      expect(res.chargeableDays).toBe(3); // 5 - 2 = 3 days
      expect(res.finalOverdueFine).toBe(6.0); // 3 * 2.00 = 6.00
    });

    it("returns zero fine when all overdue days fall on declared college holidays", () => {
      const res = calculateOverdueFine({
        dueDate: "2026-10-01",
        returnDate: "2026-10-03", // 2 days late: Oct 2, Oct 3
        finePerDay: 5.0,
        graceDays: 0,
        holidays: ["2026-10-02", "2026-10-03"], // Both days college was off
      });

      expect(res.daysLate).toBe(2);
      expect(res.holidayExemptDays).toBe(2);
      expect(res.chargeableDays).toBe(0);
      expect(res.finalOverdueFine).toBe(0.0);
    });

    it("correctly combines grace days with holiday exemptions", () => {
      // 6 days late, 2 holidays -> 4 effective days late. Grace = 2 -> 2 chargeable days.
      const res = calculateOverdueFine({
        dueDate: "2026-10-01",
        returnDate: "2026-10-07", // 6 days late
        finePerDay: 2.5,
        graceDays: 2,
        holidays: ["2026-10-02", "2026-10-05"],
      });

      expect(res.daysLate).toBe(6);
      expect(res.holidayExemptDays).toBe(2);
      expect(res.chargeableDays).toBe(2); // (6 - 2 holidays) - 2 grace = 2
      expect(res.finalOverdueFine).toBe(5.0); // 2 * 2.5 = 5.00
    });
  });

  describe("2. Lost Book Charge Calculation (BR-07, T-13)", () => {
    it("SRS Acceptance Test T-13: copy price ₹750, processing fee ₹50, on time (₹0 fine) -> ₹800.00", () => {
      const res = calculateLostCharge({
        itemPrice: 750.0,
        lostProcessingFee: 50.0,
        overdueFineToDate: 0.0,
      });

      expect(res.baseReplacementPrice).toBe(750.0);
      expect(res.processingFee).toBe(50.0);
      expect(res.overdueFineToDate).toBe(0.0);
      expect(res.totalLostCharge).toBe(800.0);
    });

    it("falls back to bib/title price when copy price is missing or 0", () => {
      const res = calculateLostCharge({
        itemPrice: 0.0, // Missing copy price
        bibPrice: 450.0, // Title price fallback
        lostProcessingFee: 50.0,
        overdueFineToDate: 0.0,
      });

      expect(res.baseReplacementPrice).toBe(450.0);
      expect(res.totalLostCharge).toBe(500.0); // 450 + 50
    });

    it("adds overdue fine accrued to date to the replacement charge", () => {
      const res = calculateLostCharge({
        itemPrice: 600.0,
        bibPrice: 600.0,
        lostProcessingFee: 50.0,
        overdueFineToDate: 34.0, // Accrued late fee to date
      });

      expect(res.baseReplacementPrice).toBe(600.0);
      expect(res.processingFee).toBe(50.0);
      expect(res.overdueFineToDate).toBe(34.0);
      expect(res.totalLostCharge).toBe(684.0); // 600 + 50 + 34
    });
  });
});
