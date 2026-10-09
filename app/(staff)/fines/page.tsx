import { desc, eq } from "drizzle-orm";
import { ForbiddenCard } from "@/components/auth/ForbiddenCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { requirePageAuth } from "@/lib/auth";
import { FinesClient } from "./FinesClient";

export const metadata = {
  title: "Fines & Payments Desk — RBMI LMS",
  description: "Collect overdue fines, process authorized waivers, and maintain receipt records",
};

export default async function FinesPage() {
  const auth = await requirePageAuth(["FINE_COLLECT", "FINE_WAIVE"]);

  if (!auth.authorized) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ForbiddenCard
          message="Access to the Fines Desk requires fine collection or waiver permissions (FINE_COLLECT or FINE_WAIVE)."
          requiredPermission="FINE_COLLECT / FINE_WAIVE"
          userRole={auth.context?.user.roleName}
        />
      </div>
    );
  }

  const staffContext = auth.context;
  const permissions = staffContext.permissions;

  // Retrieve fines
  const rawFines = await db
    .select({
      id: schema.fines.id,
      amount: schema.fines.amount,
      reason: schema.fines.reason,
      status: schema.fines.status,
      createdAt: schema.fines.createdAt,
      firstName: schema.patrons.firstName,
      lastName: schema.patrons.lastName,
      cardNo: schema.patrons.cardNo,
    })
    .from(schema.fines)
    .innerJoin(schema.patrons, eq(schema.fines.patronId, schema.patrons.id))
    .orderBy(desc(schema.fines.createdAt))
    .limit(100);

  const fines = rawFines.map((f) => ({
    id: f.id,
    amount: f.amount,
    daysOverdue: 1,
    reason: f.reason,
    status: f.status,
    createdAt: f.createdAt,
    patronName: [f.firstName, f.lastName].filter(Boolean).join(" "),
    patronCard: f.cardNo,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fines &amp; Payments Desk"
        description="Collect overdue penalties, generate payment receipts, and manage audited fine waivers."
        badge="Financial"
        badgeColor="amber"
        breadcrumbs={[{ label: "Circulation" }, { label: "Fines & Payments" }]}
      />

      <FinesClient
        initialFines={fines}
        canCollect={permissions.includes("FINE_COLLECT")}
        canWaive={permissions.includes("FINE_WAIVE")}
        csrfToken={staffContext.session.csrfToken}
      />
    </div>
  );
}
