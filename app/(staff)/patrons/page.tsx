import { ForbiddenCard } from "@/components/auth/ForbiddenCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { requirePageAuth } from "@/lib/auth";
import {
  getCachedCourses,
  getCachedDepartments,
  getCachedInstitutions,
  getCachedLibraries,
  getCachedPatronCategories,
  getCachedPatronList,
} from "@/lib/master-data-cache";
import {
  type CategoryOption,
  type MasterOption,
  type PatronListItem,
  PatronsClient,
} from "./PatronsClient";

export const metadata = {
  title: "Patron Roster — RBMI LMS",
  description: "Directory of registered student and faculty library members",
};

interface PatronsPageProps {
  searchParams?: Promise<{ libraryId?: string; addPatron?: string }>;
}

export default async function PatronsPage({ searchParams }: PatronsPageProps) {
  const auth = await requirePageAuth("PATRON_VIEW");

  if (!auth.authorized) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ForbiddenCard
          message="Access to the Patron Directory requires the PATRON_VIEW permission."
          requiredPermission="PATRON_VIEW"
          userRole={auth.context?.user.roleName}
        />
      </div>
    );
  }

  const staffContext = auth.context;
  const permissions = staffContext.permissions;
  const isSuperAdmin = staffContext.user.roleCode === "SUPER_ADMIN";
  const userLibraryId = staffContext.user.libraryId;

  const sp = (await searchParams) ?? {};
  let targetLibraryId: number | undefined;

  if (isSuperAdmin) {
    if (sp.libraryId && sp.libraryId !== "all") {
      const parsed = Number(sp.libraryId);
      if (!Number.isNaN(parsed) && parsed > 0) {
        targetLibraryId = parsed;
      }
    }
  } else {
    targetLibraryId = userLibraryId;
  }

  // Retrieve cached patrons (filtered by library) and master data in parallel
  const [patrons, categories, departments, courses, institutions, libraries] = await Promise.all([
    getCachedPatronList(targetLibraryId),
    getCachedPatronCategories(),
    getCachedDepartments(),
    getCachedCourses(),
    getCachedInstitutions(),
    getCachedLibraries(),
  ]);

  const currentLibrary = targetLibraryId ? libraries.find((l) => l.id === targetLibraryId) : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title={currentLibrary ? `${currentLibrary.name} — Patron Directory` : "Patron Directory"}
        description={
          currentLibrary
            ? `Search, inspect, and manage student and faculty library memberships for ${currentLibrary.name}.`
            : "Search, inspect, and manage student, faculty, and research scholar library memberships."
        }
        badge={currentLibrary?.code ?? "Patrons"}
        badgeColor="emerald"
        breadcrumbs={[{ label: "Patrons" }, { label: currentLibrary?.name ?? "Directory" }]}
      />

      <PatronsClient
        initialPatrons={patrons}
        categories={categories as CategoryOption[]}
        institutions={institutions as MasterOption[]}
        departments={departments as MasterOption[]}
        courses={courses as MasterOption[]}
        libraries={libraries as MasterOption[]}
        userLibraryId={userLibraryId}
        selectedLibraryId={targetLibraryId}
        isSuperAdmin={isSuperAdmin}
        autoOpenAddPatron={sp.addPatron === "true"}
        csrfToken={staffContext.session.csrfToken}
        canManage={permissions.includes("PATRON_MANAGE")}
      />
    </div>
  );
}
