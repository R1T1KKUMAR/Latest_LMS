"use client";

import { useMemo, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { downloadXlsxTemplate } from "@/lib/downloadTemplate";
import { DEFAULT_FORMATS, type ImportColumnDef, type ImportType } from "@/types/import-format";

interface ImportFormatManagerClientProps {
  csrfToken: string;
  initialStudentColumns: ImportColumnDef[];
  initialFacultyColumns: ImportColumnDef[];
  initialCatalogColumns: ImportColumnDef[];
}

interface DeleteCandidate {
  column: ImportColumnDef;
  count: number;
  hasData: boolean;
}

export function ImportFormatManagerClient({
  csrfToken,
  initialStudentColumns,
  initialFacultyColumns,
  initialCatalogColumns,
}: ImportFormatManagerClientProps) {
  const [activeTab, setActiveTab] = useState<ImportType>("STUDENT");

  // State per tab
  const [columnsByType, setColumnsByType] = useState<Record<ImportType, ImportColumnDef[]>>({
    STUDENT: initialStudentColumns,
    FACULTY: initialFacultyColumns,
    CATALOGUE: initialCatalogColumns,
  });

  const [saving, setSaving] = useState(false);
  const [checkingDelete, setCheckingDelete] = useState<string | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<DeleteCandidate | null>(null);
  const [alertInfo, setAlertInfo] = useState<{
    variant: "success" | "error" | "warning" | "info";
    title: string;
    message: string;
  } | null>(null);

  const activeColumns = columnsByType[activeTab];
  const defaultColumns = DEFAULT_FORMATS[activeTab];

  // Detect which default attributes are currently missing / removed
  const missingAttributes = useMemo(() => {
    const presentDbFields = new Set(activeColumns.map((c) => c.dbField));
    return defaultColumns.filter((def) => !presentDbFields.has(def.dbField));
  }, [activeColumns, defaultColumns]);

  const handleHeaderChange = (index: number, newHeader: string) => {
    const sanitized = newHeader.toLowerCase().replace(/[^a-z0-9_]/g, "_");
    setColumnsByType((prev) => {
      const updated = [...prev[activeTab]];
      updated[index] = {
        ...updated[index],
        csvHeader: sanitized,
      };
      return { ...prev, [activeTab]: updated };
    });
  };

  const handleMove = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= activeColumns.length) return;

    setColumnsByType((prev) => {
      const updated = [...prev[activeTab]];
      const temp = updated[index];
      updated[index] = updated[targetIndex];
      updated[targetIndex] = temp;
      return { ...prev, [activeTab]: updated };
    });
  };

  const handleInitiateDelete = async (column: ImportColumnDef) => {
    if (column.required) return;

    setCheckingDelete(column.dbField);
    try {
      const res = await fetch(
        `/api/admin/import-format/check-data?type=${activeTab}&dbField=${encodeURIComponent(
          column.dbField,
        )}`,
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to inspect database records for column.");
      }

      setDeleteCandidate({
        column,
        count: data.count,
        hasData: data.hasData,
      });
    } catch (err: unknown) {
      setAlertInfo({
        variant: "error",
        title: "Database Inspection Failed",
        message: err instanceof Error ? err.message : "Failed to verify database dependencies.",
      });
    } finally {
      setCheckingDelete(null);
    }
  };

  const handleConfirmDelete = () => {
    if (!deleteCandidate) return;
    const targetDbField = deleteCandidate.column.dbField;

    setColumnsByType((prev) => ({
      ...prev,
      [activeTab]: prev[activeTab].filter((c) => c.dbField !== targetDbField),
    }));

    setAlertInfo({
      variant: "info",
      title: "Column Removed from Format",
      message: `Attribute "${deleteCandidate.column.label}" (${deleteCandidate.column.csvHeader}) was removed. Click "Save Format" to persist your changes.`,
    });

    setDeleteCandidate(null);
  };

  const handleAddAttribute = (dbField: string) => {
    const def = defaultColumns.find((d) => d.dbField === dbField);
    if (!def) return;

    setColumnsByType((prev) => ({
      ...prev,
      [activeTab]: [...prev[activeTab], { ...def }],
    }));

    setAlertInfo({
      variant: "info",
      title: "Attribute Added",
      message: `Added "${def.label}" (${def.csvHeader}) back to the format specification.`,
    });
  };

  const handleSaveFormat = async () => {
    setSaving(true);
    setAlertInfo(null);

    try {
      const res = await fetch("/api/admin/import-format", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          type: activeTab,
          columns: activeColumns,
          csrfToken,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to save import format");
      }

      setColumnsByType((prev) => ({
        ...prev,
        [activeTab]: data.columns,
      }));

      setAlertInfo({
        variant: "success",
        title: "Format Updated Successfully",
        message: `Saved ${activeTab.toLowerCase()} bulk import format (${data.columns.length} columns). Changes reflect immediately across templates and imports.`,
      });
    } catch (err: unknown) {
      setAlertInfo({
        variant: "error",
        title: "Save Failed",
        message: err instanceof Error ? err.message : "An error occurred while saving the format.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = async () => {
    if (
      !window.confirm(`Are you sure you want to reset the ${activeTab} format back to default?`)
    ) {
      return;
    }

    setSaving(true);
    setAlertInfo(null);

    try {
      const res = await fetch("/api/admin/import-format", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          type: activeTab,
          action: "reset",
          csrfToken,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to reset format");
      }

      setColumnsByType((prev) => ({
        ...prev,
        [activeTab]: data.columns,
      }));

      setAlertInfo({
        variant: "success",
        title: "Format Reset",
        message: `Reset ${activeTab.toLowerCase()} format to institutional defaults.`,
      });
    } catch (err: unknown) {
      setAlertInfo({
        variant: "error",
        title: "Reset Failed",
        message: err instanceof Error ? err.message : "Failed to reset format.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadTestTemplate = () => {
    const headers = activeColumns.map((c) => c.csvHeader);
    const sample = activeColumns.map((c) => c.sampleValue || "-");
    const fileName =
      activeTab === "STUDENT"
        ? "student_import_custom_format"
        : activeTab === "FACULTY"
          ? "faculty_import_custom_format"
          : "books_import_custom_format";

    downloadXlsxTemplate({
      headers,
      sample,
      fileName,
    });
  };

  return (
    <div className="space-y-6">
      {alertInfo && (
        <Alert
          variant={alertInfo.variant}
          title={alertInfo.title}
          onDismiss={() => setAlertInfo(null)}
        >
          {alertInfo.message}
        </Alert>
      )}

      {/* Tabs */}
      <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-xs flex space-x-2">
        <button
          type="button"
          onClick={() => {
            setActiveTab("STUDENT");
            setAlertInfo(null);
          }}
          className={`rounded-lg px-4 py-2 text-xs font-bold transition cursor-pointer ${
            activeTab === "STUDENT"
              ? "bg-blue-900 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          🎓 Student Patrons
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab("FACULTY");
            setAlertInfo(null);
          }}
          className={`rounded-lg px-4 py-2 text-xs font-bold transition cursor-pointer ${
            activeTab === "FACULTY"
              ? "bg-blue-900 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          👔 Faculty &amp; Staff
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab("CATALOGUE");
            setAlertInfo(null);
          }}
          className={`rounded-lg px-4 py-2 text-xs font-bold transition cursor-pointer ${
            activeTab === "CATALOGUE"
              ? "bg-blue-900 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          📚 Books &amp; Catalogue
        </button>
      </div>

      {/* Main Editor Card */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        {/* Card Header & Controls */}
        <div className="border-b border-slate-200 bg-slate-50/75 px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-slate-800">
              {activeTab === "STUDENT"
                ? "Student Roster Import Format"
                : activeTab === "FACULTY"
                  ? "Faculty & Staff Import Format"
                  : "Bibliographic Catalogue & Copies Import Format"}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Configure {activeColumns.length} active columns. Update CSV header names, delete
              optional attributes, or restore columns.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Add Missing Attribute Dropdown */}
            {missingAttributes.length > 0 && (
              <select
                aria-label="Add optional attribute to import format"
                onChange={(e) => {
                  if (e.target.value) {
                    handleAddAttribute(e.target.value);
                    e.target.value = "";
                  }
                }}
                defaultValue=""
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:border-slate-400 focus:outline-hidden"
              >
                <option value="" disabled>
                  + Add Removed Attribute ({missingAttributes.length})
                </option>
                {missingAttributes.map((m) => (
                  <option key={m.dbField} value={m.dbField}>
                    {m.label} ({m.csvHeader})
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              onClick={handleResetDefaults}
              disabled={saving}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition cursor-pointer"
            >
              Restore Defaults
            </button>

            <Button type="button" variant="primary" onClick={handleSaveFormat} disabled={saving}>
              {saving ? "Saving..." : "Save Format Changes"}
            </Button>
          </div>
        </div>

        {/* Columns Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 text-center w-12">#</th>
                <th className="px-6 py-3">CSV Column Header</th>
                <th className="px-6 py-3">Target DB Field</th>
                <th className="px-6 py-3">Display Label &amp; Guide</th>
                <th className="px-4 py-3 text-center">Type</th>
                <th className="px-4 py-3 text-center">Order</th>
                <th className="px-4 py-3 text-center w-24">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeColumns.map((col, idx) => (
                <tr key={col.dbField} className="hover:bg-slate-50/50 transition">
                  {/* Row Index */}
                  <td className="px-4 py-3.5 text-center text-xs font-mono text-slate-400">
                    {idx + 1}
                  </td>

                  {/* CSV Header Input */}
                  <td className="px-6 py-3.5">
                    <div className="flex flex-col">
                      <input
                        type="text"
                        value={col.csvHeader}
                        onChange={(e) => handleHeaderChange(idx, e.target.value)}
                        placeholder="header_name"
                        aria-label={`CSV column header for ${col.label || col.dbField}`}
                        className="w-48 sm:w-56 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs font-semibold text-blue-950 focus:border-blue-900 focus:outline-hidden focus:ring-1 focus:ring-blue-900 shadow-xs"
                      />
                      <span className="mt-1 text-[10px] text-slate-400 font-mono">
                        expected in CSV / Excel
                      </span>
                    </div>
                  </td>

                  {/* Internal DB Field */}
                  <td className="px-6 py-3.5">
                    <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 font-mono text-xs font-medium text-slate-700">
                      {col.dbField}
                    </span>
                  </td>

                  {/* Human Label & Description */}
                  <td className="px-6 py-3.5">
                    <div className="font-semibold text-xs text-slate-900">{col.label}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {col.description || "—"}
                    </div>
                  </td>

                  {/* Requirement Badge */}
                  <td className="px-4 py-3.5 text-center">
                    {col.required ? (
                      <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 uppercase tracking-wide">
                        Required
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600 uppercase tracking-wide">
                        Optional
                      </span>
                    )}
                  </td>

                  {/* Reorder Buttons */}
                  <td className="px-4 py-3.5 text-center">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleMove(idx, "up")}
                        disabled={idx === 0}
                        title="Move Up"
                        className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-800 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMove(idx, "down")}
                        disabled={idx === activeColumns.length - 1}
                        title="Move Down"
                        className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-800 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                      >
                        ▼
                      </button>
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3.5 text-center">
                    {col.required ? (
                      <span
                        title="Mandatory database attributes cannot be deleted"
                        className="text-slate-300 text-xs cursor-not-allowed"
                      >
                        Locked
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleInitiateDelete(col)}
                        disabled={checkingDelete === col.dbField}
                        title={`Remove "${col.label}" from import format`}
                        className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50 p-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 transition cursor-pointer"
                      >
                        {checkingDelete === col.dbField ? (
                          <span className="animate-spin text-xs">⏳</span>
                        ) : (
                          <span>🗑️</span>
                        )}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live Template Preview Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">
              Live Spreadsheet Template Preview
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Reflects exact headers and sample data users will download from the Bulk Import
              section.
            </p>
          </div>
          <button
            type="button"
            onClick={handleDownloadTestTemplate}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-600 bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition cursor-pointer shrink-0"
          >
            <span>⬇️</span>
            <span>Download Test Excel Template (.xlsx)</span>
          </button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-900 text-emerald-400 font-bold border-b border-slate-800">
              <tr>
                {activeColumns.map((c) => (
                  <th key={c.dbField} className="px-4 py-2.5 whitespace-nowrap">
                    {c.csvHeader}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-slate-50 text-slate-700">
              <tr>
                {activeColumns.map((c) => (
                  <td
                    key={c.dbField}
                    className="px-4 py-2 whitespace-nowrap border-r border-slate-200 last:border-r-0"
                  >
                    {c.sampleValue || "-"}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Database Warning Modal */}
      {deleteCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{deleteCandidate.hasData ? "⚠️" : "🗑️"}</span>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {deleteCandidate.hasData
                    ? "Warning: Existing Database Records Detected"
                    : "Confirm Column Removal"}
                </h3>
                <p className="text-xs text-slate-500">
                  Target Attribute: <strong>{deleteCandidate.column.label}</strong> (
                  <code className="text-blue-900 font-mono">{deleteCandidate.column.dbField}</code>)
                </p>
              </div>
            </div>

            {deleteCandidate.hasData ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 space-y-2">
                <p className="font-semibold">
                  The database currently contains{" "}
                  <span className="underline font-bold text-amber-950">
                    {deleteCandidate.count.toLocaleString()} active record(s)
                  </span>{" "}
                  with non-empty data in this column.
                </p>
                <ul className="list-disc list-inside space-y-1 text-amber-800 text-[11px]">
                  <li>
                    Removing this column from the CSV format means future bulk imports will{" "}
                    <strong>not populate</strong> this attribute.
                  </li>
                  <li>
                    Existing database records will <strong>NOT be deleted</strong>; their data is
                    safe.
                  </li>
                  <li>
                    The column can be re-added to the format specification anytime from the
                    dropdown.
                  </li>
                </ul>
              </div>
            ) : (
              <p className="text-xs text-slate-600">
                No active records with data were found for this attribute in the database. Are you
                sure you want to remove <strong>{deleteCandidate.column.label}</strong> from future
                imports?
              </p>
            )}

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteCandidate(null)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 transition cursor-pointer"
              >
                Yes, Remove Attribute from Format
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
