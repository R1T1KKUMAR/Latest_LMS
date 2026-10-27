"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/Table";
import type { OpacTitleDetail } from "@/services/opac";

interface TitleDetailClientProps {
  title: OpacTitleDetail;
  isLoggedInPatron?: boolean;
  csrfToken?: string;
}

export function TitleDetailClient({
  title,
  isLoggedInPatron = false,
  csrfToken = "",
}: TitleDetailClientProps) {
  const [showHoldModal, setShowHoldModal] = useState(false);
  const [holdLoading, setHoldLoading] = useState(false);
  const [alert, setAlert] = useState<{
    variant: "info" | "success" | "warning" | "error";
    message: string;
  } | null>(null);

  const isAvailable = title.availableCopies > 0;

  const handleConfirmPlaceHold = async () => {
    setHoldLoading(true);
    setAlert(null);
    try {
      const res = await fetch("/api/holds", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          bibId: title.id,
          csrfToken,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setAlert({
          variant: "error",
          message: data.error || "Failed to place reservation hold.",
        });
      } else {
        setAlert({
          variant: "success",
          message: `Reservation hold placed for "${title.title}"! Your queue position is #${data.queuePosition}.`,
        });
      }
    } catch {
      setAlert({
        variant: "error",
        message: "Failed to communicate with server to place reservation.",
      });
    } finally {
      setHoldLoading(false);
      setShowHoldModal(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Back button */}
      <div>
        <Link
          href="/opac"
          className="inline-flex items-center text-xs font-semibold text-blue-900 hover:text-blue-700 transition"
        >
          &larr; Back to Catalogue Search
        </Link>
      </div>

      {alert && (
        <Alert variant={alert.variant} onDismiss={() => setAlert(null)}>
          {alert.message}
        </Alert>
      )}

      {/* Main Bibliographic Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
          <div className="space-y-3 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-900">
                {title.itemTypeName || "Book"}
              </span>
              {title.departmentName && (
                <span className="rounded bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                  {title.departmentName}
                </span>
              )}
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  isAvailable ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                }`}
              >
                {isAvailable
                  ? `${title.availableCopies} Copies Available`
                  : "All Copies Checked Out"}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              {title.title}
            </h1>
            {title.subtitle && (
              <p className="text-base text-slate-600 font-medium">{title.subtitle}</p>
            )}

            <p className="text-sm text-slate-700">
              <strong className="text-slate-900">Authors:</strong> {title.authors}
            </p>

            {title.editors && (
              <p className="text-xs text-slate-600">
                <strong>Editors:</strong> {title.editors}
              </p>
            )}

            {/* Bibliographic Details Grid */}
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 rounded-xl bg-slate-50 p-4 text-xs text-slate-600 border border-slate-100">
              <div>
                <span className="block text-slate-400 font-medium">Edition</span>
                <span className="font-semibold text-slate-800">{title.edition || "—"}</span>
              </div>
              <div>
                <span className="block text-slate-400 font-medium">Publisher / Year</span>
                <span className="font-semibold text-slate-800">
                  {title.publisher || "—"} {title.pubYear ? `(${title.pubYear})` : ""}
                </span>
              </div>
              <div>
                <span className="block text-slate-400 font-medium">Call Number</span>
                <span className="font-mono font-semibold text-slate-800">
                  {title.callNumber || "—"}
                </span>
              </div>
              <div>
                <span className="block text-slate-400 font-medium">DDC Number</span>
                <span className="font-mono font-semibold text-slate-800">
                  {title.ddcNumber || "—"}
                </span>
              </div>
            </div>

            {title.summary && (
              <div className="mt-4 space-y-1">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Summary / Abstract
                </h3>
                <p className="text-xs text-slate-700 leading-relaxed bg-slate-50/50 p-3 rounded-lg border border-slate-100">
                  {title.summary}
                </p>
              </div>
            )}
          </div>

          {/* Action Box */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 sm:p-5 lg:w-72 flex flex-col justify-between space-y-4">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Hold &amp; Issue Status
              </h3>
              <div className="mt-3 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600">Total Holdings:</span>
                  <strong className="text-slate-900">{title.totalCopies} copies</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Available on Shelf:</span>
                  <strong className={isAvailable ? "text-emerald-700" : "text-slate-500"}>
                    {title.availableCopies}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Currently Issued:</span>
                  <strong className="text-slate-900">{title.issuedCopies}</strong>
                </div>
                {title.referenceCopies > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">Reference Only:</span>
                    <strong className="text-purple-700">{title.referenceCopies}</strong>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-600">Waiting Holds:</span>
                  <strong className="text-blue-900">{title.waitingHolds}</strong>
                </div>
              </div>
            </div>

            <Button
              variant={isAvailable ? "outline" : "primary"}
              className="w-full"
              onClick={() => setShowHoldModal(true)}
            >
              {isAvailable ? "Reserve Title" : "Place Reservation Hold"}
            </Button>
          </div>
        </div>
      </div>

      {/* Physical Copies and Shelf Locations (FR-OP-01) */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 shadow-xs space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">
            Physical Copies &amp; Shelf Locations
          </h2>
          <p className="text-xs text-slate-500">
            Current shelf location, accession identifier, and availability status for every copy in
            campus libraries.
          </p>
        </div>

        {title.copies.length === 0 ? (
          <p className="text-xs text-slate-500 italic py-4">
            No physical copies are currently catalogued for this title.
          </p>
        ) : (
          <>
            {/* Mobile View for Copies (< sm) */}
            <div className="space-y-2.5 sm:hidden">
              {title.copies.map((copy) => (
                <div
                  key={copy.id}
                  className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-slate-900">
                      Acc: {copy.accessionNo}
                    </span>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        copy.status === "AVAILABLE"
                          ? "bg-emerald-100 text-emerald-800"
                          : copy.status === "REFERENCE_ONLY"
                            ? "bg-purple-100 text-purple-800"
                            : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {copy.status}
                    </span>
                  </div>
                  <div className="text-slate-600 flex justify-between text-[11px]">
                    <span>{copy.libraryName}</span>
                    <span className="font-mono text-slate-500">Barcode: {copy.barcode}</span>
                  </div>
                  <div className="text-blue-950 font-medium text-[11px]">
                    📍 {copy.shelfLocation || "Main Stacks"}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table (>= sm) */}
            <div className="hidden sm:block">
              <Table>
                <TableHead>
                  <tr>
                    <TableHeaderCell>Accession #</TableHeaderCell>
                    <TableHeaderCell>Barcode</TableHeaderCell>
                    <TableHeaderCell>Library</TableHeaderCell>
                    <TableHeaderCell>Shelf Location / Mark</TableHeaderCell>
                    <TableHeaderCell>Call Number</TableHeaderCell>
                    <TableHeaderCell>Copy Status</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {title.copies.map((copy) => (
                    <TableRow key={copy.id}>
                      <TableCell className="font-mono font-semibold text-slate-900">
                        {copy.accessionNo}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-600">{copy.barcode}</TableCell>
                      <TableCell className="text-xs text-slate-700">{copy.libraryName}</TableCell>
                      <TableCell className="font-semibold text-xs text-blue-950">
                        📍 {copy.shelfLocation || "Main Stacks"}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-600">
                        {copy.callNumber || title.callNumber || "—"}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                            copy.status === "AVAILABLE"
                              ? "bg-emerald-100 text-emerald-800"
                              : copy.status === "REFERENCE_ONLY"
                                ? "bg-purple-100 text-purple-800"
                                : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {copy.status}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>

      {/* Reserve / Hold Notice Modal (Not Logged In) */}
      {showHoldModal && !isLoggedInPatron && (
        <ConfirmDialog
          isOpen={true}
          title={`Reserve "${title.title}"`}
          message="To place a reservation or hold on library items, you must be logged into your Patron account."
          confirmLabel="Go to Patron Login"
          cancelLabel="Cancel"
          onConfirm={() => {
            window.location.href = "/login";
          }}
          onCancel={() => setShowHoldModal(false)}
        />
      )}

      {/* Reserve / Hold Refusal when Copies are Available (T-16 / FR-HO-01) */}
      {showHoldModal && isLoggedInPatron && isAvailable && (
        <ConfirmDialog
          isOpen={true}
          title={`Cannot Place Hold on "${title.title}"`}
          message={`This title currently has ${title.availableCopies} available copy(ies) on the shelf. In accordance with library rules (BR-05 / T-16), reservations may only be placed when all copies are checked out or unavailable.`}
          confirmLabel="Understood"
          cancelLabel="Close"
          onConfirm={() => setShowHoldModal(false)}
          onCancel={() => setShowHoldModal(false)}
        />
      )}

      {/* Reserve / Hold Confirmation when All Copies are Checked Out (T-17) */}
      {showHoldModal && isLoggedInPatron && !isAvailable && (
        <ConfirmDialog
          isOpen={true}
          title={`Reserve "${title.title}"`}
          message={`Place a reservation hold on "${title.title}"? You will be added to the reservation queue and assigned the next copy returned to the library.`}
          confirmLabel={holdLoading ? "Placing Hold..." : "Confirm Reservation"}
          cancelLabel="Cancel"
          onConfirm={handleConfirmPlaceHold}
          onCancel={() => setShowHoldModal(false)}
        />
      )}
    </div>
  );
}
