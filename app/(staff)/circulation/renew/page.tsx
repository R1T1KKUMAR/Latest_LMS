import { desc, eq } from "drizzle-orm";
import { ForbiddenCard } from "@/components/auth/ForbiddenCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { requirePageAuth } from "@/lib/auth";
import { CirculationDeskClient } from "../CirculationDeskClient";

export const metadata = {
  title: "Loan Renewal Terminal — RBMI LMS",
  description: "Renew active book loans with policy compliance and renewal limit checks",
};

export default async function RenewPage() {
  const auth = await requirePageAuth("CIRC_RENEW");

  if (!auth.authorized) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ForbiddenCard
          message="Access to the Loan Renewal Terminal requires the CIRC_RENEW permission."
          requiredPermission="CIRC_RENEW"
          userRole={auth.context?.user.roleName}
        />
      </div>
    );
  }

  const staffContext = auth.context;

  // Retrieve active loans
  const rawLoans = await db
    .select({
      id: schema.loans.id,
      issueDate: schema.loans.issueDate,
      dueDate: schema.loans.dueDate,
      status: schema.loans.status,
      firstName: schema.patrons.firstName,
      lastName: schema.patrons.lastName,
      patronCard: schema.patrons.cardNo,
      title: schema.bibRecords.title,
      accessionNo: schema.items.accessionNo,
    })
    .from(schema.loans)
    .innerJoin(schema.patrons, eq(schema.loans.patronId, schema.patrons.id))
    .innerJoin(schema.items, eq(schema.loans.itemId, schema.items.id))
    .innerJoin(schema.bibRecords, eq(schema.items.bibId, schema.bibRecords.id))
    .where(eq(schema.loans.status, "ISSUED"))
    .orderBy(desc(schema.loans.issueDate))
    .limit(50);

  const checkouts = rawLoans.map((l) => ({
    id: l.id,
    issueDate: String(l.issueDate),
    dueDate: String(l.dueDate),
    status: l.status,
    patronName: [l.firstName, l.lastName].filter(Boolean).join(" "),
    patronCard: l.patronCard,
    title: l.title,
    accessionNo: l.accessionNo,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Loan Renewal Terminal"
        description="Renew active borrowed materials. Enforces maximum renewal counts, overdue blocks, and reservation holds."
        badge="Renewal Desk"
        badgeColor="purple"
        breadcrumbs={[{ label: "Circulation", href: "/circulation" }, { label: "Loan Renewal" }]}
      />

      <CirculationDeskClient
        initialCheckouts={checkouts}
        csrfToken={staffContext.session.csrfToken}
        canIssue={false}
        canReturn={false}
        canRenew={true}
        canMarkLost={false}
        defaultTab="renew"
        standalone={true}
      />
    </div>
  );
}
