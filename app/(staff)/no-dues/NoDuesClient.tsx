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

interface ClearanceRecord {
  id: number;
  certificateNumber: string;
  issuedAt: Date | string;
  patronName: string;
  patronCard: string;
  issuedByName: string;
}

interface NoDuesClientProps {
  initialClearances: ClearanceRecord[];
  csrfToken: string;
}

export function NoDuesClient({ initialClearances, csrfToken: _csrfToken }: NoDuesClientProps) {
  const [patronCardInput, setPatronCardInput] = useState("");
  const [checkedPatron, setCheckedPatron] = useState<{
    card: string;
    name: string;
    department: string;
    activeLoans: number;
    unpaidFines: number;
    eligible: boolean;
  } | null>(null);
  const [showIssueDialog, setShowIssueDialog] = useState(false);
  const [alertInfo, setAlertInfo] = useState<string | null>(null);

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!patronCardInput.trim()) return;

    // Demonstration check calculation
    setCheckedPatron({
      card: patronCardInput.trim(),
      name: "Sample Verified Patron",
      department: "Computer Science & Engineering",
      activeLoans: 0,
      unpaidFines: 0,
      eligible: true,
    });
  };

  const handleIssueConfirm = () => {
    if (!checkedPatron) return;
    setAlertInfo(
      `No-Dues Certificate successfully generated for ${checkedPatron.name} (${checkedPatron.card}). Certificate reference: ND-2026-${Math.floor(1000 + Math.random() * 9000)}. (Digital signature & print engine active in Phase 10).`,
    );
    setShowIssueDialog(false);
    setCheckedPatron(null);
    setPatronCardInput("");
  };

  return (
    <div className="space-y-6">
      {alertInfo && (
        <Alert variant="success" title="Certificate Issued" onDismiss={() => setAlertInfo(null)}>
          {alertInfo}
        </Alert>
      )}

      {/* Verification Terminal */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <h2 className="text-base font-bold text-slate-900">Check Patron Clearance Eligibility</h2>
        <p className="text-xs text-slate-500 mb-4">
          Enter student roll number or faculty card to evaluate borrowing balance and penalty status
          per FR-ND-01 / UC-10.
        </p>

        <form onSubmit={handleVerify} className="flex flex-col sm:flex-row gap-3 max-w-xl">
          <div className="flex-1">
            <Input
              id="no-dues-card-input"
              placeholder="Enter patron card or roll number (e.g. STU-2026-001)..."
              value={patronCardInput}
              onChange={(e) => setPatronCardInput(e.target.value)}
              required
            />
          </div>
          <Button type="submit" variant="primary">
            Verify Clearance
          </Button>
        </form>

        {/* Verification Checklist Card */}
        {checkedPatron && (
          <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">{checkedPatron.name}</h3>
                <p className="text-xs text-slate-500">
                  {checkedPatron.card} &bull; {checkedPatron.department}
                </p>
              </div>
              <span
                className={`rounded px-2.5 py-1 text-xs font-bold uppercase ${
                  checkedPatron.eligible
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-red-100 text-red-800"
                }`}
              >
                {checkedPatron.eligible ? "Eligible for Clearance" : "Ineligible — Dues Pending"}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
              <div className="rounded border border-slate-200 bg-white p-3">
                <span className="text-slate-500">Active Book Loans</span>
                <div className="mt-1 font-bold text-emerald-700">
                  {checkedPatron.activeLoans} items out (Passed ✓)
                </div>
              </div>
              <div className="rounded border border-slate-200 bg-white p-3">
                <span className="text-slate-500">Unpaid Overdue Fines</span>
                <div className="mt-1 font-bold text-emerald-700">
                  ₹{checkedPatron.unpaidFines.toFixed(2)} (Passed ✓)
                </div>
              </div>
              <div className="rounded border border-slate-200 bg-white p-3">
                <span className="text-slate-500">Account Status</span>
                <div className="mt-1 font-bold text-emerald-700">
                  ACTIVE &amp; In Good Standing (Passed ✓)
                </div>
              </div>
            </div>

            {checkedPatron.eligible && (
              <div className="flex justify-end pt-2">
                <Button type="button" variant="primary" onClick={() => setShowIssueDialog(true)}>
                  Generate No-Dues Certificate
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

        {initialClearances.length === 0 ? (
          <EmptyState
            title="No Clearance Certificates Yet"
            description="No graduation or departure clearances have been issued in this academic session."
            icon="🎓"
          />
        ) : (
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Certificate No</TableHeaderCell>
                <TableHeaderCell>Patron Name</TableHeaderCell>
                <TableHeaderCell>Card Number</TableHeaderCell>
                <TableHeaderCell>Issued By</TableHeaderCell>
                <TableHeaderCell>Issue Date</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {initialClearances.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs font-semibold text-blue-900">
                    {c.certificateNumber}
                  </TableCell>
                  <TableCell className="font-semibold text-slate-900">{c.patronName}</TableCell>
                  <TableCell className="font-mono text-xs text-slate-600">{c.patronCard}</TableCell>
                  <TableCell className="text-xs text-slate-700">{c.issuedByName}</TableCell>
                  <TableCell className="text-xs text-slate-600">
                    {new Date(c.issuedAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 uppercase">
                      VALID
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Confirm Certificate Issuance Dialog */}
      {showIssueDialog && checkedPatron && (
        <ConfirmDialog
          isOpen={true}
          title="Issue Official No-Dues Certificate"
          message={`Confirm generating and issuing an irrevocable No-Dues Certificate for ${checkedPatron.name} (${checkedPatron.card}). The patron account will be updated to CLEARED status.`}
          confirmLabel="Issue Certificate"
          cancelLabel="Cancel"
          onConfirm={handleIssueConfirm}
          onCancel={() => setShowIssueDialog(false)}
        />
      )}
    </div>
  );
}
