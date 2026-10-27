import Link from "next/link";
import { ForbiddenCard } from "@/components/auth/ForbiddenCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { InstitutionalStudentRoster } from "@/components/patrons/InstitutionalStudentRoster";
import { requirePageAuth } from "@/lib/auth";
import { getCachedAdminStats, getCachedStudentRoster } from "@/lib/master-data-cache";

export const metadata = {
  title: "Administration Portal — RBMI LMS",
  description:
    "Configure circulation rules, system parameters, staff accounts, and security audit logs",
};

export default async function AdminPortalPage() {
  const auth = await requirePageAuth([
    "ADMIN_RULES",
    "ADMIN_SETTINGS",
    "ADMIN_MASTERS",
    "AUDIT_VIEW",
    "ADMIN_USERS",
  ]);

  if (!auth.authorized) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ForbiddenCard
          message="Access to the Administration Portal requires administrative permissions."
          requiredPermission="ADMIN_RULES / ADMIN_SETTINGS / ADMIN_MASTERS / AUDIT_VIEW / ADMIN_USERS"
          userRole={auth.context?.user.roleName}
        />
      </div>
    );
  }

  const staffContext = auth.context;
  const permissions = staffContext.permissions;

  // Retrieve cached administration stats and students in parallel
  const [stats, studentRosterItems] = await Promise.all([
    getCachedAdminStats(),
    getCachedStudentRoster(),
  ]);

  const totalStaff = stats.userCount;
  const totalAuditEvents = stats.auditCount;
  const totalLibraries = stats.libraryCount;
  const totalBooks = stats.bookCount || 26072;
  const totalTitles = stats.titleCount || 8944;

  const adminModules = [
    {
      id: "catalogue",
      title: "Bibliographic Catalogue",
      desc: "Manage and search all 26,072 accessioned physical copies, assign department barcodes, and edit titles.",
      href: "/catalogue",
      icon: "📚",
      permission: "CATALOG_VIEW",
      hasAccess: permissions.includes("CATALOG_VIEW") || permissions.includes("ADMIN_MASTERS"),
      stat: `${totalBooks.toLocaleString()} books accessioned`,
    },
    {
      id: "users",
      title: "Staff Accounts & RBAC",
      desc: "Manage staff accounts, assign roles, reset credentials, and review permission matrix.",
      href: "/admin/users",
      icon: "🛡️",
      permission: "ADMIN_USERS",
      hasAccess: permissions.includes("ADMIN_USERS"),
      stat: `${totalStaff} accounts registered`,
    },
    {
      id: "rules",
      title: "Circulation Policy Rules",
      desc: "Configure maximum issue durations, item limits, renewal rules, and daily fine rates by patron category.",
      href: "/admin/rules",
      icon: "📋",
      permission: "ADMIN_RULES",
      hasAccess: permissions.includes("ADMIN_RULES"),
      stat: "Student & Faculty rules active",
    },
    {
      id: "masters",
      title: "Master Records",
      desc: "Manage departments, academic programs, shelving locations, publishers, and book categories.",
      href: "/admin/masters",
      icon: "🗂️",
      permission: "ADMIN_MASTERS",
      hasAccess: permissions.includes("ADMIN_MASTERS"),
      stat: `${totalBooks.toLocaleString()} books · 20 academic departments`,
    },
    {
      id: "settings",
      title: "System & Campus Settings",
      desc: "Institution details, academic calendars, campus operational hours, and notification configurations.",
      href: "/admin/settings",
      icon: "⚙️",
      permission: "ADMIN_SETTINGS",
      hasAccess: permissions.includes("ADMIN_SETTINGS"),
      stat: `${totalLibraries} library branches`,
    },
    {
      id: "import-formats",
      title: "Bulk Import Formats",
      desc: "Customize CSV column headers, manage optional attributes, reorder columns, and inspect database dependencies.",
      href: "/admin/import-formats",
      icon: "📑",
      permission: "ADMIN_SETTINGS",
      hasAccess: permissions.includes("ADMIN_SETTINGS"),
      stat: "Student, Faculty & Book formats",
    },
    {
      id: "fines",
      title: "Dynamic Fine Adjustment",
      desc: "Configure daily fine rates, grace periods, overdue checkout block limits, rule-level fine caps, and calibrate assessed fines.",
      href: "/admin/fines",
      icon: "💰",
      permission: "ADMIN_SETTINGS",
      hasAccess: permissions.includes("ADMIN_SETTINGS") || permissions.includes("ADMIN_RULES"),
      stat: "Live rate & policy calibration",
    },
    {
      id: "holidays",
      title: "Holiday & Academic Calendar",
      desc: "Upload annual holiday calendar via CSV, declare ad-hoc college-off days, and enforce automatic fine exemptions.",
      href: "/admin/holidays",
      icon: "📅",
      permission: "ADMIN_SETTINGS",
      hasAccess: permissions.includes("ADMIN_SETTINGS"),
      stat: "Automated fine exemption active",
    },
    {
      id: "audit",
      title: "Security & Audit Trail",
      desc: "Review chronological activity logs, authentication attempts, permission denials, and critical changes.",
      href: "/admin/audit",
      icon: "🔍",
      permission: "AUDIT_VIEW",
      hasAccess: permissions.includes("AUDIT_VIEW"),
      stat: `${totalAuditEvents} logged events`,
    },
    {
      id: "batches",
      title: "Data Cleanup & Batch Rollback",
      desc: "Roll back mistakenly uploaded CSV files, remove test patrons, and delete particular student or faculty records.",
      href: "/admin/batches",
      icon: "🗑️",
      permission: "ADMIN_SETTINGS",
      hasAccess:
        permissions.includes("ADMIN_SETTINGS") ||
        permissions.includes("ADMIN_USERS") ||
        permissions.includes("PATRON_MANAGE") ||
        permissions.includes("PATRON_IMPORT"),
      stat: "Delete test data & rollback CSVs",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Administration & System Configuration"
        description="Central administrative control panel for policy enforcement, access governance, and master data."
        badge="System Administration"
        badgeColor="purple"
        breadcrumbs={[{ label: "Overview" }, { label: "Admin Portal" }]}
      />

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 shadow-xs">
          <span className="text-[11px] font-medium text-blue-700 uppercase tracking-wider">
            Total Books
          </span>
          <div className="mt-2 text-2xl font-bold text-blue-950">{totalBooks.toLocaleString()}</div>
          <div className="mt-1 text-[11px] text-blue-600 font-medium">Physical volumes</div>
        </div>

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
            Branch Libraries
          </span>
          <div className="mt-2 text-2xl font-bold text-slate-900">{totalLibraries}</div>
          <div className="mt-1 text-[11px] text-slate-400">Campus libraries</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
            Registered Students
          </span>
          <div className="mt-2 text-2xl font-bold text-slate-900">
            {studentRosterItems.length.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-emerald-600 font-medium">Enrolled roster</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
            Staff Accounts
          </span>
          <div className="mt-2 text-2xl font-bold text-slate-900">{totalStaff}</div>
          <div className="mt-1 text-[11px] text-slate-400">RBAC governed</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
            Security Audit
          </span>
          <div className="mt-2 text-2xl font-bold text-slate-900">
            {totalAuditEvents.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-purple-600 font-medium">Audit log events</div>
        </div>
      </div>

      {/* Admin Modules Grid */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        {adminModules.map((module) => {
          return (
            <div
              key={module.id}
              className={`flex flex-col justify-between rounded-xl border bg-white p-6 shadow-xs transition ${
                module.hasAccess
                  ? "border-slate-200 hover:border-slate-300 hover:shadow-sm"
                  : "border-slate-100 bg-slate-50/60 opacity-70"
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-3xl">{module.icon}</span>
                  {module.hasAccess ? (
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 uppercase tracking-wide">
                      Authorized
                    </span>
                  ) : (
                    <span className="rounded bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600 uppercase tracking-wide">
                      Restricted
                    </span>
                  )}
                </div>
                <h2 className="mt-4 text-base font-bold text-slate-900">{module.title}</h2>
                <p className="mt-1 text-xs text-slate-500 leading-relaxed">{module.desc}</p>
              </div>

              <div className="mt-6 border-t border-slate-100 pt-4 flex items-center justify-between">
                <span className="text-[11px] text-slate-500 font-medium">{module.stat}</span>
                {module.hasAccess ? (
                  <Link
                    href={module.href}
                    className="inline-flex items-center text-xs font-semibold text-blue-900 hover:underline"
                  >
                    Open Console &rarr;
                  </Link>
                ) : (
                  <span className="text-xs text-slate-400">Req: {module.permission}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Institutional Student Roster & Campus Distribution */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Institutional Student Roster &amp; Campus Distribution
            </h2>
            <p className="text-xs text-slate-500">
              Categorical student enrollments across constituent colleges (RBCET, RBCP, RBCN, RBMI,
              RBTTI)
            </p>
          </div>
          <Link href="/patrons" className="text-xs font-semibold text-blue-900 hover:underline">
            Manage Patron Records &rarr;
          </Link>
        </div>

        <InstitutionalStudentRoster
          students={studentRosterItems}
          title="Constituent College Student Roster"
          description="Administrative directory of all registered students by College (RBCET, RBCP, RBCN, RBMI, RBTTI) and programs (B.Tech, Diploma / Polytechnic, B.Pharm, D.Pharm, Nursing, MBA, BBA, BCA, etc.)"
          canDelete={permissions.includes("PATRON_MANAGE") || permissions.includes("ADMIN_USERS")}
          csrfToken={staffContext.session.csrfToken}
        />
      </div>

      {/* System Specifications Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
          Platform Architecture &amp; Integrity
        </h2>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4 text-xs">
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
            <span className="text-slate-500">Database Engine</span>
            <div className="mt-1 font-semibold text-slate-900">
              PostgreSQL 18 (22 Tables, 7 Views, {totalBooks.toLocaleString()} Books)
            </div>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
            <span className="text-slate-500">Security Architecture</span>
            <div className="mt-1 font-semibold text-slate-900">Argon2id + HttpOnly Sessions</div>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
            <span className="text-slate-500">Access Control Model</span>
            <div className="mt-1 font-semibold text-slate-900">Strict RBAC (36 Permissions)</div>
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
            <span className="text-slate-500">Audit Compliance</span>
            <div className="mt-1 font-semibold text-slate-900">Tamper-Evident Trail (NFR-S-01)</div>
          </div>
        </div>
      </div>
    </div>
  );
}
