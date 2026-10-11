import Link from "next/link";
import { ForbiddenCard } from "@/components/auth/ForbiddenCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { requirePageAuth } from "@/lib/auth";

export const metadata = {
  title: "System & Campus Settings — RBMI LMS",
  description: "Configure institutional settings, defaults, fine thresholds, and session parameters",
};

export default async function AdminSettingsPage() {
  const auth = await requirePageAuth("ADMIN_SETTINGS");

  if (!auth.authorized) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ForbiddenCard
          message="Access to System Settings requires ADMIN_SETTINGS permission."
          requiredPermission="ADMIN_SETTINGS"
          userRole={auth.context?.user.roleName}
        />
      </div>
    );
  }

  const settingsList = await db.select().from(schema.systemSettings);

  return (
    <div className="container mx-auto space-y-6 px-4 py-8">
      <PageHeader
        title="System & Campus Settings"
        description="Global system parameters, loan defaults, fine thresholds, and operational rules."
        actions={
          <Link
            href="/admin"
            className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-xs hover:bg-slate-50"
          >
            &larr; Admin Portal
          </Link>
        }
      />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="border-b border-slate-200 bg-slate-50/75 px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-800">
            System Configuration Keys ({settingsList.length} Active Settings)
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Settings take immediate effect across circulation calculations and reports without restart.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-6 py-3">Setting Key</th>
                <th className="px-6 py-3">Value</th>
                <th className="px-6 py-3">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {settingsList.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/50">
                  <td className="px-6 py-3.5 font-mono text-xs font-semibold text-blue-900">
                    {s.settingKey}
                  </td>
                  <td className="px-6 py-3.5">
                    <span className="inline-flex rounded-md bg-slate-100 px-2.5 py-1 font-mono text-xs font-medium text-slate-800">
                      {s.settingValue}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-xs text-slate-500">
                    {s.description || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
