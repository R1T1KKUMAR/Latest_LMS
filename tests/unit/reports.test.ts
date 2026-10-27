import { describe, expect, it } from "vitest";
import { formatCurrencyValue, formatReportDate, generateReportData } from "@/services/reports";

describe("Reports Service & Analytics Unit Suite (SRS Section 4.11, FR-RP-01..03)", () => {
  describe("Formatting Helpers (FR-RP-03)", () => {
    it("formats dates into standard dd-mm-yyyy format", () => {
      expect(formatReportDate("2026-08-15")).toBe("15-08-2026");
      expect(formatReportDate("2026-01-01")).toBe("01-01-2026");
      expect(formatReportDate("2026-12-31")).toBe("31-12-2026");
      expect(formatReportDate(null)).toBe("-");
      expect(formatReportDate(undefined)).toBe("-");
    });

    it("formats currency values with Indian Rupee symbol and 2 decimal places", () => {
      expect(formatCurrencyValue(850)).toBe("₹850.00");
      expect(formatCurrencyValue("1250.5")).toBe("₹1,250.50");
      expect(formatCurrencyValue(0)).toBe("₹0.00");
      expect(formatCurrencyValue(null)).toBe("₹0.00");
      expect(formatCurrencyValue("invalid")).toBe("₹0.00");
    });
  });

  describe("Report Dispatcher Validation", () => {
    it("throws a descriptive error for invalid report identifiers", async () => {
      await expect(generateReportData("rpt-999")).rejects.toThrow(
        "Unrecognized report identifier: rpt-999",
      );
      await expect(generateReportData("invalid")).rejects.toThrow(
        "Unrecognized report identifier: invalid",
      );
    });
  });
});
