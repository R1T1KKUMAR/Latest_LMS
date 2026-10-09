"use client";

import { useState } from "react";
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

interface ReservationItem {
  id: number;
  queuePosition: number;
  status: string;
  reservationDate: Date | string;
  pickupExpiryDate: Date | string | null;
  patronName: string;
  patronCard: string;
  title: string;
}

interface ReservationsClientProps {
  initialReservations: ReservationItem[];
}

export function ReservationsClient({ initialReservations }: ReservationsClientProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [cancellingHold, setCancellingHold] = useState<ReservationItem | null>(null);

  const filtered = initialReservations.filter(
    (r) =>
      r.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.patronName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.patronCard.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:flex-row sm:items-center">
        <div className="w-full sm:w-96">
          <Input
            id="reservations-search"
            placeholder="Search by title, patron name, or card number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="text-xs text-slate-500">
          Showing {filtered.length} of {initialReservations.length} reservations
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No Active Reservations"
          description={
            initialReservations.length === 0
              ? "There are currently no active holds or reservations in the queue."
              : "No reservations matched your search criteria."
          }
          icon="📌"
        />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Queue Pos</TableHeaderCell>
                <TableHeaderCell>Title</TableHeaderCell>
                <TableHeaderCell>Patron</TableHeaderCell>
                <TableHeaderCell>Card Number</TableHeaderCell>
                <TableHeaderCell>Date Placed</TableHeaderCell>
                <TableHeaderCell>Pickup Deadline</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Actions</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {filtered.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-900">
                      #{item.queuePosition}
                    </span>
                  </TableCell>
                  <TableCell className="font-semibold text-slate-900 max-w-xs truncate">
                    {item.title}
                  </TableCell>
                  <TableCell className="text-slate-800">{item.patronName}</TableCell>
                  <TableCell className="font-mono text-xs text-slate-600">
                    {item.patronCard}
                  </TableCell>
                  <TableCell className="text-xs text-slate-600">
                    {new Date(item.reservationDate).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-xs text-slate-600">
                    {item.pickupExpiryDate
                      ? new Date(item.pickupExpiryDate).toLocaleDateString()
                      : "Pending Return"}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        item.status === "AVAILABLE"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-blue-100 text-blue-800"
                      }`}
                    >
                      {item.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => setCancellingHold(item)}
                      className="text-xs font-semibold text-red-600 hover:text-red-800"
                    >
                      Cancel Hold
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Cancel Hold Confirmation Dialog */}
      {cancellingHold && (
        <ConfirmDialog
          isOpen={true}
          isDestructive={true}
          title="Cancel Reservation"
          message={`Are you sure you want to cancel hold #${cancellingHold.queuePosition} for "${cancellingHold.title}" (Patron: ${cancellingHold.patronName})? This action updates the hold queue order.`}
          confirmLabel="Confirm Cancellation"
          cancelLabel="Keep Hold"
          onConfirm={() => setCancellingHold(null)}
          onCancel={() => setCancellingHold(null)}
        />
      )}
    </div>
  );
}
