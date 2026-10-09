import { eq, sql } from "drizzle-orm";
import { ForbiddenCard } from "@/components/auth/ForbiddenCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { requirePageAuth } from "@/lib/auth";
import { CatalogueClient } from "./CatalogueClient";

export const metadata = {
  title: "Bibliographic Catalogue — RBMI LMS",
  description: "Search, catalog, and manage titles, editions, and accessioned copies",
};

export default async function CataloguePage() {
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

  // Retrieve catalogue titles with copy counts and item type info
  const [rawTitles, itemTypes, departments, libraries] = await Promise.all([
    db
      .select({
        id: schema.bibRecords.id,
        title: schema.bibRecords.title,
        subtitle: schema.bibRecords.subtitle,
        authors: schema.bibRecords.authors,
        isbn: schema.bibRecords.isbn,
        edition: schema.bibRecords.edition,
        pubYear: schema.bibRecords.pubYear,
        callNumber: schema.bibRecords.callNumber,
        itemTypeId: schema.bibRecords.itemTypeId,
        itemTypeName: schema.itemTypes.name,
        totalCopies: sql<number>`count(${schema.items.id})::int`,
        availableCopies: sql<number>`count(case when ${schema.items.status} = 'AVAILABLE' then 1 end)::int`,
      })
      .from(schema.bibRecords)
      .innerJoin(schema.itemTypes, eq(schema.bibRecords.itemTypeId, schema.itemTypes.id))
      .leftJoin(schema.items, eq(schema.bibRecords.id, schema.items.bibId))
      .groupBy(schema.bibRecords.id, schema.itemTypes.name)
      .orderBy(schema.bibRecords.title)
      .limit(100),
    db
      .select({ id: schema.itemTypes.id, name: schema.itemTypes.name, code: schema.itemTypes.code })
      .from(schema.itemTypes)
      .where(eq(schema.itemTypes.isActive, true)),
    db
      .select({
        id: schema.departments.id,
        name: schema.departments.name,
        code: schema.departments.code,
      })
      .from(schema.departments)
      .where(eq(schema.departments.isActive, true)),
    db
      .select({ id: schema.libraries.id, name: schema.libraries.name, code: schema.libraries.code })
      .from(schema.libraries)
      .where(eq(schema.libraries.isActive, true)),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bibliographic Catalogue"
        description="Search, manage titles, accession physical copies, and view real-time shelf availability."
        badge="Catalog"
        badgeColor="indigo"
        breadcrumbs={[{ label: "Catalogue" }, { label: "Bibliographic Records" }]}
      />

      <CatalogueClient
        initialTitles={rawTitles}
        itemTypes={itemTypes}
        departments={departments}
        libraries={libraries}
        csrfToken={staffContext.session.csrfToken}
        canManage={permissions.includes("CATALOG_MANAGE")}
      />
    </div>
  );
}
