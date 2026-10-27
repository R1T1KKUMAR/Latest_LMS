"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/Table";
import { formatDate } from "@/lib/utils";
import type { ImportBatchListItem } from "@/services/batch-import-management";

export interface PatronSearchItem {
  id: number;
  cardNo: string;
  fullName: string;
  patronType: string;
  employeeId?: string | null;
  email?: string | null;
  mobile?: string | null;
  status: string;
  importBatchId?: number | null;
  categoryName?: string;
  departmentName?: string | null;
  courseName?: string | null;
  createdAt: string;
}

interface BatchManagementClientProps {
  initialBatches: ImportBatchListItem[];
  initialPatrons: PatronSearchItem[];
  csrfToken: string;
  canManageBatches: boolean;
  canManagePatrons: boolean;
}

export function BatchManagementClient({
  initialBatches,
  initialPatrons,
  csrfToken,
  canManageBatches,
  canManagePatrons,
}: BatchManagementClientProps) {
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<"batches" | "patrons" | "books">("batches");
  const [batches, setBatches] = useState<ImportBatchListItem[]>(initialBatches);
  const [patrons, setPatrons] = useState<PatronSearchItem[]>(initialPatrons);

  // Search & Filter for Patrons
  const [patronSearch, setPatronSearch] = useState("");
  const [patronTypeFilter, setPatronTypeFilter] = useState("ALL");

  // Alert
  const [alert, setAlert] = useState<{
    variant: "info" | "success" | "warning" | "error";
    message: string;
  } | null>(null);

  // Batch Delete Modal
  const [deleteBatchModal, setDeleteBatchModal] = useState<{
    open: boolean;
    batch: ImportBatchListItem;
    force: boolean;
  } | null>(null);
  const [isDeletingBatch, setIsDeletingBatch] = useState(false);

  // Individual Patron Delete Modal
  const [deletePatronModal, setDeletePatronModal] = useState<{
    open: boolean;
    patron: PatronSearchItem;
    force: boolean;
  } | null>(null);
  const [isDeletingPatron, setIsDeletingPatron] = useState(false);

  // Filtered patrons list
  const filteredPatrons = useMemo(() => {
    return patrons.filter((p) => {
      if (patronTypeFilter !== "ALL" && p.patronType !== patronTypeFilter) {
        return false;
      }
      if (!patronSearch.trim()) return true;
      const term = patronSearch.trim().toLowerCase();
      return (
        p.fullName.toLowerCase().includes(term) ||
        p.cardNo.toLowerCase().includes(term) ||
        p.employeeId?.toLowerCase().includes(term) ||
        p.email?.toLowerCase().includes(term) ||
        p.mobile?.includes(term)
      );
    });
  }, [patrons, patronSearch, patronTypeFilter]);

  // Execute Batch Deletion / Rollback
  const handleConfirmBatchDelete = async () => {
    if (!deleteBatchModal) return;
    setIsDeletingBatch(true);
    setAlert(null);

    try {
      const url = `/api/admin/batches/${deleteBatchModal.batch.id}${deleteBatchModal.force ? "?force=true" : ""}`;
      const res = await fetch(url, {
        method: "DELETE",
        headers: {
          "x-csrf-token": csrfToken,
        },
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to rollback and delete batch");
      }

      setAlert({
        variant: "success",
        message: data.message || `Batch #${deleteBatchModal.batch.id} rolled back successfully.`,
      });

      // Update local batches state
      setBatches((prev) => prev.filter((b) => b.id !== deleteBatchModal.batch.id));
      // Remove any patrons belonging to this batch
      setPatrons((prev) => prev.filter((p) => p.importBatchId !== deleteBatchModal.batch.id));

      setDeleteBatchModal(null);
      router.refresh();
    } catch (err: unknown) {
      setAlert({
        variant: "error",
        message: err instanceof Error ? err.message : "Failed to delete batch",
      });
    } finally {
      setIsDeletingBatch(false);
    }
  };

  // Execute Individual Patron Deletion
  const handleConfirmPatronDelete = async () => {
    if (!deletePatronModal) return;
    setIsDeletingPatron(true);
    setAlert(null);

    try {
      const url = `/api/patrons/${deletePatronModal.patron.id}${deletePatronModal.force ? "?force=true" : ""}`;
      const res = await fetch(url, {
        method: "DELETE",
        headers: {
          "x-csrf-token": csrfToken,
        },
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to delete patron");
      }

      setAlert({
        variant: "success",
        message:
          data.message || `Patron "${deletePatronModal.patron.fullName}" deleted successfully.`,
      });

      // Update local patrons state
      setPatrons((prev) => prev.filter((p) => p.id !== deletePatronModal.patron.id));
      setDeletePatronModal(null);
      router.refresh();
    } catch (err: unknown) {
      setAlert({
        variant: "error",
        message: err instanceof Error ? err.message : "Failed to delete patron",
      });
    } finally {
      setIsDeletingPatron(false);
    }
  };

  return (
    <div className="space-y-6">
      {alert && (
        <Alert variant={alert.variant} onDismiss={() => setAlert(null)}>
          {alert.message}
        </Alert>
      )}

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="flex space-x-6 text-sm font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab("batches")}
            className={`pb-3 border-b-2 transition ${
              activeTab === "batches"
                ? "border-blue-900 text-blue-900"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            📁 Uploaded CSV Files ({batches.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("patrons")}
            className={`pb-3 border-b-2 transition ${
              activeTab === "patrons"
                ? "border-blue-900 text-blue-900"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            👤 Delete Particular Student / Faculty ({patrons.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("books")}
            className={`pb-3 border-b-2 transition ${
              activeTab === "books"
                ? "border-blue-900 text-blue-900"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            📚 Books &amp; Catalogue Deletion
          </button>
        </nav>
      </div>

      {/* TAB 1: UPLOADED CSV BATCHES */}
      {activeTab === "batches" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Uploaded CSV Files &amp; Import Batches
              </h3>
              <p className="text-xs text-slate-500">
                Mistakenly uploaded CSV files can be rolled back here. Deleting a batch permanently
                removes all records generated by that upload.
              </p>
            </div>
            <Link href="/import">
              <Button variant="outline" size="sm">
                + Ingest New CSV File
              </Button>
            </Link>
          </div>

          {batches.length === 0 ? (
            <EmptyState
              title="No Import Batches Recorded"
              description="No CSV files have been imported or all existing batches have been deleted."
              action={{
                label: "Go to Bulk Import",
                href: "/import",
              }}
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Batch ID</TableHeaderCell>
                    <TableHeaderCell>File Name</TableHeaderCell>
                    <TableHeaderCell>Category / Type</TableHeaderCell>
                    <TableHeaderCell>Uploaded By</TableHeaderCell>
                    <TableHeaderCell>Upload Date</TableHeaderCell>
                    <TableHeaderCell>Rows Ingested</TableHeaderCell>
                    <TableHeaderCell>Active Records</TableHeaderCell>
                    <TableHeaderCell>Actions</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {batches.map((b) => {
                    const isStudent = b.importType === "STUDENT";
                    const isFaculty = b.importType === "FACULTY";
                    const _isCatalog = b.importType === "CATALOGUE";

                    return (
                      <TableRow key={b.id}>
                        <TableCell>
                          <span className="font-mono text-xs font-semibold text-slate-700">
                            #{b.id}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="text-base">📄</span>
                            <div>
                              <div className="font-semibold text-slate-900">{b.fileName}</div>
                              <div className="text-[11px] text-slate-400">
                                Total rows: {b.totalRows}{" "}
                                {b.skippedRows > 0 ? `(${b.skippedRows} skipped)` : ""}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                              isStudent
                                ? "bg-blue-100 text-blue-800"
                                : isFaculty
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-purple-100 text-purple-800"
                            }`}
                          >
                            {b.importType}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-slate-700">{b.importedByName}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-slate-600">{formatDate(b.createdAt)}</span>
                        </TableCell>
                        <TableCell>
                          <span className="font-semibold text-slate-900">
                            {b.importedRows.toLocaleString()}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-0.5">
                            <span className="font-semibold text-slate-800">
                              {b.currentActiveRecords.toLocaleString()} remaining
                            </span>
                            {b.hasActiveLoans && (
                              <div className="text-[11px] font-semibold text-amber-600">
                                ⚠️ {b.activeLoansCount} active issue(s)
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {canManageBatches ? (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() =>
                                setDeleteBatchModal({
                                  open: true,
                                  batch: b,
                                  force: false,
                                })
                              }
                              title="Delete all records from this uploaded CSV"
                            >
                              Rollback CSV
                            </Button>
                          ) : (
                            <span className="text-xs text-slate-400">Read-Only</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: DELETE PARTICULAR STUDENT / FACULTY */}
      {activeTab === "patrons" && (
        <div className="space-y-4">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Individual Member Record Management
              </h3>
              <p className="text-xs text-slate-500">
                Remove unnecessary test students or faculty members created during trial runs before
                adding actual patron lists.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <Input
                  id="patron-search"
                  placeholder="Search student by Name, Roll No, Card No, or Mobile..."
                  value={patronSearch}
                  onChange={(e) => setPatronSearch(e.target.value)}
                />
              </div>
              <div className="w-full sm:w-48">
                <select
                  aria-label="Filter by patron type"
                  value={patronTypeFilter}
                  onChange={(e) => setPatronTypeFilter(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                >
                  <option value="ALL">All Types</option>
                  <option value="STUDENT">Students</option>
                  <option value="FACULTY">Faculty</option>
                  <option value="STAFF">Staff</option>
                </select>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Card / ID</TableHeaderCell>
                  <TableHeaderCell>Name</TableHeaderCell>
                  <TableHeaderCell>Type</TableHeaderCell>
                  <TableHeaderCell>Employee ID</TableHeaderCell>
                  <TableHeaderCell>Course / Department</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>Actions</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredPatrons.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-slate-400">
                      No matching student or faculty records found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPatrons.map((p) => {
                    const isStudent = p.patronType === "STUDENT";
                    return (
                      <TableRow key={p.id}>
                        <TableCell>
                          <span className="font-mono text-xs font-bold text-blue-900">
                            {p.cardNo}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="font-semibold text-slate-900">{p.fullName}</div>
                          {p.email && <div className="text-[11px] text-slate-400">{p.email}</div>}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                              isStudent
                                ? "bg-blue-100 text-blue-800"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {p.patronType}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-xs text-slate-700">
                            {p.employeeId || "—"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs text-slate-800">
                            {p.courseName || p.departmentName || "—"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                              p.status === "ACTIVE"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {p.status}
                          </span>
                        </TableCell>
                        <TableCell>
                          {canManagePatrons ? (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() =>
                                setDeletePatronModal({
                                  open: true,
                                  patron: p,
                                  force: false,
                                })
                              }
                              title="Permanently remove this member record"
                            >
                              Delete Record
                            </Button>
                          ) : (
                            <span className="text-xs text-slate-400">Read-Only</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* TAB 3: BOOKS & CATALOGUE DELETION */}
      {activeTab === "books" && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <div className="flex items-start gap-4">
            <span className="text-3xl">📚</span>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900">
                Book Titles &amp; Physical Copies Removal
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed max-w-2xl">
                To delete individual book copies, specific accessions, or entire bibliographic
                titles that were added for testing or entered by mistake, use the Bibliographic
                Catalogue console. To remove an entire bulk catalogue upload at once, use the{" "}
                <strong>Uploaded CSV Files</strong> tab.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-4 space-y-2">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Individual Books &amp; Copies
              </h4>
              <p className="text-xs text-slate-600">
                Search physical copies by accession number or barcode, and delete individual book
                records with live validation checks.
              </p>
              <div className="pt-2">
                <Link href="/catalogue">
                  <Button variant="primary" size="sm">
                    Open Catalogue Console &rarr;
                  </Button>
                </Link>
              </div>
            </div>

            <div className="rounded-lg border border-slate-100 bg-slate-50 p-4 space-y-2">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Bulk Uploaded Book Batches
              </h4>
              <p className="text-xs text-slate-600">
                If a book CSV file was incorrectly uploaded, switch to the Uploaded CSV Files tab to
                rollback the entire batch in one step.
              </p>
              <div className="pt-2">
                <Button variant="outline" size="sm" onClick={() => setActiveTab("batches")}>
                  View Uploaded CSV Batches &rarr;
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DELETE / ROLLBACK CSV BATCH */}
      {deleteBatchModal?.open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-batch-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 text-xl font-bold">
                ⚠️
              </span>
              <div>
                <h3 id="delete-batch-modal-title" className="text-base font-bold text-slate-900">
                  Rollback Uploaded CSV Batch #{deleteBatchModal.batch.id}
                </h3>
                <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                  Are you sure you want to permanently delete uploaded file{" "}
                  <strong className="text-slate-900">{deleteBatchModal.batch.fileName}</strong>?
                </p>
              </div>
            </div>

            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-2 text-xs">
              <div className="grid grid-cols-2 gap-2 text-slate-700">
                <div>
                  <span className="text-slate-500">Import Type:</span>{" "}
                  <strong>{deleteBatchModal.batch.importType}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Total Rows:</span>{" "}
                  <strong>{deleteBatchModal.batch.totalRows}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Active Records to Remove:</span>{" "}
                  <strong className="text-red-700">
                    {deleteBatchModal.batch.currentActiveRecords}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">Active Issued Books:</span>{" "}
                  <strong>{deleteBatchModal.batch.activeLoansCount}</strong>
                </div>
              </div>
            </div>

            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 space-y-1.5">
              <p className="font-semibold text-amber-900">Irreversible Deletion</p>
              <p>
                This will purge all {deleteBatchModal.batch.importType.toLowerCase()} records
                created from this file.
              </p>
              <label className="flex items-center gap-2 pt-1 font-medium text-amber-950 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteBatchModal.force}
                  onChange={(e) =>
                    setDeleteBatchModal({
                      ...deleteBatchModal,
                      force: e.target.checked,
                    })
                  }
                  className="rounded border-amber-400 text-red-600 focus:ring-red-500"
                />
                Force deletion if test data (releases any borrowed items back to library)
              </label>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <Button
                variant="outline"
                onClick={() => setDeleteBatchModal(null)}
                disabled={isDeletingBatch}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleConfirmBatchDelete}
                isLoading={isDeletingBatch}
              >
                Yes, Rollback &amp; Delete CSV
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DELETE INDIVIDUAL PATRON */}
      {deletePatronModal?.open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-patron-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 text-lg font-bold">
                ⚠️
              </span>
              <div>
                <h3 id="delete-patron-modal-title" className="text-base font-bold text-slate-900">
                  Delete {deletePatronModal.patron.patronType === "STUDENT" ? "Student" : "Member"}{" "}
                  Record
                </h3>
                <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                  Are you sure you want to permanently delete{" "}
                  <strong className="text-slate-900">{deletePatronModal.patron.fullName}</strong>{" "}
                  (Card:{" "}
                  <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">
                    {deletePatronModal.patron.cardNo}
                  </code>
                  {deletePatronModal.patron.employeeId
                    ? `, Emp ID: ${deletePatronModal.patron.employeeId}`
                    : ""}
                  )?
                </p>
              </div>
            </div>

            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 space-y-1.5">
              <p className="font-semibold text-amber-900">Irreversible Action</p>
              <p>
                This removes the member profile, credentials, and circulation records from the
                database.
              </p>
              <label className="flex items-center gap-2 pt-1 font-medium text-amber-950 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deletePatronModal.force}
                  onChange={(e) =>
                    setDeletePatronModal({
                      ...deletePatronModal,
                      force: e.target.checked,
                    })
                  }
                  className="rounded border-amber-400 text-red-600 focus:ring-red-500"
                />
                Force deletion if test data (releases any borrowed items back to library)
              </label>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <Button
                variant="outline"
                onClick={() => setDeletePatronModal(null)}
                disabled={isDeletingPatron}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleConfirmPatronDelete}
                isLoading={isDeletingPatron}
              >
                Yes, Delete Record
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
