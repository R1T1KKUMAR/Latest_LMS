import { describe, expect, it } from "vitest";
import { generateReportData } from "@/services/reports";

describe("All 13 Statutory Reports Integration Execution", () => {
  const allReportIds = [
    "rpt-01", // Accession Register
    "rpt-02", // Daily Circulation Summary
    "rpt-03", // Overdue Items & Defaulters
    "rpt-04", // Fine Collection Register
    "rpt-05", // Fine Waiver Log
    "rpt-06", // Patron Directory & Active Borrowers
    "rpt-07", // Lost & Written-Off Items
    "rpt-08", // Popular & High-Demand Titles
    "rpt-09", // Department-Wise Resource Utilization
    "rpt-10", // Stock Verification Audit
    "rpt-11", // Reservation Queue Status
    "rpt-12", // No-Dues Issued Register
    "rpt-13", // System Security Audit Log
  ];

  for (const rptId of allReportIds) {
    it(`executes report query for ${rptId} without error and returns structured columns & summary`, async () => {
      const res = await generateReportData(rptId, {
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      });

      expect(res).toBeDefined();
      expect(res.id).toBe(rptId);
      expect(res.columns.length).toBeGreaterThan(0);
      expect(Array.isArray(res.rows)).toBe(true);
      expect(Array.isArray(res.summary)).toBe(true);
      expect(typeof res.totalRecords).toBe("number");
    });
  }
});
