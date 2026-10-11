import { eq } from "drizzle-orm";
import { ForbiddenCard } from "@/components/auth/ForbiddenCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { db } from "@/db";
import * as schema from "@/db/schema";
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

  // Fetch reference data for dropdown defaults
  const libraries = await db
    .select({
      id: schema.libraries.id,
      code: schema.libraries.code,
      name: schema.libraries.name,
    })
    .from(schema.libraries)
    .where(eq(schema.libraries.isActive, true));

  const categories = await db
    .select({
      id: schema.patronCategories.id,
      code: schema.patronCategories.code,
      name: schema.patronCategories.name,
      patronType: schema.patronCategories.patronType,
    })
    .from(schema.patronCategories)
    .where(eq(schema.patronCategories.isActive, true));

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
        libraries={libraries}
        categories={categories}
      />
    </div>
  );
}
