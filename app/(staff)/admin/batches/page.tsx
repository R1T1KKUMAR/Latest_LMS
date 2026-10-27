import { desc, eq } from "drizzle-orm";
import { ForbiddenCard } from "@/components/auth/ForbiddenCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { requirePageAuth } from "@/lib/auth";
import { listImportBatches } from "@/services/batch-import-management";
import { BatchManagementClient } from "./BatchManagementClient";

export const metadata = {
  title: "Data Cleanup & CSV Batch Management — RBMI LMS",
  description: "Rollback mistakenly uploaded CSV files, remove test data, and manage records",
};

export default async function BatchManagementPage() {
  const auth = await requirePageAuth([
    "ADMIN_SETTINGS",
    "ADMIN_USERS",
    "PATRON_IMPORT",
    "CATALOG_IMPORT",
    "PATRON_MANAGE",
  ]);

  if (!auth.authorized) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ForbiddenCard
          message="Access to Data Cleanup & Batch Management requires administrative or import management privileges."
          requiredPermission="ADMIN_SETTINGS / ADMIN_USERS / PATRON_IMPORT / CATALOG_IMPORT / PATRON_MANAGE"
          userRole={auth.context?.user.roleName}
        />
      </div>
    );
  }

  const staffContext = auth.context;
  const permissions = staffContext.permissions;

  // Retrieve batch import history and all patrons
  const [batches, rawPatrons] = await Promise.all([
    listImportBatches(),
    db
      .select({
        id: schema.patrons.id,
        cardNo: schema.patrons.cardNo,
        firstName: schema.patrons.firstName,
        lastName: schema.patrons.lastName,
        patronType: schema.patrons.patronType,
        employeeId: schema.patrons.employeeId,
        email: schema.patrons.email,
        mobile: schema.patrons.mobile,
        status: schema.patrons.status,
        importBatchId: schema.patrons.importBatchId,
        categoryName: schema.patronCategories.name,
        departmentName: schema.departments.name,
        courseName: schema.courses.name,
        createdAt: schema.patrons.createdAt,
      })
      .from(schema.patrons)
      .innerJoin(schema.patronCategories, eq(schema.patrons.categoryId, schema.patronCategories.id))
      .leftJoin(schema.departments, eq(schema.patrons.departmentId, schema.departments.id))
      .leftJoin(schema.courses, eq(schema.patrons.courseId, schema.courses.id))
      .orderBy(desc(schema.patrons.createdAt)),
  ]);

  const patrons = rawPatrons.map((p) => ({
    id: p.id,
    cardNo: p.cardNo,
    fullName: [p.firstName, p.lastName].filter(Boolean).join(" "),
    patronType: p.patronType,
    employeeId: p.employeeId,
    email: p.email,
    mobile: p.mobile,
    status: p.status,
    importBatchId: p.importBatchId,
    categoryName: p.categoryName,
    departmentName: p.departmentName,
    courseName: p.courseName,
    createdAt: p.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data Cleanup & Batch Management"
        description="Roll back wrong or mistaken CSV file uploads, delete unnecessary test records, or remove particular student/faculty profiles."
        badge="Data Governance"
        badgeColor="purple"
        breadcrumbs={[
          { label: "Admin Portal", href: "/admin" },
          { label: "Data Cleanup & Batches" },
        ]}
      />

      <BatchManagementClient
        initialBatches={batches}
        initialPatrons={patrons}
        csrfToken={staffContext.session.csrfToken}
        canManageBatches={
          permissions.includes("ADMIN_SETTINGS") ||
          permissions.includes("ADMIN_USERS") ||
          permissions.includes("PATRON_IMPORT") ||
          permissions.includes("CATALOG_IMPORT")
        }
        canManagePatrons={
          permissions.includes("PATRON_MANAGE") || permissions.includes("ADMIN_USERS")
        }
      />
    </div>
  );
}
