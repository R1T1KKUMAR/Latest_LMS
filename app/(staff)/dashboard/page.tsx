import { and, count, eq, lt, sql } from "drizzle-orm";
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
import {
  InstitutionalStudentRoster,
  type StudentRosterItem,
} from "@/components/patrons/InstitutionalStudentRoster";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { requirePageAuth } from "@/lib/auth";

export const metadata = {
  title: "Staff Dashboard — RBMI LMS",
  description: "Central library operational metrics and circulation summary",
};

let cachedMetricsData: { data: any; cachedAt: number } | null = null;
const METRICS_CACHE_MS = 15 * 1000;

async function getDashboardMetrics() {
  const now = Date.now();
  if (cachedMetricsData && now - cachedMetricsData.cachedAt < METRICS_CACHE_MS) {
    return cachedMetricsData.data;
  }
  const rows = await db.execute<{
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
  cachedMetricsData = { data: rows, cachedAt: now };
  return rows;
}

export default async function DashboardPage() {
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

  // Query operational metrics from DB in a single consolidated round-trip (with 15s RAM cache)
  const [metricsRows, recentLoans, rawStudents] = await Promise.all([
    getDashboardMetrics(),
    db
      .select({
        id: schema.loans.id,
        issueDate: schema.loans.issueDate,
        dueDate: schema.loans.dueDate,
        status: schema.loans.status,
        firstName: schema.patrons.firstName,
        lastName: schema.patrons.lastName,
        patronCard: schema.patrons.cardNo,
        title: schema.bibRecords.title,
        accessionNo: schema.items.accessionNo,
      })
      .from(schema.loans)
      .innerJoin(schema.patrons, eq(schema.loans.patronId, schema.patrons.id))
      .innerJoin(schema.items, eq(schema.loans.itemId, schema.items.id))
      .innerJoin(schema.bibRecords, eq(schema.items.bibId, schema.bibRecords.id))
      .orderBy(sql`${schema.loans.issueDate} DESC`)
      .limit(5),
    db
      .select({
        id: schema.patrons.id,
        cardNo: schema.patrons.cardNo,
        firstName: schema.patrons.firstName,
        lastName: schema.patrons.lastName,
        patronType: schema.patrons.patronType,
        categoryId: schema.patrons.categoryId,
        categoryName: schema.patronCategories.name,
        institutionId: schema.patrons.institutionId,
        institutionCode: schema.institutions.code,
        institutionName: schema.institutions.name,
        courseId: schema.patrons.courseId,
        courseCode: schema.courses.code,
        courseName: schema.courses.name,
        departmentId: schema.patrons.departmentId,
        departmentName: schema.departments.name,
        academicYear: schema.patrons.academicYear,
        semester: schema.patrons.semester,
        section: schema.patrons.section,
        email: schema.patrons.email,
        mobile: schema.patrons.mobile,
        rollNo: schema.patrons.rollNo,
        employeeId: schema.patrons.employeeId,
        cardExpiry: schema.patrons.cardExpiry,
        status: schema.patrons.status,
      })
      .from(schema.patrons)
      .innerJoin(schema.patronCategories, eq(schema.patrons.categoryId, schema.patronCategories.id))
      .leftJoin(schema.institutions, eq(schema.patrons.institutionId, schema.institutions.id))
      .leftJoin(schema.courses, eq(schema.patrons.courseId, schema.courses.id))
      .leftJoin(schema.departments, eq(schema.patrons.departmentId, schema.departments.id))
      .where(eq(schema.patrons.patronType, "STUDENT"))
      .orderBy(schema.patrons.rollNo),
  ]);

  const studentRosterItems: StudentRosterItem[] = rawStudents.map((s) => ({
    id: s.id,
    cardNo: s.cardNo,
    fullName: [s.firstName, s.lastName].filter(Boolean).join(" "),
    patronType: s.patronType,
    categoryId: s.categoryId,
    categoryName: s.categoryName,
    institutionId: s.institutionId,
    institutionCode: s.institutionCode,
    institutionName: s.institutionName,
    courseId: s.courseId,
    courseCode: s.courseCode,
    courseName: s.courseName,
    departmentId: s.departmentId,
    departmentName: s.departmentName,
    academicYear: s.academicYear,
    semester: s.semester,
    section: s.section,
    email: s.email,
    mobile: s.mobile,
    rollNo: s.rollNo,
    employeeId: s.employeeId,
    cardExpiry: String(s.cardExpiry),
    status: s.status,
  }));

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
      desc: "Manage titles, accessions, and editions",
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
        title="Operational Dashboard"
        description={`Welcome back, ${staffContext.user.fullName}. System overview and real-time circulation metrics.`}
        badge="Live Metrics"
        badgeColor="blue"
        breadcrumbs={[{ label: "Overview" }, { label: "Dashboard" }]}
      />

      {overdueLoans > 0 && (
        <Alert variant="warning" title={`${overdueLoans} Overdue Items Detected`}>
          There are currently {overdueLoans} active circulation loans past their scheduled return
          date. Visit the circulation desk or reports repository to send overdue notifications.
        </Alert>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
            Catalog Titles
          </span>
          <div className="mt-2 text-2xl font-bold text-slate-900">
            {totalTitles.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">Bibliographic records</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
            Physical Copies
          </span>
          <div className="mt-2 text-2xl font-bold text-slate-900">
            {totalCopies.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">Accessioned items</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
            Active Patrons
          </span>
          <div className="mt-2 text-2xl font-bold text-slate-900">
            {activePatrons.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-emerald-600 font-medium">Verified accounts</div>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50/30 p-4 shadow-xs">
          <span className="text-[11px] font-medium text-blue-700 uppercase tracking-wider">
            Active Loans
          </span>
          <div className="mt-2 text-2xl font-bold text-blue-900">
            {activeLoans.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-blue-600">Items checked out</div>
        </div>

        <div
          className={`rounded-xl border p-4 shadow-xs ${overdueLoans > 0 ? "border-amber-300 bg-amber-50/40" : "border-slate-200 bg-white"}`}
        >
          <span
            className={`text-[11px] font-medium uppercase tracking-wider ${overdueLoans > 0 ? "text-amber-800" : "text-slate-500"}`}
          >
            Overdue Loans
          </span>
          <div
            className={`mt-2 text-2xl font-bold ${overdueLoans > 0 ? "text-amber-900" : "text-slate-900"}`}
          >
            {overdueLoans.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-amber-700">Past due date</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
            Outstanding Fines
          </span>
          <div className="mt-2 text-2xl font-bold text-slate-900">
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
            <h2 className="text-base font-bold text-slate-900">Recent Circulation Transactions</h2>
            <p className="text-xs text-slate-500">
              Latest check-outs recorded across campus terminals
            </p>
          </div>
          <Link href="/circulation" className="text-xs font-semibold text-blue-900 hover:underline">
            Open Circulation Desk &rarr;
          </Link>
        </div>

        {recentLoans.length === 0 ? (
          <EmptyState
            title="No Recent Transactions"
            description="No book loans have been recorded yet. Begin by issuing items at the Circulation Desk."
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
                  <TableCell className="text-xs text-slate-600">{String(loan.issueDate)}</TableCell>
                  <TableCell className="text-xs text-slate-600">{String(loan.dueDate)}</TableCell>
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
              Complete student body categorized by College (RBCET, RBCP, RBCN, RBMI, RBTTI) and Academic Program
            </p>
          </div>
          <Link
            href="/patrons"
            className="text-xs font-semibold text-blue-900 hover:underline"
          >
            Open Full Patron Directory &rarr;
          </Link>
        </div>

        <InstitutionalStudentRoster
          students={studentRosterItems}
          title="Student Roster by College &amp; Program"
          description="Browse campus students classified by constituent college (RBCET, RBCP, RBCN, RBMI, RBTTI) and programs (B.Tech, Diploma / Polytechnic, Pharmacy, Nursing, Management, etc.)"
        />
      </div>
    </div>
  );
}
