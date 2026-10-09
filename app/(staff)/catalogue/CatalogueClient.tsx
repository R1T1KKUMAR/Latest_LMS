"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/Table";
import { generateCode128Svg } from "@/lib/barcode";
import { ITEM_STATUSES, type ItemStatus } from "@/lib/validations/catalogue";

export interface CatalogueTitleItem {
  id: number;
  title: string;
  subtitle: string | null;
  authors: string;
  isbn: string | null;
  edition: string | null;
  pubYear: number | null;
  callNumber: string | null;
  itemTypeId: number;
  itemTypeName: string;
  totalCopies: number;
  availableCopies: number;
}

export interface MasterOption {
  id: number;
  name: string;
  code: string;
}

export interface CopyDetail {
  id: number;
  accessionNo: string;
  barcode: string;
  status: string;
  location: string | null;
  price: string;
  libraryName: string;
}

interface CatalogueClientProps {
  initialTitles: CatalogueTitleItem[];
  itemTypes: MasterOption[];
  departments: MasterOption[];
  libraries: MasterOption[];
  csrfToken: string;
  canManage: boolean;
}

export function CatalogueClient({
  initialTitles,
  itemTypes,
  departments,
  libraries,
  csrfToken,
  canManage,
}: CatalogueClientProps) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTypeFilter, setSelectedTypeFilter] = useState("");
  const [actionAlert, setActionAlert] = useState<{
    variant: "info" | "success" | "warning" | "error";
    message: string;
  } | null>(null);

  // Add Title Modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSubmittingTitle, setIsSubmittingTitle] = useState(false);
  const [newTitle, setNewTitle] = useState({
    title: "",
    subtitle: "",
    authors: "",
    isbn: "",
    edition: "",
    publisher: "",
    pubYear: "",
    itemTypeId: itemTypes[0]?.id ? String(itemTypes[0].id) : "1",
    departmentId: "",
    callNumber: "",
    price: "",
  });

  // Title Details & Copies Drawer state
  const [selectedBibId, setSelectedBibId] = useState<number | null>(null);
  const [bibDetail, setBibDetail] = useState<{
    title: CatalogueTitleItem;
    copies: CopyDetail[];
  } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Add Copies state
  const [showAddCopies, setShowAddCopies] = useState(false);
  const [isSubmittingCopies, setIsSubmittingCopies] = useState(false);
  const [copyForm, setCopyForm] = useState({
    libraryId: libraries[0]?.id ? String(libraries[0].id) : "1",
    count: 1,
    location: "",
    price: "",
  });

  // Barcode Preview Modal
  const [barcodePreview, setBarcodePreview] = useState<{
    accessionNo: string;
    title: string;
  } | null>(null);

  const filtered = initialTitles.filter((t) => {
    if (selectedTypeFilter && String(t.itemTypeId) !== selectedTypeFilter) {
      return false;
    }
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return (
      t.title.toLowerCase().includes(q) ||
      t.authors.toLowerCase().includes(q) ||
      (t.isbn && t.isbn.includes(q)) ||
      (t.callNumber && t.callNumber.toLowerCase().includes(q))
    );
  });

  const handleCreateTitle = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingTitle(true);
    setActionAlert(null);

    try {
      const res = await fetch("/api/catalogue/titles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          title: newTitle.title,
          subtitle: newTitle.subtitle || undefined,
          authors: newTitle.authors,
          isbn: newTitle.isbn || undefined,
          edition: newTitle.edition || undefined,
          publisher: newTitle.publisher || undefined,
          pubYear: newTitle.pubYear ? Number(newTitle.pubYear) : undefined,
          itemTypeId: Number(newTitle.itemTypeId),
          departmentId: newTitle.departmentId ? Number(newTitle.departmentId) : undefined,
          callNumber: newTitle.callNumber || undefined,
          price: newTitle.price ? Number(newTitle.price) : undefined,
          csrfToken,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setActionAlert({ variant: "error", message: data.error || "Failed to create title" });
      } else {
        setActionAlert({
          variant: "success",
          message: `Title "${data.title.title}" created successfully!`,
        });
        setShowAddModal(false);
        setNewTitle({
          title: "",
          subtitle: "",
          authors: "",
          isbn: "",
          edition: "",
          publisher: "",
          pubYear: "",
          itemTypeId: itemTypes[0]?.id ? String(itemTypes[0].id) : "1",
          departmentId: "",
          callNumber: "",
          price: "",
        });
        router.refresh();
      }
    } catch {
      setActionAlert({ variant: "error", message: "Network error occurred creating title" });
    } finally {
      setIsSubmittingTitle(false);
    }
  };

  const handleViewDetails = async (bibId: number) => {
    setSelectedBibId(bibId);
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/catalogue/titles/${bibId}`);
      const data = await res.json();
      if (res.ok && data.title) {
        setBibDetail({
          title: data.title,
          copies: data.title.copies || [],
        });
      }
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleAddCopies = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBibId) return;
    setIsSubmittingCopies(true);
    try {
      const res = await fetch(`/api/catalogue/titles/${selectedBibId}/copies`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          libraryId: Number(copyForm.libraryId),
          count: Number(copyForm.count),
          location: copyForm.location || undefined,
          price: copyForm.price ? Number(copyForm.price) : undefined,
          csrfToken,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to add copies");
      } else {
        setShowAddCopies(false);
        setActionAlert({
          variant: "success",
          message: `Successfully added ${data.copies.length} copies! (Accession numbers: ${data.copies[0]?.accessionNo}..${data.copies[data.copies.length - 1]?.accessionNo})`,
        });
        handleViewDetails(selectedBibId);
        router.refresh();
      }
    } finally {
      setIsSubmittingCopies(false);
    }
  };

  const handleUpdateCopyStatus = async (copyId: number, status: ItemStatus) => {
    try {
      const res = await fetch(`/api/catalogue/copies/${copyId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({ status, csrfToken }),
      });
      if (res.ok && selectedBibId) {
        handleViewDetails(selectedBibId);
        router.refresh();
      }
    } catch {
      alert("Error updating copy status");
    }
  };

  return (
    <div className="space-y-6">
      {actionAlert && (
        <Alert variant={actionAlert.variant} onDismiss={() => setActionAlert(null)}>
          {actionAlert.message}
        </Alert>
      )}

      {/* Search and Action Toolbar */}
      <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:flex-row sm:items-center">
        <div className="flex flex-1 flex-col sm:flex-row gap-3">
          <div className="w-full sm:w-80">
            <Input
              id="catalogue-search-filter"
              placeholder="Search by title, author, ISBN, call number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-48">
            <Select
              id="catalogue-type-filter"
              value={selectedTypeFilter}
              onChange={(e) => setSelectedTypeFilter(e.target.value)}
              options={[
                { value: "", label: "All Item Types" },
                ...itemTypes.map((t) => ({ value: String(t.id), label: t.name })),
              ]}
            />
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <span className="text-xs text-slate-500">
            {filtered.length} of {initialTitles.length} titles
          </span>
          {canManage && (
            <Button variant="primary" onClick={() => setShowAddModal(true)}>
              + Add Title
            </Button>
          )}
        </div>
      </div>

      {/* Titles Table */}
      {filtered.length === 0 ? (
        <EmptyState
          title="No Bibliographic Records"
          description={
            initialTitles.length === 0
              ? "The library collection has no titles cataloged. Click '+ Add Title' to add the first bibliographic record."
              : "No titles match the search criteria."
          }
          icon="📚"
        />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Title &amp; Subtitle</TableHeaderCell>
                <TableHeaderCell>Authors</TableHeaderCell>
                <TableHeaderCell>Type</TableHeaderCell>
                <TableHeaderCell>ISBN</TableHeaderCell>
                <TableHeaderCell>Call Number</TableHeaderCell>
                <TableHeaderCell>Stock Availability</TableHeaderCell>
                <TableHeaderCell>Actions</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {filtered.map((item) => {
                const hasAvailable = item.availableCopies > 0;
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => handleViewDetails(item.id)}
                        className="text-left font-bold text-slate-900 hover:text-blue-900 transition"
                      >
                        {item.title}
                      </button>
                      {item.subtitle && (
                        <div className="text-xs text-slate-500 truncate max-w-xs">
                          {item.subtitle}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-slate-700">{item.authors}</TableCell>
                    <TableCell>
                      <span className="inline-flex rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-700">
                        {item.itemTypeName}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-600">
                      {item.isbn || "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-600">
                      {item.callNumber || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            hasAvailable
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {item.availableCopies} / {item.totalCopies} Available
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleViewDetails(item.id)}
                      >
                        Copies ({item.totalCopies})
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add Title Modal */}
      {showAddModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-title-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs overflow-y-auto"
        >
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl border border-slate-200 my-8">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
              <h3 id="add-title-modal-title" className="text-base font-bold text-slate-900">
                Catalog New Bibliographic Title (FR-CA-01)
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTitle} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Input
                    id="new-title-title"
                    label="Book / Material Title"
                    value={newTitle.title}
                    onChange={(e) => setNewTitle({ ...newTitle, title: e.target.value })}
                    required
                  />
                </div>
                <div className="sm:col-span-2">
                  <Input
                    id="new-title-subtitle"
                    label="Subtitle (Optional)"
                    value={newTitle.subtitle}
                    onChange={(e) => setNewTitle({ ...newTitle, subtitle: e.target.value })}
                  />
                </div>
                <div>
                  <Input
                    id="new-title-authors"
                    label="Author(s)"
                    placeholder="e.g. Kernighan, Brian; Ritchie, Dennis"
                    value={newTitle.authors}
                    onChange={(e) => setNewTitle({ ...newTitle, authors: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Input
                    id="new-title-isbn"
                    label="ISBN (10 or 13 digits)"
                    placeholder="e.g. 978-0131103627"
                    value={newTitle.isbn}
                    onChange={(e) => setNewTitle({ ...newTitle, isbn: e.target.value })}
                  />
                </div>
                <div>
                  <Select
                    id="new-title-type"
                    label="Item Material Type"
                    value={newTitle.itemTypeId}
                    onChange={(e) => setNewTitle({ ...newTitle, itemTypeId: e.target.value })}
                    options={itemTypes.map((t) => ({ value: String(t.id), label: t.name }))}
                    required
                  />
                </div>
                <div>
                  <Select
                    id="new-title-dept"
                    label="Academic Department"
                    value={newTitle.departmentId}
                    onChange={(e) => setNewTitle({ ...newTitle, departmentId: e.target.value })}
                    options={[
                      { value: "", label: "General / Institutional" },
                      ...departments.map((d) => ({ value: String(d.id), label: d.name })),
                    ]}
                  />
                </div>
                <div>
                  <Input
                    id="new-title-call"
                    label="Call Number / Classification"
                    placeholder="e.g. 005.13 KER"
                    value={newTitle.callNumber}
                    onChange={(e) => setNewTitle({ ...newTitle, callNumber: e.target.value })}
                  />
                </div>
                <div>
                  <Input
                    id="new-title-year"
                    label="Publication Year"
                    type="number"
                    placeholder="e.g. 2024"
                    value={newTitle.pubYear}
                    onChange={(e) => setNewTitle({ ...newTitle, pubYear: e.target.value })}
                  />
                </div>
                <div>
                  <Input
                    id="new-title-edition"
                    label="Edition"
                    placeholder="e.g. 2nd Edition"
                    value={newTitle.edition}
                    onChange={(e) => setNewTitle({ ...newTitle, edition: e.target.value })}
                  />
                </div>
                <div>
                  <Input
                    id="new-title-price"
                    label="Cover Price (₹)"
                    type="number"
                    step="0.01"
                    placeholder="e.g. 650.00"
                    value={newTitle.price}
                    onChange={(e) => setNewTitle({ ...newTitle, price: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 border-t border-slate-100 pt-4 mt-6">
                <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" isLoading={isSubmittingTitle}>
                  Save Bibliographic Title
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Title Details & Copies Drawer / Modal */}
      {bibDetail && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="copies-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs overflow-y-auto"
        >
          <div className="w-full max-w-4xl rounded-xl bg-white p-6 shadow-xl border border-slate-200 my-8 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase text-blue-900">
                  {bibDetail.title.itemTypeName}
                </span>
                <h3 id="copies-modal-title" className="text-lg font-bold text-slate-900 mt-1">
                  {bibDetail.title.title}
                </h3>
                <p className="text-xs text-slate-500">
                  By {bibDetail.title.authors} &bull; Call No: {bibDetail.title.callNumber || "N/A"}{" "}
                  &bull; ISBN: {bibDetail.title.isbn || "N/A"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBibDetail(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            {/* Copies Header with Add Copies CTA */}
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Accessioned Physical Copies</h4>
                <p className="text-xs text-slate-500">
                  {bibDetail.copies.length} copies accessioned in library branches
                </p>
              </div>

              {canManage && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setShowAddCopies(!showAddCopies)}
                >
                  {showAddCopies ? "Hide Add Form" : "+ Add Copies (1–200)"}
                </Button>
              )}
            </div>

            {/* Add Copies Sub-Form */}
            {showAddCopies && (
              <form
                onSubmit={handleAddCopies}
                className="rounded-lg border border-blue-200 bg-blue-50/40 p-4 space-y-3"
              >
                <h5 className="text-xs font-bold text-blue-900 uppercase">
                  Batch Accessioning (FR-CA-02)
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <Select
                      id="copy-library-id"
                      label="Library Branch"
                      value={copyForm.libraryId}
                      onChange={(e) => setCopyForm({ ...copyForm, libraryId: e.target.value })}
                      options={libraries.map((l) => ({
                        value: String(l.id),
                        label: `${l.name} (${l.code})`,
                      }))}
                      required
                    />
                  </div>
                  <div>
                    <Input
                      id="copy-count"
                      label="Number of Copies (1–200)"
                      type="number"
                      min={1}
                      max={200}
                      value={copyForm.count}
                      onChange={(e) => setCopyForm({ ...copyForm, count: Number(e.target.value) })}
                      required
                    />
                  </div>
                  <div>
                    <Input
                      id="copy-location"
                      label="Shelf Location"
                      placeholder="e.g. Stack A-3, Shelf 2"
                      value={copyForm.location}
                      onChange={(e) => setCopyForm({ ...copyForm, location: e.target.value })}
                    />
                  </div>
                  <div>
                    <Input
                      id="copy-price"
                      label="Copy Price (₹)"
                      type="number"
                      step="0.01"
                      placeholder="e.g. 650.00"
                      value={copyForm.price}
                      onChange={(e) => setCopyForm({ ...copyForm, price: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex justify-end pt-1">
                  <Button type="submit" variant="primary" size="sm" isLoading={isSubmittingCopies}>
                    Generate &amp; Accession Copies
                  </Button>
                </div>
              </form>
            )}

            {/* Copies List */}
            {bibDetail.copies.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 border rounded-lg">
                No physical copies accessioned yet for this title.
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200">
                <Table>
                  <TableHead>
                    <tr>
                      <TableHeaderCell>Accession No</TableHeaderCell>
                      <TableHeaderCell>Barcode</TableHeaderCell>
                      <TableHeaderCell>Branch</TableHeaderCell>
                      <TableHeaderCell>Shelf Location</TableHeaderCell>
                      <TableHeaderCell>Status</TableHeaderCell>
                      <TableHeaderCell>Actions</TableHeaderCell>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {bibDetail.copies.map((copy) => (
                      <TableRow key={copy.id}>
                        <TableCell className="font-mono text-xs font-bold text-slate-900">
                          {copy.accessionNo}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-slate-600">
                          {copy.barcode}
                        </TableCell>
                        <TableCell className="text-xs text-slate-700">{copy.libraryName}</TableCell>
                        <TableCell className="text-xs text-slate-600">
                          {copy.location || "General Shelf"}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                              copy.status === "AVAILABLE"
                                ? "bg-emerald-100 text-emerald-800"
                                : copy.status === "ISSUED"
                                  ? "bg-blue-100 text-blue-800"
                                  : copy.status === "REFERENCE_ONLY"
                                    ? "bg-purple-100 text-purple-800"
                                    : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {copy.status}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <button
                              type="button"
                              onClick={() =>
                                setBarcodePreview({
                                  accessionNo: copy.accessionNo,
                                  title: bibDetail.title.title,
                                })
                              }
                              className="text-xs font-semibold text-blue-900 hover:underline"
                            >
                              Barcode SVG
                            </button>
                            {canManage && copy.status !== "ISSUED" && (
                              <select
                                aria-label="Change Copy Status"
                                value={copy.status}
                                onChange={(e) =>
                                  handleUpdateCopyStatus(copy.id, e.target.value as ItemStatus)
                                }
                                className="rounded border border-slate-300 text-[11px] p-1 bg-white"
                              >
                                {ITEM_STATUSES.filter((s) => s !== "ISSUED").map((st) => (
                                  <option key={st} value={st}>
                                    {st}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="flex justify-end border-t border-slate-100 pt-3">
              <Button variant="outline" onClick={() => setBibDetail(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Code 128 Barcode SVG Preview Modal */}
      {barcodePreview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="barcode-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl border border-slate-200 text-center space-y-4">
            <h3 id="barcode-modal-title" className="text-sm font-bold text-slate-900">
              Code 128 Barcode (FR-CA-07)
            </h3>
            <p className="text-xs text-slate-500 truncate">{barcodePreview.title}</p>

            <div
              className="flex justify-center p-4 bg-slate-50 rounded-lg border border-slate-200"
              // biome-ignore lint/security/noDangerouslySetInnerHtml: pure internal Code 128 SVG generator
              dangerouslySetInnerHTML={{
                __html: generateCode128Svg(barcodePreview.accessionNo, {
                  height: 50,
                  barWidth: 2,
                }),
              }}
            />

            <Button variant="outline" onClick={() => setBarcodePreview(null)} className="w-full">
              Close Preview
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
