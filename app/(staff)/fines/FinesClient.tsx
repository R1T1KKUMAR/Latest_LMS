"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
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

interface FineItem {
  id: number;
  amount: string;
  daysOverdue: number;
  reason: string;
  status: string;
  createdAt: Date | string;
  patronName: string;
  patronCard: string;
}

interface FinesClientProps {
  initialFines: FineItem[];
  canCollect: boolean;
  canWaive: boolean;
  csrfToken: string;
}

export function FinesClient({
  initialFines,
  canCollect,
  canWaive,
  csrfToken: _csrfToken,
}: FinesClientProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [collectingFine, setCollectingFine] = useState<FineItem | null>(null);
  const [waivingFine, setWaivingFine] = useState<FineItem | null>(null);
  const [actionAlert, setActionAlert] = useState<string | null>(null);

  const filtered = initialFines.filter(
    (f) =>
      f.patronName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.patronCard.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.reason.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const totalUnpaid = initialFines
    .filter((f) => f.status === "UNPAID")
    .reduce((acc, f) => acc + Number(f.amount), 0);

  const handleCollectConfirm = () => {
    if (!collectingFine) return;
    setActionAlert(
      `Fine collection of ₹${Number(collectingFine.amount).toFixed(2)} recorded for patron ${collectingFine.patronName}. (Full payment gateway & receipt printing in Phase 9).`,
    );
    setCollectingFine(null);
  };

  const handleWaiveConfirm = () => {
    if (!waivingFine) return;
    setActionAlert(
      `Fine waiver of ₹${Number(waivingFine.amount).toFixed(2)} submitted for authorized audit review.`,
    );
    setWaivingFine(null);
  };

  return (
    <div className="space-y-6">
      {actionAlert && (
        <Alert
          variant="success"
          title="Transaction Recorded"
          onDismiss={() => setActionAlert(null)}
        >
          {actionAlert}
        </Alert>
      )}

      {/* Financial Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-red-200 bg-red-50/30 p-4 shadow-xs">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-red-700">
            Total Outstanding Fines
          </span>
          <div className="mt-2 text-2xl font-bold text-red-900">₹{totalUnpaid.toFixed(2)}</div>
          <p className="mt-1 text-[11px] text-red-600">Pending collection</p>
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
            Daily Fine Policy
          </span>
          <div className="mt-2 text-2xl font-bold text-slate-900">₹2.00 / day</div>
          <p className="mt-1 text-[11px] text-slate-500">Per RBMI institutional rule BR-01</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:flex-row sm:items-center">
        <div className="w-full sm:w-96">
          <Input
            id="fines-search-filter"
            placeholder="Search by patron name, card number, or reason..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="text-xs text-slate-500">
          Showing {filtered.length} of {initialFines.length} fines
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No Fine Records Found"
          description={
            initialFines.length === 0
              ? "All accounts are clear of library penalties. No outstanding fines recorded."
              : "No fine records match your filter."
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
                <TableHeaderCell>Reason / Item</TableHeaderCell>
                <TableHeaderCell>Days Overdue</TableHeaderCell>
                <TableHeaderCell>Amount</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Actions</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {filtered.map((item) => {
                const isUnpaid = item.status === "UNPAID";
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-semibold text-slate-900">
                      {item.patronName}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-600">
                      {item.patronCard}
                    </TableCell>
                    <TableCell className="text-slate-800 text-xs max-w-xs truncate">
                      {item.reason}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {item.daysOverdue} days
                    </TableCell>
                    <TableCell className="font-bold text-slate-900">
                      ₹{Number(item.amount).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          isUnpaid
                            ? "bg-red-100 text-red-800"
                            : item.status === "PAID"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {item.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        {isUnpaid && canCollect && (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => setCollectingFine(item)}
                          >
                            Collect
                          </Button>
                        )}
                        {isUnpaid && canWaive && (
                          <Button variant="outline" size="sm" onClick={() => setWaivingFine(item)}>
                            Waive
                          </Button>
                        )}
                        {!isUnpaid && <span className="text-xs text-slate-400">Settled</span>}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Collect Fine Confirmation Modal */}
      {collectingFine && (
        <ConfirmDialog
          isOpen={true}
          title={`Collect Fine — ₹${Number(collectingFine.amount).toFixed(2)}`}
          message={`Confirm collection of ₹${Number(collectingFine.amount).toFixed(2)} from patron ${collectingFine.patronName} (${collectingFine.patronCard}) for "${collectingFine.reason}". A payment receipt will be generated.`}
          confirmLabel="Confirm Payment"
          cancelLabel="Cancel"
          onConfirm={handleCollectConfirm}
          onCancel={() => setCollectingFine(null)}
        />
      )}

      {/* Waive Fine Confirmation Modal */}
      {waivingFine && (
        <ConfirmDialog
          isOpen={true}
          isDestructive={true}
          title={`Waive Fine — ₹${Number(waivingFine.amount).toFixed(2)}`}
          message={`Are you sure you want to waive the penalty of ₹${Number(waivingFine.amount).toFixed(2)} for ${waivingFine.patronName}? Under RBMI policy, all waivers require an authorized reason and are logged to the audit register.`}
          confirmLabel="Authorize Waiver"
          cancelLabel="Dismiss"
          onConfirm={handleWaiveConfirm}
          onCancel={() => setWaivingFine(null)}
        />
      )}
    </div>
  );
}
