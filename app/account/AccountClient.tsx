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
      <div className="py-12">
        <EmptyState
          title="Patron Sign-In Required"
          description="Please sign in with your student roll number or faculty employee ID and password to access your borrowing history, active loans, reservations, and account settings."
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
        body: JSON.stringify({
          csrfToken,
          reason: "Cancelled by patron from online account portal",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setHoldAlert({
          variant: "error",
          message: data.error || "Failed to cancel reservation",
        });
      } else {
        setHoldAlert({
          variant: "success",
          message: `Reservation for "${cancelHoldTarget.title}" was successfully cancelled.`,
        });
        router.refresh();
      }
    } catch {
      setHoldAlert({
        variant: "error",
        message: "Failed to communicate with server to cancel reservation",
      });
    } finally {
      setCancelHoldLoading(false);
      setCancelHoldTarget(null);
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

    // Minimum 6 characters required per FR-OP-03
    if (newPassword.length < 6) {
      setPasswordStatus({
        variant: "error",
        message: "New password must be at least 6 characters long (FR-OP-03).",
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
    <div className="space-y-6">
      {/* T-20 / FR-AU-05 Default Password Warning Banner */}
      {mustChangePassword && (
        <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start space-x-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <h3 className="text-sm font-bold text-amber-950">
                  Security Action Required: Default Password Active
                </h3>
                <p className="text-xs text-amber-800 mt-0.5">
                  Your account is currently using the initial default password assigned at
                  registration or import. Please update your password to secure your account.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab("security")}
              className="whitespace-nowrap rounded-md bg-amber-600 hover:bg-amber-700 px-3 py-1.5 text-xs font-bold text-white transition shadow-xs"
            >
              Change Password Now &rarr;
            </button>
          </div>
        </div>
      )}

      {/* Profile Card Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center space-x-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-blue-900 text-xl font-bold text-white shadow-xs">
              {profile.fullName.charAt(0)}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl font-bold text-slate-900">{profile.fullName}</h1>
                <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-900 uppercase">
                  {profile.patronType}
                </span>
                <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 uppercase">
                  {profile.status}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                <span>
                  Card No: <strong className="font-mono text-slate-700">{profile.cardNo}</strong>
                </span>
                {profile.rollNo && (
                  <span>
                    Roll No: <strong className="text-slate-700">{profile.rollNo}</strong>
                  </span>
                )}
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
                  <strong className="text-slate-700">
                    {formatDate(profile.cardExpiry)}
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
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("loans")}
          className={`rounded-lg px-4 py-2 text-xs font-bold transition ${
            activeTab === "loans"
              ? "bg-blue-900 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          📖 Current Loans ({currentLoans.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className={`rounded-lg px-4 py-2 text-xs font-bold transition ${
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

      {/* Tab 1: Current Loans */}
      {activeTab === "loans" && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Currently Borrowed Volumes</h2>
            <p className="text-xs text-slate-500">
              Active loans issued to your patron account with loan periods and due dates.
            </p>
          </div>

          {currentLoans.length === 0 ? (
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
                          {formatDate(loan.dueDate)} ({loan.daysOverdue} days
                          overdue)
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
          )}
        </div>
      )}

      {/* Tab 2: Borrowing History (FR-OP-02) */}
      {activeTab === "history" && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Borrowing History</h2>
            <p className="text-xs text-slate-500">
              Complete record of previously borrowed, returned, and closed library volumes.
            </p>
          </div>

          {loanHistory.length === 0 ? (
            <EmptyState
              title="No Past Borrowing History"
              description="You have not yet completed any book returns."
              icon="📜"
            />
          ) : (
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
          )}
        </div>
      )}

      {/* Tab 3: Reservations / Holds (FR-OP-02, FR-OP-03, T-17) */}
      {activeTab === "holds" && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
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
                      {hold.pickupExpiryDate
                        ? formatDate(hold.pickupExpiryDate)
                        : "Pending return"}
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
          )}
        </div>
      )}

      {/* Tab 4: Fines & Dues */}
      {activeTab === "fines" && (
        <div className="space-y-6">
          {/* Outstanding Balance Banner */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
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
                Note: Outstanding fines exceeding institutional limits block borrowing and renewals
                (BR-08).
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
            <h2 className="text-base font-bold text-slate-900">Fine Ledger &amp; Statements</h2>

            {fines.length === 0 ? (
              <EmptyState
                title="Zero Fines Assessed"
                description="Your account has no recorded library fine liabilities."
                icon="✓"
              />
            ) : (
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
            )}
          </div>
        </div>
      )}

      {/* Tab 5: Security / Password Change (FR-OP-03, T-20) */}
      {activeTab === "security" && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs max-w-xl space-y-6">
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
              <Button type="submit" variant="primary" isLoading={passwordLoading}>
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
