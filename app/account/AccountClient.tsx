"use client";

import Link from "next/link";
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
import type { PatronAccountData } from "@/services/opac";

interface AccountClientProps {
  accountData: PatronAccountData | null;
  csrfToken: string;
}

export function AccountClient({ accountData, csrfToken }: AccountClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"loans" | "history" | "holds" | "fines" | "security">(
    "loans",
  );
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

  // Local state for mustChangePassword flag
  const [mustChangePassword, setMustChangePassword] = useState(
    accountData?.profile.mustChangePassword ?? false,
  );

  // Cancel hold state
  // biome-ignore lint/suspicious/noExplicitAny: hold target
  const [cancelHoldTarget, setCancelHoldTarget] = useState<any | null>(null);
  const [cancelHoldLoading, setCancelHoldLoading] = useState(false);
  const [holdAlert, setHoldAlert] = useState<{
    variant: "info" | "success" | "warning" | "error";
    message: string;
  } | null>(null);

  if (!accountData) {
    return (
      <div className="py-8 sm:py-12">
        <EmptyState
          title="Patron Sign-In Required"
          description="Please sign in with your student roll number or faculty employee ID and password to access your borrowing history, currently issued books, reservations, and account settings."
          action={{
            label: "Sign In as Patron",
            href: "/login",
          }}
          icon="🔒"
        />
      </div>
    );
  }

  const { profile, currentLoans, loanHistory, holds, fines, totalOutstandingFines } = accountData;

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

  const handleCancelHold = async () => {
    if (!cancelHoldTarget) return;
    setCancelHoldLoading(true);
    setHoldAlert(null);
    try {
      const res = await fetch(`/api/holds/${cancelHoldTarget.id}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({ csrfToken }),
      });

      const data = await res.json();
      if (!res.ok) {
        setHoldAlert({
          variant: "error",
          message: data.error || "Failed to cancel reservation hold.",
        });
      } else {
        setHoldAlert({
          variant: "success",
          message: `Reservation hold for "${cancelHoldTarget.title}" has been cancelled.`,
        });
        setCancelHoldTarget(null);
        router.refresh();
      }
    } catch {
      setHoldAlert({
        variant: "error",
        message: "Network error occurred while cancelling reservation.",
      });
    } finally {
      setCancelHoldLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordStatus(null);

    if (newPassword.length < 6) {
      setPasswordStatus({
        variant: "warning",
        message: "New password must be at least 6 characters long.",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordStatus({
        variant: "warning",
        message: "New password and password confirmation do not match.",
      });
      return;
    }

    setPasswordLoading(true);
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
          message: data.error || "Failed to update password. Please check your current password.",
        });
      } else {
        setPasswordStatus({
          variant: "success",
          message:
            "Your password has been changed successfully. Initial password requirements cleared.",
        });
        setMustChangePassword(false);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        router.refresh();
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
    <div className="space-y-4 sm:space-y-6">
      {/* T-20 / FR-AU-05 Default Password Warning Banner */}
      {mustChangePassword && (
        <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-3 sm:p-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start space-x-3">
              <span className="text-xl sm:text-2xl">⚠️</span>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-amber-950">
                  Security Action Required: Default Password Active
                </h3>
                <p className="text-[11px] sm:text-xs text-amber-800 mt-0.5 leading-relaxed">
                  Your account is currently using the initial default password assigned at
                  registration or import. Please update your password to secure your account.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab("security")}
              className="w-full sm:w-auto text-center whitespace-nowrap rounded-md bg-amber-600 hover:bg-amber-700 px-3 py-1.5 text-xs font-bold text-white transition shadow-xs"
            >
              Change Password Now &rarr;
            </button>
          </div>
        </div>
      )}

      {/* Profile Card Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-xs">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-start sm:items-center space-x-3 sm:space-x-4">
            <div className="flex h-12 w-12 sm:h-14 sm:w-14 flex-shrink-0 items-center justify-center rounded-xl bg-blue-900 text-lg sm:text-xl font-bold text-white shadow-xs">
              {profile.fullName.charAt(0)}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <h1 className="text-lg sm:text-xl font-bold text-slate-900 truncate">
                  {profile.fullName}
                </h1>
                <span className="rounded bg-blue-100 px-2 py-0.5 text-[9px] sm:text-[10px] font-bold text-blue-900 uppercase">
                  {profile.patronType}
                </span>
                <span className="rounded bg-emerald-100 px-2 py-0.5 text-[9px] sm:text-[10px] font-bold text-emerald-800 uppercase">
                  {profile.status}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 sm:gap-x-4 gap-y-1 text-xs text-slate-500">
                <span>
                  Card No: <strong className="font-mono text-slate-700">{profile.cardNo}</strong>
                </span>
                <span>
                  Library:{" "}
                  <strong className="text-blue-900 font-semibold bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                    {profile.libraryName || "Central Library"}
                  </strong>
                </span>
                {profile.employeeId && (
                  <span>
                    Emp ID: <strong className="text-slate-700">{profile.employeeId}</strong>
                  </span>
                )}
                {profile.departmentName && (
                  <span>
                    Dept: <strong className="text-slate-700">{profile.departmentName}</strong>
                  </span>
                )}
                <span>
                  Card Expiry:{" "}
                  <strong className="text-slate-700">{formatDate(profile.cardExpiry)}</strong>
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full sm:w-auto text-center rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-red-50 hover:text-red-700 transition"
          >
            {loggingOut ? "Signing out..." : "Sign Out"}
          </button>
        </div>
      </div>

      {/* Navigation Tabs (Scrollable on mobile) */}
      <div className="flex overflow-x-auto no-scrollbar gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("loans")}
          className={`flex-shrink-0 whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-bold transition ${
            activeTab === "loans"
              ? "bg-blue-900 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          📖 Issued Books ({currentLoans.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className={`flex-shrink-0 whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-bold transition ${
            activeTab === "history"
              ? "bg-blue-900 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          📜 Borrowing History ({loanHistory.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("holds")}
          className={`flex-shrink-0 whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-bold transition ${
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
          className={`flex-shrink-0 whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-bold transition ${
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
          className={`flex-shrink-0 whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-bold transition ${
            activeTab === "security"
              ? "bg-blue-900 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          🛡️ Change Password
        </button>
      </div>

      {/* Tab 1: Issued Books (Formerly Loans) */}
      {activeTab === "loans" && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 shadow-xs space-y-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Currently Issued Books</h2>
            <p className="text-xs text-slate-500">
              Books currently issued to your patron account with issue periods and due dates.
            </p>
          </div>

          {currentLoans.length === 0 ? (
            <EmptyState
              title="No Issued Books"
              description="You do not currently have any issued books checked out from the library."
              action={{
                label: "Browse Catalogue (OPAC)",
                href: "/opac",
              }}
              icon="📚"
            />
          ) : (
            <>
              {/* Mobile Card View (< sm) */}
              <div className="space-y-3 sm:hidden">
                {currentLoans.map((loan) => (
                  <div
                    key={loan.id}
                    className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 shadow-2xs space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/opac/title/${loan.bibId}`}
                        className="font-bold text-sm text-slate-900 hover:text-blue-900 leading-snug"
                      >
                        {loan.title}
                      </Link>
                      <span
                        className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          loan.isOverdue
                            ? "bg-red-100 text-red-800"
                            : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {loan.isOverdue ? `${loan.daysOverdue}d overdue` : `${loan.daysRemaining}d left`}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5 text-[10px]">
                      <span className="font-mono bg-white text-slate-700 px-1.5 py-0.5 rounded border border-slate-200 font-semibold">
                        Acc: {loan.accessionNo}
                      </span>
                      <span className="bg-blue-50 text-blue-900 border border-blue-200 px-1.5 py-0.5 rounded font-medium">
                        {loan.libraryName}
                      </span>
                      <span className="bg-white text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded">
                        Renewals: {loan.renewalCount} used
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200 text-xs">
                      <div>
                        <span className="text-slate-400 block text-[10px] font-semibold uppercase">
                          Issue Date
                        </span>
                        <span className="text-slate-700 font-medium">
                          {formatDate(loan.issueDate)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] font-semibold uppercase">
                          Due Date
                        </span>
                        <span
                          className={`font-bold ${
                            loan.isOverdue ? "text-red-600" : "text-slate-900"
                          }`}
                        >
                          {formatDate(loan.dueDate)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table (>= sm) */}
              <div className="hidden sm:block">
                <Table>
                  <TableHead>
                    <tr>
                      <TableHeaderCell>Book Title</TableHeaderCell>
                      <TableHeaderCell>Accession #</TableHeaderCell>
                      <TableHeaderCell>Library</TableHeaderCell>
                      <TableHeaderCell>Issue Date</TableHeaderCell>
                      <TableHeaderCell>Due Date &amp; Status</TableHeaderCell>
                      <TableHeaderCell>Renewals</TableHeaderCell>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {currentLoans.map((loan) => (
                      <TableRow key={loan.id}>
                        <TableCell>
                          <Link
                            href={`/opac/title/${loan.bibId}`}
                            className="font-semibold text-slate-900 hover:text-blue-900"
                          >
                            {loan.title}
                          </Link>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-slate-600">
                          {loan.accessionNo}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">{loan.libraryName}</TableCell>
                        <TableCell className="text-xs text-slate-600">
                          {formatDate(loan.issueDate)}
                        </TableCell>
                        <TableCell className="text-xs">
                          {loan.isOverdue ? (
                            <span className="font-bold text-red-600">
                              {formatDate(loan.dueDate)} ({loan.daysOverdue} days overdue)
                            </span>
                          ) : (
                            <span className="text-slate-800">
                              {formatDate(loan.dueDate)}{" "}
                              <span className="text-slate-400">({loan.daysRemaining} days left)</span>
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">
                          {loan.renewalCount} used
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab 2: Borrowing History (FR-OP-02) */}
      {activeTab === "history" && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 shadow-xs space-y-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Borrowing History</h2>
            <p className="text-xs text-slate-500">
              Complete record of previously issued, returned, and closed library volumes.
            </p>
          </div>

          {loanHistory.length === 0 ? (
            <EmptyState
              title="No Past Borrowing History"
              description="You have not yet completed any book returns."
              icon="📜"
            />
          ) : (
            <>
              {/* Mobile Card View (< sm) */}
              <div className="space-y-3 sm:hidden">
                {loanHistory.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 shadow-2xs space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/opac/title/${item.bibId}`}
                        className="font-bold text-sm text-slate-900 hover:text-blue-900 leading-snug"
                      >
                        {item.title}
                      </Link>
                      <span
                        className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          item.status === "RETURNED"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-slate-100 text-slate-800"
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>

                    <div className="text-[11px] font-mono text-slate-600">
                      Accession #: {item.accessionNo}
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200 text-[11px]">
                      <div>
                        <span className="text-slate-400 block text-[9px] uppercase font-semibold">
                          Issued
                        </span>
                        <span className="text-slate-700">{formatDate(item.issueDate)}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[9px] uppercase font-semibold">
                          Due
                        </span>
                        <span className="text-slate-700">{formatDate(item.dueDate)}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[9px] uppercase font-semibold">
                          Returned
                        </span>
                        <span className="text-emerald-700 font-semibold">
                          {item.returnDate ? formatDate(item.returnDate) : "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table (>= sm) */}
              <div className="hidden sm:block">
                <Table>
                  <TableHead>
                    <tr>
                      <TableHeaderCell>Title</TableHeaderCell>
                      <TableHeaderCell>Accession #</TableHeaderCell>
                      <TableHeaderCell>Issue Date</TableHeaderCell>
                      <TableHeaderCell>Due Date</TableHeaderCell>
                      <TableHeaderCell>Return Date</TableHeaderCell>
                      <TableHeaderCell>Status</TableHeaderCell>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {loanHistory.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <Link
                            href={`/opac/title/${item.bibId}`}
                            className="font-medium text-slate-900 hover:text-blue-900"
                          >
                            {item.title}
                          </Link>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-slate-600">
                          {item.accessionNo}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">
                          {formatDate(item.issueDate)}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">
                          {formatDate(item.dueDate)}
                        </TableCell>
                        <TableCell className="text-xs text-slate-700">
                          {item.returnDate ? formatDate(item.returnDate) : "—"}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              item.status === "RETURNED"
                                ? "bg-slate-100 text-slate-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {item.status}
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
      )}

      {/* Tab 3: Reservations / Holds (FR-OP-02, FR-OP-03, T-17) */}
      {activeTab === "holds" && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 shadow-xs space-y-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Title Reservations &amp; Holds</h2>
            <p className="text-xs text-slate-500">
              Your position in waiting queues or titles ready for collection at the circulation
              desk.
            </p>
          </div>

          {holdAlert && <Alert variant={holdAlert.variant}>{holdAlert.message}</Alert>}

          {holds.length === 0 ? (
            <EmptyState
              title="No Active Reservations"
              description="You have not reserved any books currently. Find titles in OPAC to place holds."
              action={{
                label: "Find Books in OPAC",
                href: "/opac",
              }}
              icon="📌"
            />
          ) : (
            <>
              {/* Mobile Card View (< sm) */}
              <div className="space-y-3 sm:hidden">
                {holds.map((hold) => (
                  <div
                    key={hold.id}
                    className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 shadow-2xs space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center space-x-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-900">
                          #{hold.queuePosition}
                        </span>
                        <Link
                          href={`/opac/title/${hold.bibId}`}
                          className="font-bold text-sm text-slate-900 hover:text-blue-900 leading-snug"
                        >
                          {hold.title}
                        </Link>
                      </div>
                      <span
                        className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          hold.status === "AVAILABLE_FOR_PICKUP"
                            ? "bg-emerald-100 text-emerald-800 animate-pulse"
                            : hold.status === "WAITING"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {hold.status}
                      </span>
                    </div>

                    <p className="text-xs text-slate-500">{hold.authors}</p>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-xs">
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                          Pickup Deadline
                        </span>
                        <span className="font-medium text-slate-700">
                          {hold.pickupExpiryDate ? formatDate(hold.pickupExpiryDate) : "Pending return"}
                        </span>
                      </div>
                      {hold.isCancellable && (
                        <button
                          type="button"
                          onClick={() => setCancelHoldTarget(hold)}
                          className="rounded bg-red-50 border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-100 transition"
                        >
                          Cancel Hold
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table (>= sm) */}
              <div className="hidden sm:block">
                <Table>
                  <TableHead>
                    <tr>
                      <TableHeaderCell>Queue Pos</TableHeaderCell>
                      <TableHeaderCell>Title &amp; Authors</TableHeaderCell>
                      <TableHeaderCell>Request Date</TableHeaderCell>
                      <TableHeaderCell>Status</TableHeaderCell>
                      <TableHeaderCell>Pickup Deadline</TableHeaderCell>
                      <TableHeaderCell>Action</TableHeaderCell>
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
                        <TableCell>
                          <Link
                            href={`/opac/title/${hold.bibId}`}
                            className="font-semibold text-slate-900 hover:text-blue-900"
                          >
                            {hold.title}
                          </Link>
                          <span className="text-xs text-slate-500 block">{hold.authors}</span>
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">
                          {formatDate(hold.requestDate)}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              hold.status === "AVAILABLE_FOR_PICKUP"
                                ? "bg-emerald-100 text-emerald-800 animate-pulse"
                                : hold.status === "WAITING"
                                  ? "bg-blue-100 text-blue-800"
                                  : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {hold.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">
                          {hold.pickupExpiryDate ? formatDate(hold.pickupExpiryDate) : "Pending return"}
                        </TableCell>
                        <TableCell>
                          {hold.isCancellable ? (
                            <button
                              type="button"
                              onClick={() => setCancelHoldTarget(hold)}
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
            </>
          )}
        </div>
      )}

      {/* Tab 4: Fines & Dues */}
      {activeTab === "fines" && (
        <div className="space-y-4 sm:space-y-6">
          {/* Outstanding Balance Banner */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Total Outstanding Balance
              </span>
              <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">
                ₹{totalOutstandingFines.toFixed(2)}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Outstanding penalties must be cleared at the library desk.
              </p>
            </div>
            {totalOutstandingFines > 0 && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-800 font-medium">
                Note: Outstanding fines exceeding institutional limits block book issues and renewals
                (BR-08).
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 shadow-xs space-y-4">
            <h2 className="text-base font-bold text-slate-900">Fine Ledger &amp; Statements</h2>

            {fines.length === 0 ? (
              <EmptyState
                title="Zero Fines Assessed"
                description="Your account has no recorded library fine liabilities."
                icon="✓"
              />
            ) : (
              <>
                {/* Mobile Card View (< sm) */}
                <div className="space-y-3 sm:hidden">
                  {fines.map((fine) => (
                    <div
                      key={fine.id}
                      className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 shadow-2xs space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-xs text-slate-900">{fine.reason}</span>
                        <span
                          className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            fine.status === "OUTSTANDING"
                              ? "bg-red-100 text-red-800"
                              : fine.status === "PAID"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {fine.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200 text-xs">
                        <div>
                          <span className="text-slate-400 block text-[9px] uppercase font-semibold">
                            Total
                          </span>
                          <span className="font-mono text-slate-800 font-semibold">₹{fine.amount}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[9px] uppercase font-semibold">
                            Paid
                          </span>
                          <span className="font-mono text-slate-600">₹{fine.paidAmount}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[9px] uppercase font-semibold">
                            Remaining
                          </span>
                          <span className="font-mono font-bold text-slate-900">₹{fine.balance}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop Table (>= sm) */}
                <div className="hidden sm:block">
                  <Table>
                    <TableHead>
                      <tr>
                        <TableHeaderCell>Reason / Description</TableHeaderCell>
                        <TableHeaderCell>Assessed Date</TableHeaderCell>
                        <TableHeaderCell>Amount</TableHeaderCell>
                        <TableHeaderCell>Paid</TableHeaderCell>
                        <TableHeaderCell>Remaining Balance</TableHeaderCell>
                        <TableHeaderCell>Status</TableHeaderCell>
                      </tr>
                    </TableHead>
                    <TableBody>
                      {fines.map((fine) => (
                        <TableRow key={fine.id}>
                          <TableCell className="font-semibold text-slate-900">{fine.reason}</TableCell>
                          <TableCell className="text-xs text-slate-600">
                            {formatDate(fine.createdAt)}
                          </TableCell>
                          <TableCell className="text-xs text-slate-800 font-mono">
                            ₹{fine.amount}
                          </TableCell>
                          <TableCell className="text-xs text-slate-600 font-mono">
                            ₹{fine.paidAmount}
                          </TableCell>
                          <TableCell className="font-bold text-slate-900 font-mono text-xs">
                            ₹{fine.balance}
                          </TableCell>
                          <TableCell>
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                fine.status === "OUTSTANDING"
                                  ? "bg-red-100 text-red-800"
                                  : fine.status === "PAID"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-slate-100 text-slate-700"
                              }`}
                            >
                              {fine.status}
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
        </div>
      )}

      {/* Tab 5: Security / Password Change (FR-OP-03, T-20) */}
      {activeTab === "security" && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 shadow-xs max-w-xl space-y-4 sm:space-y-6">
          <div>
            <h2 className="text-base font-bold text-slate-900">Change Patron Password</h2>
            <p className="text-xs text-slate-500 mt-1">
              Per FR-OP-03, passwords must be at least 6 characters long and require verification of
              your current credentials.
            </p>
          </div>

          {passwordStatus && (
            <Alert variant={passwordStatus.variant} onDismiss={() => setPasswordStatus(null)}>
              {passwordStatus.message}
            </Alert>
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
              label="New Password (minimum 6 characters)"
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
              <Button type="submit" variant="primary" className="w-full sm:w-auto" isLoading={passwordLoading}>
                Update Password
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Cancel Hold Dialog */}
      {cancelHoldTarget && (
        <ConfirmDialog
          isOpen={true}
          isDestructive={true}
          title="Cancel Title Reservation"
          message={`Are you sure you want to cancel your reservation for "${cancelHoldTarget.title}"? Your position in the waiting queue will be relinquished.`}
          confirmLabel={cancelHoldLoading ? "Cancelling..." : "Confirm Cancellation"}
          cancelLabel="Keep Reservation"
          onConfirm={handleCancelHold}
          onCancel={() => setCancelHoldTarget(null)}
        />
      )}
    </div>
  );
}
