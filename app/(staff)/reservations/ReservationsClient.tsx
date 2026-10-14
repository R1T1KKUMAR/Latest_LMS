"use client";

import { useRouter } from "next/navigation";
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
import { formatDate } from "@/lib/utils";

interface ReservationItem {
  id: number;
  queuePosition: number;
  status: string;
  reservationDate: Date | string | null;
  pickupExpiryDate: Date | string | null;
  patronName: string;
  patronCard: string;
  title: string;
}

interface ReservationsClientProps {
  initialReservations: ReservationItem[];
  csrfToken?: string;
}

export function ReservationsClient({ initialReservations, csrfToken }: ReservationsClientProps) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [cancellingHold, setCancellingHold] = useState<ReservationItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [housekeepingLoading, setHousekeepingLoading] = useState(false);
  const [alertState, setAlertState] = useState<{
    variant: "success" | "error" | "info";
    message: string;
  } | null>(null);

  const filtered = initialReservations.filter(
    (r) =>
      r.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.patronName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.patronCard.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleConfirmCancel = async () => {
    if (!cancellingHold) return;
    setLoading(true);
    setAlertState(null);

    try {
      const res = await fetch(`/api/holds/${cancellingHold.id}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken ?? "",
        },
        body: JSON.stringify({
          csrfToken,
          reason: "Staff manual cancellation from reservations queue",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to cancel hold");
      }

      setAlertState({
        variant: "success",
        message: `Hold #${cancellingHold.id} for "${cancellingHold.title}" has been cancelled. ${
          data.nextHoldPromoted
            ? `Copy re-assigned to next patron (Hold #${data.nextHoldPromoted.id}).`
            : "Copy returned to shelf or queue updated."
        }`,
      });
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Cancellation failed";
      setAlertState({
        variant: "error",
        message,
      });
    } finally {
      setLoading(false);
      setCancellingHold(null);
    }
  };

  const handleRunHousekeeping = async () => {
    setHousekeepingLoading(true);
    setAlertState(null);

    try {
      const res = await fetch("/api/holds/process-expired", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken ?? "",
        },
        body: JSON.stringify({ csrfToken }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to run housekeeping");
      }

      setAlertState({
        variant: "info",
        message: `Expiration housekeeping complete: ${data.processedCount} expired holds processed.`,
      });
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Housekeeping failed";
      setAlertState({
        variant: "error",
        message,
      });
    } finally {
      setHousekeepingLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "AVAILABLE_FOR_PICKUP":
        return "bg-emerald-100 text-emerald-800 border-emerald-300";
      case "WAITING":
        return "bg-blue-100 text-blue-800 border-blue-300";
      case "COMPLETED":
        return "bg-slate-100 text-slate-700 border-slate-300";
      case "CANCELLED":
        return "bg-zinc-100 text-zinc-600 border-zinc-300";
      case "EXPIRED":
        return "bg-rose-100 text-rose-800 border-rose-300";
      default:
        return "bg-slate-100 text-slate-800 border-slate-300";
    }
  };

  return (
    <div className="space-y-6">
      {alertState && <Alert variant={alertState.variant}>{alertState.message}</Alert>}

      {/* Search & Actions Bar */}
      <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:flex-row sm:items-center">
        <div className="w-full sm:w-96">
          <Input
            id="reservations-search"
            placeholder="Search by title, patron name, or card number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-slate-500">
            Showing {filtered.length} of {initialReservations.length} reservations
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRunHousekeeping}
            isLoading={housekeepingLoading}
          >
            Run Expiry Check
          </Button>
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
                    {item.status === "WAITING" || item.status === "AVAILABLE_FOR_PICKUP" ? (
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-900">
                        #{item.queuePosition}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 font-mono">—</span>
                    )}
                  </TableCell>
                  <TableCell className="font-semibold text-slate-900 max-w-xs truncate">
                    {item.title}
                  </TableCell>
                  <TableCell className="text-slate-800">{item.patronName}</TableCell>
                  <TableCell className="font-mono text-xs text-slate-600">
                    {item.patronCard}
                  </TableCell>
                  <TableCell className="text-xs text-slate-600">
                    {formatDate(item.reservationDate)}
                  </TableCell>
                  <TableCell className="text-xs text-slate-600">
                    {item.pickupExpiryDate ? (
                      <span className="font-semibold text-amber-700">
                        {formatDate(item.pickupExpiryDate)}
                      </span>
                    ) : item.status === "WAITING" ? (
                      <span className="text-slate-400 italic">Pending Return</span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${getStatusBadge(
                        item.status,
                      )}`}
                    >
                      {item.status.replace(/_/g, " ")}
                    </span>
                  </TableCell>
                  <TableCell>
                    {item.status === "WAITING" || item.status === "AVAILABLE_FOR_PICKUP" ? (
                      <button
                        type="button"
                        onClick={() => setCancellingHold(item)}
                        className="text-xs font-semibold text-red-600 hover:text-red-800 transition"
                      >
                        Cancel Hold
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
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
          message={`Are you sure you want to cancel hold #${cancellingHold.id} for "${cancellingHold.title}" (Patron: ${cancellingHold.patronName})? This action will advance the next waiting patron in line.`}
          confirmLabel={loading ? "Cancelling..." : "Confirm Cancellation"}
          cancelLabel="Keep Hold"
          onConfirm={handleConfirmCancel}
          onCancel={() => setCancellingHold(null)}
        />
      )}
    </div>
  );
}
