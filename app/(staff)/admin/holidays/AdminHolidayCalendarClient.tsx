"use client";

import { useState } from "react";
import type { HolidayRecord } from "@/services/holidays";

interface AdminHolidayCalendarClientProps {
  initialHolidays: HolidayRecord[];
  csrfToken: string;
}

export function AdminHolidayCalendarClient({
  initialHolidays,
  csrfToken,
}: AdminHolidayCalendarClientProps) {
  const [holidays, setHolidays] = useState<HolidayRecord[]>(initialHolidays);
  const [activeTab, setActiveTab] = useState<"calendar" | "add-adhoc" | "upload">("calendar");

  // Filter & Search
  const [filterType, setFilterType] = useState<"ALL" | "ANNUAL" | "AD_HOC">("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Ad-hoc Holiday Form
  const [adhocStartDate, setAdhocStartDate] = useState("");
  const [adhocEndDate, setAdhocEndDate] = useState("");
  const [adhocName, setAdhocName] = useState("");
  const [adhocType, setAdhocType] = useState<"AD_HOC" | "ANNUAL">("AD_HOC");
  const [adhocDescription, setAdhocDescription] = useState("");
  const [submittingAdhoc, setSubmittingAdhoc] = useState(false);
  const [adhocMessage, setAdhocMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Upload Calendar State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadMode, setUploadMode] = useState<"MERGE" | "REPLACE">("MERGE");
  const [uploadPreview, setUploadPreview] = useState<{
    items: Array<{ date: string; name: string; type: string; description?: string }>;
    validCount: number;
    errorCount: number;
    errors: Array<{ row: number; error: string }>;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Deletion state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Format day of week
  const getDayOfWeek = (dateStr: string) => {
    try {
      const d = new Date(`${dateStr}T00:00:00Z`);
      return d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
    } catch {
      return "";
    }
  };

  // Next upcoming holiday
  const todayIso = new Date().toISOString().slice(0, 10);
  const upcomingHolidays = holidays.filter((h) => h.date >= todayIso);
  const nextHoliday = upcomingHolidays.length > 0 ? upcomingHolidays[0] : null;

  // Filtered list
  const filteredHolidays = holidays.filter((h) => {
    if (filterType !== "ALL" && h.type !== filterType) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        h.name.toLowerCase().includes(q) ||
        h.date.includes(q) ||
        (h.description?.toLowerCase().includes(q) ?? false)
      );
    }
    return true;
  });

  // Handle Add Ad-hoc / College Off
  const handleAddAdhoc = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingAdhoc(true);
    setAdhocMessage(null);

    try {
      if (!adhocStartDate) {
        throw new Error("Date is required.");
      }
      if (!adhocName.trim()) {
        throw new Error("Reason or holiday name is required.");
      }

      // Check if multi-day range was specified
      const datesToAdd: string[] = [adhocStartDate];
      if (adhocEndDate && adhocEndDate > adhocStartDate) {
        const dStart = new Date(`${adhocStartDate}T00:00:00Z`);
        const dEnd = new Date(`${adhocEndDate}T00:00:00Z`);
        const diffDays = Math.floor((dEnd.getTime() - dStart.getTime()) / (1000 * 60 * 60 * 24));
        for (let i = 1; i <= diffDays; i++) {
          const next = new Date(
            Date.UTC(dStart.getUTCFullYear(), dStart.getUTCMonth(), dStart.getUTCDate() + i),
          );
          datesToAdd.push(next.toISOString().slice(0, 10));
        }
      }

      let addedCount = 0;
      for (const d of datesToAdd) {
        const res = await fetch("/api/admin/holidays", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": csrfToken,
          },
          body: JSON.stringify({
            date: d,
            name: adhocName.trim(),
            type: adhocType,
            description: adhocDescription.trim() || undefined,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Failed to schedule holiday");
        }
        addedCount++;
      }

      // Refresh list
      const listRes = await fetch("/api/admin/holidays");
      const listData = await listRes.json();
      if (listData.success) {
        setHolidays(listData.holidays);
      }

      setAdhocMessage({
        type: "success",
        text: `Declared ${addedCount} holiday ${addedCount === 1 ? "day" : "days"} ("${adhocName}"). Overdue fines will be exempted for this period!`,
      });

      setAdhocStartDate("");
      setAdhocEndDate("");
      setAdhocName("");
      setAdhocDescription("");
    } catch (err: unknown) {
      setAdhocMessage({
        type: "error",
        text: (err as Error).message || "Error adding holiday",
      });
    } finally {
      setSubmittingAdhoc(false);
    }
  };

  // Handle File Selection and Preview
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setSelectedFile(null);
      setUploadPreview(null);
      return;
    }

    setSelectedFile(file);
    setUploadMessage(null);

    // Run preview
    const formData = new FormData();
    formData.append("file", file);
    formData.append("csrfToken", csrfToken);
    formData.append("previewOnly", "true");

    try {
      const res = await fetch("/api/admin/holidays/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUploadPreview({
          items: data.items,
          validCount: data.validCount,
          errorCount: data.errorCount,
          errors: data.errors,
        });
      } else {
        setUploadMessage({
          type: "error",
          text: data.error || "Failed to parse CSV preview.",
        });
      }
    } catch (err: unknown) {
      setUploadMessage({
        type: "error",
        text: (err as Error).message || "Error reading file",
      });
    }
  };

  // Confirm Import
  const handleConfirmUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setUploadMessage(null);

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("csrfToken", csrfToken);
    formData.append("mode", uploadMode);

    try {
      const res = await fetch("/api/admin/holidays/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to import calendar");
      }

      setUploadMessage({
        type: "success",
        text: data.message,
      });

      // Refresh list
      const listRes = await fetch("/api/admin/holidays");
      const listData = await listRes.json();
      if (listData.success) {
        setHolidays(listData.holidays);
      }

      setSelectedFile(null);
      setUploadPreview(null);
    } catch (err: unknown) {
      setUploadMessage({
        type: "error",
        text: (err as Error).message || "Import failed",
      });
    } finally {
      setUploading(false);
    }
  };

  // Delete Holiday
  const handleDeleteHoliday = async (id: string, name: string, date: string) => {
    if (!confirm(`Are you sure you want to remove the holiday "${name}" on ${date}?`)) {
      return;
    }

    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/holidays/${id}`, {
        method: "DELETE",
        headers: {
          "x-csrf-token": csrfToken,
        },
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to remove holiday");
      }

      setHolidays((prev) => prev.filter((h) => h.id !== id));
    } catch (err: unknown) {
      alert((err as Error).message || "Error deleting holiday");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Stat Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <span className="text-xs text-slate-500 font-medium">Total Holidays</span>
          <div className="mt-1 text-2xl font-black text-slate-900">{holidays.length}</div>
          <span className="text-[11px] text-emerald-700 font-medium">100% Fine Exempt</span>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 shadow-xs">
          <span className="text-xs text-blue-700 font-medium">Annual Calendar</span>
          <div className="mt-1 text-2xl font-black text-blue-900">
            {holidays.filter((h) => h.type === "ANNUAL").length}
          </div>
          <span className="text-[11px] text-blue-600 font-medium">Academic gazetted</span>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 shadow-xs">
          <span className="text-xs text-amber-700 font-medium">Ad-hoc College Off</span>
          <div className="mt-1 text-2xl font-black text-amber-900">
            {holidays.filter((h) => h.type === "AD_HOC").length}
          </div>
          <span className="text-[11px] text-amber-700 font-medium">Emergency closures</span>
        </div>

        <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-4 shadow-xs">
          <span className="text-xs text-purple-700 font-medium">Next Holiday</span>
          <div className="mt-1 text-sm font-bold text-purple-900 truncate">
            {nextHoliday ? nextHoliday.name : "None upcoming"}
          </div>
          <span className="text-[11px] text-purple-600 font-mono">
            {nextHoliday ? nextHoliday.date : "—"}
          </span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("calendar")}
            className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
              activeTab === "calendar"
                ? "bg-slate-900 text-white shadow-xs"
                : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            📋 Holiday List ({holidays.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("add-adhoc")}
            className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
              activeTab === "add-adhoc"
                ? "bg-amber-600 text-white shadow-xs"
                : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            ⚡ Declare College-Off Day
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("upload")}
            className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
              activeTab === "upload"
                ? "bg-blue-700 text-white shadow-xs"
                : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            📤 Upload Annual Calendar (.csv)
          </button>
        </div>

        <a
          href="/api/admin/holidays/template"
          download="annual_holiday_calendar_template.csv"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs"
        >
          📥 Download Calendar Template
        </a>
      </div>

      {/* TAB 1: ALL SCHEDULED HOLIDAYS */}
      {activeTab === "calendar" && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-xs space-y-4">
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100">
            {/* Filter buttons */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setFilterType("ALL")}
                className={`rounded-md px-3 py-1 text-xs font-semibold ${
                  filterType === "ALL"
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                All ({holidays.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterType("ANNUAL")}
                className={`rounded-md px-3 py-1 text-xs font-semibold ${
                  filterType === "ANNUAL"
                    ? "bg-blue-700 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Annual ({holidays.filter((h) => h.type === "ANNUAL").length})
              </button>
              <button
                type="button"
                onClick={() => setFilterType("AD_HOC")}
                className={`rounded-md px-3 py-1 text-xs font-semibold ${
                  filterType === "AD_HOC"
                    ? "bg-amber-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                College Off ({holidays.filter((h) => h.type === "AD_HOC").length})
              </button>
            </div>

            {/* Search */}
            <input
              type="text"
              placeholder="Search by holiday name or date..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs w-full sm:w-64 focus:border-slate-900 focus:outline-hidden"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="border-b border-slate-200 bg-slate-50 font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Day</th>
                  <th className="px-6 py-3">Holiday / Closure Reason</th>
                  <th className="px-6 py-3">Type</th>
                  <th className="px-6 py-3">Remarks / Memo</th>
                  <th className="px-6 py-3 text-center">Fine Status</th>
                  <th className="px-6 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredHolidays.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-slate-400">
                      No holidays found matching criteria. Use &quot;Declare College-Off Day&quot;
                      or &quot;Upload Annual Calendar&quot; above to add holidays.
                    </td>
                  </tr>
                ) : (
                  filteredHolidays.map((holiday) => (
                    <tr key={holiday.id} className="hover:bg-slate-50/50">
                      <td className="px-6 py-3.5 font-mono font-semibold text-slate-900">
                        {holiday.date}
                      </td>
                      <td className="px-6 py-3.5 font-medium text-slate-500">
                        {getDayOfWeek(holiday.date)}
                      </td>
                      <td className="px-6 py-3.5 font-bold text-slate-900">{holiday.name}</td>
                      <td className="px-6 py-3.5">
                        {holiday.type === "AD_HOC" ? (
                          <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
                            College Off
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-semibold text-blue-800">
                            Annual Holiday
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3.5 text-slate-500">{holiday.description || "—"}</td>
                      <td className="px-6 py-3.5 text-center">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 uppercase tracking-wide">
                          ✓ Exempted
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-center">
                        <button
                          type="button"
                          onClick={() =>
                            handleDeleteHoliday(holiday.id, holiday.name, holiday.date)
                          }
                          disabled={deletingId === holiday.id}
                          className="rounded border border-rose-200 px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                        >
                          {deletingId === holiday.id ? "Removing..." : "Remove"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: DECLARE AD-HOC COLLEGE OFF */}
      {activeTab === "add-adhoc" && (
        <div className="max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-6">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Declare Ad-Hoc Holiday / College Off Day
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Add a holiday due to emergency weather, local election, district administration
              advisory, or unplanned campus closure. Overdue fines will be exempted for all patrons
              on these dates.
            </p>
          </div>

          {adhocMessage && (
            <div
              className={`rounded-lg p-3 text-xs font-medium ${
                adhocMessage.type === "success"
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-rose-50 text-rose-800 border border-rose-200"
              }`}
            >
              {adhocMessage.text}
            </div>
          )}

          <form onSubmit={handleAddAdhoc} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="adhocStartDateInput"
                  className="block text-xs font-bold text-slate-700"
                >
                  Holiday Date (or Range Start) *
                </label>
                <input
                  id="adhocStartDateInput"
                  type="date"
                  value={adhocStartDate}
                  onChange={(e) => setAdhocStartDate(e.target.value)}
                  required
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-900 shadow-xs focus:border-slate-900 focus:outline-hidden"
                />
              </div>

              <div>
                <label
                  htmlFor="adhocEndDateInput"
                  className="block text-xs font-bold text-slate-700"
                >
                  Range End Date (Optional)
                </label>
                <input
                  id="adhocEndDateInput"
                  type="date"
                  min={adhocStartDate}
                  value={adhocEndDate}
                  onChange={(e) => setAdhocEndDate(e.target.value)}
                  placeholder="Leave blank for single day"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-900 shadow-xs focus:border-slate-900 focus:outline-hidden"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  For multi-day closure (e.g. storm alert).
                </p>
              </div>
            </div>

            <div>
              <label htmlFor="adhocNameInput" className="block text-xs font-bold text-slate-700">
                Reason / Holiday Name *
              </label>
              <input
                id="adhocNameInput"
                type="text"
                placeholder="e.g. College closed due to heavy rain advisory by DM"
                value={adhocName}
                onChange={(e) => setAdhocName(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-900 shadow-xs focus:border-slate-900 focus:outline-hidden"
              />
            </div>

            <div>
              <label htmlFor="adhocTypeSelect" className="block text-xs font-bold text-slate-700">
                Category
              </label>
              <select
                id="adhocTypeSelect"
                value={adhocType}
                onChange={(e) => setAdhocType(e.target.value as "AD_HOC" | "ANNUAL")}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-900 shadow-xs focus:border-slate-900 focus:outline-hidden"
              >
                <option value="AD_HOC">Ad-hoc College Off / Emergency Closure</option>
                <option value="ANNUAL">Annual / Gazetted Academic Holiday</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="adhocDescriptionInput"
                className="block text-xs font-bold text-slate-700"
              >
                Official Circular / Memo Remarks
              </label>
              <textarea
                id="adhocDescriptionInput"
                rows={2}
                placeholder="e.g. Circular Ref: RBMI/ADMIN/2026/104. All academic operations suspended."
                value={adhocDescription}
                onChange={(e) => setAdhocDescription(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-xs text-slate-900 shadow-xs focus:border-slate-900 focus:outline-hidden"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={submittingAdhoc}
                className="inline-flex items-center rounded-lg bg-amber-600 px-5 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-amber-700 disabled:opacity-50"
              >
                {submittingAdhoc
                  ? "Scheduling Holiday..."
                  : "Declare College Holiday & Exempt Fines"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 3: UPLOAD ANNUAL CALENDAR */}
      {activeTab === "upload" && (
        <div className="max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-6">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Upload Annual Holiday Calendar</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Upload a standard CSV file containing the annual gazetted academic holidays for the
              institution.
            </p>
          </div>

          {uploadMessage && (
            <div
              className={`rounded-lg p-3 text-xs font-medium ${
                uploadMessage.type === "success"
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-rose-50 text-rose-800 border border-rose-200"
              }`}
            >
              {uploadMessage.text}
            </div>
          )}

          <div className="space-y-4">
            {/* Template Info Card */}
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-800">Supported File Format</span>
                  <p className="text-[11px] text-slate-500">
                    CSV columns:{" "}
                    <code className="rounded bg-slate-200 px-1 py-0.5">
                      Date,Holiday Name,Type,Description
                    </code>
                  </p>
                </div>
                <a
                  href="/api/admin/holidays/template"
                  download="annual_holiday_calendar_template.csv"
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Download Sample CSV
                </a>
              </div>
            </div>

            {/* Import Mode */}
            <div>
              <span className="block text-xs font-bold text-slate-700 mb-1">Import Mode</span>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="uploadMode"
                    value="MERGE"
                    checked={uploadMode === "MERGE"}
                    onChange={() => setUploadMode("MERGE")}
                    className="text-slate-900"
                  />
                  <span>Merge with existing calendar (Recommended)</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="uploadMode"
                    value="REPLACE"
                    checked={uploadMode === "REPLACE"}
                    onChange={() => setUploadMode("REPLACE")}
                    className="text-slate-900"
                  />
                  <span>Replace entire annual calendar</span>
                </label>
              </div>
            </div>

            {/* File Picker */}
            <div>
              <label
                htmlFor="calendarFileInput"
                className="block text-xs font-bold text-slate-700 mb-1"
              >
                Select Calendar CSV File
              </label>
              <input
                id="calendarFileInput"
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-900 file:text-white hover:file:bg-slate-800"
              />
            </div>

            {/* Preview Section */}
            {uploadPreview && (
              <div className="rounded-lg border border-slate-200 p-4 space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-emerald-700 font-bold">
                    ✓ Valid Rows Detected: {uploadPreview.validCount}
                  </span>
                  {uploadPreview.errorCount > 0 && (
                    <span className="text-rose-700">Errors: {uploadPreview.errorCount}</span>
                  )}
                </div>

                {uploadPreview.items.length > 0 && (
                  <div className="max-h-48 overflow-y-auto rounded border border-slate-100 bg-slate-50 p-2 text-xs">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="text-slate-400 font-medium border-b border-slate-200">
                          <th className="py-1">Date</th>
                          <th className="py-1">Holiday Name</th>
                          <th className="py-1">Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {uploadPreview.items.map((row) => (
                          <tr key={row.date} className="border-b border-slate-100">
                            <td className="py-1 font-mono text-slate-700">{row.date}</td>
                            <td className="py-1 font-semibold text-slate-900">{row.name}</td>
                            <td className="py-1 text-slate-500">{row.type}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleConfirmUpload}
                  disabled={uploading || uploadPreview.validCount === 0}
                  className="w-full rounded-lg bg-emerald-600 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50"
                >
                  {uploading
                    ? "Importing Calendar..."
                    : `Confirm & Import ${uploadPreview.validCount} Holidays`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
