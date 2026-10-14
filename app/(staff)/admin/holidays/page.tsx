import Link from "next/link";
import { ForbiddenCard } from "@/components/auth/ForbiddenCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { requirePageAuth } from "@/lib/auth";
import { getHolidays } from "@/services/holidays";
import { AdminHolidayCalendarClient } from "./AdminHolidayCalendarClient";

export const metadata = {
  title: "Holiday & Academic Calendar — RBMI LMS Administration",
  description:
    "Upload annual holiday calendar, declare ad-hoc college closures, and manage automatic overdue fine exemptions",
};

export default async function AdminHolidaysPage() {
  const auth = await requirePageAuth("ADMIN_SETTINGS");

  if (!auth.authorized || !auth.context) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ForbiddenCard
          message="Access to the Holiday & Academic Calendar requires ADMIN_SETTINGS permission."
          requiredPermission="ADMIN_SETTINGS"
          userRole={auth.context?.user.roleName}
        />
      </div>
    );
  }

  const staffContext = auth.context;
  const holidays = await getHolidays();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Holiday & Academic Calendar"
        description="Upload annual holiday schedule, declare emergency or ad-hoc college-off days, and enforce automatic fine exemptions."
        badge="Academic Calendar"
        badgeColor="purple"
        breadcrumbs={[{ label: "Admin Portal", href: "/admin" }, { label: "Holiday Calendar" }]}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/admin/fines"
              className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50"
            >
              💰 Fine Policies
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

      <AdminHolidayCalendarClient
        initialHolidays={holidays}
        csrfToken={staffContext.session.csrfToken}
      />
    </div>
  );
}
