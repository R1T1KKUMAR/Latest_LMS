import { ForbiddenCard } from "@/components/auth/ForbiddenCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { requirePageAuth } from "@/lib/auth";
import { listRecentClearances } from "@/services/nodues";
import { NoDuesClient } from "./NoDuesClient";

export const metadata = {
  title: "No-Dues Clearance Desk — RBMI LMS",
  description: "Verify clearance eligibility, confirm zero liabilities, and issue certificates",
};

export default async function NoDuesPage() {
  const auth = await requirePageAuth("NODUES_ISSUE");

  if (!auth.authorized) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ForbiddenCard
          message="Access to the No-Dues Clearance Desk requires the NODUES_ISSUE permission."
          requiredPermission="NODUES_ISSUE"
          userRole={auth.context?.user.roleName}
        />
      </div>
    );
  }

  const staffContext = auth.context;
  const recentClearances = await listRecentClearances(20);

  return (
    <div className="space-y-6">
      <PageHeader
        title="No-Dues Clearance Desk"
        description="Verify patron borrowing balance and unpaid fines, and issue graduation/departure clearances."
        badge="Clearance"
        badgeColor="emerald"
        breadcrumbs={[{ label: "Circulation" }, { label: "No-Dues Clearance" }]}
      />

      <NoDuesClient
        initialClearances={recentClearances}
        csrfToken={staffContext.session.csrfToken}
      />
    </div>
  );
}
