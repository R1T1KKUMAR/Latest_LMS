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

export interface OpacBook {
  id: number;
  title: string;
  subtitle: string | null;
  authors: string;
  isbn: string | null;
  edition: string | null;
  pubYear: number | null;
  callNumber: string | null;
  totalCopies: number;
  availableCopies: number;
}

interface OpacClientProps {
  initialBooks: OpacBook[];
  isLoggedInPatron?: boolean;
  csrfToken?: string;
}

export function OpacClient({
  initialBooks,
  isLoggedInPatron = false,
  csrfToken = "",
}: OpacClientProps) {
  const [query, setQuery] = useState("");
  const [searchField, setSearchField] = useState("all");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [selectedBook, setSelectedBook] = useState<OpacBook | null>(null);
  const [holdTarget, setHoldTarget] = useState<OpacBook | null>(null);
  const [holdLoading, setHoldLoading] = useState(false);
  const [holdBanner, setHoldBanner] = useState<{
    variant: "info" | "success" | "warning" | "error";
    message: string;
  } | null>(null);

  const filteredBooks = initialBooks.filter((b) => {
    if (onlyAvailable && b.availableCopies <= 0) return false;
    if (!query.trim()) return true;

    const q = query.toLowerCase();
    if (searchField === "title") return b.title.toLowerCase().includes(q);
    if (searchField === "author") return b.authors.toLowerCase().includes(q);
    if (searchField === "isbn") return b.isbn?.includes(q);
    if (searchField === "call") return b.callNumber?.toLowerCase().includes(q);

    // "all"
    return (
      b.title.toLowerCase().includes(q) ||
      b.authors.toLowerCase().includes(q) ||
      (b.isbn && b.isbn.includes(q)) ||
      (b.callNumber && b.callNumber.toLowerCase().includes(q))
    );
  });

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

  return (
    <div className="space-y-6">
      {holdBanner && <Alert variant={holdBanner.variant}>{holdBanner.message}</Alert>}

      {/* Search Header Hero */}
      <div className="rounded-2xl bg-gradient-to-r from-blue-900 to-indigo-900 p-8 text-white shadow-lg">
        <div className="max-w-2xl">
          <span className="rounded bg-blue-700/80 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-blue-100">
            OPAC &bull; Campus Union Catalogue
          </span>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
            Search RBMI Central Library
          </h1>
          <p className="mt-2 text-sm text-blue-100/90 leading-relaxed">
            Search physical books, technical journals, project reports, and reference collections
            across RBMI campus libraries.
          </p>
        </div>

        {/* Search Input and Filter Bar */}
        <div className="mt-6 rounded-xl bg-white p-4 text-slate-900 shadow-md">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
            <div className="sm:col-span-7">
              <Input
                id="opac-search-input"
                placeholder="Search by book title, author, keyword, or ISBN..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="sm:col-span-3">
              <Select
                id="opac-field-select"
                value={searchField}
                onChange={(e) => setSearchField(e.target.value)}
                options={[
                  { value: "all", label: "All Fields" },
                  { value: "title", label: "Title Only" },
                  { value: "author", label: "Author Only" },
                  { value: "isbn", label: "ISBN" },
                  { value: "call", label: "Call Number" },
                ]}
              />
            </div>
            <div className="sm:col-span-2 flex items-center">
              <Button type="button" variant="primary" className="w-full" onClick={() => {}}>
                Search
              </Button>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-600">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyAvailable}
                onChange={(e) => setOnlyAvailable(e.target.checked)}
                className="rounded border-slate-300 text-blue-900 focus:ring-blue-900"
              />
              <span>Show available items only</span>
            </label>

            <span className="text-slate-500 font-medium">
              Showing {filteredBooks.length} of {initialBooks.length} volumes
            </span>
          </div>
        </div>
      </div>

      {/* Results Section */}
      {filteredBooks.length === 0 ? (
        <EmptyState
          title="No Matching Library Materials"
          description={
            initialBooks.length === 0
              ? "The public catalogue currently has no accessioned volumes listed."
              : "No titles match your search criteria. Try using different keywords or broadening your search fields."
          }
          icon="🔍"
        />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Title &amp; Subtitle</TableHeaderCell>
                <TableHeaderCell>Authors</TableHeaderCell>
                <TableHeaderCell>Edition / Year</TableHeaderCell>
                <TableHeaderCell>Call Number</TableHeaderCell>
                <TableHeaderCell>Availability</TableHeaderCell>
                <TableHeaderCell>Actions</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {filteredBooks.map((book) => {
                const isAvailable = book.availableCopies > 0;
                return (
                  <TableRow key={book.id}>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => setSelectedBook(book)}
                        className="text-left font-bold text-blue-950 hover:underline block"
                      >
                        {book.title}
                      </button>
                      {book.subtitle && (
                        <span className="text-xs text-slate-500 block truncate max-w-sm">
                          {book.subtitle}
                        </span>
                      )}
                      {book.isbn && (
                        <span className="font-mono text-[10px] text-slate-400">
                          ISBN: {book.isbn}
                        </span>
                      )}
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
                        <Button variant="secondary" size="sm" onClick={() => setSelectedBook(book)}>
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
      )}

      {/* Book Details Modal */}
      {selectedBook && (
        <ConfirmDialog
          isOpen={true}
          title={selectedBook.title}
          message={`Author(s): ${selectedBook.authors} | Call Number: ${selectedBook.callNumber || "N/A"} | Copies: ${selectedBook.availableCopies} Available / ${selectedBook.totalCopies} Total. Published: ${selectedBook.pubYear || "N/A"}.`}
          confirmLabel="Close"
          cancelLabel="Place Hold"
          onConfirm={() => setSelectedBook(null)}
          onCancel={() => {
            setHoldTarget(selectedBook);
            setSelectedBook(null);
          }}
        />
      )}

      {/* Reserve / Hold Notice Modal */}
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

      {/* Patron Account Banner */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold text-blue-900">
            Registered RBMI Student or Faculty Member?
          </h2>
          <p className="text-xs text-blue-700">
            Sign in to your Patron account to check active loans, renew books, manage reservations,
            and review fine balances.
          </p>
        </div>
        <Link
          href="/account"
          className="whitespace-nowrap rounded-md bg-blue-900 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-800 transition"
        >
          My Patron Account &rarr;
        </Link>
      </div>
    </div>
  );
}
