import { sql } from "drizzle-orm";
import Link from "next/link";
import { ForbiddenCard } from "@/components/auth/ForbiddenCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/Table";
import { InstitutionalStudentRoster } from "@/components/patrons/InstitutionalStudentRoster";
import { db } from "@/db";
import { requirePageAuth } from "@/lib/auth";
import {
  getCachedLibraries,
  getCachedRecentLoans,
  getCachedStudentRoster,
} from "@/lib/master-data-cache";
import { formatDate, formatNumber } from "@/lib/utils";

export const metadata = {
  title: "Multi-Library Dashboard — RBMI LMS",
  description: "Operational metrics and circulation summary across RBMI campus libraries",
};

interface DashboardMetricRow extends Record<string, unknown> {
  titleCount: number;
  copyCount: number;
  patronCount: number;
  activeLoans: number;
  overdueLoans: number;
  unpaidFinesCount: number;
  unpaidFinesSum: string;
}

// biome-ignore lint/suspicious/noExplicitAny: Metrics rows storage
const metricsCache = new Map<string, { data: any; cachedAt: number }>();
const METRICS_CACHE_MS = 15 * 1000;

async function getDashboardMetrics(libraryId?: number) {
  const cacheKey = libraryId ? `metrics_${libraryId}` : "metrics_all";
  const now = Date.now();
  const cached = metricsCache.get(cacheKey);
  if (cached && now - cached.cachedAt < METRICS_CACHE_MS) {
    return cached.data;
  }

  // biome-ignore lint/suspicious/noExplicitAny: Raw sql execute result
  let rows: any;
  if (libraryId) {
    rows = await db.execute<DashboardMetricRow>(sql`
      SELECT
        (SELECT count(DISTINCT bib_id)::int FROM items WHERE library_id = ${libraryId}) AS "titleCount",
        (SELECT count(*)::int FROM items WHERE library_id = ${libraryId}) AS "copyCount",
        (SELECT count(*)::int FROM patrons WHERE status = 'ACTIVE' AND library_id = ${libraryId}) AS "patronCount",
        (SELECT count(*)::int FROM loans WHERE status = 'ISSUED' AND library_id = ${libraryId}) AS "activeLoans",
        (SELECT count(*)::int FROM loans WHERE status = 'ISSUED' AND due_date < CURRENT_DATE AND library_id = ${libraryId}) AS "overdueLoans",
        (SELECT count(*)::int FROM fines f JOIN loans l ON f.loan_id = l.id WHERE f.status = 'OUTSTANDING' AND l.library_id = ${libraryId}) AS "unpaidFinesCount",
        (SELECT COALESCE(SUM(f.amount - f.paid_amount), 0)::text FROM fines f JOIN loans l ON f.loan_id = l.id WHERE f.status = 'OUTSTANDING' AND l.library_id = ${libraryId}) AS "unpaidFinesSum"
    `);
  } else {
    rows = await db.execute<{
      titleCount: number;
      copyCount: number;
      patronCount: number;
      activeLoans: number;
      overdueLoans: number;
      unpaidFinesCount: number;
      unpaidFinesSum: string;
    }>(sql`
      SELECT
        (SELECT count(*)::int FROM bib_records) AS "titleCount",
        (SELECT count(*)::int FROM items) AS "copyCount",
        (SELECT count(*)::int FROM patrons WHERE status = 'ACTIVE') AS "patronCount",
        (SELECT count(*)::int FROM loans WHERE status = 'ISSUED') AS "activeLoans",
        (SELECT count(*)::int FROM loans WHERE status = 'ISSUED' AND due_date < CURRENT_DATE) AS "overdueLoans",
        (SELECT count(*)::int FROM fines WHERE status = 'OUTSTANDING') AS "unpaidFinesCount",
        (SELECT COALESCE(SUM(amount - paid_amount), 0)::text FROM fines WHERE status = 'OUTSTANDING') AS "unpaidFinesSum"
    `);
  }

  metricsCache.set(cacheKey, { data: rows, cachedAt: now });
  return rows;
}

interface DashboardPageProps {
  searchParams?: Promise<{ libraryId?: string }>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const auth = await requirePageAuth("DASHBOARD_VIEW");

  if (!auth.authorized) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ForbiddenCard
          message="Access to the Staff Dashboard requires the DASHBOARD_VIEW permission."
          requiredPermission="DASHBOARD_VIEW"
          userRole={auth.context?.user.roleName}
        />
      </div>
    );
  }

  const staffContext = auth.context;
  const isSuperAdmin = staffContext.user.roleCode === "SUPER_ADMIN";

  // Parse query parameters for multi-branch view
  const sp = (await searchParams) ?? {};
  let activeLibraryId: number | undefined;

  if (isSuperAdmin) {
    if (sp.libraryId && sp.libraryId !== "all") {
      const parsed = Number(sp.libraryId);
      if (!Number.isNaN(parsed) && parsed > 0) {
        activeLibraryId = parsed;
      }
    }
  } else {
    // Non-super admins are strictly scoped to their assigned library
    activeLibraryId = staffContext.user.libraryId;
  }

  // Query operational metrics, recent loans, student roster, and libraries in parallel with caching
  const [metricsRows, recentLoans, studentRosterItems, allLibraries] = await Promise.all([
    getDashboardMetrics(activeLibraryId),
    getCachedRecentLoans(10, activeLibraryId),
    getCachedStudentRoster(activeLibraryId),
    getCachedLibraries(),
  ]);

  const currentLibrary = activeLibraryId
    ? allLibraries.find((l) => l.id === activeLibraryId)
    : undefined;

  const libraryDisplayName = currentLibrary ? currentLibrary.name : "All Libraries (Consolidated)";

  // biome-ignore lint/suspicious/noExplicitAny: Metrics index access
  const metrics = (metricsRows[0] ?? {}) as any;
  const totalTitles = Number(metrics.titleCount ?? 0);
  const totalCopies = Number(metrics.copyCount ?? 0);
  const activePatrons = Number(metrics.patronCount ?? 0);
  const activeLoans = Number(metrics.activeLoans ?? 0);
  const overdueLoans = Number(metrics.overdueLoans ?? 0);
  const unpaidFineAmount = Number(metrics.unpaidFinesSum ?? 0);
  const unpaidFineCount = Number(metrics.unpaidFinesCount ?? 0);

  const quickActions = [
    {
      title: "Circulation Desk",
      desc: "Process check-outs, returns, and renewals",
      href: "/circulation",
      icon: "🔄",
      color: "border-blue-200 bg-blue-50/40 text-blue-900 hover:bg-blue-50",
    },
    {
      title: "Catalogue Search",
      desc: "Search volumes and bibliographic titles",
      href: "/catalogue",
      icon: "📚",
      color: "border-indigo-200 bg-indigo-50/40 text-indigo-900 hover:bg-indigo-50",
    },
    {
      title: "Patron Directory",
      desc: "Register patrons and check eligibility",
      href: "/patrons",
      icon: "👥",
      color: "border-emerald-200 bg-emerald-50/40 text-emerald-900 hover:bg-emerald-50",
    },
    {
      title: "Fine Collection",
      desc: "Collect overdue fines or process waivers",
      href: "/fines",
      icon: "💰",
      color: "border-amber-200 bg-amber-50/40 text-amber-900 hover:bg-amber-50",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          isSuperAdmin && !activeLibraryId
            ? "Multi-Library Campus Dashboard"
            : `${libraryDisplayName} Dashboard`
        }
        description={
          isSuperAdmin && !activeLibraryId
            ? `Welcome back, ${staffContext.user.fullName}. Consolidated multi-branch circulation and inventory metrics across all 4 libraries.`
            : `Welcome back, ${staffContext.user.fullName}. Live operational metrics and circulation summary for ${libraryDisplayName}.`
        }
        badge={activeLibraryId ? (currentLibrary?.code ?? "Branch") : "Campus Unified"}
        badgeColor={isSuperAdmin && !activeLibraryId ? "purple" : "blue"}
        breadcrumbs={[{ label: "Overview" }, { label: "Dashboard" }]}
      />

      {/* Super Admin Multi-Library Toggle Switcher */}
      {isSuperAdmin && (
        <div className="rounded-xl border-2 border-purple-300 bg-white p-4 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-purple-100 pb-2">
            <div className="flex items-center gap-2">
              <span className="flex h-3 w-3 rounded-full bg-purple-600 animate-pulse" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-purple-900">
                Switch Library (Interactive Toggle Bar)
              </h2>
            </div>
            <span className="text-[11px] text-purple-700 font-semibold bg-purple-50 border border-purple-200 px-2.5 py-0.5 rounded-full">
              Current: {libraryDisplayName}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard"
              className={`rounded-lg px-4 py-2 text-xs font-extrabold transition flex items-center gap-2 border-2 ${
                !activeLibraryId
                  ? "bg-purple-900 text-white border-purple-950 shadow-md ring-2 ring-purple-400"
                  : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300"
              }`}
            >
              <span className="text-sm">🏛️</span>
              <span>All Libraries (Campus Unified)</span>
            </Link>

            {allLibraries.map((lib) => {
              const isSelected = activeLibraryId === lib.id;
              const icon =
                lib.code === "RBCN"
                  ? "🏥"
                  : lib.code === "RBCP"
                    ? "💊"
                    : lib.code === "LIB-GN"
                      ? "🏢"
                      : "📚";

              return (
                <Link
                  key={lib.id}
                  href={`/dashboard?libraryId=${lib.id}`}
                  className={`rounded-lg px-4 py-2 text-xs font-extrabold transition flex items-center gap-2 border-2 ${
                    isSelected
                      ? "bg-blue-900 text-white border-blue-950 shadow-md ring-2 ring-blue-400"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300"
                  }`}
                >
                  <span className="text-sm">{icon}</span>
                  <span>{lib.name}</span>
                  <span
                    className={`ml-1 h-2.5 w-2.5 rounded-full ${
                      lib.isLibrarianAvailable ? "bg-emerald-400" : "bg-amber-400"
                    }`}
                    title={
                      lib.isLibrarianAvailable
                        ? "Librarian Available (Normal Fines)"
                        : "Librarian Away (Fines Exempted)"
                    }
                  />
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Library Ingestion & Record Creation Hub (Scoped to Active Library) */}
      <div className="rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-white p-5 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-blue-100 pb-2">
          <div>
            <h3 className="text-sm font-bold text-blue-950 flex items-center gap-2">
              <span>⚡</span>
              <span>Library Actions & Data Ingestion — {libraryDisplayName}</span>
            </h3>
            <p className="text-xs text-blue-700">
              {activeLibraryId
                ? `Directly add volumes, register patrons, or execute bulk CSV imports for ${libraryDisplayName}.`
                : "Select a specific library above or use the branch shortcuts below to ingest records per library."}
            </p>
          </div>
          {currentLibrary && (
            <span className="text-[11px] font-bold text-blue-900 bg-blue-100/80 border border-blue-300 px-2.5 py-1 rounded-md">
              Branch Code: {currentLibrary.code}
            </span>
          )}
        </div>

        {activeLibraryId ? (
          /* Single Selected Library Quick Action Buttons */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
            <Link
              href={`/catalogue?addBook=true&libraryId=${activeLibraryId}`}
              className="group flex flex-col p-3.5 rounded-xl border-2 border-indigo-200 bg-white hover:border-indigo-500 hover:shadow-md transition"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xl">📚</span>
                <span className="text-[11px] font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded group-hover:bg-indigo-600 group-hover:text-white transition">
                  + Add Book
                </span>
              </div>
              <div className="text-xs font-bold text-slate-900">Add Book / Volume</div>
              <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                Accession physical copy into {currentLibrary?.name || "library"}
              </div>
            </Link>

            <Link
              href={`/patrons?addPatron=true&libraryId=${activeLibraryId}`}
              className="group flex flex-col p-3.5 rounded-xl border-2 border-emerald-200 bg-white hover:border-emerald-500 hover:shadow-md transition"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xl">👥</span>
                <span className="text-[11px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded group-hover:bg-emerald-600 group-hover:text-white transition">
                  + Register Patron
                </span>
              </div>
              <div className="text-xs font-bold text-slate-900">Register Patron Member</div>
              <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                Add student or faculty account to {currentLibrary?.name || "library"}
              </div>
            </Link>

            <Link
              href={`/import?type=books&libraryId=${activeLibraryId}`}
              className="group flex flex-col p-3.5 rounded-xl border-2 border-purple-200 bg-white hover:border-purple-500 hover:shadow-md transition"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xl">📥</span>
                <span className="text-[11px] font-extrabold text-purple-700 bg-purple-50 px-2 py-0.5 rounded group-hover:bg-purple-600 group-hover:text-white transition">
                  Bulk Books
                </span>
              </div>
              <div className="text-xs font-bold text-slate-900">Bulk Import Books (CSV)</div>
              <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                Batch import catalogue records into {currentLibrary?.name || "library"}
              </div>
            </Link>

            <Link
              href={`/import?type=students&libraryId=${activeLibraryId}`}
              className="group flex flex-col p-3.5 rounded-xl border-2 border-blue-200 bg-white hover:border-blue-500 hover:shadow-md transition"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xl">📥</span>
                <span className="text-[11px] font-extrabold text-blue-700 bg-blue-50 px-2 py-0.5 rounded group-hover:bg-blue-600 group-hover:text-white transition">
                  Bulk Students
                </span>
              </div>
              <div className="text-xs font-bold text-slate-900">Bulk Import Patrons (CSV)</div>
              <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                Batch import student roster into {currentLibrary?.name || "library"}
              </div>
            </Link>
          </div>
        ) : (
          /* All Libraries Multi-Branch Action Matrix */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
            {allLibraries.map((lib) => {
              const icon =
                lib.code === "RBCN"
                  ? "🏥"
                  : lib.code === "RBCP"
                    ? "💊"
                    : lib.code === "LIB-GN"
                      ? "🏢"
                      : "📚";

              return (
                <div
                  key={lib.id}
                  className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                      <span>{icon}</span>
                      <span className="truncate">{lib.name}</span>
                    </span>
                    <span className="text-[10px] font-extrabold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                      {lib.code}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    <Link
                      href={`/catalogue?addBook=true&libraryId=${lib.id}`}
                      className="rounded-lg bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-900 px-2 py-1.5 text-center text-[11px] font-bold transition flex items-center justify-center gap-1"
                    >
                      <span>📚</span>
                      <span>+ Book</span>
                    </Link>
                    <Link
                      href={`/patrons?addPatron=true&libraryId=${lib.id}`}
                      className="rounded-lg bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-900 px-2 py-1.5 text-center text-[11px] font-bold transition flex items-center justify-center gap-1"
                    >
                      <span>👥</span>
                      <span>+ Patron</span>
                    </Link>
                    <Link
                      href={`/import?type=books&libraryId=${lib.id}`}
                      className="rounded-lg bg-purple-50 border border-purple-200 hover:bg-purple-100 text-purple-900 px-2 py-1.5 text-center text-[11px] font-bold transition flex items-center justify-center gap-1"
                    >
                      <span>📥</span>
                      <span>Bulk Books</span>
                    </Link>
                    <Link
                      href={`/import?type=students&libraryId=${lib.id}`}
                      className="rounded-lg bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-900 px-2 py-1.5 text-center text-[11px] font-bold transition flex items-center justify-center gap-1"
                    >
                      <span>📥</span>
                      <span>Bulk Patrons</span>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Branch Librarian Dedicated Context Banner */}
      {!isSuperAdmin && currentLibrary && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center space-x-3">
            <span className="flex h-3 w-3 rounded-full bg-blue-600" />
            <div>
              <div className="text-xs text-slate-500 font-medium">Assigned Library Branch</div>
              <h2 className="text-base font-bold text-slate-900">{currentLibrary.name}</h2>
            </div>
          </div>
          <div className="flex items-center space-x-3 text-xs">
            <span className="text-slate-500">Circulation Desk Status:</span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-bold border ${
                currentLibrary.isLibrarianAvailable
                  ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                  : "bg-amber-50 text-amber-900 border-amber-300"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  currentLibrary.isLibrarianAvailable ? "bg-emerald-500" : "bg-amber-500"
                }`}
              />
              <span>
                {currentLibrary.isLibrarianAvailable
                  ? "Librarian Present (Normal Fines)"
                  : "Librarian Away (Fines Exempted)"}
              </span>
            </span>
          </div>
        </div>
      )}

      {overdueLoans > 0 && (
        <Alert variant="warning" title={`${overdueLoans} Overdue Items Detected`}>
          There are currently {overdueLoans} active book issues past their scheduled return
          date in {libraryDisplayName}.
        </Alert>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-3.5 sm:p-4 shadow-xs">
          <span className="text-[11px] font-medium text-blue-700 uppercase tracking-wider">
            Total Books
          </span>
          <div className="mt-2 text-xl sm:text-2xl font-bold text-blue-950">{formatNumber(totalCopies)}</div>
          <div className="mt-1 text-[11px] text-blue-600 font-medium">
            {activeLibraryId ? "Assigned copies" : "Campus volumes"}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-xs">
          <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
            Catalog Titles
          </span>
          <div className="mt-2 text-xl sm:text-2xl font-bold text-slate-900">{formatNumber(totalTitles)}</div>
          <div className="mt-1 text-[11px] text-slate-400">Bibliographic records</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-xs">
          <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
            Active Patrons
          </span>
          <div className="mt-2 text-xl sm:text-2xl font-bold text-slate-900">
            {formatNumber(activePatrons)}
          </div>
          <div className="mt-1 text-[11px] text-emerald-600 font-medium">
            {activeLibraryId ? "Assigned students" : "Total verified accounts"}
          </div>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50/30 p-3.5 sm:p-4 shadow-xs">
          <span className="text-[11px] font-medium text-blue-700 uppercase tracking-wider">
            Issued Books
          </span>
          <div className="mt-2 text-xl sm:text-2xl font-bold text-blue-900">{formatNumber(activeLoans)}</div>
          <div className="mt-1 text-[11px] text-blue-600">Items checked out</div>
        </div>

        <div
          className={`rounded-xl border p-3.5 sm:p-4 shadow-xs ${
            overdueLoans > 0 ? "border-amber-300 bg-amber-50/40" : "border-slate-200 bg-white"
          }`}
        >
          <span
            className={`text-[11px] font-medium uppercase tracking-wider ${
              overdueLoans > 0 ? "text-amber-800" : "text-slate-500"
            }`}
          >
            Overdue Books
          </span>
          <div
            className={`mt-2 text-xl sm:text-2xl font-bold ${
              overdueLoans > 0 ? "text-amber-900" : "text-slate-900"
            }`}
          >
            {formatNumber(overdueLoans)}
          </div>
          <div className="mt-1 text-[11px] text-amber-700">Past due date</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-xs">
          <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
            Outstanding Fines
          </span>
          <div className="mt-2 text-xl sm:text-2xl font-bold text-slate-900">
            ₹{unpaidFineAmount.toFixed(2)}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">{unpaidFineCount} unpaid records</div>
        </div>
      </div>

      {/* Quick Launch Cards */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-700 mb-3">
          Quick Navigation
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className={`rounded-xl border p-5 transition shadow-xs hover:shadow-sm ${action.color}`}
            >
              <div className="text-2xl">{action.icon}</div>
              <h3 className="mt-2 text-sm font-bold">{action.title}</h3>
              <p className="mt-1 text-xs opacity-80">{action.desc}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Circulation Activity */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Recent Circulation Transactions {activeLibraryId ? `— ${libraryDisplayName}` : ""}
            </h2>
            <p className="text-xs text-slate-500">
              Latest check-outs recorded {activeLibraryId ? "at this branch" : "across all campus terminals"}
            </p>
          </div>
          <Link href="/circulation" className="text-xs font-semibold text-blue-900 hover:underline">
            Open Circulation Desk &rarr;
          </Link>
        </div>

        {recentLoans.length === 0 ? (
          <EmptyState
            title="No Recent Transactions"
            description={`No book issues have been recorded yet for ${libraryDisplayName}.`}
            action={{
              label: "Go to Circulation Desk",
              href: "/circulation",
            }}
            icon="📖"
          />
        ) : (
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Patron</TableHeaderCell>
                <TableHeaderCell>Card No</TableHeaderCell>
                <TableHeaderCell>Book Title</TableHeaderCell>
                <TableHeaderCell>Accession</TableHeaderCell>
                {!activeLibraryId && <TableHeaderCell>Library</TableHeaderCell>}
                <TableHeaderCell>Issue Date</TableHeaderCell>
                <TableHeaderCell>Due Date</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {recentLoans.map((loan) => (
                <TableRow key={loan.id}>
                  <TableCell className="font-medium text-slate-900">
                    {[loan.firstName, loan.lastName].filter(Boolean).join(" ")}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-slate-600">
                    {loan.patronCard}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-slate-900">{loan.title}</TableCell>
                  <TableCell className="font-mono text-xs text-slate-600">
                    {loan.accessionNo}
                  </TableCell>
                  {!activeLibraryId && (
                    <TableCell className="text-xs font-medium text-slate-700">
                      {loan.libraryName || "Central Library"}
                    </TableCell>
                  )}
                  <TableCell className="text-xs text-slate-600">
                    {formatDate(loan.issueDate)}
                  </TableCell>
                  <TableCell className="text-xs text-slate-600">
                    {formatDate(loan.dueDate)}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-800 uppercase">
                      {loan.status}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Institutional Student Directory & Campus Distribution */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Institutional Student Directory &amp; Campus Distribution
            </h2>
            <p className="text-xs text-slate-500">
              Students categorized by College (RBCET, RBCP, RBCN, RBMI, RBTTI) and Academic Program{" "}
              {activeLibraryId ? `(Assigned to ${libraryDisplayName})` : "(All Campus Libraries)"}
            </p>
          </div>
          <Link href="/patrons" className="text-xs font-semibold text-blue-900 hover:underline">
            Open Full Patron Directory &rarr;
          </Link>
        </div>

        <InstitutionalStudentRoster
          students={studentRosterItems}
          title={`Student Roster — ${libraryDisplayName}`}
          description={`Browse students classified by constituent college (RBCET, RBCP, RBCN, RBMI, RBTTI) and assigned to ${libraryDisplayName}.`}
        />
      </div>
    </div>
  );
}
