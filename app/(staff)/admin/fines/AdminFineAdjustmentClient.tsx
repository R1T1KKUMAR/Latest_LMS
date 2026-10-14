"use client";

import { useState } from "react";
import type { CirculationRuleDetail } from "@/services/admin-rules";

interface AdminFineAdjustmentClientProps {
  initialSettings: Record<string, string>;
  initialRules: CirculationRuleDetail[];
  csrfToken: string;
  holidays: Array<{ date: string; name: string }>;
}

export function AdminFineAdjustmentClient({
  initialSettings,
  initialRules,
  csrfToken,
  holidays,
}: AdminFineAdjustmentClientProps) {
  const [activeTab, setActiveTab] = useState<"global" | "rules" | "adjust" | "simulator">("global");

  // Global settings state
  const [finePerDay, setFinePerDay] = useState(initialSettings.DEFAULT_FINE_PER_DAY ?? "2.00");
  const [graceDays, setGraceDays] = useState(initialSettings.DEFAULT_GRACE_DAYS ?? "0");
  const [fineBlockLimit, setFineBlockLimit] = useState(
    initialSettings.FINE_BLOCK_LIMIT ?? "100.00",
  );
  const [lostProcessingFee, setLostProcessingFee] = useState(
    initialSettings.LOST_PROCESSING_FEE ?? "50.00",
  );
  const [blockIssueIfOverdue, setBlockIssueIfOverdue] = useState(
    initialSettings.BLOCK_ISSUE_IF_OVERDUE === "true",
  );

  const [savingGlobal, setSavingGlobal] = useState(false);
  const [globalMessage, setGlobalMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Rules state
  const [rules, setRules] = useState<CirculationRuleDetail[]>(initialRules);
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [editFinePerDay, setEditFinePerDay] = useState("");
  const [editGraceDays, setEditGraceDays] = useState("");
  const [editMaxFine, setEditMaxFine] = useState("");
  const [savingRule, setSavingRule] = useState(false);
  const [ruleMessage, setRuleMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Fine adjust state
  const [adjustFineId, setAdjustFineId] = useState("");
  const [adjustNewAmount, setAdjustNewAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [adjustMessage, setAdjustMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Simulator state
  const [simDueDate, setSimDueDate] = useState("2026-10-01");
  const [simReturnDate, setSimReturnDate] = useState("2026-10-10");
  const [simRate, setSimRate] = useState("2.00");
  const [simGrace, setSimGrace] = useState("0");
  const [simMaxFine, setSimMaxFine] = useState("100.00");

  // Compute simulator results live
  const calculateSimResult = () => {
    if (!simDueDate || !simReturnDate) return null;
    const d1 = new Date(`${simDueDate}T00:00:00Z`);
    const d2 = new Date(`${simReturnDate}T00:00:00Z`);
    const diffDays = Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
    const totalDaysLate = Math.max(0, diffDays);

    const holidaySet = new Set(holidays.map((h) => h.date));
    let exemptCount = 0;
    const exemptList: Array<{ date: string; name: string }> = [];

    if (totalDaysLate > 0) {
      const base = new Date(d1);
      for (let i = 1; i <= totalDaysLate; i++) {
        const next = new Date(
          Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + i),
        );
        const iso = next.toISOString().slice(0, 10);
        if (holidaySet.has(iso)) {
          exemptCount++;
          const match = holidays.find((h) => h.date === iso);
          exemptList.push({ date: iso, name: match?.name ?? "College Holiday" });
        }
      }
    }

    const effectiveLate = Math.max(0, totalDaysLate - exemptCount);
    const graceNum = Math.max(0, Number(simGrace) || 0);
    const chargeable = Math.max(0, effectiveLate - graceNum);
    const rateNum = Math.max(0, Number(simRate) || 0);
    const calculated = chargeable * rateNum;
    const capNum = simMaxFine ? Number(simMaxFine) : 0;
    const finalFine = capNum > 0 && calculated > capNum ? capNum : calculated;

    return {
      totalDaysLate,
      exemptCount,
      exemptList,
      chargeable,
      calculated: calculated.toFixed(2),
      finalFine: finalFine.toFixed(2),
      isCapped: capNum > 0 && calculated > capNum,
    };
  };

  const simResult = calculateSimResult();

  // Save global fine settings
  const handleSaveGlobal = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingGlobal(true);
    setGlobalMessage(null);

    try {
      const res = await fetch("/api/admin/fines", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          settings: {
            DEFAULT_FINE_PER_DAY: finePerDay,
            DEFAULT_GRACE_DAYS: graceDays,
            FINE_BLOCK_LIMIT: fineBlockLimit,
            LOST_PROCESSING_FEE: lostProcessingFee,
            BLOCK_ISSUE_IF_OVERDUE: blockIssueIfOverdue ? "true" : "false",
          },
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to update fine settings");
      }

      setGlobalMessage({
        type: "success",
        text: `Global fine parameters updated successfully! (${data.updatedKeys.length} settings adjusted)`,
      });
    } catch (err: unknown) {
      setGlobalMessage({
        type: "error",
        text: (err as Error).message || "Error saving global settings",
      });
    } finally {
      setSavingGlobal(false);
    }
  };

  // Start editing a rule
  const handleStartEditRule = (rule: CirculationRuleDetail) => {
    setEditingRuleId(rule.id);
    setEditFinePerDay(rule.finePerDay);
    setEditGraceDays(String(rule.graceDays));
    setEditMaxFine(rule.maxFine ?? "");
    setRuleMessage(null);
  };

  // Save rule fine rate
  const handleSaveRule = async (ruleId: number) => {
    setSavingRule(true);
    setRuleMessage(null);

    try {
      const res = await fetch("/api/admin/fines", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          ruleId,
          ruleUpdates: {
            finePerDay: editFinePerDay,
            graceDays: Number(editGraceDays),
            maxFine: editMaxFine.trim() ? editMaxFine : null,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to update rule fine parameters");
      }

      setRules((prev) =>
        prev.map((r) =>
          r.id === ruleId
            ? {
                ...r,
                finePerDay: Number(editFinePerDay).toFixed(2),
                graceDays: Number(editGraceDays),
                maxFine: editMaxFine.trim() ? Number(editMaxFine).toFixed(2) : null,
              }
            : r,
        ),
      );

      setEditingRuleId(null);
      setRuleMessage({
        type: "success",
        text: `Circulation rule #${ruleId} fine policy updated immediately.`,
      });
    } catch (err: unknown) {
      setRuleMessage({
        type: "error",
        text: (err as Error).message || "Error updating rule",
      });
    } finally {
      setSavingRule(false);
    }
  };

  // Handle fine adjustment
  const handleAdjustFine = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdjusting(true);
    setAdjustMessage(null);

    try {
      const res = await fetch("/api/admin/fines/adjust", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          fineId: Number(adjustFineId),
          newAmount: Number(adjustNewAmount),
          reason: adjustReason,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to adjust fine amount");
      }

      setAdjustMessage({
        type: "success",
        text: data.message,
      });

      setAdjustFineId("");
      setAdjustNewAmount("");
      setAdjustReason("");
    } catch (err: unknown) {
      setAdjustMessage({
        type: "error",
        text: (err as Error).message || "Error adjusting fine",
      });
    } finally {
      setAdjusting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("global")}
          className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
            activeTab === "global"
              ? "bg-slate-900 text-white shadow-xs"
              : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
          }`}
        >
          ⚙️ Global Fine Parameters
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("rules")}
          className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
            activeTab === "rules"
              ? "bg-slate-900 text-white shadow-xs"
              : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
          }`}
        >
          📋 Rule-Level Fine Rates ({rules.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("adjust")}
          className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
            activeTab === "adjust"
              ? "bg-slate-900 text-white shadow-xs"
              : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
          }`}
        >
          ✏️ Individual Fine Calibration
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("simulator")}
          className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
            activeTab === "simulator"
              ? "bg-slate-900 text-white shadow-xs"
              : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
          }`}
        >
          🧪 Holiday Exemption Simulator
        </button>
      </div>

      {/* Exemption Notice Banner */}
      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 shadow-xs">
        <div className="flex items-start gap-3">
          <span className="text-xl">📅</span>
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-amber-900">
              Automatic Holiday Exemption Enforced
            </h2>
            <p className="mt-0.5 text-xs text-amber-800 leading-relaxed">
              All dates recorded in the <strong>Academic &amp; Holiday Calendar</strong> (
              {holidays.length} active dates) are automatically exempted from overdue fine charges
              during return, loss, or patron inquiry. Patrons are never charged for days the college
              was closed.
            </p>
          </div>
        </div>
      </div>

      {/* TAB 1: Global Parameters */}
      {activeTab === "global" && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-xs">
          <div className="border-b border-slate-200 bg-slate-50/75 px-6 py-4">
            <h2 className="text-sm font-bold text-slate-900">Global Overdue &amp; Fine Defaults</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              These settings serve as system fallbacks and global circulation thresholds. Changes
              take effect instantly without restarting.
            </p>
          </div>

          <form onSubmit={handleSaveGlobal} className="p-6 space-y-6">
            {globalMessage && (
              <div
                className={`rounded-lg p-3 text-xs font-medium ${
                  globalMessage.type === "success"
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-rose-50 text-rose-800 border border-rose-200"
                }`}
              >
                {globalMessage.text}
              </div>
            )}

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {/* Default Fine Per Day */}
              <div className="space-y-1.5">
                <label htmlFor="finePerDayInput" className="block text-xs font-bold text-slate-700">
                  Default Fine Per Day (₹)
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 font-medium text-xs">
                    ₹
                  </span>
                  <input
                    id="finePerDayInput"
                    type="number"
                    step="0.25"
                    min="0"
                    value={finePerDay}
                    onChange={(e) => setFinePerDay(e.target.value)}
                    required
                    className="w-full rounded-lg border border-slate-300 py-2 pl-7 pr-3 text-xs font-semibold text-slate-900 shadow-xs focus:border-slate-900 focus:outline-hidden"
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  Standard rate charged per chargeable overdue day.
                </p>
              </div>

              {/* Default Grace Days */}
              <div className="space-y-1.5">
                <label htmlFor="graceDaysInput" className="block text-xs font-bold text-slate-700">
                  Default Grace Period (Days)
                </label>
                <input
                  id="graceDaysInput"
                  type="number"
                  step="1"
                  min="0"
                  value={graceDays}
                  onChange={(e) => setGraceDays(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-900 shadow-xs focus:border-slate-900 focus:outline-hidden"
                />
                <p className="text-[11px] text-slate-500">
                  Free days after due date before overdue fines start.
                </p>
              </div>

              {/* Fine Block Limit */}
              <div className="space-y-1.5">
                <label
                  htmlFor="fineBlockLimitInput"
                  className="block text-xs font-bold text-slate-700"
                >
                  Checkout Block Threshold (₹)
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 font-medium text-xs">
                    ₹
                  </span>
                  <input
                    id="fineBlockLimitInput"
                    type="number"
                    step="5.00"
                    min="0"
                    value={fineBlockLimit}
                    onChange={(e) => setFineBlockLimit(e.target.value)}
                    required
                    className="w-full rounded-lg border border-slate-300 py-2 pl-7 pr-3 text-xs font-semibold text-slate-900 shadow-xs focus:border-slate-900 focus:outline-hidden"
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  Cumulative fine amount that prevents new book loans.
                </p>
              </div>

              {/* Lost Processing Fee */}
              <div className="space-y-1.5">
                <label
                  htmlFor="lostProcessingFeeInput"
                  className="block text-xs font-bold text-slate-700"
                >
                  Lost Book Processing Fee (₹)
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 font-medium text-xs">
                    ₹
                  </span>
                  <input
                    id="lostProcessingFeeInput"
                    type="number"
                    step="5.00"
                    min="0"
                    value={lostProcessingFee}
                    onChange={(e) => setLostProcessingFee(e.target.value)}
                    required
                    className="w-full rounded-lg border border-slate-300 py-2 pl-7 pr-3 text-xs font-semibold text-slate-900 shadow-xs focus:border-slate-900 focus:outline-hidden"
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  Administrative fee added to lost item replacement charges.
                </p>
              </div>

              {/* Block If Overdue */}
              <div className="space-y-1.5">
                <span className="block text-xs font-bold text-slate-700">
                  Overdue Loan Checkout Restriction
                </span>
                <label className="flex items-center gap-2 pt-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={blockIssueIfOverdue}
                    onChange={(e) => setBlockIssueIfOverdue(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                  />
                  <span className="text-xs font-semibold text-slate-800">
                    Block new book issues if patron has overdue loans
                  </span>
                </label>
                <p className="text-[11px] text-slate-500">
                  Strictly blocks checkout at circulation desk (BR-08).
                </p>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4 flex justify-end">
              <button
                type="submit"
                disabled={savingGlobal}
                className="inline-flex items-center rounded-lg bg-slate-900 px-5 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 disabled:opacity-50"
              >
                {savingGlobal ? "Saving Adjustments..." : "Save Global Parameters"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 2: Rule-Level Fine Rates */}
      {activeTab === "rules" && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-xs">
          <div className="border-b border-slate-200 bg-slate-50/75 px-6 py-4">
            <h2 className="text-sm font-bold text-slate-900">
              Category &amp; Item Specific Fine Rates
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Circulation rules take precedence over global defaults. Click &quot;Adjust Rates&quot;
              to change daily fine, grace period, or max fine cap for any category.
            </p>
          </div>

          {ruleMessage && (
            <div
              className={`m-6 rounded-lg p-3 text-xs font-medium ${
                ruleMessage.type === "success"
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-rose-50 text-rose-800 border border-rose-200"
              }`}
            >
              {ruleMessage.text}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="border-b border-slate-200 bg-slate-50 font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-6 py-3">Rule ID</th>
                  <th className="px-6 py-3">Branch</th>
                  <th className="px-6 py-3">Patron Category</th>
                  <th className="px-6 py-3">Item Type</th>
                  <th className="px-6 py-3 text-right">Fine / Day</th>
                  <th className="px-6 py-3 text-center">Grace Days</th>
                  <th className="px-6 py-3 text-right">Max Fine Cap</th>
                  <th className="px-6 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rules.map((rule) => {
                  const isEditing = editingRuleId === rule.id;
                  return (
                    <tr key={rule.id} className="hover:bg-slate-50/50">
                      <td className="px-6 py-3.5 font-mono text-slate-400">#{rule.id}</td>
                      <td className="px-6 py-3.5 font-medium text-slate-900">
                        {rule.libraryName ?? "All Branches"}
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="inline-flex rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                          {rule.categoryName ?? "All Categories"}
                        </span>
                      </td>
                      <td className="px-6 py-3.5">
                        <span className="inline-flex rounded-md bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700">
                          {rule.itemTypeName ?? "All Items"}
                        </span>
                      </td>

                      {/* Editable Fine Per Day */}
                      <td className="px-6 py-3.5 text-right font-semibold text-amber-900">
                        {isEditing ? (
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            value={editFinePerDay}
                            onChange={(e) => setEditFinePerDay(e.target.value)}
                            className="w-20 rounded border border-slate-300 px-2 py-1 text-right text-xs"
                          />
                        ) : (
                          `₹${rule.finePerDay}`
                        )}
                      </td>

                      {/* Editable Grace Days */}
                      <td className="px-6 py-3.5 text-center text-slate-700">
                        {isEditing ? (
                          <input
                            type="number"
                            step="1"
                            min="0"
                            value={editGraceDays}
                            onChange={(e) => setEditGraceDays(e.target.value)}
                            className="w-16 rounded border border-slate-300 px-2 py-1 text-center text-xs"
                          />
                        ) : (
                          `${rule.graceDays} days`
                        )}
                      </td>

                      {/* Editable Max Fine */}
                      <td className="px-6 py-3.5 text-right text-slate-600">
                        {isEditing ? (
                          <input
                            type="number"
                            step="10"
                            min="0"
                            placeholder="No Cap"
                            value={editMaxFine}
                            onChange={(e) => setEditMaxFine(e.target.value)}
                            className="w-24 rounded border border-slate-300 px-2 py-1 text-right text-xs"
                          />
                        ) : rule.maxFine ? (
                          `₹${rule.maxFine}`
                        ) : (
                          "No Cap"
                        )}
                      </td>

                      {/* Action buttons */}
                      <td className="px-6 py-3.5 text-center">
                        {isEditing ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleSaveRule(rule.id)}
                              disabled={savingRule}
                              className="rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingRuleId(null)}
                              className="rounded border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleStartEditRule(rule)}
                            className="inline-flex items-center rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Adjust Rates
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: Individual Fine Calibration */}
      {activeTab === "adjust" && (
        <div className="max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-6">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Individual Fine Calibration &amp; Override
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Directly adjust or calibrate the assessed amount on any outstanding fine record. All
              modifications require a formal administrative justification and are audited.
            </p>
          </div>

          {adjustMessage && (
            <div
              className={`rounded-lg p-3 text-xs font-medium ${
                adjustMessage.type === "success"
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-rose-50 text-rose-800 border border-rose-200"
              }`}
            >
              {adjustMessage.text}
            </div>
          )}

          <form onSubmit={handleAdjustFine} className="space-y-4">
            <div>
              <label htmlFor="adjustFineIdInput" className="block text-xs font-bold text-slate-700">
                Fine ID (#)
              </label>
              <input
                id="adjustFineIdInput"
                type="number"
                min="1"
                placeholder="e.g. 1"
                value={adjustFineId}
                onChange={(e) => setAdjustFineId(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-900 shadow-xs focus:border-slate-900 focus:outline-hidden"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Can be retrieved from the Fines Desk or Patron Profile.
              </p>
            </div>

            <div>
              <label
                htmlFor="adjustNewAmountInput"
                className="block text-xs font-bold text-slate-700"
              >
                New Adjusted Amount (₹)
              </label>
              <input
                id="adjustNewAmountInput"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={adjustNewAmount}
                onChange={(e) => setAdjustNewAmount(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-900 shadow-xs focus:border-slate-900 focus:outline-hidden"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Set to ₹0.00 or lower amount. Cannot be less than amounts already paid.
              </p>
            </div>

            <div>
              <label htmlFor="adjustReasonInput" className="block text-xs font-bold text-slate-700">
                Justification / Reason (Mandatory)
              </label>
              <textarea
                id="adjustReasonInput"
                rows={3}
                placeholder="e.g. Administrative waiver for emergency medical leave / unexpected college holiday period."
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-xs text-slate-900 shadow-xs focus:border-slate-900 focus:outline-hidden"
              />
            </div>

            <button
              type="submit"
              disabled={adjusting}
              className="inline-flex items-center rounded-lg bg-amber-600 px-5 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-amber-700 disabled:opacity-50"
            >
              {adjusting ? "Adjusting Fine..." : "Apply Fine Calibration"}
            </button>
          </form>
        </div>
      )}

      {/* TAB 4: Holiday Exemption Simulator */}
      {activeTab === "simulator" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Controls */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Fine &amp; Exemption Calculator</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Test any due date and return date interval to simulate holiday deductions and fine
                calculations in real time.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="simDueDateInput" className="block text-xs font-bold text-slate-700">
                  Due Date
                </label>
                <input
                  id="simDueDateInput"
                  type="date"
                  value={simDueDate}
                  onChange={(e) => setSimDueDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-900"
                />
              </div>

              <div>
                <label
                  htmlFor="simReturnDateInput"
                  className="block text-xs font-bold text-slate-700"
                >
                  Return Date
                </label>
                <input
                  id="simReturnDateInput"
                  type="date"
                  value={simReturnDate}
                  onChange={(e) => setSimReturnDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-900"
                />
              </div>

              <div>
                <label htmlFor="simRateInput" className="block text-xs font-bold text-slate-700">
                  Fine Rate (₹/day)
                </label>
                <input
                  id="simRateInput"
                  type="number"
                  step="0.5"
                  value={simRate}
                  onChange={(e) => setSimRate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-900"
                />
              </div>

              <div>
                <label htmlFor="simGraceInput" className="block text-xs font-bold text-slate-700">
                  Grace Period (days)
                </label>
                <input
                  id="simGraceInput"
                  type="number"
                  step="1"
                  value={simGrace}
                  onChange={(e) => setSimGrace(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-900"
                />
              </div>

              <div className="col-span-2">
                <label htmlFor="simMaxFineInput" className="block text-xs font-bold text-slate-700">
                  Max Fine Cap (₹)
                </label>
                <input
                  id="simMaxFineInput"
                  type="number"
                  step="10"
                  value={simMaxFine}
                  onChange={(e) => setSimMaxFine(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-900"
                />
              </div>
            </div>
          </div>

          {/* Result Card */}
          {simResult && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
              <h2 className="text-sm font-bold text-slate-900">Calculation Breakdown</h2>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <span className="text-[11px] text-slate-500 font-medium">Calendar Days Late</span>
                  <div className="mt-1 text-base font-bold text-slate-900">
                    {simResult.totalDaysLate} days
                  </div>
                </div>

                <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3">
                  <span className="text-[11px] text-emerald-700 font-medium">
                    Holidays Exempted
                  </span>
                  <div className="mt-1 text-base font-bold text-emerald-800">
                    {simResult.exemptCount} {simResult.exemptCount === 1 ? "day" : "days"} (₹0
                    charged)
                  </div>
                </div>

                <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <span className="text-[11px] text-slate-500 font-medium">Chargeable Days</span>
                  <div className="mt-1 text-base font-bold text-slate-900">
                    {simResult.chargeable} days
                  </div>
                </div>

                <div className="rounded-lg border border-amber-100 bg-amber-50 p-3">
                  <span className="text-[11px] text-amber-700 font-medium">Final Overdue Fine</span>
                  <div className="mt-1 text-lg font-black text-amber-900">
                    ₹{simResult.finalFine}
                  </div>
                  {simResult.isCapped && (
                    <span className="text-[10px] text-amber-700 font-semibold">
                      (Capped at Max Fine)
                    </span>
                  )}
                </div>
              </div>

              {simResult.exemptList.length > 0 && (
                <div className="border-t border-slate-100 pt-3">
                  <span className="text-xs font-bold text-slate-700">Exempted Holiday Dates:</span>
                  <ul className="mt-2 space-y-1">
                    {simResult.exemptList.map((item) => (
                      <li
                        key={item.date}
                        className="flex items-center justify-between rounded bg-slate-50 px-2.5 py-1 text-xs"
                      >
                        <span className="font-mono text-slate-600">{item.date}</span>
                        <span className="font-semibold text-emerald-700">{item.name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
