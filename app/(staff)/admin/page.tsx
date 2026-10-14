import { count, eq } from "drizzle-orm";
import Link from "next/link";
import { ForbiddenCard } from "@/components/auth/ForbiddenCard";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  InstitutionalStudentRoster,
  type StudentRosterItem,
} from "@/components/patrons/InstitutionalStudentRoster";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { requirePageAuth } from "@/lib/auth";

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

  // Retrieve administration stats and students
  const [userCountRes, auditCountRes, libraryCountRes, rawStudents] = await Promise.all([
    db.select({ value: count() }).from(schema.users),
    db.select({ value: count() }).from(schema.auditLogs),
    db.select({ value: count() }).from(schema.libraries),
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

  const totalStaff = userCountRes[0]?.value ?? 0;
  const totalAuditEvents = auditCountRes[0]?.value ?? 0;
  const totalLibraries = libraryCountRes[0]?.value ?? 0;

  const adminModules = [
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
      desc: "Configure maximum loan durations, item limits, renewal rules, and daily fine rates by patron category.",
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
      stat: "Institutional masters",
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
              Categorical student enrollments across constituent colleges (RBCET, RBCP, RBCN, RBMI, RBTTI)
            </p>
          </div>
          <Link
            href="/patrons"
            className="text-xs font-semibold text-blue-900 hover:underline"
          >
            Manage Patron Records &rarr;
          </Link>
        </div>

        <InstitutionalStudentRoster
          students={studentRosterItems}
          title="Constituent College Student Roster"
          description="Administrative directory of all registered students by College (RBCET, RBCP, RBCN, RBMI, RBTTI) and programs (B.Tech, Diploma / Polytechnic, B.Pharm, D.Pharm, Nursing, MBA, BBA, BCA, etc.)"
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
              PostgreSQL 18 (22 Tables, 6 Views)
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
