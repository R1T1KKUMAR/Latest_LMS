"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import type { ReportQueryResult } from "@/services/reports";

interface ReportViewerModalProps {
  reportId: string;
  reportCode: string;
  reportName: string;
  reportDescription: string;
  reportCategory: string;
  reportIcon: string;
  initialStartDate?: string;
  initialEndDate?: string;
  onClose: () => void;
}

export function ReportViewerModal({
  reportId,
  reportCode,
  reportName,
  reportDescription,
  reportCategory,
  reportIcon,
  initialStartDate = "2026-01-01",
  initialEndDate = "2026-12-31",
  onClose,
}: ReportViewerModalProps) {
  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReportQueryResult | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);

  const fetchReport = useCallback(
    async (start = startDate, end = endDate) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          reportId,
          startDate: start,
          endDate: end,
        });

        const res = await fetch(`/api/reports/query?${params.toString()}`);
        const json = await res.json();

        if (!res.ok || !json.success) {
          throw new Error(json.error || "Failed to load report data");
        }

        setData(json.report);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load report data");
      } finally {
        setLoading(false);
      }
    },
    [reportId, startDate, endDate],
  );

  useEffect(() => {
    fetchReport(initialStartDate, initialEndDate);
  }, [fetchReport, initialStartDate, initialEndDate]);

  // Client-side instant search across all columns
  const filteredRows = useMemo(() => {
    if (!data?.rows) return [];
    if (!searchQuery.trim()) return data.rows;

    const q = searchQuery.toLowerCase().trim();
    return data.rows.filter((row) =>
      Object.values(row).some((val) =>
        String(val ?? "")
          .toLowerCase()
          .includes(q),
      ),
    );
  }, [data?.rows, searchQuery]);

  // CSV download with UTF-8 BOM per SRS FR-RP-02
  const handleExportCsv = () => {
    if (!data || data.rows.length === 0) return;

    const headers = data.columns.map((c) => `"${c.label.replace(/"/g, '""')}"`).join(",");
    const rows = filteredRows.map((row) =>
      data.columns
        .map((c) => {
          const val = row[c.key] ?? "";
          return `"${String(val).replace(/"/g, '""')}"`;
        })
        .join(","),
    );

    const csvContent = `\uFEFF${[headers, ...rows].join("\r\n")}`;
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    const dateStr = new Date().toISOString().split("T")[0];
    const safeName = data.name.toLowerCase().replace(/[^a-z0-9]/g, "_");
    anchor.download = `${data.code}_${safeName}_${dateStr}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    // Timeout release prevents file locking on Windows
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    setDownloadSuccess(`Exported ${filteredRows.length} rows to CSV with UTF-8 encoding.`);
    setTimeout(() => setDownloadSuccess(null), 4000);
  };

  const handlePrint = () => {
    window.print();
  };

  const getBadgeStyle = (val: string) => {
    const v = String(val).toUpperCase();
    if (["AVAILABLE", "ACTIVE", "PAID", "CLEARED"].includes(v)) {
      return "bg-emerald-100 text-emerald-800 border-emerald-300";
    }
    if (["ISSUED", "WAITING", "CASH", "UPI", "STAFF"].includes(v)) {
      return "bg-blue-100 text-blue-800 border-blue-300";
    }
    if (["LOST", "DAMAGED", "WITHDRAWN", "OUTSTANDING", "FAILED"].includes(v)) {
      return "bg-rose-100 text-rose-800 border-rose-300";
    }
    if (["WAIVED", "RESERVED", "SYSTEM"].includes(v)) {
      return "bg-purple-100 text-purple-800 border-purple-300";
    }
    if (["REFERENCE_ONLY", "AVAILABLE_FOR_PICKUP"].includes(v)) {
      return "bg-amber-100 text-amber-800 border-amber-300";
    }
    return "bg-slate-100 text-slate-700 border-slate-300";
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 md:p-6 backdrop-blur-xs overflow-y-auto"
    >
      <div className="relative flex flex-col w-full max-w-7xl max-h-[94vh] rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-slate-200 bg-slate-50/80 px-6 py-4 gap-3">
          <div className="flex items-center gap-3">
            <span className="text-3xl p-2 rounded-xl bg-white shadow-xs border border-slate-200">
              {reportIcon}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-900">
                  {reportCode}
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                  {reportCategory}
                </span>
                <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  ● Live Data View
                </span>
              </div>
              <h2 className="text-lg font-bold text-slate-900 mt-0.5">{reportName}</h2>
              <p className="text-xs text-slate-500 max-w-2xl">{reportDescription}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end md:self-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 text-xs text-slate-700 hover:bg-white"
            >
              <span>🖨️</span>
              <span>Print</span>
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleExportCsv}
              disabled={loading || !data || data.rows.length === 0}
              className="inline-flex items-center gap-1.5 text-xs shadow-xs"
            >
              <span>⬇️</span>
              <span>Download CSV</span>
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="ml-2 rounded-lg p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition cursor-pointer"
              aria-label="Close viewer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-wrap items-center justify-between border-b border-slate-200 bg-white px-6 py-3 gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-600">
              <span className="font-semibold text-slate-700">Date Range:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded border border-slate-300 px-2.5 py-1 text-xs text-slate-800 shadow-2xs focus:border-blue-600 focus:outline-hidden"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded border border-slate-300 px-2.5 py-1 text-xs text-slate-800 shadow-2xs focus:border-blue-600 focus:outline-hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fetchReport(startDate, endDate)}
                disabled={loading}
                className="px-2.5 py-1 text-xs font-semibold"
              >
                {loading ? "Loading..." : "Apply Filter"}
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative w-full sm:w-72">
              <input
                type="text"
                placeholder="Search in records..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-slate-50/50 px-3 py-1.5 pl-8 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:border-blue-600 focus:outline-hidden"
              />
              <span className="absolute left-2.5 top-2 text-slate-400 text-xs">🔍</span>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1.5 text-slate-400 hover:text-slate-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="p-4 bg-rose-50 border-b border-rose-200">
            <Alert variant="error" title="Report Error" onDismiss={() => setError(null)}>
              {error}
            </Alert>
          </div>
        )}
        {downloadSuccess && (
          <div className="p-3 bg-emerald-50 border-b border-emerald-200">
            <Alert
              variant="success"
              title="Export Ready"
              onDismiss={() => setDownloadSuccess(null)}
            >
              {downloadSuccess}
            </Alert>
          </div>
        )}

        {/* Summary Metric Cards */}
        {data?.summary && data.summary.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50/60 p-4 border-b border-slate-200">
            {data.summary.map((item, idx) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed summary indices
                key={idx}
                className={`rounded-xl border p-3 bg-white shadow-2xs ${
                  item.highlight ? "border-blue-200 bg-blue-50/30" : "border-slate-200"
                }`}
              >
                <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                  {item.label}
                </div>
                <div
                  className={`text-lg font-bold mt-1 ${
                    item.highlight ? "text-blue-900" : "text-slate-900"
                  }`}
                >
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Table Content (Scrollable) */}
        <div className="flex-1 overflow-auto p-4 min-h-[300px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500 space-y-3">
              <div className="h-8 w-8 animate-spin rounded-full border-3 border-blue-900 border-t-transparent" />
              <p className="text-sm font-medium">Generating {reportName}...</p>
              <p className="text-xs text-slate-400">Querying live database registers</p>
            </div>
          ) : !data || filteredRows.length === 0 ? (
            <EmptyState
              icon={reportIcon}
              title={searchQuery ? "No matching records" : "No records found"}
              description={
                searchQuery
                  ? `No entries match "${searchQuery}". Clear your search query to see all records.`
                  : `There are currently no records in the ${reportName} register for the selected date range.`
              }
            />
          ) : (
            <div className="w-full overflow-x-auto rounded-xl border border-slate-200 shadow-2xs">
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                <thead className="bg-slate-100/90 sticky top-0 z-10">
                  <tr>
                    <th className="px-3.5 py-3 font-bold text-slate-700 w-12 text-center">#</th>
                    {data.columns.map((col) => (
                      <th
                        key={col.key}
                        className={`px-3.5 py-3 font-bold text-slate-700 whitespace-nowrap ${
                          col.align === "right"
                            ? "text-right"
                            : col.align === "center"
                              ? "text-center"
                              : "text-left"
                        }`}
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredRows.map((row, rIdx) => (
                    <tr
                      // biome-ignore lint/suspicious/noArrayIndexKey: stable row key
                      key={rIdx}
                      className="hover:bg-blue-50/40 transition-colors odd:bg-white even:bg-slate-50/30"
                    >
                      <td className="px-3.5 py-2.5 text-slate-400 text-center font-mono text-[11px]">
                        {rIdx + 1}
                      </td>
                      {data.columns.map((col) => {
                        const val = row[col.key];

                        if (col.format === "badge" && val) {
                          return (
                            <td
                              key={col.key}
                              className={`px-3.5 py-2.5 whitespace-nowrap ${
                                col.align === "center" ? "text-center" : ""
                              }`}
                            >
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold border ${getBadgeStyle(
                                  String(val),
                                )}`}
                              >
                                {String(val)}
                              </span>
                            </td>
                          );
                        }

                        if (col.format === "currency") {
                          return (
                            <td
                              key={col.key}
                              className="px-3.5 py-2.5 text-right font-mono font-semibold text-slate-900 whitespace-nowrap"
                            >
                              {String(val ?? "₹0.00")}
                            </td>
                          );
                        }

                        if (col.format === "date") {
                          return (
                            <td
                              key={col.key}
                              className="px-3.5 py-2.5 text-center font-mono text-slate-700 whitespace-nowrap"
                            >
                              {String(val ?? "-")}
                            </td>
                          );
                        }

                        return (
                          <td
                            key={col.key}
                            className={`px-3.5 py-2.5 text-slate-700 ${
                              col.align === "right"
                                ? "text-right font-mono"
                                : col.align === "center"
                                  ? "text-center"
                                  : "text-left"
                            }`}
                          >
                            {val !== undefined && val !== null ? String(val) : "-"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between border-t border-slate-200 bg-slate-50/80 px-6 py-3 text-xs text-slate-500 gap-2">
          <div>
            Showing <span className="font-semibold text-slate-800">{filteredRows.length}</span> of{" "}
            <span className="font-semibold text-slate-800">{data?.totalRecords || 0}</span> records
            {searchQuery && <span> (filtered from search)</span>}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-slate-400">
              Format: dd-mm-yyyy / Currency: ₹ (SRS FR-RP-03)
            </span>
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
