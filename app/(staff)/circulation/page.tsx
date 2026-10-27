import { ForbiddenCard } from "@/components/auth/ForbiddenCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { requirePageAuth } from "@/lib/auth";
import {
  getCachedCourses,
  getCachedDepartments,
  getCachedInstitutions,
  getCachedPatronCategories,
  getCachedRecentLoans,
} from "@/lib/master-data-cache";
import { CirculationDeskClient } from "./CirculationDeskClient";

export const metadata = {
  title: "Circulation Desk — RBMI LMS",
  description: "Issue books, process returns, renew books, and monitor active borrowings",
};

export default async function CirculationPage() {
  const auth = await requirePageAuth(["CIRC_ISSUE", "CIRC_RETURN", "CIRC_RENEW", "CIRC_LOST"]);

  if (!auth.authorized) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ForbiddenCard
          message="Access to the Circulation Desk requires circulation permissions (CIRC_ISSUE, CIRC_RETURN, CIRC_RENEW, or CIRC_LOST)."
          requiredPermission="CIRC_ISSUE / CIRC_RETURN / CIRC_RENEW / CIRC_LOST"
          userRole={auth.context?.user.roleName}
        />
      </div>
    );
  }

  const staffContext = auth.context;
  const permissions = staffContext.permissions;

  // Retrieve active checkouts and master data in parallel with caching
  const [checkouts, institutions, courses, departments, patronCategories] = await Promise.all([
    getCachedRecentLoans(50),
    getCachedInstitutions(),
    getCachedCourses(),
    getCachedDepartments(),
    getCachedPatronCategories(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Circulation Desk"
        description="Barcode-driven issue, return, and renewal terminal with live patron eligibility verification."
        badge="Terminal"
        badgeColor="blue"
        breadcrumbs={[{ label: "Circulation" }, { label: "Issue & Return" }]}
      />

      <CirculationDeskClient
        initialCheckouts={checkouts}
        csrfToken={staffContext.session.csrfToken}
        canIssue={permissions.includes("CIRC_ISSUE")}
        canReturn={permissions.includes("CIRC_RETURN")}
        canRenew={permissions.includes("CIRC_RENEW")}
        canMarkLost={permissions.includes("CIRC_LOST")}
        institutions={institutions}
        departments={departments}
        courses={courses}
        patronCategories={patronCategories}
      />
    </div>
  );
}
