import { ForbiddenCard } from "@/components/auth/ForbiddenCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { requirePageAuth } from "@/lib/auth";
import { getCachedRecentLoans } from "@/lib/master-data-cache";
import { CirculationDeskClient } from "../CirculationDeskClient";

export const metadata = {
  title: "Declare Lost Material — RBMI LMS",
  description: "Declare issued materials lost and assess replacement fee plus processing charge",
};

export default async function LostPage() {
  const auth = await requirePageAuth("CIRC_LOST");

  if (!auth.authorized) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ForbiddenCard
          message="Access to the Declare Lost Terminal requires the CIRC_LOST permission."
          requiredPermission="CIRC_LOST"
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
        title="Declare Material Lost Terminal"
        description="Process lost library books. Calculates book replacement cost, non-refundable processing fee, and overdue fines to date per BR-07."
        badge="Lost Desk"
        badgeColor="amber"
        breadcrumbs={[{ label: "Circulation", href: "/circulation" }, { label: "Declare Lost" }]}
      />

      <CirculationDeskClient
        initialCheckouts={checkouts}
        csrfToken={staffContext.session.csrfToken}
        canIssue={false}
        canReturn={false}
        canRenew={false}
        canMarkLost={true}
        defaultTab="lost"
        standalone={true}
      />
    </div>
  );
}
