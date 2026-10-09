import { ForbiddenCard } from "@/components/auth/ForbiddenCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { requirePageAuth } from "@/lib/auth";
import { ImportClient } from "./ImportClient";

export const metadata = {
  title: "Bulk CSV Data Import — RBMI LMS",
  description: "Batch import student rosters, faculty records, and bibliographic titles",
};

export default async function ImportPage() {
  const auth = await requirePageAuth(["PATRON_IMPORT", "CATALOG_IMPORT"]);

  if (!auth.authorized) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ForbiddenCard
          message="Access to Data Import requires PATRON_IMPORT or CATALOG_IMPORT permission."
          requiredPermission="PATRON_IMPORT / CATALOG_IMPORT"
          userRole={auth.context?.user.roleName}
        />
      </div>
    );
  }

  const staffContext = auth.context;
  const permissions = staffContext.permissions;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bulk CSV Data Import"
        description="Ingest tabular rosters for student enrollments, faculty appointments, and library collections."
        badge="Batch Operations"
        badgeColor="indigo"
        breadcrumbs={[{ label: "Catalog & Patrons" }, { label: "Bulk Import" }]}
      />

      <ImportClient
        canImportPatrons={permissions.includes("PATRON_IMPORT")}
        canImportCatalog={permissions.includes("CATALOG_IMPORT")}
        csrfToken={staffContext.session.csrfToken}
      />
    </div>
  );
}
