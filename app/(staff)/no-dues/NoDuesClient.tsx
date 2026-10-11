"use client";

import Link from "next/link";
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
import type { NoDuesEligibilityResult, RecentClearanceRecord } from "@/services/nodues";

interface NoDuesClientProps {
  initialClearances: RecentClearanceRecord[];
  csrfToken: string;
}

export function NoDuesClient({ initialClearances, csrfToken }: NoDuesClientProps) {
  const [patronCardInput, setPatronCardInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [issueLoading, setIssueLoading] = useState(false);
  const [eligibilityData, setEligibilityData] = useState<NoDuesEligibilityResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{
    certificateNo: string;
    patronId: number;
    patronName: string;
    patronCard: string;
    status: string;
  } | null>(null);

  const [clearancesList, setClearancesList] = useState<RecentClearanceRecord[]>(initialClearances);
  const [showIssueDialog, setShowIssueDialog] = useState(false);
  const [closeAccount, setCloseAccount] = useState(true);
  const [remarks, setRemarks] = useState("");

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const term = patronCardInput.trim();
    if (!term) return;

    setLoading(true);
    setErrorMsg(null);
    setSuccessInfo(null);
    setEligibilityData(null);

    try {
      const res = await fetch(`/api/no-dues/check?identifier=${encodeURIComponent(term)}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMsg(data.error || "Failed to check patron eligibility");
      } else {
        setEligibilityData(data);
      }
    } catch {
      setErrorMsg("Network error verifying clearance eligibility");
    } finally {
      setLoading(false);
    }
  };

  const handleIssueConfirm = async () => {
    if (!eligibilityData) return;

    setIssueLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/no-dues/issue", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          patronId: eligibilityData.patron.id,
          closeAccount,
          remarks: remarks.trim() || undefined,
          csrfToken,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMsg(data.error || "Failed to issue No-Dues certificate");
      } else {
        const newRecord: RecentClearanceRecord = {
          id: Date.now(),
          certificateNo: data.certificateNo,
          patronId: data.patronId,
          patronName: data.patronName,
          patronCardNo: data.patronCardNo,
          issuedByName: data.issuedByName,
          issuedAt: new Date(),
          status: data.accountStatus,
        };

        setClearancesList((prev) => [newRecord, ...prev]);
        setSuccessInfo({
          certificateNo: data.certificateNo,
          patronId: data.patronId,
          patronName: data.patronName,
          patronCard: data.patronCardNo,
          status: data.accountStatus,
        });

        // Re-check patron to reflect graduated status
        setEligibilityData((prev) =>
          prev
            ? {
                ...prev,
                patron: {
                  ...prev.patron,
                  status: data.accountStatus,
                },
                isEligible: false,
                refusalReasons: ["Clearance previously completed (GRADUATED)."],
              }
            : null,
        );
      }
    } catch {
      setErrorMsg("Network error issuing No-Dues certificate");
    } finally {
      setIssueLoading(false);
      setShowIssueDialog(false);
      setRemarks("");
    }
  };

  return (
    <div className="space-y-6">
      {errorMsg && (
        <Alert variant="error" title="Error" onDismiss={() => setErrorMsg(null)}>
          {errorMsg}
        </Alert>
      )}

      {successInfo && (
        <Alert
          variant="success"
          title="Clearance Certificate Issued Successfully"
          onDismiss={() => setSuccessInfo(null)}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-1">
            <div>
              No-Dues Certificate <strong>{successInfo.certificateNo}</strong> issued for{" "}
              <strong>{successInfo.patronName}</strong> ({successInfo.patronCard}). Account status:{" "}
              <span className="font-bold">{successInfo.status}</span>.
            </div>
            <Link
              href={`/no-dues/certificate/${successInfo.patronId}`}
              className="inline-flex items-center gap-1.5 rounded bg-emerald-800 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-900 transition whitespace-nowrap"
            >
              🖨️ View &amp; Print Certificate
            </Link>
          </div>
        </Alert>
      )}

      {/* Verification Terminal */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <h2 className="text-base font-bold text-slate-900">Check Patron Clearance Eligibility</h2>
        <p className="text-xs text-slate-500 mb-4">
          Enter student roll number, faculty card, or barcode to evaluate borrowing balance and
          penalty status per FR-ND-01 / UC-09.
        </p>

        <form onSubmit={handleVerify} className="flex flex-col sm:flex-row gap-3 max-w-xl">
          <div className="flex-1">
            <Input
              id="no-dues-card-input"
              placeholder="Enter patron card, roll no, or username (e.g. 2301430100045)..."
              value={patronCardInput}
              onChange={(e) => setPatronCardInput(e.target.value)}
              required
            />
          </div>
          <Button type="submit" variant="primary" isLoading={loading}>
            Verify Clearance
          </Button>
        </form>

        {/* Verification Checklist Card */}
        {eligibilityData && (
          <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {eligibilityData.patron.fullName}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Card:{" "}
                  <span className="font-mono font-semibold">{eligibilityData.patron.cardNo}</span>
                  {eligibilityData.patron.rollNo && (
                    <>
                      {" "}
                      &bull; Roll:{" "}
                      <span className="font-mono">{eligibilityData.patron.rollNo}</span>
                    </>
                  )}
                  {eligibilityData.patron.departmentName && (
                    <> &bull; {eligibilityData.patron.departmentName}</>
                  )}{" "}
                  &bull;{" "}
                  <span className="uppercase font-semibold">
                    {eligibilityData.patron.categoryName}
                  </span>
                </p>
              </div>
              <div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                    eligibilityData.isEligible
                      ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                      : "bg-red-100 text-red-800 border border-red-300"
                  }`}
                >
                  {eligibilityData.isEligible
                    ? "Eligible for Clearance"
                    : "Ineligible — Dues Pending"}
                </span>
              </div>
            </div>

            {/* Metrics Triplet */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
              <div
                className={`rounded border p-3 ${
                  eligibilityData.activeLoansCount === 0
                    ? "border-emerald-200 bg-white"
                    : "border-red-200 bg-red-50/50"
                }`}
              >
                <span className="text-slate-500 font-medium">Active Book Loans</span>
                <div
                  className={`mt-1 font-bold ${
                    eligibilityData.activeLoansCount === 0 ? "text-emerald-700" : "text-red-700"
                  }`}
                >
                  {eligibilityData.activeLoansCount === 0
                    ? "0 items out (Passed ✓)"
                    : `${eligibilityData.activeLoansCount} book(s) out (Action Required ✕)`}
                </div>
              </div>

              <div
                className={`rounded border p-3 ${
                  eligibilityData.totalUnpaidFines === 0
                    ? "border-emerald-200 bg-white"
                    : "border-red-200 bg-red-50/50"
                }`}
              >
                <span className="text-slate-500 font-medium">Unpaid Overdue / Lost Fines</span>
                <div
                  className={`mt-1 font-bold ${
                    eligibilityData.totalUnpaidFines === 0 ? "text-emerald-700" : "text-red-700"
                  }`}
                >
                  {eligibilityData.totalUnpaidFines === 0
                    ? "₹0.00 pending (Passed ✓)"
                    : `₹${eligibilityData.totalUnpaidFines.toFixed(2)} pending (Action Required ✕)`}
                </div>
              </div>

              <div className="rounded border border-slate-200 bg-white p-3">
                <span className="text-slate-500 font-medium">Patron Account Status</span>
                <div className="mt-1 font-bold text-slate-800">
                  <span
                    className={`inline-block px-1.5 py-0.5 rounded text-[11px] uppercase ${
                      eligibilityData.patron.status === "ACTIVE"
                        ? "bg-emerald-100 text-emerald-800"
                        : eligibilityData.patron.status === "GRADUATED"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {eligibilityData.patron.status}
                  </span>
                </div>
              </div>
            </div>

            {/* Refusal Notice if Ineligible */}
            {!eligibilityData.isEligible && eligibilityData.refusalReasons.length > 0 && (
              <div className="rounded border border-red-200 bg-red-50 p-3 text-xs text-red-800 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <span>⛔</span> Clearance Blocked:
                </div>
                <ul className="list-disc list-inside space-y-0.5 pl-1">
                  {eligibilityData.refusalReasons.map((reason, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: list is static
                    <li key={i}>{reason}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Active Loans Table with Return Shortcuts */}
            {eligibilityData.pendingLoans.length > 0 && (
              <div className="mt-3 rounded border border-slate-200 bg-white p-3">
                <h4 className="text-xs font-bold text-slate-800 mb-2 uppercase tracking-wider">
                  Pending Book Checkouts (Return Required)
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b text-slate-500">
                        <th className="py-1">Accession / Barcode</th>
                        <th className="py-1">Title</th>
                        <th className="py-1">Due Date</th>
                        <th className="py-1 text-right">Shortcut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {eligibilityData.pendingLoans.map((loan) => (
                        <tr key={loan.id}>
                          <td className="py-1.5 font-mono font-medium text-slate-800">
                            {loan.accessionNo} ({loan.barcode})
                          </td>
                          <td className="py-1.5 font-medium text-slate-900">{loan.title}</td>
                          <td className="py-1.5 text-slate-600">{loan.dueDate}</td>
                          <td className="py-1.5 text-right">
                            <Link
                              href={loan.returnShortcutUrl}
                              className="inline-block rounded bg-blue-50 border border-blue-200 px-2 py-0.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 transition"
                            >
                              Check-In Book &rarr;
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Outstanding Fines Table with Pay Shortcuts */}
            {eligibilityData.pendingFines.length > 0 && (
              <div className="mt-3 rounded border border-slate-200 bg-white p-3">
                <h4 className="text-xs font-bold text-slate-800 mb-2 uppercase tracking-wider">
                  Unpaid Fine Liabilities (Payment Required)
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b text-slate-500">
                        <th className="py-1">Type</th>
                        <th className="py-1">Reason</th>
                        <th className="py-1">Original</th>
                        <th className="py-1">Balance</th>
                        <th className="py-1 text-right">Shortcut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {eligibilityData.pendingFines.map((fine) => (
                        <tr key={fine.id}>
                          <td className="py-1.5 font-semibold text-slate-800">{fine.fineType}</td>
                          <td className="py-1.5 text-slate-600">{fine.reason}</td>
                          <td className="py-1.5 text-slate-600 font-mono">₹{fine.amount}</td>
                          <td className="py-1.5 font-bold text-red-700 font-mono">
                            ₹{fine.remainingBalance.toFixed(2)}
                          </td>
                          <td className="py-1.5 text-right">
                            <Link
                              href={fine.finesShortcutUrl}
                              className="inline-block rounded bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-semibold text-amber-800 hover:bg-amber-100 transition"
                            >
                              Collect / Waive &rarr;
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Action Bar */}
            {eligibilityData.isEligible && (
              <div className="flex justify-end pt-2 border-t border-slate-200">
                <Button type="button" variant="primary" onClick={() => setShowIssueDialog(true)}>
                  🎓 Generate No-Dues Certificate
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Historical Clearance Register */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <h2 className="text-base font-bold text-slate-900 mb-1">Recent No-Dues Clearances</h2>
        <p className="text-xs text-slate-500 mb-4">
          Official institutional clearance certificates generated
        </p>

        {clearancesList.length === 0 ? (
          <EmptyState
            title="No Clearance Certificates Yet"
            description="No graduation or departure clearances have been issued in this academic session."
            icon="🎓"
          />
        ) : (
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Certificate Ref</TableHeaderCell>
                <TableHeaderCell>Patron Name</TableHeaderCell>
                <TableHeaderCell>Card Number</TableHeaderCell>
                <TableHeaderCell>Issued By</TableHeaderCell>
                <TableHeaderCell>Issue Date</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell className="text-right">Action</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {clearancesList.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs font-semibold text-blue-900">
                    {c.certificateNo}
                  </TableCell>
                  <TableCell className="font-semibold text-slate-900">{c.patronName}</TableCell>
                  <TableCell className="font-mono text-xs text-slate-600">
                    {c.patronCardNo}
                  </TableCell>
                  <TableCell className="text-xs text-slate-700">{c.issuedByName}</TableCell>
                  <TableCell className="text-xs text-slate-600">
                    {new Date(c.issuedAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 uppercase">
                      {c.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/no-dues/certificate/${c.patronId}`}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition"
                    >
                      Print Certificate &rarr;
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Confirm Certificate Issuance Dialog */}
      {showIssueDialog && eligibilityData && (
        <ConfirmDialog
          isOpen={true}
          title="Issue Official No-Dues Clearance Certificate"
          message={`Confirm generating and issuing an irrevocable No-Dues Certificate for ${eligibilityData.patron.fullName} (${eligibilityData.patron.cardNo}).`}
          confirmLabel={issueLoading ? "Issuing..." : "Confirm & Issue Certificate"}
          cancelLabel="Cancel"
          onConfirm={handleIssueConfirm}
          onCancel={() => setShowIssueDialog(false)}
        >
          <div className="mt-4 space-y-3 text-xs text-slate-700 border-t border-slate-200 pt-3">
            <label className="flex items-center gap-2 cursor-pointer font-medium">
              <input
                type="checkbox"
                checked={closeAccount}
                onChange={(e) => setCloseAccount(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-900 focus:ring-blue-800"
              />
              <span>
                Close account upon clearance (Set patron status to{" "}
                <strong className="text-blue-950 font-bold">GRADUATED</strong>)
              </span>
            </label>
            <p className="text-[11px] text-slate-500 pl-6">
              When checked, this permanently closes library borrowing privileges per FR-ND-02 and
              updates patron status to GRADUATED.
            </p>

            <div className="pt-2">
              <label
                htmlFor="clearance-remarks"
                className="block font-semibold text-slate-700 mb-1"
              >
                Optional Clearance Remarks / Reference:
              </label>
              <input
                id="clearance-remarks"
                type="text"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="e.g. Cleared for B.Tech CSE 2026 convocation"
                className="w-full rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-hidden"
              />
            </div>
          </div>
        </ConfirmDialog>
      )}
    </div>
  );
}
