import { desc, eq } from "drizzle-orm";
import { ForbiddenCard } from "@/components/auth/ForbiddenCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { requirePageAuth } from "@/lib/auth";
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

export default async function PatronsPage() {
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

  // Retrieve patrons and master data
  const [rawPatrons, categories, departments, courses] = await Promise.all([
    db
      .select({
        id: schema.patrons.id,
        cardNo: schema.patrons.cardNo,
        firstName: schema.patrons.firstName,
        lastName: schema.patrons.lastName,
        patronType: schema.patrons.patronType,
        categoryId: schema.patrons.categoryId,
        categoryName: schema.patronCategories.name,
        departmentId: schema.patrons.departmentId,
        departmentName: schema.departments.name,
        email: schema.patrons.email,
        mobile: schema.patrons.mobile,
        rollNo: schema.patrons.rollNo,
        employeeId: schema.patrons.employeeId,
        cardExpiry: schema.patrons.cardExpiry,
        status: schema.patrons.status,
      })
      .from(schema.patrons)
      .innerJoin(schema.patronCategories, eq(schema.patrons.categoryId, schema.patronCategories.id))
      .leftJoin(schema.departments, eq(schema.patrons.departmentId, schema.departments.id))
      .orderBy(desc(schema.patrons.createdAt))
      .limit(100),
    db
      .select({
        id: schema.patronCategories.id,
        name: schema.patronCategories.name,
        code: schema.patronCategories.code,
        patronType: schema.patronCategories.patronType,
      })
      .from(schema.patronCategories)
      .where(eq(schema.patronCategories.isActive, true)),
    db
      .select({
        id: schema.departments.id,
        name: schema.departments.name,
        code: schema.departments.code,
      })
      .from(schema.departments)
      .where(eq(schema.departments.isActive, true)),
    db
      .select({
        id: schema.courses.id,
        name: schema.courses.name,
        code: schema.courses.code,
      })
      .from(schema.courses)
      .where(eq(schema.courses.isActive, true)),
  ]);

  const patrons: PatronListItem[] = rawPatrons.map((p) => ({
    id: p.id,
    cardNo: p.cardNo,
    fullName: [p.firstName, p.lastName].filter(Boolean).join(" "),
    patronType: p.patronType,
    categoryName: p.categoryName,
    departmentName: p.departmentName,
    email: p.email,
    mobile: p.mobile,
    rollNo: p.rollNo,
    employeeId: p.employeeId,
    cardExpiry: String(p.cardExpiry),
    status: p.status,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Patron Directory"
        description="Search, inspect, and manage student, faculty, and research scholar library memberships."
        badge="Patrons"
        badgeColor="emerald"
        breadcrumbs={[{ label: "Patrons" }, { label: "Directory" }]}
      />

      <PatronsClient
        initialPatrons={patrons}
        categories={categories as CategoryOption[]}
        departments={departments as MasterOption[]}
        courses={courses as MasterOption[]}
        csrfToken={staffContext.session.csrfToken}
        canManage={permissions.includes("PATRON_MANAGE")}
      />
    </div>
  );
}
