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
  title: "Book Check-In (Return) — RBMI LMS",
  description:
    "Check in returned library materials, assess overdue fines, and fulfill hold requests",
};

export default async function ReturnPage() {
  const auth = await requirePageAuth("CIRC_RETURN");

  if (!auth.authorized) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ForbiddenCard
          message="Access to the Book Return Terminal requires the CIRC_RETURN permission."
          requiredPermission="CIRC_RETURN"
          userRole={auth.context?.user.roleName}
        />
      </div>
    );
  }

  const staffContext = auth.context;

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
        title="Book Return (Check-In) Terminal"
        description="Select borrower and book from cascading category dropdowns or use 1-click return on borrowed books. Automatically assesses late fines and flags reservations."
        badge="Return Desk"
        badgeColor="emerald"
        breadcrumbs={[
          { label: "Circulation", href: "/circulation" },
          { label: "Book Return (Check-In)" },
        ]}
      />

      <CirculationDeskClient
        initialCheckouts={checkouts}
        csrfToken={staffContext.session.csrfToken}
        canIssue={false}
        canReturn={true}
        canRenew={false}
        canMarkLost={false}
        defaultTab="return"
        standalone={true}
        institutions={institutions}
        departments={departments}
        courses={courses}
        patronCategories={patronCategories}
      />
    </div>
  );
}
