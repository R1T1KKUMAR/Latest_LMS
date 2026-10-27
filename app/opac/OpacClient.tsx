"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
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
import type {
  OpacBookItem,
  OpacCopyItem,
  OpacDepartmentItem,
  OpacTitleDetail,
} from "@/services/opac";

interface OpacClientProps {
  initialBooks: OpacBookItem[];
  newArrivals: OpacBookItem[];
  mostBorrowed: (OpacBookItem & { borrowCount: number })[];
  departments: OpacDepartmentItem[];
  totalCopies?: number;
  totalTitles?: number;
  isLoggedInPatron?: boolean;
  patronName?: string;
  csrfToken?: string;
}

export function OpacClient({
  initialBooks,
  newArrivals,
  mostBorrowed,
  departments,
  totalCopies = 26072,
  totalTitles = 8944,
  isLoggedInPatron = false,
  patronName = "",
  csrfToken = "",
}: OpacClientProps) {
  const [activeTab, setActiveTab] = useState<"search" | "new" | "popular" | "departments">(
    "search",
  );
  const [query, setQuery] = useState("");
  const [searchField, setSearchField] = useState("all");
  const [selectedCollegeId, setSelectedCollegeId] = useState<string>("all");
  const [selectedDeptId, setSelectedDeptId] = useState<string>("all");
  const [onlyAvailable, setOnlyAvailable] = useState(false);

  // Extract unique colleges from department list
  const collegesMap = new Map<string, { id: string; code: string; name: string }>();
  for (const d of departments) {
    if (d.institutionId && d.institutionCode) {
      collegesMap.set(String(d.institutionId), {
        id: String(d.institutionId),
        code: d.institutionCode,
        name: d.institutionName || d.institutionCode,
      });
    }
  }
  const colleges = Array.from(collegesMap.values());

  // Filter departments for selected college
  const availableDepts = departments.filter((d) => {
    if (selectedCollegeId === "all") return true;
    return String(d.institutionId) === selectedCollegeId;
  });

  // Selected book for details modal
  const [selectedBookDetail, setSelectedBookDetail] = useState<OpacTitleDetail | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Hold placement
  const [holdTarget, setHoldTarget] = useState<OpacBookItem | null>(null);
  const [holdLoading, setHoldLoading] = useState(false);
  const [holdBanner, setHoldBanner] = useState<{
    variant: "info" | "success" | "warning" | "error";
    message: string;
  } | null>(null);

  // Filtered search results
  const filteredBooks = initialBooks.filter((b) => {
    if (onlyAvailable && b.availableCopies <= 0) return false;
    if (selectedCollegeId !== "all") {
      const dept = departments.find((d) => d.id === b.departmentId);
      if (!dept || String(dept.institutionId) !== selectedCollegeId) return false;
    }
    if (selectedDeptId !== "all" && b.departmentId !== parseInt(selectedDeptId, 10)) return false;

    if (!query.trim()) return true;
    const q = query.toLowerCase();

    if (searchField === "title")
      return b.title.toLowerCase().includes(q) || (b.subtitle?.toLowerCase().includes(q) ?? false);
    if (searchField === "author") return b.authors.toLowerCase().includes(q);
    if (searchField === "isbn") return b.isbn?.toLowerCase().includes(q) ?? false;
    if (searchField === "call") return b.callNumber?.toLowerCase().includes(q) ?? false;
    if (searchField === "publisher") return b.publisher?.toLowerCase().includes(q) ?? false;
    if (searchField === "subject") return b.subject?.toLowerCase().includes(q) ?? false;

    // "all"
    return (
      b.title.toLowerCase().includes(q) ||
      (b.subtitle?.toLowerCase().includes(q) ?? false) ||
      b.authors.toLowerCase().includes(q) ||
      (b.isbn?.toLowerCase().includes(q) ?? false) ||
      (b.publisher?.toLowerCase().includes(q) ?? false) ||
      (b.callNumber?.toLowerCase().includes(q) ?? false) ||
      (b.subject?.toLowerCase().includes(q) ?? false)
    );
  });

  const handleOpenDetails = async (book: OpacBookItem) => {
    setLoadingDetails(true);
    try {
      const res = await fetch(`/api/opac/title/${book.id}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setSelectedBookDetail(data.title);
      } else {
        // Fallback with basic details
        setSelectedBookDetail({
          ...book,
          editors: null,
          summary: null,
          ddcNumber: null,
          placeOfPublication: null,
          pages: null,
          language: null,
          keywords: null,
          waitingHolds: 0,
          copies: [],
        });
      }
    } catch {
      setSelectedBookDetail({
        ...book,
        editors: null,
        summary: null,
        ddcNumber: null,
        placeOfPublication: null,
        pages: null,
        language: null,
        keywords: null,
        waitingHolds: 0,
        copies: [],
      });
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleConfirmPlaceHold = async () => {
    if (!holdTarget) return;
    setHoldLoading(true);
    setHoldBanner(null);
    try {
      const res = await fetch("/api/holds", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          bibId: holdTarget.id,
          csrfToken,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setHoldBanner({
          variant: "error",
          message: data.error || "Failed to place reservation hold.",
        });
      } else {
        setHoldBanner({
          variant: "success",
          message: `Reservation hold placed for "${holdTarget.title}"! Your queue position is #${data.queuePosition}.`,
        });
      }
    } catch {
      setHoldBanner({
        variant: "error",
        message: "Failed to communicate with server to place reservation.",
      });
    } finally {
      setHoldLoading(false);
      setHoldTarget(null);
    }
  };

  const handleSelectDepartment = (deptId: number) => {
    setSelectedDeptId(String(deptId));
    setActiveTab("search");
  };

  return (
    <div className="space-y-6">
      {holdBanner && (
        <Alert variant={holdBanner.variant} onDismiss={() => setHoldBanner(null)}>
          {holdBanner.message}
        </Alert>
      )}

      {/* Hero Header */}
      <div className="rounded-2xl bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 p-4 sm:p-8 text-white shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <span className="rounded bg-blue-700/80 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-blue-100">
              OPAC &bull; Campus Union Catalogue
            </span>
            <h1 className="mt-3 text-2xl sm:text-4xl font-extrabold tracking-tight">
              Search RBMI Central Library
            </h1>
            <p className="mt-2 text-xs sm:text-sm text-blue-100/90 leading-relaxed max-w-2xl">
              Online public catalogue for students, faculty, and research scholars across RBMI Group
              of Institutions. Search without login, browse new arrivals, and check shelf
              availability.
            </p>
          </div>

          {isLoggedInPatron ? (
            <div className="rounded-xl bg-white/10 p-3 sm:p-4 border border-white/20 backdrop-blur-xs text-left sm:text-right">
              <span className="text-xs text-blue-200">Signed in as Patron</span>
              <div className="text-sm font-bold text-white">{patronName || "My Account"}</div>
              <Link
                href="/account"
                className="mt-2 inline-block rounded bg-blue-500 hover:bg-blue-600 px-3 py-1 text-xs font-semibold text-white transition"
              >
                Go to Account &rarr;
              </Link>
            </div>
          ) : (
            <div className="rounded-xl bg-white/10 p-3 sm:p-4 border border-white/20 backdrop-blur-xs text-left sm:text-right">
              <span className="text-xs text-blue-200">Registered Patron?</span>
              <div className="text-sm font-bold text-white">Borrow &amp; Reserve Books</div>
              <Link
                href="/login"
                className="mt-2 inline-block rounded bg-amber-500 hover:bg-amber-600 px-3 py-1 text-xs font-bold text-slate-950 transition"
              >
                Sign In &rarr;
              </Link>
            </div>
          )}
        </div>

        {/* Discovery Navigation Tabs (Horizontally scrollable on mobile) */}
        <div className="mt-6 sm:mt-8 flex overflow-x-auto no-scrollbar gap-2 border-t border-white/20 pt-4 pb-1">
          <button
            type="button"
            onClick={() => setActiveTab("search")}
            className={`flex-shrink-0 whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-bold transition ${
              activeTab === "search"
                ? "bg-white text-blue-950 shadow-md"
                : "bg-white/10 text-white hover:bg-white/20"
            }`}
          >
            🔍 Search Catalogue ({totalCopies.toLocaleString()} Books)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("new")}
            className={`flex-shrink-0 whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-bold transition ${
              activeTab === "new"
                ? "bg-white text-blue-950 shadow-md"
                : "bg-white/10 text-white hover:bg-white/20"
            }`}
          >
            ✨ New Arrivals ({newArrivals.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("popular")}
            className={`flex-shrink-0 whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-bold transition ${
              activeTab === "popular"
                ? "bg-white text-blue-950 shadow-md"
                : "bg-white/10 text-white hover:bg-white/20"
            }`}
          >
            📈 Most Borrowed ({mostBorrowed.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("departments")}
            className={`flex-shrink-0 whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-bold transition ${
              activeTab === "departments"
                ? "bg-white text-blue-950 shadow-md"
                : "bg-white/10 text-white hover:bg-white/20"
            }`}
          >
            🏛️ Browse by Department ({departments.length})
          </button>
        </div>
      </div>

      {/* Tab 1: Catalogue Search */}
      {activeTab === "search" && (
        <div className="space-y-6">
          {/* Search Inputs */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
              <div className="sm:col-span-4">
                <Input
                  id="opac-search-input"
                  placeholder="Search by title, author, keyword, ISBN..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <Select
                  id="opac-field-select"
                  value={searchField}
                  onChange={(e) => setSearchField(e.target.value)}
                  options={[
                    { value: "all", label: "All Fields" },
                    { value: "title", label: "Title & Subtitle" },
                    { value: "author", label: "Authors" },
                    { value: "isbn", label: "ISBN" },
                    { value: "call", label: "Call Number" },
                    { value: "subject", label: "Subject / Keywords" },
                    { value: "publisher", label: "Publisher" },
                  ]}
                />
              </div>
              <div className="sm:col-span-3">
                <Select
                  id="opac-college-select"
                  value={selectedCollegeId}
                  onChange={(e) => {
                    setSelectedCollegeId(e.target.value);
                    setSelectedDeptId("all");
                  }}
                  options={[
                    { value: "all", label: "🏛️ All Colleges" },
                    ...colleges.map((c) => ({
                      value: c.id,
                      label: `${c.code} — ${c.name}`,
                    })),
                  ]}
                />
              </div>
              <div className="sm:col-span-3">
                <Select
                  id="opac-dept-select"
                  value={selectedDeptId}
                  onChange={(e) => setSelectedDeptId(e.target.value)}
                  options={[
                    {
                      value: "all",
                      label:
                        selectedCollegeId !== "all"
                          ? `📚 All ${collegesMap.get(selectedCollegeId)?.code} Programs`
                          : "📚 All Academic Departments",
                    },
                    ...availableDepts.map((d) => ({
                      value: String(d.id),
                      label: `${d.name} (${d.titleCount} titles)`,
                    })),
                  ]}
                />
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-600">
              <label className="flex items-center space-x-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={onlyAvailable}
                  onChange={(e) => setOnlyAvailable(e.target.checked)}
                  className="rounded border-slate-300 text-blue-900 focus:ring-blue-900"
                />
                <span className="font-medium">Show available items only (shelf copies &gt; 0)</span>
              </label>

              <div className="flex items-center space-x-4">
                {selectedDeptId !== "all" && (
                  <button
                    type="button"
                    onClick={() => setSelectedDeptId("all")}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Clear department filter
                  </button>
                )}
                <span className="text-slate-500 font-medium">
                  Showing {filteredBooks.length} matching titles
                </span>
              </div>
            </div>
          </div>

          {/* Results Display */}
          {filteredBooks.length === 0 ? (
            <EmptyState
              title="No Matching Library Materials"
              description={
                initialBooks.length === 0
                  ? "The public catalogue currently has no accessioned volumes listed."
                  : "No titles match your search criteria. Try modifying your search query or selecting 'All Academic Departments'."
              }
              icon="🔍"
            />
          ) : (
            <>
              {/* Mobile Card List (< sm) */}
              <div className="space-y-3 sm:hidden">
                {filteredBooks.map((book) => {
                  const isAvailable = book.availableCopies > 0;
                  return (
                    <div
                      key={book.id}
                      className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/opac/title/${book.id}`}
                          className="font-bold text-sm text-blue-950 hover:underline leading-snug line-clamp-2"
                        >
                          {book.title}
                        </Link>
                        <span
                          className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            isAvailable
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {isAvailable ? "Available" : "Checked Out"}
                        </span>
                      </div>

                      {book.subtitle && (
                        <p className="text-xs text-slate-500 line-clamp-1">{book.subtitle}</p>
                      )}

                      <p className="text-xs text-slate-700">{book.authors}</p>

                      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                        {book.institutionCode && (
                          <span className="rounded bg-blue-50 text-blue-900 font-bold px-1.5 py-0.5 border border-blue-200">
                            🏛️ {book.institutionCode}
                          </span>
                        )}
                        {book.departmentName && (
                          <span className="rounded bg-emerald-50 text-emerald-900 font-bold px-1.5 py-0.5 border border-emerald-200">
                            📚 {book.departmentName}
                          </span>
                        )}
                        {book.callNumber && (
                          <span className="font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                            Call: {book.callNumber}
                          </span>
                        )}
                        <span className="text-slate-500 font-medium">
                          {book.availableCopies} of {book.totalCopies} on shelf
                        </span>
                      </div>

                      <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="flex-1"
                          onClick={() => handleOpenDetails(book)}
                        >
                          Details
                        </Button>
                        <Button
                          variant={isAvailable ? "outline" : "primary"}
                          size="sm"
                          className="flex-1"
                          onClick={() => setHoldTarget(book)}
                        >
                          Reserve
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table (>= sm) */}
              <div className="hidden sm:block rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
                <Table>
                  <TableHead>
                    <tr>
                      <TableHeaderCell>Title &amp; Subtitle</TableHeaderCell>
                      <TableHeaderCell>Authors</TableHeaderCell>
                      <TableHeaderCell>Edition / Year</TableHeaderCell>
                      <TableHeaderCell>Call Number</TableHeaderCell>
                      <TableHeaderCell>Copy Availability</TableHeaderCell>
                      <TableHeaderCell>Actions</TableHeaderCell>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {filteredBooks.map((book) => {
                      const isAvailable = book.availableCopies > 0;
                      return (
                        <TableRow key={book.id}>
                          <TableCell>
                            <Link
                              href={`/opac/title/${book.id}`}
                              className="text-left font-bold text-blue-950 hover:underline block"
                            >
                              {book.title}
                            </Link>
                            {book.subtitle && (
                              <span className="text-xs text-slate-500 block truncate max-w-sm">
                                {book.subtitle}
                              </span>
                            )}
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                              {book.institutionCode && (
                                <span className="rounded bg-blue-100 text-blue-900 font-bold px-1.5 py-0.5 border border-blue-200">
                                  🏛️ {book.institutionCode}
                                </span>
                              )}
                              {book.departmentName && (
                                <span className="rounded bg-emerald-100 text-emerald-900 font-bold px-1.5 py-0.5 border border-emerald-200">
                                  📚 {book.departmentName}
                                </span>
                              )}
                              {book.isbn && <span className="text-slate-400">ISBN: {book.isbn}</span>}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-slate-700">{book.authors}</TableCell>
                          <TableCell className="text-xs text-slate-600">
                            {book.edition ? `Ed. ${book.edition}` : ""}{" "}
                            {book.pubYear ? `(${book.pubYear})` : "—"}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-slate-600">
                            {book.callNumber || "—"}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-0.5">
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                  isAvailable
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-amber-100 text-amber-800"
                                }`}
                              >
                                {isAvailable ? "Available" : "Checked Out"}
                              </span>
                              <div className="text-[10px] text-slate-500">
                                {book.availableCopies} of {book.totalCopies} on shelf
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center space-x-2">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleOpenDetails(book)}
                              >
                                Details
                              </Button>
                              <Button
                                variant={isAvailable ? "outline" : "primary"}
                                size="sm"
                                onClick={() => setHoldTarget(book)}
                              >
                                Reserve
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab 2: New Arrivals */}
      {activeTab === "new" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4">
            <h2 className="text-sm font-bold text-blue-950">Recently Acquired Titles</h2>
            <p className="text-xs text-blue-800">
              Volumes catalogued and accessioned into RBMI collections within the latest arrival
              period.
            </p>
          </div>

          {newArrivals.length === 0 ? (
            <EmptyState
              title="No Recent Acquisitions"
              description="No new volumes have been added in the past 30 days."
              icon="✨"
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {newArrivals.map((book) => {
                const isAvailable = book.availableCopies > 0;
                return (
                  <div
                    key={book.id}
                    className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="rounded bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-900">
                          NEW ARRIVAL
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            isAvailable
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {isAvailable ? `${book.availableCopies} Available` : "Checked Out"}
                        </span>
                      </div>
                      <Link
                        href={`/opac/title/${book.id}`}
                        className="font-bold text-slate-900 hover:text-blue-900 transition line-clamp-2"
                      >
                        {book.title}
                      </Link>
                      <p className="text-xs text-slate-600 mt-1 line-clamp-1">{book.authors}</p>
                      {book.publisher && (
                        <p className="text-[11px] text-slate-400 mt-1">
                          {book.publisher} {book.pubYear ? `(${book.pubYear})` : ""}
                        </p>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[10px] text-slate-500 font-mono">
                        {book.callNumber || "No Call #"}
                      </span>
                      <div className="flex space-x-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleOpenDetails(book)}
                        >
                          Details
                        </Button>
                        <Button
                          variant={isAvailable ? "outline" : "primary"}
                          size="sm"
                          onClick={() => setHoldTarget(book)}
                        >
                          Reserve
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Most Borrowed */}
      {activeTab === "popular" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-4">
            <h2 className="text-sm font-bold text-indigo-950">Most Circulated Library Materials</h2>
            <p className="text-xs text-indigo-800">
              High-demand textbooks, reference titles, and technical manuals with highest patron
              borrowing counts.
            </p>
          </div>

          {mostBorrowed.length === 0 ? (
            <EmptyState
              title="No Circulation Records"
              description="Circulation trends will appear once books are borrowed and returned."
              icon="📈"
            />
          ) : (
            <>
              {/* Mobile Card View (< sm) */}
              <div className="space-y-3 sm:hidden">
                {mostBorrowed.map((book, index) => {
                  const isAvailable = book.availableCopies > 0;
                  return (
                    <div
                      key={book.id}
                      className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center space-x-2">
                          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-900 text-[11px] font-bold text-white shadow-xs">
                            #{index + 1}
                          </span>
                          <Link
                            href={`/opac/title/${book.id}`}
                            className="font-bold text-sm text-blue-950 hover:underline leading-snug line-clamp-2"
                          >
                            {book.title}
                          </Link>
                        </div>
                        <span
                          className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            isAvailable
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {isAvailable ? `${book.availableCopies} on shelf` : "Checked Out"}
                        </span>
                      </div>

                      <p className="text-xs text-slate-600">{book.authors}</p>

                      <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                        <span>{book.departmentName || "General"}</span>
                        <span className="font-semibold text-blue-950 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                          {book.borrowCount} checkouts
                        </span>
                      </div>

                      <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="flex-1"
                          onClick={() => handleOpenDetails(book)}
                        >
                          Details
                        </Button>
                        <Button
                          variant={isAvailable ? "outline" : "primary"}
                          size="sm"
                          className="flex-1"
                          onClick={() => setHoldTarget(book)}
                        >
                          Reserve
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table (>= sm) */}
              <div className="hidden sm:block rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
                <Table>
                  <TableHead>
                    <tr>
                      <TableHeaderCell>Rank / Popularity</TableHeaderCell>
                      <TableHeaderCell>Title &amp; Authors</TableHeaderCell>
                      <TableHeaderCell>Department</TableHeaderCell>
                      <TableHeaderCell>Availability</TableHeaderCell>
                      <TableHeaderCell>Actions</TableHeaderCell>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {mostBorrowed.map((book, index) => {
                      const isAvailable = book.availableCopies > 0;
                      return (
                        <TableRow key={book.id}>
                          <TableCell>
                            <div className="flex items-center space-x-2">
                              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-900 text-xs font-bold text-white shadow-xs">
                                #{index + 1}
                              </span>
                              <span className="text-xs font-semibold text-slate-700">
                                {book.borrowCount} checkouts
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Link
                              href={`/opac/title/${book.id}`}
                              className="font-bold text-blue-950 hover:underline block"
                            >
                              {book.title}
                            </Link>
                            <span className="text-xs text-slate-600 block">{book.authors}</span>
                          </TableCell>
                          <TableCell className="text-xs text-slate-600">
                            {book.departmentName || "General"}
                          </TableCell>
                          <TableCell>
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                isAvailable
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {isAvailable ? `${book.availableCopies} on shelf` : "Checked Out"}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex space-x-2">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleOpenDetails(book)}
                              >
                                Details
                              </Button>
                              <Button
                                variant={isAvailable ? "outline" : "primary"}
                                size="sm"
                                onClick={() => setHoldTarget(book)}
                              >
                                Reserve
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab 4: Departments */}
      {activeTab === "departments" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-bold text-slate-900">Academic Department Collections</h2>
            <p className="text-xs text-slate-500">
              Browse {totalCopies.toLocaleString()} physical volumes classified across{" "}
              {departments.length} institute departments. Select any department to filter catalogue
              materials.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {departments.map((dept) => (
              <button
                key={dept.id}
                type="button"
                onClick={() => handleSelectDepartment(dept.id)}
                className="rounded-xl border border-slate-200 bg-white p-5 text-left shadow-xs hover:border-blue-500 hover:shadow-md transition group"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-blue-900 bg-blue-50 px-2 py-0.5 rounded">
                    {dept.code}
                  </span>
                  <span className="text-xs text-slate-400 group-hover:text-blue-600 font-semibold">
                    View Titles &rarr;
                  </span>
                </div>
                <h3 className="mt-3 text-base font-bold text-slate-900 group-hover:text-blue-900">
                  {dept.name}
                </h3>
                <div className="mt-2 flex items-center space-x-4 text-xs text-slate-500">
                  <span>
                    📚 <strong>{dept.titleCount}</strong> titles
                  </span>
                  <span>
                    📖 <strong>{dept.totalCopies}</strong> copies
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Detailed Modal with Copies Shelf Locations (FR-OP-01) */}
      {selectedBookDetail && (
        <ConfirmDialog
          isOpen={true}
          title={selectedBookDetail.title}
          message={`Author(s): ${selectedBookDetail.authors} | Call Number: ${selectedBookDetail.callNumber || "N/A"} | Copies: ${selectedBookDetail.availableCopies} Available / ${selectedBookDetail.totalCopies} Total. Published: ${selectedBookDetail.pubYear || "N/A"}.`}
          confirmLabel="Close"
          cancelLabel="Reserve Title"
          onConfirm={() => setSelectedBookDetail(null)}
          onCancel={() => {
            setHoldTarget(selectedBookDetail);
            setSelectedBookDetail(null);
          }}
        >
          <div className="mt-4 space-y-3 text-left">
            {selectedBookDetail.summary && (
              <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-700">
                <strong className="block text-slate-900 mb-1">Summary / Abstract:</strong>
                {selectedBookDetail.summary}
              </div>
            )}

            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Physical Copies &amp; Shelf Locations (FR-OP-01):
            </h4>

            {selectedBookDetail.copies.length === 0 ? (
              <p className="text-xs text-slate-500 italic">
                No physical copies currently recorded on shelf.
              </p>
            ) : (
              <div className="max-h-48 overflow-y-auto rounded border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 sticky top-0">
                    <tr>
                      <th className="p-2 font-semibold">Accession #</th>
                      <th className="p-2 font-semibold">Library</th>
                      <th className="p-2 font-semibold">Shelf Location</th>
                      <th className="p-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedBookDetail.copies.map((c: OpacCopyItem) => (
                      <tr key={c.id}>
                        <td className="p-2 font-mono">{c.accessionNo}</td>
                        <td className="p-2">{c.libraryName}</td>
                        <td className="p-2 font-medium text-slate-800">
                          {c.shelfLocation || "Main Stacks"}
                        </td>
                        <td className="p-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              c.status === "AVAILABLE"
                                ? "bg-emerald-100 text-emerald-800"
                                : c.status === "REFERENCE_ONLY"
                                  ? "bg-purple-100 text-purple-800"
                                  : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {c.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </ConfirmDialog>
      )}

      {/* Reserve / Hold Notice Modal (Not Logged In) */}
      {holdTarget && !isLoggedInPatron && (
        <ConfirmDialog
          isOpen={true}
          title={`Reserve "${holdTarget.title}"`}
          message="To place a reservation or hold on library items, you must be logged into your Patron account."
          confirmLabel="Go to Patron Login"
          cancelLabel="Cancel"
          onConfirm={() => {
            window.location.href = "/login";
          }}
          onCancel={() => setHoldTarget(null)}
        />
      )}

      {/* Reserve / Hold Refusal when Copies are Available (T-16 / FR-HO-01) */}
      {holdTarget && isLoggedInPatron && holdTarget.availableCopies > 0 && (
        <ConfirmDialog
          isOpen={true}
          title={`Cannot Place Hold on "${holdTarget.title}"`}
          message={`This title currently has ${holdTarget.availableCopies} available copy(ies) on the shelf. In accordance with library rules (BR-05 / T-16), reservations may only be placed when all copies are checked out or unavailable.`}
          confirmLabel="Understood"
          cancelLabel="Close"
          onConfirm={() => setHoldTarget(null)}
          onCancel={() => setHoldTarget(null)}
        />
      )}

      {/* Reserve / Hold Confirmation when All Copies are Checked Out (T-17) */}
      {holdTarget && isLoggedInPatron && holdTarget.availableCopies === 0 && (
        <ConfirmDialog
          isOpen={true}
          title={`Reserve "${holdTarget.title}"`}
          message={`Place a reservation hold on "${holdTarget.title}"? You will be added to the reservation queue and assigned the next copy returned to the library.`}
          confirmLabel={holdLoading ? "Placing Hold..." : "Confirm Reservation"}
          cancelLabel="Cancel"
          onConfirm={handleConfirmPlaceHold}
          onCancel={() => setHoldTarget(null)}
        />
      )}
    </div>
  );
}
