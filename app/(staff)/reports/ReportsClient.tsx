"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

interface ReportDef {
  id: string;
  code: string;
  name: string;
  description: string;
  category: "Circulation" | "Inventory" | "Financial" | "Analytics" | "Compliance";
  icon: string;
}

const allReports: ReportDef[] = [
  {
    id: "rpt-01",
    code: "RPT-01",
    name: "Accession Register",
    description:
      "Chronological statutory record of accessioned volumes, purchase price, vendor, and call numbers.",
    category: "Inventory",
    icon: "📖",
  },
  {
    id: "rpt-02",
    code: "RPT-02",
    name: "Daily Circulation Summary",
    description:
      "Daily count and detail of checkouts, returns, and renewals broken down by library terminal.",
    category: "Circulation",
    icon: "🔄",
  },
  {
    id: "rpt-03",
    code: "RPT-03",
    name: "Overdue Items & Defaulters",
    description:
      "List of active loans past due date, patron contact information, days overdue, and accrued penalties.",
    category: "Circulation",
    icon: "⚠️",
  },
  {
    id: "rpt-04",
    code: "RPT-04",
    name: "Fine Collection Register",
    description:
      "Audited financial register of all fine collections, payment modes (Cash/UPI), and receipt numbers.",
    category: "Financial",
    icon: "💰",
  },
  {
    id: "rpt-05",
    code: "RPT-05",
    name: "Fine Waiver Log",
    description:
      "Statutory log of waived library penalties, authorizing staff identity, and justified reasons.",
    category: "Financial",
    icon: "📝",
  },
  {
    id: "rpt-06",
    code: "RPT-06",
    name: "Patron Directory & Active Borrowers",
    description:
      "Directory of registered student and faculty members, card expiry status, and active borrowing counts.",
    category: "Compliance",
    icon: "👥",
  },
  {
    id: "rpt-07",
    code: "RPT-07",
    name: "Lost & Written-Off Items",
    description:
      "Report of items marked lost or damaged, replacement costs assessed, and write-off authorizations.",
    category: "Inventory",
    icon: "❌",
  },
  {
    id: "rpt-08",
    code: "RPT-08",
    name: "Popular & High-Demand Titles",
    description:
      "Top circulated bibliographic records ranked by checkout frequency and active hold volume.",
    category: "Analytics",
    icon: "⭐",
  },
  {
    id: "rpt-09",
    code: "RPT-09",
    name: "Department-Wise Resource Utilization",
    description: "Circulation distribution across B.Tech, Pharmacy, MBA, and MCA departments.",
    category: "Analytics",
    icon: "📊",
  },
  {
    id: "rpt-10",
    code: "RPT-10",
    name: "Stock Verification Audit",
    description:
      "Shelf physical verification status, missing accession flags, and shelf reconciliation variance.",
    category: "Inventory",
    icon: "🔍",
  },
  {
    id: "rpt-11",
    code: "RPT-11",
    name: "Reservation Queue Status",
    description: "Pending title holds, hold wait-times, and expiring pickup notifications.",
    category: "Circulation",
    icon: "📌",
  },
  {
    id: "rpt-12",
    code: "RPT-12",
    name: "No-Dues Issued Register",
    description:
      "Chronological repository of all graduation and departure clearance certificates generated.",
    category: "Compliance",
    icon: "🎓",
  },
  {
    id: "rpt-13",
    code: "RPT-13",
    name: "System Security Audit Log",
    description:
      "Chronological trail of user logins, role modifications, failed authentications, and policy events.",
    category: "Compliance",
    icon: "🛡️",
  },
];

export function ReportsClient() {
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [activeReport, setActiveReport] = useState<ReportDef | null>(null);
  const [startDate, setStartDate] = useState("2026-01-01");
  const [endDate, setEndDate] = useState("2026-12-31");
  const [exportFormat, setExportFormat] = useState("CSV");
  const [reportFeedback, setReportFeedback] = useState<string | null>(null);

  const categories = ["ALL", "Circulation", "Inventory", "Financial", "Analytics", "Compliance"];

  const filteredReports = allReports.filter(
    (r) => selectedCategory === "ALL" || r.category === selectedCategory,
  );

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeReport) return;
    setReportFeedback(
      `Report "${activeReport.name} (${activeReport.code})" generated successfully in ${exportFormat} format. (Full data streaming & PDF export active in Phase 11).`,
    );
    setActiveReport(null);
  };

  return (
    <div className="space-y-6">
      {reportFeedback && (
        <Alert
          variant="success"
          title="Report Generation Triggered"
          onDismiss={() => setReportFeedback(null)}
        >
          {reportFeedback}
        </Alert>
      )}

      {/* Category Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setSelectedCategory(cat)}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
              selectedCategory === cat
                ? "bg-blue-900 text-white shadow-xs"
                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            {cat} {cat === "ALL" ? `(${allReports.length})` : ""}
          </button>
        ))}
      </div>

      {/* Reports Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredReports.map((report) => (
          <div
            key={report.id}
            className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-slate-300 hover:shadow-sm"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-2xl">{report.icon}</span>
                <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-700">
                  {report.code}
                </span>
              </div>
              <h3 className="mt-3 text-sm font-bold text-slate-900">{report.name}</h3>
              <p className="mt-1 text-xs text-slate-500 leading-relaxed">{report.description}</p>
            </div>

            <div className="mt-5 border-t border-slate-100 pt-3 flex items-center justify-between">
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                {report.category}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setActiveReport(report);
                  setReportFeedback(null);
                }}
              >
                Configure &amp; Export
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Report Configuration Modal Form */}
      {activeReport && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="font-mono text-xs font-bold text-blue-900">
                  {activeReport.code}
                </span>
                <h3 id="report-modal-title" className="text-base font-bold text-slate-900">
                  {activeReport.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveReport(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGenerate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Input
                  id="report-from-date"
                  label="From Date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
                <Input
                  id="report-to-date"
                  label="To Date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                />
              </div>

              <Select
                id="report-export-format"
                label="Export Format"
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value)}
                options={[
                  { value: "CSV", label: "CSV (Comma Separated Values)" },
                  { value: "PDF", label: "PDF Document (Print Ready)" },
                  { value: "EXCEL", label: "Microsoft Excel (.xlsx)" },
                ]}
              />

              <div className="mt-6 flex justify-end space-x-3 border-t border-slate-100 pt-4">
                <Button type="button" variant="outline" onClick={() => setActiveReport(null)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary">
                  Generate &amp; Download
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
