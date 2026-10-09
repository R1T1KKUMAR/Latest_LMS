"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/Table";

export interface CirculationItem {
  id: number;
  issueDate: Date | string;
  dueDate: Date | string;
  status: string;
  patronName: string;
  patronCard: string;
  title: string;
  accessionNo: string;
}

export interface PatronProfile {
  id: number;
  cardNo: string;
  rollNo: string | null;
  employeeId: string | null;
  username: string;
  firstName: string;
  lastName: string | null;
  patronType: string;
  categoryId: number;
  categoryName: string;
  departmentName: string | null;
  courseName: string | null;
  cardExpiry: string | Date;
  status: string;
  mobile: string | null;
  email: string | null;
  activeLoansCount: number;
  overdueLoansCount: number;
  totalOutstandingFines: number;
  activeLoans: Array<{
    id: number;
    itemId: number;
    accessionNo: string;
    barcode: string;
    title: string;
    issueDate: string;
    dueDate: string;
    daysOverdue: number;
    isOverdue: boolean;
    renewalCount: number;
  }>;
  activeHolds: Array<{
    id: number;
    title: string;
    queuePosition: number;
    status: string;
    expiryDate: string | null;
  }>;
}

interface CirculationDeskClientProps {
  initialCheckouts: CirculationItem[];
  csrfToken: string;
  canIssue: boolean;
  canReturn: boolean;
  canRenew: boolean;
  canMarkLost?: boolean;
  defaultTab?: "issue" | "return" | "renew" | "lost";
  standalone?: boolean;
}

export function CirculationDeskClient({
  initialCheckouts,
  csrfToken,
  canIssue,
  canReturn,
  canRenew,
  canMarkLost = true,
  defaultTab = "issue",
  standalone = false,
}: CirculationDeskClientProps) {
  const [activeTab, setActiveTab] = useState<"issue" | "return" | "renew" | "lost">(defaultTab);
  const [cardNo, setCardNo] = useState("");
  const [accessionNo, setAccessionNo] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [loans, setLoans] = useState<CirculationItem[]>(initialCheckouts);
  const [patronData, setPatronData] = useState<PatronProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [deskAlert, setDeskAlert] = useState<{
    variant: "info" | "success" | "warning" | "error";
    title: string;
    message: string;
  } | null>(null);

  // Lost confirmation dialog state
  const [lostDialog, setLostDialog] = useState<{
    isOpen: boolean;
    loanId?: number;
    barcodeOrAccession?: string;
    title?: string;
    patronName?: string;
  }>({ isOpen: false });

  // Refs for scanner autofocus
  const patronInputRef = useRef<HTMLInputElement>(null);
  const copyInputRef = useRef<HTMLInputElement>(null);

  // Focus management based on active tab
  useEffect(() => {
    if (activeTab === "issue") {
      if (!patronData) {
        patronInputRef.current?.focus();
      } else {
        copyInputRef.current?.focus();
      }
    } else {
      copyInputRef.current?.focus();
    }
  }, [activeTab, patronData]);

  // Lookup patron details
  const handleLookupPatron = async (queryTerm = cardNo) => {
    const term = queryTerm.trim();
    if (!term) return;

    setIsLoading(true);
    setDeskAlert(null);
    try {
      const res = await fetch(`/api/circulation/patron-lookup?term=${encodeURIComponent(term)}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        setPatronData(null);
        setDeskAlert({
          variant: "error",
          title: "Patron Lookup Failed",
          message: data.error || `Patron "${term}" not found`,
        });
        patronInputRef.current?.focus();
      } else {
        setPatronData(data.patron);
        setCardNo(data.patron.cardNo);
        // Automatically focus the item barcode field for immediate book scan
        setTimeout(() => copyInputRef.current?.focus(), 50);
      }
    } catch {
      setDeskAlert({
        variant: "error",
        title: "Network Error",
        message: "Failed to connect to patron lookup service",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Issue copy submission
  const handleIssueSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!cardNo.trim() || !accessionNo.trim()) {
      setDeskAlert({
        variant: "warning",
        title: "Missing Information",
        message: "Please enter both the Patron Identifier and Item Barcode / Accession Number.",
      });
      return;
    }

    setIsLoading(true);
    setDeskAlert(null);
    try {
      const res = await fetch("/api/circulation/issue", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          patronIdentifier: cardNo.trim(),
          barcodeOrAccession: accessionNo.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setDeskAlert({
          variant: "error",
          title: "Issue Refusal",
          message: data.error || "Item checkout was refused by the library rules engine.",
        });
        copyInputRef.current?.select();
      } else {
        setDeskAlert({
          variant: "success",
          title: "Item Checked Out Successfully",
          message: `"${data.title}" successfully issued to ${data.patron.name} (${data.patron.cardNo}). Due date: ${data.dueDate}.${
            data.reservationFulfilled ? " (Waiting reservation fulfilled)" : ""
          }`,
        });

        // Add to active loans table
        const newCheckout: CirculationItem = {
          id: data.loan.id,
          issueDate: data.loan.issueDate,
          dueDate: data.loan.dueDate,
          status: "ISSUED",
          patronName: data.patron.name,
          patronCard: data.patron.cardNo,
          title: data.title,
          accessionNo: data.copy.accessionNo,
        };
        setLoans((prev) => [newCheckout, ...prev]);

        // Refresh patron profile to update quotas & active loans
        handleLookupPatron(cardNo);

        // Reset copy input for next scan and refocus
        setAccessionNo("");
        copyInputRef.current?.focus();
      }
    } catch {
      setDeskAlert({
        variant: "error",
        title: "Transaction Error",
        message: "Failed to communicate with circulation desk service.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Return copy submission
  const handleReturnSubmit = async (e?: React.FormEvent, customBarcode?: string) => {
    if (e) e.preventDefault();
    const barcode = (customBarcode ?? accessionNo).trim();
    if (!barcode) {
      setDeskAlert({
        variant: "warning",
        title: "Missing Barcode",
        message: "Please scan or enter the Accession Number or Barcode of the item to return.",
      });
      return;
    }

    setIsLoading(true);
    setDeskAlert(null);
    try {
      const res = await fetch("/api/circulation/return", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          barcodeOrAccession: barcode,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setDeskAlert({
          variant: "error",
          title: "Return Error",
          message: data.error || "Failed to process return.",
        });
        copyInputRef.current?.select();
      } else {
        let message = `"${data.title}" returned. Status: ${data.copy.status}.`;
        if (data.fineAmount > 0) {
          message += ` Overdue fine of ₹${data.fineAmount.toFixed(2)} assessed (${data.daysLate} day(s) late).`;
        }
        if (data.holdAlert) {
          message += ` 🔔 ALERT: Item is reserved for ${data.holdAlert.patronName} (${data.holdAlert.patronCard}). Pickup deadline: ${data.holdAlert.pickupExpiryDate}.`;
        }

        setDeskAlert({
          variant: data.holdAlert ? "info" : "success",
          title: data.holdAlert
            ? "Item Returned — Reserved for Hold!"
            : "Item Returned Successfully",
          message,
        });

        // Remove or update from active loans table
        setLoans((prev) => prev.filter((l) => l.accessionNo !== data.copy.accessionNo));

        // Refresh patron data if patron was previously active
        if (patronData) {
          handleLookupPatron(patronData.cardNo);
        }

        // Clear input and refocus for rapid continuous scanning
        setAccessionNo("");
        copyInputRef.current?.focus();
      }
    } catch {
      setDeskAlert({
        variant: "error",
        title: "Transaction Error",
        message: "Failed to communicate with circulation return service.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Renew loan submission
  const handleRenewSubmit = async (
    e?: React.FormEvent,
    loanId?: number,
    customBarcode?: string,
  ) => {
    if (e) e.preventDefault();
    const barcode = (customBarcode ?? accessionNo).trim();
    if (!loanId && !barcode) {
      setDeskAlert({
        variant: "warning",
        title: "Missing Loan Identifier",
        message: "Please enter the Accession Number/Barcode or select an active loan to renew.",
      });
      return;
    }

    setIsLoading(true);
    setDeskAlert(null);
    try {
      const res = await fetch("/api/circulation/renew", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          loanId,
          barcodeOrAccession: loanId ? undefined : barcode,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setDeskAlert({
          variant: "error",
          title: "Renewal Refused",
          message: data.error || "Loan renewal refused by circulation policy.",
        });
        copyInputRef.current?.select();
      } else {
        setDeskAlert({
          variant: "success",
          title: "Loan Renewed Successfully",
          message: `Loan extended. New due date: ${data.newDueDate} (Renewal ${data.renewalCount} of ${data.maxRenewals}).`,
        });

        // Update in active loans list
        if (data.loan?.id) {
          setLoans((prev) =>
            prev.map((l) =>
              l.id === data.loan.id ? { ...l, dueDate: data.newDueDate, status: "ISSUED" } : l,
            ),
          );
        }

        if (patronData) {
          handleLookupPatron(patronData.cardNo);
        }

        setAccessionNo("");
        copyInputRef.current?.focus();
      }
    } catch {
      setDeskAlert({
        variant: "error",
        title: "Transaction Error",
        message: "Failed to communicate with circulation renewal service.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Mark copy lost execution
  const handleConfirmMarkLost = async () => {
    const { loanId, barcodeOrAccession } = lostDialog;
    if (!loanId && !barcodeOrAccession) return;

    setIsLoading(true);
    try {
      const res = await fetch("/api/circulation/mark-lost", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          loanId,
          barcodeOrAccession: loanId ? undefined : barcodeOrAccession,
          remarks: "Declared lost at circulation terminal",
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setDeskAlert({
          variant: "error",
          title: "Declaration Failed",
          message: data.error || "Could not mark copy as lost.",
        });
      } else {
        setDeskAlert({
          variant: "warning",
          title: "Item Declared Lost",
          message: `"${data.title}" marked as LOST. Replacement fee: ₹${data.replacementFee.toFixed(2)}${
            data.overdueFine > 0 ? `, Overdue fine: ₹${data.overdueFine.toFixed(2)}` : ""
          }. Total charge assessed: ₹${data.totalCharged.toFixed(2)}.`,
        });

        // Remove from active loans
        if (loanId) {
          setLoans((prev) => prev.filter((l) => l.id !== loanId));
        }

        if (patronData) {
          handleLookupPatron(patronData.cardNo);
        }

        setAccessionNo("");
      }
    } catch {
      setDeskAlert({
        variant: "error",
        title: "Transaction Error",
        message: "Failed to communicate with lost item service.",
      });
    } finally {
      setIsLoading(false);
      setLostDialog({ isOpen: false });
    }
  };

  const filteredCheckouts = loans.filter(
    (c) =>
      c.patronName.toLowerCase().includes(searchFilter.toLowerCase()) ||
      c.patronCard.toLowerCase().includes(searchFilter.toLowerCase()) ||
      c.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
      c.accessionNo.toLowerCase().includes(searchFilter.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      {deskAlert && (
        <Alert
          variant={deskAlert.variant}
          title={deskAlert.title}
          onDismiss={() => setDeskAlert(null)}
        >
          {deskAlert.message}
        </Alert>
      )}

      {/* Transaction Terminal Tabs (only if not standalone mode) */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        {!standalone && (
          <div className="border-b border-slate-200 bg-slate-50 px-6 py-3 flex items-center justify-between">
            <div className="flex space-x-2">
              {canIssue && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("issue");
                    setDeskAlert(null);
                  }}
                  className={`rounded-lg px-4 py-2 text-xs font-bold transition ${
                    activeTab === "issue"
                      ? "bg-blue-900 text-white shadow-xs"
                      : "text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  📥 Check Out (Issue)
                </button>
              )}

              {canReturn && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("return");
                    setDeskAlert(null);
                  }}
                  className={`rounded-lg px-4 py-2 text-xs font-bold transition ${
                    activeTab === "return"
                      ? "bg-blue-900 text-white shadow-xs"
                      : "text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  📤 Check In (Return)
                </button>
              )}

              {canRenew && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("renew");
                    setDeskAlert(null);
                  }}
                  className={`rounded-lg px-4 py-2 text-xs font-bold transition ${
                    activeTab === "renew"
                      ? "bg-blue-900 text-white shadow-xs"
                      : "text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  🔄 Renew Loan
                </button>
              )}

              {canMarkLost && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("lost");
                    setDeskAlert(null);
                  }}
                  className={`rounded-lg px-4 py-2 text-xs font-bold transition ${
                    activeTab === "lost"
                      ? "bg-red-700 text-white shadow-xs"
                      : "text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  ⚠️ Declare Lost
                </button>
              )}
            </div>

            <div className="hidden sm:flex text-xs text-slate-500 space-x-3">
              <Link href="/circulation/issue" className="hover:text-blue-900 font-medium">
                Issue View $\to$
              </Link>
              <Link href="/circulation/return" className="hover:text-blue-900 font-medium">
                Return View $\to$
              </Link>
              <Link href="/circulation/renew" className="hover:text-blue-900 font-medium">
                Renew View $\to$
              </Link>
              <Link href="/circulation/lost" className="hover:text-blue-900 font-medium">
                Lost View $\to$
              </Link>
            </div>
          </div>
        )}

        <div className="p-6">
          {/* Issue Tab Form */}
          {activeTab === "issue" && canIssue && (
            <div className="space-y-6">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!patronData) {
                    handleLookupPatron();
                  } else {
                    handleIssueSubmit();
                  }
                }}
                className="space-y-4"
              >
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Issue Book to Patron</h3>
                  <p className="text-xs text-slate-500">
                    Scan or type patron barcode, then scan item barcode. Press Enter in either field
                    to proceed.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 max-w-2xl">
                  <div>
                    <Input
                      ref={patronInputRef}
                      id="circ-patron-card"
                      label="Patron Card / Roll No"
                      placeholder="e.g. STU-2026-001 or roll number..."
                      value={cardNo}
                      onChange={(e) => setCardNo(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleLookupPatron();
                        }
                      }}
                      required
                    />
                    <div className="mt-1 flex justify-between items-center text-[11px] text-slate-500">
                      <span>Press Enter to verify patron</span>
                      <button
                        type="button"
                        onClick={() => handleLookupPatron()}
                        className="text-blue-900 hover:underline font-semibold"
                      >
                        Verify Patron
                      </button>
                    </div>
                  </div>

                  <div>
                    <Input
                      ref={copyInputRef}
                      id="circ-accession-no"
                      label="Item Accession / Barcode"
                      placeholder="e.g. ACC-00104 or scan barcode..."
                      value={accessionNo}
                      onChange={(e) => setAccessionNo(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleIssueSubmit();
                        }
                      }}
                      required
                    />
                    <div className="mt-1 text-[11px] text-slate-500">
                      <span>Press Enter to complete checkout</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end max-w-2xl pt-2">
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={isLoading || !cardNo.trim() || !accessionNo.trim()}
                  >
                    {isLoading ? "Processing Issue..." : "Check Out Item (Enter)"}
                  </Button>
                </div>
              </form>

              {/* Patron Verification Profile Card */}
              {patronData && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 max-w-3xl space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">
                        {patronData.firstName} {patronData.lastName || ""}
                      </h4>
                      <p className="text-xs text-slate-500">
                        Card: <span className="font-mono font-semibold">{patronData.cardNo}</span>
                        {patronData.rollNo ? ` | Roll: ${patronData.rollNo}` : ""}
                        {patronData.employeeId ? ` | Emp ID: ${patronData.employeeId}` : ""} |{" "}
                        {patronData.categoryName} ({patronData.patronType})
                      </p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${
                          patronData.status === "ACTIVE"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {patronData.status}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
                    <div className="rounded-md bg-white p-2.5 border border-slate-200">
                      <span className="text-slate-500 block text-[11px]">Active Loans</span>
                      <span className="text-sm font-bold text-slate-900">
                        {patronData.activeLoansCount} book(s)
                      </span>
                    </div>

                    <div className="rounded-md bg-white p-2.5 border border-slate-200">
                      <span className="text-slate-500 block text-[11px]">Overdue Loans</span>
                      <span
                        className={`text-sm font-bold ${
                          patronData.overdueLoansCount > 0 ? "text-red-600" : "text-emerald-700"
                        }`}
                      >
                        {patronData.overdueLoansCount} overdue
                      </span>
                    </div>

                    <div className="rounded-md bg-white p-2.5 border border-slate-200">
                      <span className="text-slate-500 block text-[11px]">Outstanding Fines</span>
                      <span
                        className={`text-sm font-bold ${
                          patronData.totalOutstandingFines > 0 ? "text-amber-700" : "text-slate-900"
                        }`}
                      >
                        ₹{patronData.totalOutstandingFines.toFixed(2)}
                      </span>
                    </div>

                    <div className="rounded-md bg-white p-2.5 border border-slate-200">
                      <span className="text-slate-500 block text-[11px]">Active Holds</span>
                      <span className="text-sm font-bold text-slate-900">
                        {patronData.activeHolds.length} hold(s)
                      </span>
                    </div>
                  </div>

                  {patronData.overdueLoansCount > 0 && (
                    <div className="rounded-md bg-red-50 p-2.5 text-xs text-red-800 border border-red-200 flex items-center space-x-2">
                      <span className="font-bold">⚠️ Warning:</span>
                      <span>
                        Patron has overdue materials. Rules engine will block checkout if
                        BLOCK_ISSUE_IF_OVERDUE is enabled.
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Return Tab Form */}
          {activeTab === "return" && canReturn && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleReturnSubmit();
              }}
              className="space-y-4 max-w-xl"
            >
              <div>
                <h3 className="text-sm font-bold text-slate-900">Return Accessioned Copy</h3>
                <p className="text-xs text-slate-500">
                  Scan item barcode. Overdue fines and hold queue reservation alerts apply
                  automatically.
                </p>
              </div>

              <div className="max-w-md">
                <Input
                  ref={copyInputRef}
                  id="circ-return-barcode"
                  label="Item Accession / Barcode"
                  placeholder="Scan or enter accession barcode..."
                  value={accessionNo}
                  onChange={(e) => setAccessionNo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleReturnSubmit();
                    }
                  }}
                  required
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Press Enter after scanning to complete return
                </p>
              </div>

              <div className="flex justify-end pt-2">
                <Button type="submit" variant="primary" disabled={isLoading || !accessionNo.trim()}>
                  {isLoading ? "Processing Return..." : "Process Return (Enter)"}
                </Button>
              </div>
            </form>
          )}

          {/* Renew Tab Form */}
          {activeTab === "renew" && canRenew && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleRenewSubmit();
              }}
              className="space-y-4 max-w-xl"
            >
              <div>
                <h3 className="text-sm font-bold text-slate-900">Renew Active Loan</h3>
                <p className="text-xs text-slate-500">
                  Verifies overdue status, maximum renewals, fine limit, and waiting reservations.
                </p>
              </div>

              <div className="max-w-md">
                <Input
                  ref={copyInputRef}
                  id="circ-renew-barcode"
                  label="Item Accession / Barcode"
                  placeholder="Scan or enter barcode to renew..."
                  value={accessionNo}
                  onChange={(e) => setAccessionNo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleRenewSubmit();
                    }
                  }}
                  required
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Press Enter after scanning to renew loan
                </p>
              </div>

              <div className="flex justify-end pt-2">
                <Button type="submit" variant="primary" disabled={isLoading || !accessionNo.trim()}>
                  {isLoading ? "Verifying Renewal..." : "Renew Loan (Enter)"}
                </Button>
              </div>
            </form>
          )}

          {/* Lost Tab Form */}
          {activeTab === "lost" && canMarkLost && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!accessionNo.trim()) return;
                setLostDialog({
                  isOpen: true,
                  barcodeOrAccession: accessionNo.trim(),
                  title: `Item with barcode ${accessionNo.trim()}`,
                });
              }}
              className="space-y-4 max-w-xl"
            >
              <div>
                <h3 className="text-sm font-bold text-red-900">Declare Copy as Lost</h3>
                <p className="text-xs text-slate-500">
                  Charges item replacement fee, processing fee, and overdue fine to borrower per
                  BR-07.
                </p>
              </div>

              <div className="max-w-md">
                <Input
                  ref={copyInputRef}
                  id="circ-lost-barcode"
                  label="Item Accession / Barcode"
                  placeholder="Scan or enter barcode of lost item..."
                  value={accessionNo}
                  onChange={(e) => setAccessionNo(e.target.value)}
                  required
                />
              </div>

              <div className="flex justify-end pt-2">
                <Button type="submit" variant="danger" disabled={isLoading || !accessionNo.trim()}>
                  Declare Lost Item...
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Active Loans Table */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center mb-5">
          <div>
            <h2 className="text-base font-bold text-slate-900">Active Circulation Records</h2>
            <p className="text-xs text-slate-500">
              Real-time loans currently issued across libraries ({loans.length} active)
            </p>
          </div>

          <div className="w-full sm:w-64">
            <Input
              id="circ-search-filter"
              placeholder="Search patron, title, accession..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
            />
          </div>
        </div>

        {filteredCheckouts.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500">
            {loans.length === 0
              ? "No active book checkouts found in the database."
              : "No loans matched your search filter."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHead>
                <tr>
                  <TableHeaderCell>Patron</TableHeaderCell>
                  <TableHeaderCell>Card Number</TableHeaderCell>
                  <TableHeaderCell>Title</TableHeaderCell>
                  <TableHeaderCell>Accession No</TableHeaderCell>
                  <TableHeaderCell>Issue Date</TableHeaderCell>
                  <TableHeaderCell>Due Date</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell className="text-right">Actions</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {filteredCheckouts.map((item) => {
                  const isOverdue = new Date(item.dueDate) < new Date();
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-semibold text-slate-900">
                        {item.patronName}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-600">
                        <button
                          type="button"
                          onClick={() => {
                            setCardNo(item.patronCard);
                            setActiveTab("issue");
                            handleLookupPatron(item.patronCard);
                          }}
                          className="hover:underline text-blue-900 font-semibold"
                          title="Click to view patron record"
                        >
                          {item.patronCard}
                        </button>
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-slate-900 font-medium">
                        {item.title}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-600">
                        {item.accessionNo}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600">
                        {new Date(item.issueDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className={isOverdue ? "font-bold text-red-600" : "text-slate-600"}>
                          {new Date(item.dueDate).toLocaleDateString()}
                          {isOverdue && " (Overdue)"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                            isOverdue
                              ? "bg-red-100 text-red-800"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {isOverdue ? "OVERDUE" : item.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end space-x-1.5">
                          {canReturn && (
                            <button
                              type="button"
                              onClick={() => handleReturnSubmit(undefined, item.accessionNo)}
                              className="rounded px-2 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition"
                              title="Process Return"
                            >
                              Return
                            </button>
                          )}
                          {canRenew && (
                            <button
                              type="button"
                              onClick={() => handleRenewSubmit(undefined, item.id)}
                              className="rounded px-2 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 transition"
                              title="Renew Loan"
                            >
                              Renew
                            </button>
                          )}
                          {canMarkLost && (
                            <button
                              type="button"
                              onClick={() =>
                                setLostDialog({
                                  isOpen: true,
                                  loanId: item.id,
                                  barcodeOrAccession: item.accessionNo,
                                  title: item.title,
                                  patronName: item.patronName,
                                })
                              }
                              className="rounded px-2 py-1 text-[11px] font-semibold text-red-700 bg-red-50 hover:bg-red-100 transition"
                              title="Declare Lost"
                            >
                              Lost
                            </button>
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
      </div>

      {/* Confirm Declare Lost Dialog */}
      <ConfirmDialog
        isOpen={lostDialog.isOpen}
        title="Declare Material Lost?"
        message={`Are you sure you want to declare "${lostDialog.title || "this book"}" as LOST? This will close the loan, mark the copy as LOST in the catalogue, and charge replacement costs plus processing fee to the borrower.`}
        confirmLabel="Declare Lost & Assess Fee"
        cancelLabel="Cancel"
        isDestructive={true}
        isLoading={isLoading}
        onConfirm={handleConfirmMarkLost}
        onCancel={() => setLostDialog({ isOpen: false })}
      />
    </div>
  );
}
