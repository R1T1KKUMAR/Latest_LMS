import Link from "next/link";
import { ForbiddenCard } from "@/components/auth/ForbiddenCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { requirePageAuth } from "@/lib/auth";
import { listCirculationRules } from "@/services/admin-rules";
import { getHolidays } from "@/services/holidays";
import { getAllSystemSettings } from "@/services/settings";
import { AdminFineAdjustmentClient } from "./AdminFineAdjustmentClient";

export const metadata = {
  title: "Dynamic Fine Adjustment — RBMI LMS Administration",
  description:
    "Calibrate overdue fine rates, grace periods, circulation rule fine matrix, and manage fine exemptions",
};

export default async function AdminFineAdjustmentPage() {
  const auth = await requirePageAuth(["ADMIN_SETTINGS", "ADMIN_RULES"]);

  if (!auth.authorized || !auth.context) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ForbiddenCard
          message="Access to Fine Adjustment Console requires administrative permissions (ADMIN_SETTINGS or ADMIN_RULES)."
          requiredPermission="ADMIN_SETTINGS / ADMIN_RULES"
          userRole={auth.context?.user.roleName}
        />
      </div>
    );
  }

  const staffContext = auth.context;

  const [allSettings, rules, holidays] = await Promise.all([
    getAllSystemSettings(),
    listCirculationRules(),
    getHolidays(),
  ]);

  const fineSettingsMap: Record<string, string> = {};
  for (const s of allSettings) {
    fineSettingsMap[s.settingKey] = s.settingValue;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dynamic Fine Adjustment & Policy Calibration"
        description="Fine rate tuning, circulation rule matrix, overdue checkout thresholds, and live fine calculator."
        badge="Financial Policy"
        badgeColor="amber"
        breadcrumbs={[
          { label: "Admin Portal", href: "/admin" },
          { label: "Dynamic Fine Adjustment" },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/admin/holidays"
              className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50"
            >
              📅 Holiday Calendar ({holidays.length})
            </Link>
            <Link
              href="/admin"
              className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50"
            >
              &larr; Admin Portal
            </Link>
          </div>
        }
      />

      <AdminFineAdjustmentClient
        initialSettings={fineSettingsMap}
        initialRules={rules}
        csrfToken={staffContext.session.csrfToken}
        holidays={holidays.map((h) => ({ date: h.date, name: h.name }))}
      />
    </div>
  );
}
