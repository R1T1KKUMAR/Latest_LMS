import { ForbiddenCard } from "@/components/auth/ForbiddenCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { requirePageAuth } from "@/lib/auth";
import {
  getCachedDepartments,
  getCachedInstitutions,
  getCachedItemTypes,
  getCachedLibraries,
} from "@/lib/master-data-cache";
import { listIndividualCopies } from "@/services/catalogue";
import { CatalogueClient } from "./CatalogueClient";

export const metadata = {
  title: "Bibliographic Catalogue — RBMI LMS",
  description: "Search, catalog, and manage titles, editions, and accessioned copies",
};

interface CataloguePageProps {
  searchParams?: Promise<{ libraryId?: string; addBook?: string }>;
}

export default async function CataloguePage({ searchParams }: CataloguePageProps) {
  const auth = await requirePageAuth("CATALOG_VIEW");

  if (!auth.authorized) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ForbiddenCard
          message="Access to the Library Catalogue requires the CATALOG_VIEW permission."
          requiredPermission="CATALOG_VIEW"
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

  // Retrieve catalogue individual book copies (all physical volumes scoped to library) with pagination
  const [catalogueData, institutions, itemTypes, departments, libraries] = await Promise.all([
    listIndividualCopies({ limit: 50, page: 1, libraryId: targetLibraryId }),
    getCachedInstitutions(),
    getCachedItemTypes(),
    getCachedDepartments(),
    getCachedLibraries(),
  ]);

  const currentLibrary = targetLibraryId ? libraries.find((l) => l.id === targetLibraryId) : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title={currentLibrary ? `${currentLibrary.name} — Catalogue` : "Bibliographic Catalogue"}
        description={
          currentLibrary
            ? `Search, accession physical copies, and view real-time shelf availability for ${currentLibrary.name}.`
            : "Search, manage titles, accession physical copies, and view real-time shelf availability."
        }
        badge={currentLibrary?.code ?? "Catalog"}
        badgeColor="indigo"
        breadcrumbs={[{ label: "Catalogue" }, { label: currentLibrary?.name ?? "Bibliographic Records" }]}
      />

      <CatalogueClient
        initialTitles={catalogueData.records}
        initialPagination={catalogueData.pagination}
        institutions={institutions}
        itemTypes={itemTypes}
        departments={departments}
        libraries={libraries}
        csrfToken={staffContext.session.csrfToken}
        canManage={permissions.includes("CATALOG_MANAGE")}
        userLibraryId={userLibraryId}
        selectedLibraryId={targetLibraryId}
        isSuperAdmin={isSuperAdmin}
        autoOpenAddBook={sp.addBook === "true"}
      />
    </div>
  );
}
