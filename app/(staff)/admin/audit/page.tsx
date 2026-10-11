import { desc } from "drizzle-orm";
import Link from "next/link";
import { ForbiddenCard } from "@/components/auth/ForbiddenCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { requirePageAuth } from "@/lib/auth";

export const metadata = {
  title: "Security & Audit Trail — RBMI LMS",
  description: "Chronological security log of system operations, sign-ins, and permission checks",
};

export default async function AdminAuditPage() {
  const auth = await requirePageAuth("AUDIT_VIEW");

  if (!auth.authorized) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ForbiddenCard
          message="Access to Audit Trail requires AUDIT_VIEW permission."
          requiredPermission="AUDIT_VIEW"
          userRole={auth.context?.user.roleName}
        />
      </div>
    );
  }

  const logs = await db
    .select()
    .from(schema.auditLogs)
    .orderBy(desc(schema.auditLogs.createdAt))
    .limit(100);

  return (
    <div className="container mx-auto space-y-6 px-4 py-8">
      <PageHeader
        title="Security & Audit Trail"
        description="Append-only record of system operations, authentication events, and administrative actions."
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
            Recent Audit Events (Last {logs.length} Records)
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Logs are immutable and retain actor identities, actions performed, timestamps, and IP addresses.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-6 py-3">Timestamp</th>
                <th className="px-6 py-3">Actor</th>
                <th className="px-6 py-3">Action</th>
                <th className="px-6 py-3">Entity</th>
                <th className="px-6 py-3">Details</th>
                <th className="px-6 py-3">IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/50">
                  <td className="px-6 py-3.5 font-mono text-xs text-slate-500">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="px-6 py-3.5">
                    <div className="font-medium text-slate-800">{log.actorName}</div>
                    <span className="text-[10px] uppercase text-slate-400">{log.actorType}</span>
                  </td>
                  <td className="px-6 py-3.5">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                        log.action.includes("FAILED") || log.action.includes("DENIED")
                          ? "bg-rose-100 text-rose-800"
                          : log.action.includes("LOGIN")
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-blue-100 text-blue-800"
                      }`}
                    >
                      {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-xs text-slate-600">
                    {log.entity || "—"} {log.entityId ? `#${log.entityId}` : ""}
                  </td>
                  <td className="px-6 py-3.5 text-xs text-slate-500">
                    {log.details || "—"}
                  </td>
                  <td className="px-6 py-3.5 font-mono text-xs text-slate-400">
                    {log.ipAddress || "127.0.0.1"}
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
