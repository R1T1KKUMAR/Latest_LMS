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

export interface PatronProfile {
  id: number;
  cardNo: string;
  fullName: string;
  patronType: string;
  email: string | null;
  mobile: string | null;
  rollNo: string | null;
  employeeId: string | null;
  cardExpiry: string;
  status: string;
}

export interface PatronLoan {
  id: number;
  title: string;
  accessionNo: string;
  issueDate: string;
  dueDate: string;
  status: string;
  renewalCount: number;
}

export interface PatronHold {
  id: number;
  title: string;
  requestDate: string;
  queuePosition: number;
  status: string;
  expiryDate: string | null;
}

export interface PatronFine {
  id: number;
  reason: string;
  amount: string;
  status: string;
  createdAt: string;
}

interface AccountClientProps {
  patron: PatronProfile | null;
  loans: PatronLoan[];
  holds: PatronHold[];
  fines: PatronFine[];
  csrfToken: string;
}

export function AccountClient({ patron, loans, holds, fines, csrfToken }: AccountClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"loans" | "holds" | "fines" | "security">("loans");
  const [loggingOut, setLoggingOut] = useState(false);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<{
    variant: "info" | "success" | "warning" | "error";
    message: string;
  } | null>(null);

  // Renew modal
  const [renewTarget, setRenewTarget] = useState<PatronLoan | null>(null);
  const [cancelHoldTarget, setCancelHoldTarget] = useState<PatronHold | null>(null);

  if (!patron) {
    return (
      <div className="py-12">
        <EmptyState
          title="Patron Sign-In Required"
          description="Please sign in with your student roll number or faculty employee ID and password to access your borrowing history, active loans, and account settings."
          action={{
            label: "Sign In as Patron",
            href: "/login",
          }}
          icon="🔒"
        />
      </div>
    );
  }

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({ csrfToken }),
      });
    } finally {
      router.push("/login");
      router.refresh();
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordStatus({
        variant: "error",
        message: "New password and confirmation do not match.",
      });
      return;
    }

    if (newPassword.length < 8) {
      setPasswordStatus({
        variant: "error",
        message: "New password must be at least 8 characters long per security policy.",
      });
      return;
    }

    setPasswordLoading(true);
    setPasswordStatus(null);

    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          csrfToken,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setPasswordStatus({
          variant: "error",
          message: data.error || "Failed to update password.",
        });
      } else {
        setPasswordStatus({
          variant: "success",
          message: "Your password has been changed successfully.",
        });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch {
      setPasswordStatus({
        variant: "error",
        message: "Network error occurred while attempting to change password.",
      });
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Profile Card Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center space-x-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-blue-900 text-xl font-bold text-white shadow-xs">
              {patron.fullName.charAt(0)}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl font-bold text-slate-900">{patron.fullName}</h1>
                <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-900 uppercase">
                  {patron.patronType}
                </span>
                <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 uppercase">
                  {patron.status}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                <span>
                  Card No: <strong className="font-mono text-slate-700">{patron.cardNo}</strong>
                </span>
                {patron.rollNo && (
                  <span>
                    Roll No: <strong className="text-slate-700">{patron.rollNo}</strong>
                  </span>
                )}
                {patron.employeeId && (
                  <span>
                    Emp ID: <strong className="text-slate-700">{patron.employeeId}</strong>
                  </span>
                )}
                <span>
                  Card Expiry:{" "}
                  <strong className="text-slate-700">
                    {new Date(patron.cardExpiry).toLocaleDateString()}
                  </strong>
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-red-50 hover:text-red-700 transition"
          >
            {loggingOut ? "Signing out..." : "Sign Out"}
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex space-x-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("loans")}
          className={`rounded-lg px-4 py-2 text-xs font-bold transition ${
            activeTab === "loans"
              ? "bg-blue-900 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          📖 Active Loans ({loans.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("holds")}
          className={`rounded-lg px-4 py-2 text-xs font-bold transition ${
            activeTab === "holds"
              ? "bg-blue-900 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          📌 Reservations ({holds.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("fines")}
          className={`rounded-lg px-4 py-2 text-xs font-bold transition ${
            activeTab === "fines"
              ? "bg-blue-900 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          💰 Fines &amp; Dues ({fines.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("security")}
          className={`rounded-lg px-4 py-2 text-xs font-bold transition ${
            activeTab === "security"
              ? "bg-blue-900 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          🛡️ Change Password
        </button>
      </div>

      {/* Tab 1: Active Loans */}
      {activeTab === "loans" && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          <h2 className="text-base font-bold text-slate-900 mb-1">Currently Borrowed Books</h2>
          <p className="text-xs text-slate-500 mb-4">Items issued to your library account</p>

          {loans.length === 0 ? (
            <EmptyState
              title="No Active Loans"
              description="You do not currently have any books checked out from the library."
              action={{
                label: "Browse Catalogue (OPAC)",
                href: "/opac",
              }}
              icon="📚"
            />
          ) : (
            <Table>
              <TableHead>
                <tr>
                  <TableHeaderCell>Book Title</TableHeaderCell>
                  <TableHeaderCell>Accession No</TableHeaderCell>
                  <TableHeaderCell>Issue Date</TableHeaderCell>
                  <TableHeaderCell>Due Date</TableHeaderCell>
                  <TableHeaderCell>Renewals</TableHeaderCell>
                  <TableHeaderCell>Actions</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {loans.map((loan) => {
                  const isOverdue = new Date(loan.dueDate) < new Date();
                  return (
                    <TableRow key={loan.id}>
                      <TableCell className="font-semibold text-slate-900">{loan.title}</TableCell>
                      <TableCell className="font-mono text-xs text-slate-600">
                        {loan.accessionNo}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">
                        {new Date(loan.issueDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className={isOverdue ? "font-bold text-red-600" : "text-slate-700"}>
                          {new Date(loan.dueDate).toLocaleDateString()}
                          {isOverdue && " (Overdue)"}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">
                        {loan.renewalCount} / 1
                      </TableCell>
                      <TableCell>
                        <Button variant="secondary" size="sm" onClick={() => setRenewTarget(loan)}>
                          Request Renewal
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      {/* Tab 2: Reservations */}
      {activeTab === "holds" && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          <h2 className="text-base font-bold text-slate-900 mb-1">Your Title Reservations</h2>
          <p className="text-xs text-slate-500 mb-4">Titles in queue or waiting for pickup</p>

          {holds.length === 0 ? (
            <EmptyState
              title="No Active Reservations"
              description="You have not reserved any books currently. Find titles in OPAC to place holds."
              icon="📌"
            />
          ) : (
            <Table>
              <TableHead>
                <tr>
                  <TableHeaderCell>Queue Pos</TableHeaderCell>
                  <TableHeaderCell>Title</TableHeaderCell>
                  <TableHeaderCell>Date Requested</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>Pickup Deadline</TableHeaderCell>
                  <TableHeaderCell>Actions</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {holds.map((hold) => (
                  <TableRow key={hold.id}>
                    <TableCell>
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-900">
                        #{hold.queuePosition}
                      </span>
                    </TableCell>
                    <TableCell className="font-semibold text-slate-900">{hold.title}</TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {new Date(hold.requestDate).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800 uppercase">
                        {hold.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {hold.expiryDate ? new Date(hold.expiryDate).toLocaleDateString() : "Pending"}
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => setCancelHoldTarget(hold)}
                        className="text-xs font-semibold text-red-600 hover:text-red-800"
                      >
                        Cancel
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      {/* Tab 3: Fines & Dues */}
      {activeTab === "fines" && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          <h2 className="text-base font-bold text-slate-900 mb-1">
            Fine Records &amp; Liabilities
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            Penalties assessed for overdue or damaged materials
          </p>

          {fines.length === 0 ? (
            <EmptyState
              title="No Fines Recorded"
              description="Your account is completely clear of overdue library penalties."
              icon="✓"
            />
          ) : (
            <Table>
              <TableHead>
                <tr>
                  <TableHeaderCell>Reason</TableHeaderCell>
                  <TableHeaderCell>Assessed Date</TableHeaderCell>
                  <TableHeaderCell>Amount</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {fines.map((fine) => (
                  <TableRow key={fine.id}>
                    <TableCell className="font-semibold text-slate-900">{fine.reason}</TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {new Date(fine.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="font-bold text-slate-900">
                      ₹{Number(fine.amount).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          fine.status === "OUTSTANDING"
                            ? "bg-red-100 text-red-800"
                            : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {fine.status}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}

      {/* Tab 4: Security */}
      {activeTab === "security" && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs max-w-xl">
          <h2 className="text-base font-bold text-slate-900 mb-1">Update Patron Password</h2>
          <p className="text-xs text-slate-500 mb-6">
            Ensure your password is at least 8 characters long and contains letters and numbers.
          </p>

          {passwordStatus && (
            <div className="mb-4">
              <Alert variant={passwordStatus.variant}>{passwordStatus.message}</Alert>
            </div>
          )}

          <form onSubmit={handlePasswordChange} className="space-y-4">
            <Input
              id="patron-current-password"
              type="password"
              label="Current Password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
            <Input
              id="patron-new-password"
              type="password"
              label="New Password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <Input
              id="patron-confirm-password"
              type="password"
              label="Confirm New Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />

            <div className="pt-2">
              <Button type="submit" variant="primary" isLoading={passwordLoading}>
                Update Password
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Renew Modal Dialog */}
      {renewTarget && (
        <ConfirmDialog
          isOpen={true}
          title={`Renew "${renewTarget.title}"`}
          message={`Are you sure you want to renew this item? If no other patron has placed a hold on this book, your loan will be extended by 14 days.`}
          confirmLabel="Submit Renewal"
          cancelLabel="Cancel"
          onConfirm={() => {
            alert("Renewal request submitted. (Automated circulation renewal active in Phase 6).");
            setRenewTarget(null);
          }}
          onCancel={() => setRenewTarget(null)}
        />
      )}

      {/* Cancel Hold Dialog */}
      {cancelHoldTarget && (
        <ConfirmDialog
          isOpen={true}
          isDestructive={true}
          title={`Cancel Reservation`}
          message={`Are you sure you want to cancel your reservation for "${cancelHoldTarget.title}"?`}
          confirmLabel="Cancel Hold"
          cancelLabel="Keep Reservation"
          onConfirm={() => setCancelHoldTarget(null)}
          onCancel={() => setCancelHoldTarget(null)}
        />
      )}
    </div>
  );
}
