import { ForbiddenCard } from "@/components/auth/ForbiddenCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { requirePageAuth } from "@/lib/auth";
import { getCachedRecentLoans } from "@/lib/master-data-cache";
import { CirculationDeskClient } from "../CirculationDeskClient";

export const metadata = {
  title: "Book Renewal Terminal — RBMI LMS",
  description: "Renew active book issues with policy compliance and renewal limit checks",
};

export default async function RenewPage() {
  const auth = await requirePageAuth("CIRC_RENEW");

  if (!auth.authorized) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ForbiddenCard
          message="Access to the Book Renewal Terminal requires the CIRC_RENEW permission."
          requiredPermission="CIRC_RENEW"
          userRole={auth.context?.user.roleName}
        />
      </div>
    );
  }

  const staffContext = auth.context;

  // Retrieve active checkouts with caching
  const checkouts = await getCachedRecentLoans(50);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Book Renewal Terminal"
        description="Renew active borrowed materials. Enforces maximum renewal counts, overdue blocks, and reservation holds."
        badge="Renewal Desk"
        badgeColor="purple"
        breadcrumbs={[{ label: "Circulation", href: "/circulation" }, { label: "Book Renewal" }]}
      />

      <CirculationDeskClient
        initialCheckouts={checkouts}
        csrfToken={staffContext.session.csrfToken}
        canIssue={false}
        canReturn={false}
        canRenew={true}
        canMarkLost={false}
        defaultTab="renew"
        standalone={true}
      />
    </div>
  );
}
