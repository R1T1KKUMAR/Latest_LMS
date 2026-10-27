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
import { CirculationDeskClient } from "../CirculationDeskClient";

export const metadata = {
  title: "Book Checkout (Issue) — RBMI LMS",
  description: "Checkout books to registered patrons with 9-step policy validation",
};

export default async function IssuePage() {
  const auth = await requirePageAuth("CIRC_ISSUE");

  if (!auth.authorized) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ForbiddenCard
          message="Access to the Book Checkout Terminal requires the CIRC_ISSUE permission."
          requiredPermission="CIRC_ISSUE"
          userRole={auth.context?.user.roleName}
        />
      </div>
    );
  }

  const staffContext = auth.context;

  // Retrieve recent active checkouts and master data in parallel with caching
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
        title="Book Checkout Terminal"
        description="Select patron and available book from cascading category dropdowns to issue. Quotas and borrowing rules apply automatically."
        badge="Issue Desk"
        badgeColor="blue"
        breadcrumbs={[
          { label: "Circulation", href: "/circulation" },
          { label: "Book Checkout (Issue)" },
        ]}
      />

      <CirculationDeskClient
        initialCheckouts={checkouts}
        csrfToken={staffContext.session.csrfToken}
        canIssue={true}
        canReturn={false}
        canRenew={false}
        canMarkLost={false}
        defaultTab="issue"
        standalone={true}
        institutions={institutions}
        departments={departments}
        courses={courses}
        patronCategories={patronCategories}
      />
    </div>
  );
}
