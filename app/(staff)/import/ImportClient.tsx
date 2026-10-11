"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";

interface LibraryOption {
  id: number;
  code: string;
  name: string;
}

interface CategoryOption {
  id: number;
  code: string;
  name: string;
  patronType: string;
}

interface ImportClientProps {
  canImportPatrons: boolean;
  canImportCatalog: boolean;
  csrfToken: string;
  libraries: LibraryOption[];
  categories: CategoryOption[];
}

export function ImportClient({
  canImportPatrons,
  canImportCatalog,
  csrfToken,
  libraries,
  categories,
}: ImportClientProps) {
  const [activeTab, setActiveTab] = useState<"students" | "faculty" | "catalog">(
    canImportPatrons ? "students" : "catalog",
  );
  const [stage, setStage] = useState<"upload" | "preview" | "result">("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [encoding, setEncoding] = useState<string>("auto");
  const [defaultLibraryId, setDefaultLibraryId] = useState<number>(libraries[0]?.id ?? 1);
  const [defaultCategoryId, setDefaultCategoryId] = useState<number>(
    categories.find((c) =>
      activeTab === "faculty" ? c.patronType === "FACULTY" : c.patronType === "STUDENT",
    )?.id ??
      categories[0]?.id ??
      1,
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // biome-ignore lint/suspicious/noExplicitAny: polymorphic preview data
  const [previewData, setPreviewData] = useState<any>(null);
  // biome-ignore lint/suspicious/noExplicitAny: polymorphic result data
  const [resultData, setResultData] = useState<any>(null);

  const handleTabChange = (tab: "students" | "faculty" | "catalog") => {
    setActiveTab(tab);
    setStage("upload");
    setSelectedFile(null);
    setPreviewData(null);
    setResultData(null);
    setError(null);

    // Update default category to match type
    const matchingCategory = categories.find((c) =>
      tab === "faculty"
        ? c.patronType === "FACULTY" || c.patronType === "STAFF"
        : c.patronType === "STUDENT",
    );
    if (matchingCategory) {
      setDefaultCategoryId(matchingCategory.id);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setError(null);
    }
  };

  const handleValidatePreview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setError("Please select a CSV file to validate.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("type", activeTab);
      formData.append("encoding", encoding);
      if (activeTab === "catalog") {
        formData.append("defaultLibraryId", String(defaultLibraryId));
      } else {
        formData.append("defaultCategoryId", String(defaultCategoryId));
      }

      const res = await fetch("/api/imports/preview", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to validate CSV file");
      }

      setPreviewData(data.preview);
      setStage("preview");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Validation failed");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!selectedFile || !previewData) return;

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("type", activeTab);
      formData.append("encoding", encoding);
      formData.append("csrfToken", csrfToken);
      if (activeTab === "catalog") {
        formData.append("defaultLibraryId", String(defaultLibraryId));
      } else {
        formData.append("defaultCategoryId", String(defaultCategoryId));
      }

      const res = await fetch("/api/imports/confirm", {
        method: "POST",
        headers: {
          "x-csrf-token": csrfToken,
        },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to confirm and commit import");
      }

      setResultData(data.result);
      setStage("result");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Import execution failed");
    } finally {
      setLoading(false);
    }
  };

  const resetAll = () => {
    setStage("upload");
    setSelectedFile(null);
    setPreviewData(null);
    setResultData(null);
    setError(null);
  };

  const csvSpecs = {
    students: {
      name: "Student Rosters",
      columns:
        "roll_no, first_name, last_name, card_no, gender, dob, institute, course, department, year, semester, mobile, email",
      sample:
        "230101, Rohan, Sharma, 230101, M, 15-08-2004, RBMI-ENG, BTECH-CS, CSE, 2, 4, 9876543210, rohan@example.com",
    },
    faculty: {
      name: "Faculty & Staff",
      columns:
        "employee_id, first_name, last_name, card_no, gender, dob, institute, department, category, mobile, email, joining_date",
      sample:
        "EMP-101, Dr. Priya, Verma, EMP-101, F, 22-04-1985, RBMI-ENG, CSE, FACULTY, 9812345678, priya@rbmi.in, 01-07-2020",
    },
    catalog: {
      name: "Book Titles & Copies",
      columns:
        "title, isbn, authors, publisher, pub_year, item_type, library, copies, accession_no, barcode, price, location",
      sample:
        "Computer Networks, 9780132126953, Andrew S. Tanenbaum, Pearson, 2021, BOOK, CL, 2, CL001|CL002, CL001|CL002, 850.00, Shelf A-1",
    },
  };

  const currentSpec = csvSpecs[activeTab];

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="error" title="Import Error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Navigation Tabs */}
      <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-xs flex space-x-2">
        {canImportPatrons && (
          <>
            <button
              type="button"
              onClick={() => handleTabChange("students")}
              className={`rounded-lg px-4 py-2 text-xs font-bold transition cursor-pointer ${
                activeTab === "students"
                  ? "bg-blue-900 text-white shadow-xs"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              🎓 Student Patrons
            </button>
            <button
              type="button"
              onClick={() => handleTabChange("faculty")}
              className={`rounded-lg px-4 py-2 text-xs font-bold transition cursor-pointer ${
                activeTab === "faculty"
                  ? "bg-blue-900 text-white shadow-xs"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              👔 Faculty &amp; Staff
            </button>
          </>
        )}

        {canImportCatalog && (
          <button
            type="button"
            onClick={() => handleTabChange("catalog")}
            className={`rounded-lg px-4 py-2 text-xs font-bold transition cursor-pointer ${
              activeTab === "catalog"
                ? "bg-blue-900 text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            📚 Catalogue &amp; Books
          </button>
        )}
      </div>

      {/* STAGE 1: UPLOAD & CONFIGURE */}
      {stage === "upload" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
            <h2 className="text-base font-bold text-slate-900">Upload {currentSpec.name} CSV</h2>
            <p className="text-xs text-slate-500 mb-6">
              Upload an RFC 4180 CSV file. The file will be validated in memory first with{" "}
              <strong>zero database writes</strong> before your confirmation.
            </p>

            <form onSubmit={handleValidatePreview} className="space-y-5 max-w-2xl">
              {/* Dropzone */}
              <div className="rounded-xl border-2 border-dashed border-slate-300 p-8 text-center hover:border-blue-500 transition bg-slate-50/50">
                <span className="text-3xl">📁</span>
                <div className="mt-3 text-xs text-slate-600">
                  <label
                    htmlFor="csv-file-upload"
                    className="cursor-pointer font-bold text-blue-900 hover:underline"
                  >
                    Choose a CSV file
                  </label>{" "}
                  or drag and drop
                </div>
                <input
                  id="csv-file-upload"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                {selectedFile ? (
                  <p className="mt-3 text-xs font-semibold text-emerald-700">
                    Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] text-slate-400">
                    Comma-separated values (.csv) only, up to 10MB (Patrons) / 20MB (Books)
                  </p>
                )}
              </div>

              {/* Options Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                {activeTab === "catalog" ? (
                  <div>
                    <label
                      htmlFor="default-library-select"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Default Library Branch
                    </label>
                    <select
                      id="default-library-select"
                      value={defaultLibraryId}
                      onChange={(e) => setDefaultLibraryId(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:border-blue-900 focus:outline-hidden"
                    >
                      {libraries.map((lib) => (
                        <option key={lib.id} value={lib.id}>
                          {lib.name} ({lib.code})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label
                      htmlFor="default-category-select"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Default Patron Category
                    </label>
                    <select
                      id="default-category-select"
                      value={defaultCategoryId}
                      onChange={(e) => setDefaultCategoryId(Number(e.target.value))}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:border-blue-900 focus:outline-hidden"
                    >
                      {categories
                        .filter((c) =>
                          activeTab === "faculty"
                            ? c.patronType === "FACULTY" || c.patronType === "STAFF"
                            : c.patronType === "STUDENT",
                        )
                        .map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name} ({cat.code})
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="encoding-select"
                    className="block text-xs font-semibold text-slate-700 mb-1"
                  >
                    Character Encoding
                  </label>
                  <select
                    id="encoding-select"
                    value={encoding}
                    onChange={(e) => setEncoding(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:border-blue-900 focus:outline-hidden"
                  >
                    <option value="auto">Auto-detect (UTF-8 / Windows-1252)</option>
                    <option value="utf-8">UTF-8 (Standard)</option>
                    <option value="windows-1252">Windows-1252 (Excel Legacy)</option>
                  </select>
                </div>
              </div>

              <div className="pt-3">
                <Button type="submit" variant="primary" disabled={!selectedFile || loading}>
                  {loading ? "Validating CSV..." : "Validate & Preview Rows"}
                </Button>
              </div>
            </form>
          </div>

          {/* Format Spec */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">
              Format Specifications: {currentSpec.name}
            </h3>
            <div className="mt-4 space-y-3">
              <div>
                <span className="text-xs font-semibold text-slate-700">Supported Headers:</span>
                <div className="mt-1 overflow-x-auto rounded bg-slate-900 p-3 font-mono text-xs text-emerald-400">
                  {currentSpec.columns}
                </div>
              </div>

              <div>
                <span className="text-xs font-semibold text-slate-700">Sample Row:</span>
                <div className="mt-1 overflow-x-auto rounded bg-slate-900 p-3 font-mono text-xs text-slate-300">
                  {currentSpec.sample}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STAGE 2: PREVIEW & CONFIRMATION */}
      {stage === "preview" && previewData && (
        <div className="space-y-6">
          {/* Summary Metric Banners */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Total Rows
              </span>
              <p className="text-2xl font-bold text-slate-900 mt-1">
                {previewData.summary.totalRows}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-xs">
              <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">
                Valid (OK)
              </span>
              <p className="text-2xl font-bold text-emerald-800 mt-1">
                {previewData.summary.okCount}
              </p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 shadow-xs">
              <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider">
                Warnings (WARN)
              </span>
              <p className="text-2xl font-bold text-amber-800 mt-1">
                {previewData.summary.warnCount}
              </p>
            </div>
            <div className="rounded-xl border border-red-200 bg-red-50/50 p-4 shadow-xs">
              <span className="text-xs font-semibold text-red-700 uppercase tracking-wider">
                Errors (Skipped)
              </span>
              <p className="text-2xl font-bold text-red-800 mt-1">
                {previewData.summary.errorCount}
              </p>
            </div>
          </div>

          {/* Action Bar */}
          <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-blue-900">
              <p className="font-bold">⚠️ Zero database writes have been made.</p>
              <p className="mt-0.5">
                Confirming will import <strong>{previewData.summary.validCount} valid rows</strong>.{" "}
                {previewData.summary.errorCount > 0 && (
                  <span>
                    The <strong>{previewData.summary.errorCount} error rows</strong> will be safely
                    skipped.
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center space-x-3 w-full sm:w-auto">
              <Button type="button" variant="outline" onClick={resetAll} disabled={loading}>
                Cancel &amp; Re-upload
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handleConfirmImport}
                disabled={previewData.summary.validCount === 0 || loading}
              >
                {loading
                  ? "Importing..."
                  : `Confirm & Import ${previewData.summary.validCount} Rows`}
              </Button>
            </div>
          </div>

          {/* Preview Table */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-800">
                Validation Preview ({previewData.fileName})
              </h3>
              <span className="text-xs text-slate-500">
                Displaying first {Math.min(previewData.rows.length, 50)} of{" "}
                {previewData.rows.length} rows
              </span>
            </div>

            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 text-slate-600 uppercase font-semibold sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4">#</th>
                    <th className="py-2.5 px-4">Status</th>
                    {activeTab === "catalog" ? (
                      <>
                        <th className="py-2.5 px-4">Action</th>
                        <th className="py-2.5 px-4">Title</th>
                        <th className="py-2.5 px-4">Authors / ISBN</th>
                        <th className="py-2.5 px-4">Copies</th>
                      </>
                    ) : (
                      <>
                        <th className="py-2.5 px-4">ID / Roll</th>
                        <th className="py-2.5 px-4">Card No</th>
                        <th className="py-2.5 px-4">Name</th>
                        <th className="py-2.5 px-4">Category</th>
                      </>
                    )}
                    <th className="py-2.5 px-4">Validation Messages</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewData.rows.slice(0, 50).map((row: any) => (
                    <tr
                      key={row.rowNumber}
                      className={`hover:bg-slate-50/80 ${
                        row.status === "ERROR"
                          ? "bg-red-50/30"
                          : row.status === "WARN"
                            ? "bg-amber-50/20"
                            : ""
                      }`}
                    >
                      <td className="py-2 px-4 font-mono text-slate-500">{row.rowNumber}</td>
                      <td className="py-2 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            row.status === "OK"
                              ? "bg-emerald-100 text-emerald-800"
                              : row.status === "WARN"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-red-100 text-red-800"
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>

                      {activeTab === "catalog" ? (
                        <>
                          <td className="py-2 px-4">
                            <span
                              className={`text-[11px] font-semibold ${
                                row.action === "NEW_TITLE" ? "text-blue-700" : "text-purple-700"
                              }`}
                            >
                              {row.action === "NEW_TITLE" ? "New Title" : "Add Copies"}
                            </span>
                          </td>
                          <td className="py-2 px-4 font-medium text-slate-900 max-w-[200px] truncate">
                            {row.data?.title || row.raw.title || "—"}
                          </td>
                          <td className="py-2 px-4 text-slate-600">
                            {row.data?.authors || row.raw.authors || "—"}
                            {row.data?.isbn && (
                              <span className="block text-[10px] text-slate-400 font-mono">
                                ISBN: {row.data.isbn}
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-4 font-mono font-bold text-slate-700">
                            {row.data?.copiesCount ?? row.raw.copies ?? 1}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-2 px-4 font-mono text-slate-800">
                            {row.data?.rollNo ||
                              row.data?.employeeId ||
                              row.raw.roll_no ||
                              row.raw.employee_id ||
                              "—"}
                          </td>
                          <td className="py-2 px-4 font-mono text-slate-800">
                            {row.data?.cardNo || row.raw.card_no || "—"}
                          </td>
                          <td className="py-2 px-4 font-medium text-slate-900">
                            {row.data?.firstName
                              ? `${row.data.firstName} ${row.data.lastName || ""}`
                              : row.raw.first_name || row.raw.name || "—"}
                          </td>
                          <td className="py-2 px-4 text-slate-600">
                            {row.data?.categoryCode || row.raw.category || "—"}
                          </td>
                        </>
                      )}

                      <td className="py-2 px-4">
                        {row.messages && row.messages.length > 0 ? (
                          <ul className="space-y-0.5 text-[11px]">
                            {row.messages.map((m: string) => (
                              <li
                                key={`row-${row.rowNumber}-msg-${m.slice(0, 30)}`}
                                className={
                                  row.status === "ERROR"
                                    ? "text-red-700 font-medium"
                                    : "text-amber-700"
                                }
                              >
                                • {m}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-emerald-700 text-[11px]">Valid</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* STAGE 3: RESULT DISPLAY */}
      {stage === "result" && resultData && (
        <div className="space-y-6">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-6 shadow-xs">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-3xl">🎉</span>
                <h2 className="text-lg font-bold text-emerald-950 mt-2">
                  Import Completed Successfully
                </h2>
                <p className="text-xs text-emerald-800 mt-1">
                  Batch #{resultData.batchId} processed from <strong>{resultData.fileName}</strong>.
                </p>
              </div>
              <Button type="button" variant="outline" onClick={resetAll}>
                Import Another File
              </Button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
              <div className="bg-white rounded-lg p-3 border border-emerald-200">
                <span className="text-[11px] font-semibold text-slate-500 uppercase">
                  Total Rows
                </span>
                <p className="text-xl font-bold text-slate-900 mt-0.5">{resultData.totalRows}</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-emerald-200">
                <span className="text-[11px] font-semibold text-emerald-700 uppercase">
                  Imported
                </span>
                <p className="text-xl font-bold text-emerald-700 mt-0.5">
                  {resultData.importedCount}
                </p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-emerald-200">
                <span className="text-[11px] font-semibold text-slate-500 uppercase">Skipped</span>
                <p className="text-xl font-bold text-slate-700 mt-0.5">{resultData.skippedCount}</p>
              </div>
              {resultData.totalCopiesAdded !== undefined && (
                <div className="bg-white rounded-lg p-3 border border-emerald-200">
                  <span className="text-[11px] font-semibold text-blue-700 uppercase">
                    Total Copies
                  </span>
                  <p className="text-xl font-bold text-blue-800 mt-0.5">
                    {resultData.totalCopiesAdded}
                  </p>
                </div>
              )}
            </div>

            {/* Print Shortcuts */}
            <div className="mt-6 pt-6 border-t border-emerald-200 flex flex-wrap gap-3 items-center">
              {resultData.labelPrintUrl && (
                <Link
                  href={resultData.labelPrintUrl}
                  target="_blank"
                  className="rounded-lg bg-blue-900 px-4 py-2 text-xs font-bold text-white hover:bg-blue-800 transition inline-flex items-center space-x-1.5"
                >
                  <span>🏷️</span>
                  <span>Print Barcode Labels for Imported Copies</span>
                </Link>
              )}
              {resultData.printCardsUrl && (
                <Link
                  href={resultData.printCardsUrl}
                  target="_blank"
                  className="rounded-lg bg-indigo-900 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-800 transition inline-flex items-center space-x-1.5"
                >
                  <span>💳</span>
                  <span>Print Library Cards for Imported Patrons</span>
                </Link>
              )}
            </div>
          </div>

          {/* Book Accessions Summary */}
          {resultData.titles && resultData.titles.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900 mb-4">
                Imported Bibliographic Titles &amp; Accession Ranges
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">Title</th>
                      <th className="py-2 px-3">Action</th>
                      <th className="py-2 px-3">Copies Added</th>
                      <th className="py-2 px-3">Accession Range</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {resultData.titles.map((t: any) => (
                      <tr
                        key={`imported-title-${t.bibId || t.title}-${t.accessionRange || t.copiesAdded}`}
                        className="hover:bg-slate-50"
                      >
                        <td className="py-2 px-3 font-medium text-slate-900">{t.title}</td>
                        <td className="py-2 px-3 font-semibold text-blue-700">{t.action}</td>
                        <td className="py-2 px-3 font-mono font-bold">{t.copiesAdded}</td>
                        <td className="py-2 px-3 font-mono text-emerald-800 font-semibold">
                          {t.accessionRange || "None"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Skipped Rows Ledger */}
          {resultData.skippedRows && resultData.skippedRows.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-white p-6 shadow-xs">
              <h3 className="text-sm font-bold text-red-900 mb-3">
                Skipped Rows Ledger ({resultData.skippedRows.length})
              </h3>
              <ul className="divide-y divide-red-100 text-xs">
                {resultData.skippedRows.map((s: any) => (
                  <li
                    key={`skipped-row-${s.rowNumber}-${s.reason.slice(0, 30)}`}
                    className="py-2 flex justify-between"
                  >
                    <span className="font-mono text-slate-600">Row #{s.rowNumber}</span>
                    <span className="text-red-700 font-medium">{s.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
