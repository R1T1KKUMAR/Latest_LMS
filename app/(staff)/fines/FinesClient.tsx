"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
import type { FineListItem, PaymentMethod } from "@/services/fines";

interface FinesClientProps {
  initialFines: FineListItem[];
  initialTotalOutstanding: number;
  canCollect: boolean;
  canWaive: boolean;
  csrfToken: string;
}

export function FinesClient({
  initialFines,
  initialTotalOutstanding,
  canCollect,
  canWaive,
  csrfToken,
}: FinesClientProps) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [collectingFine, setCollectingFine] = useState<FineListItem | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [paymentRemarks, setPaymentRemarks] = useState<string>("");

  const [waivingFine, setWaivingFine] = useState<FineListItem | null>(null);
  const [waiverRemarks, setWaiverRemarks] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [actionAlert, setActionAlert] = useState<{
    variant: "success" | "error" | "info";
    message: string;
    receiptNo?: string;
  } | null>(null);

  const filtered = initialFines.filter((f) => {
    if (statusFilter !== "ALL" && f.status !== statusFilter) return false;
    if (!searchTerm.trim()) return true;

    const term = searchTerm.toLowerCase();
    return (
      f.patronName.toLowerCase().includes(term) ||
      f.patronCard.toLowerCase().includes(term) ||
      f.reason.toLowerCase().includes(term) ||
      f.fineType.toLowerCase().includes(term)
    );
  });

  const openCollectModal = (fine: FineListItem) => {
    setCollectingFine(fine);
    setPaymentAmount(fine.balanceAmount);
    setPaymentMethod("CASH");
    setPaymentRemarks("");
    setActionAlert(null);
  };

  const handleCollectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!collectingFine) return;

    const numAmount = Number(paymentAmount);
    const numBalance = Number(collectingFine.balanceAmount);

    if (Number.isNaN(numAmount) || numAmount <= 0) {
      setActionAlert({
        variant: "error",
        message: "Payment amount must be greater than zero.",
      });
      return;
    }

    if (numAmount > numBalance) {
      setActionAlert({
        variant: "error",
        message: `Payment amount (₹${numAmount.toFixed(2)}) cannot exceed outstanding balance (₹${numBalance.toFixed(2)}).`,
      });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/fines/pay", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          fineId: collectingFine.id,
          amount: numAmount,
          paymentMethod,
          remarks: paymentRemarks,
          csrfToken,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Payment collection failed");
      }

      setActionAlert({
        variant: "success",
        message: `Payment of ₹${numAmount.toFixed(2)} collected successfully! (Receipt: ${data.receiptNo}). Remaining balance: ₹${Number(data.remainingBalance).toFixed(2)}.`,
        receiptNo: data.receiptNo,
      });

      setCollectingFine(null);
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Payment failed";
      setActionAlert({
        variant: "error",
        message: msg,
      });
    } finally {
      setLoading(false);
    }
  };

  const openWaiveModal = (fine: FineListItem) => {
    setWaivingFine(fine);
    setWaiverRemarks("");
    setActionAlert(null);
  };

  const handleWaiveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waivingFine) return;

    setLoading(true);
    try {
      const res = await fetch("/api/fines/waive", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          fineId: waivingFine.id,
          remarks: waiverRemarks || "Administrative waiver authorized by librarian",
          csrfToken,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Fine waiver failed");
      }

      setActionAlert({
        variant: "success",
        message: `Fine #${waivingFine.id} waived successfully for patron ${waivingFine.patronName}. (Waiver Receipt: ${data.receiptNo}).`,
        receiptNo: data.receiptNo,
      });

      setWaivingFine(null);
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Waiver failed";
      setActionAlert({
        variant: "error",
        message: msg,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {actionAlert && (
        <Alert variant={actionAlert.variant}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <span>{actionAlert.message}</span>
            {actionAlert.receiptNo && (
              <Link
                href={`/fines/receipt/${actionAlert.receiptNo}`}
                className="inline-flex items-center gap-1 rounded bg-white px-2.5 py-1 text-xs font-bold text-slate-800 shadow-xs border hover:bg-slate-50 transition"
              >
                🖨️ View &amp; Print Receipt &rarr;
              </Link>
            )}
          </div>
        </Alert>
      )}

      {/* Financial Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-4 shadow-xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-rose-700">
            Total Outstanding Fines
          </span>
          <div className="mt-2 text-2xl font-bold text-rose-900">
            ₹{initialTotalOutstanding.toFixed(2)}
          </div>
          <p className="mt-1 text-[11px] text-rose-600">Pending patron collection</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Total Fine Records
          </span>
          <div className="mt-2 text-2xl font-bold text-slate-900">{initialFines.length}</div>
          <p className="mt-1 text-[11px] text-slate-500">Historical &amp; active records</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Overdue Fine Policy
          </span>
          <div className="mt-2 text-2xl font-bold text-slate-900">₹2.00 / day</div>
          <p className="mt-1 text-[11px] text-slate-500">Grace: 0 days &bull; Cap: ₹200 (BR-06)</p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:flex-row sm:items-center">
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          <div className="w-full sm:w-80">
            <Input
              id="fines-search-filter"
              placeholder="Search by patron name, card, reason, or type..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-44">
            <Select
              id="fines-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[
                { value: "ALL", label: "All Statuses" },
                { value: "OUTSTANDING", label: "Outstanding Only" },
                { value: "PAID", label: "Paid Only" },
                { value: "WAIVED", label: "Waived Only" },
              ]}
            />
          </div>
        </div>
        <div className="text-xs text-slate-500">
          Showing {filtered.length} of {initialFines.length} fine records
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No Fine Records Found"
          description={
            initialFines.length === 0
              ? "All accounts are clear of library penalties. No outstanding fines recorded."
              : "No fine records match your filter criteria."
          }
          icon="💰"
        />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Patron</TableHeaderCell>
                <TableHeaderCell>Card Number</TableHeaderCell>
                <TableHeaderCell>Type</TableHeaderCell>
                <TableHeaderCell>Reason / Details</TableHeaderCell>
                <TableHeaderCell>Original Amount</TableHeaderCell>
                <TableHeaderCell>Paid</TableHeaderCell>
                <TableHeaderCell>Balance Due</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Actions</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {filtered.map((item) => {
                const isOutstanding = item.status === "OUTSTANDING";
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-semibold text-slate-900">
                      {item.patronName}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-600">
                      {item.patronCard}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">
                        {item.fineType}
                      </span>
                    </TableCell>
                    <TableCell className="text-slate-800 text-xs max-w-xs truncate">
                      {item.reason}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      ₹{Number(item.amount).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600 font-mono">
                      ₹{Number(item.paidAmount).toFixed(2)}
                    </TableCell>
                    <TableCell className="font-bold font-mono">
                      <span
                        className={
                          Number(item.balanceAmount) > 0 ? "text-rose-700" : "text-emerald-700"
                        }
                      >
                        ₹{Number(item.balanceAmount).toFixed(2)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          isOutstanding
                            ? "bg-rose-100 text-rose-800 border border-rose-300"
                            : item.status === "PAID"
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                              : "bg-amber-100 text-amber-800 border border-amber-300"
                        }`}
                      >
                        {item.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        {isOutstanding && canCollect && (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => openCollectModal(item)}
                          >
                            Collect
                          </Button>
                        )}
                        {isOutstanding && canWaive && (
                          <Button variant="outline" size="sm" onClick={() => openWaiveModal(item)}>
                            Waive
                          </Button>
                        )}
                        {!isOutstanding && (
                          <span className="text-xs text-slate-400 font-medium">Settled</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Collect Payment Modal Dialog */}
      {collectingFine && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
            <h2 className="text-lg font-bold text-slate-900">
              Collect Fine Payment — Fine #{collectingFine.id}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Patron: <strong>{collectingFine.patronName}</strong> ({collectingFine.patronCard})
            </p>

            <div className="my-4 rounded-xl bg-slate-50 p-3 text-xs border border-slate-200 space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-600">Fine Reason:</span>
                <span className="font-medium text-slate-900">{collectingFine.reason}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Total Assessed:</span>
                <span className="font-mono text-slate-800">
                  ₹{Number(collectingFine.amount).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Already Paid:</span>
                <span className="font-mono text-slate-800">
                  ₹{Number(collectingFine.paidAmount).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between font-bold text-slate-900 border-t pt-1">
                <span>Outstanding Balance:</span>
                <span className="text-rose-700 font-mono">
                  ₹{Number(collectingFine.balanceAmount).toFixed(2)}
                </span>
              </div>
            </div>

            <form onSubmit={handleCollectSubmit} className="space-y-4 text-xs">
              <div>
                <label
                  htmlFor="payment-amount-input"
                  className="block font-semibold text-slate-700 mb-1"
                >
                  Amount to Pay (₹)
                </label>
                <Input
                  id="payment-amount-input"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={collectingFine.balanceAmount}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  required
                />
                <span className="text-[11px] text-slate-400 mt-0.5 block">
                  Partial payments permitted. Max: ₹{collectingFine.balanceAmount}
                </span>
              </div>

              <div>
                <label
                  htmlFor="payment-method-select"
                  className="block font-semibold text-slate-700 mb-1"
                >
                  Payment Method
                </label>
                <Select
                  id="payment-method-select"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  options={[
                    { value: "CASH", label: "Cash" },
                    { value: "UPI", label: "UPI / QR Code" },
                    { value: "CARD", label: "Debit / Credit Card" },
                    { value: "ONLINE", label: "Online Campus Portal" },
                  ]}
                />
              </div>

              <div>
                <label
                  htmlFor="payment-remarks-input"
                  className="block font-semibold text-slate-700 mb-1"
                >
                  Remarks / Transaction Ref (Optional)
                </label>
                <Input
                  id="payment-remarks-input"
                  placeholder="e.g., UPI Transaction ID, Cash counter slip"
                  value={paymentRemarks}
                  onChange={(e) => setPaymentRemarks(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCollectingFine(null)}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm" isLoading={loading}>
                  Confirm &amp; Issue Receipt
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Waive Fine Modal Dialog */}
      {waivingFine && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
            <h2 className="text-lg font-bold text-rose-900">
              Authorize Fine Waiver — Fine #{waivingFine.id}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Patron: <strong>{waivingFine.patronName}</strong> ({waivingFine.patronCard})
            </p>

            <div className="my-4 rounded-xl bg-amber-50 p-3 text-xs border border-amber-200 space-y-1">
              <div className="flex justify-between">
                <span className="text-amber-800 font-semibold">Balance to Forgive:</span>
                <span className="font-mono font-bold text-amber-900">
                  ₹{Number(waivingFine.balanceAmount).toFixed(2)}
                </span>
              </div>
              <p className="text-[11px] text-amber-700 pt-1">
                Waivers permanently close fine liability. Under RBMI Section 4.9 policy, an audit
                entry will be recorded with your staff identity.
              </p>
            </div>

            <form onSubmit={handleWaiveSubmit} className="space-y-4 text-xs">
              <div>
                <label
                  htmlFor="waiver-remarks-input"
                  className="block font-semibold text-slate-700 mb-1"
                >
                  Waiver Authorization Reason (Required)
                </label>
                <Input
                  id="waiver-remarks-input"
                  placeholder="e.g., Authorized by Principal, Medical leave concession"
                  value={waiverRemarks}
                  onChange={(e) => setWaiverRemarks(e.target.value)}
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setWaivingFine(null)}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="danger" size="sm" isLoading={loading}>
                  Authorize Waiver
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
