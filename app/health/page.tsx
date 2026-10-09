import { PublicFooter, PublicHeader } from "@/components/layout/PublicHeader";
import { env } from "@/config/env";

export const dynamic = "force-dynamic";

export default function HealthPage() {
  const uptimeMinutes = Math.floor(process.uptime() / 60);

  return (
    <div className="min-h-screen flex flex-col">
      <PublicHeader currentPath="/health" />

      <main className="flex-1 mx-auto max-w-4xl px-4 py-10 sm:px-6 w-full">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
          <div className="border-b border-slate-200 bg-slate-50/75 px-6 py-4">
            <div className="flex items-center space-x-2">
              <span className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
              <h2 className="text-lg font-bold text-slate-900">Application Health & Status</h2>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              System diagnostics and runtime operational parameters
            </p>
          </div>

          <div className="p-6">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-4">
                <dt className="text-xs font-medium text-slate-500">Service Status</dt>
                <dd className="mt-1 text-sm font-semibold text-emerald-700">
                  Operational (Healthy)
                </dd>
              </div>

              <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-4">
                <dt className="text-xs font-medium text-slate-500">Runtime Environment</dt>
                <dd className="mt-1 text-sm font-semibold text-slate-800">{env.NODE_ENV}</dd>
              </div>

              <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-4">
                <dt className="text-xs font-medium text-slate-500">Node Engine Version</dt>
                <dd className="mt-1 text-sm font-semibold text-slate-800">{process.version}</dd>
              </div>

              <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-4">
                <dt className="text-xs font-medium text-slate-500">Process Uptime</dt>
                <dd className="mt-1 text-sm font-semibold text-slate-800">
                  {uptimeMinutes} minute(s)
                </dd>
              </div>

              <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-4">
                <dt className="text-xs font-medium text-slate-500">Configured Server Port</dt>
                <dd className="mt-1 text-sm font-semibold text-slate-800">{env.PORT}</dd>
              </div>

              <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-4">
                <dt className="text-xs font-medium text-slate-500">Log Level</dt>
                <dd className="mt-1 text-sm font-semibold text-slate-800">{env.LOG_LEVEL}</dd>
              </div>
            </dl>

            <div className="mt-6 border-t border-slate-100 pt-4 flex items-center justify-between text-xs text-slate-500">
              <span>
                JSON Health Endpoint:{" "}
                <code className="rounded bg-slate-100 px-1 py-0.5 text-slate-800">/api/health</code>
              </span>
              <span className="text-emerald-700 font-medium">All systems normal</span>
            </div>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
