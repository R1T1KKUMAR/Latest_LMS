import { ForbiddenCard } from "@/components/auth/ForbiddenCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { requirePageAuth } from "@/lib/auth";
import { listFines } from "@/services/fines";
import { FinesClient } from "./FinesClient";

export const metadata = {
  title: "Fines & Payments Desk — RBMI LMS",
  description: "Collect overdue fines, process authorized waivers, and maintain receipt records",
};

export default async function FinesPage() {
  const auth = await requirePageAuth(["FINE_COLLECT", "FINE_WAIVE"]);

  if (!auth.authorized || !auth.context) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ForbiddenCard
          message="Access to the Fines Desk requires fine collection or waiver permissions (FINE_COLLECT or FINE_WAIVE)."
          requiredPermission="FINE_COLLECT / FINE_WAIVE"
          userRole={auth.context?.user.roleName}
        />
      </div>
    );
  }

  const staffContext = auth.context;
  const permissions = staffContext.permissions;

  // Retrieve fines with true balances and patron details (FR-FI-01)
  const result = await listFines({ limit: 100 });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fines &amp; Payments Desk"
        description="Collect overdue penalties, generate payment receipts, and manage audited fine waivers."
        badge="Financial"
        badgeColor="amber"
        breadcrumbs={[{ label: "Circulation" }, { label: "Fines & Payments" }]}
      />

      <FinesClient
        initialFines={result.fines}
        initialTotalOutstanding={result.totalOutstandingAmount}
        canCollect={permissions.includes("FINE_COLLECT")}
        canWaive={permissions.includes("FINE_WAIVE")}
        csrfToken={staffContext.session.csrfToken}
      />
    </div>
  );
}
