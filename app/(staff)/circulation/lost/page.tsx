import { desc, eq } from "drizzle-orm";
import { ForbiddenCard } from "@/components/auth/ForbiddenCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { requirePageAuth } from "@/lib/auth";
import { CirculationDeskClient } from "../CirculationDeskClient";

export const metadata = {
  title: "Declare Lost Material — RBMI LMS",
  description: "Declare loaned materials lost and assess replacement fee plus processing charge",
};

export default async function LostPage() {
  const auth = await requirePageAuth("CIRC_LOST");

  if (!auth.authorized) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ForbiddenCard
          message="Access to the Declare Lost Terminal requires the CIRC_LOST permission."
          requiredPermission="CIRC_LOST"
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
        title="Declare Material Lost Terminal"
        description="Process lost library books. Calculates book replacement cost, non-refundable processing fee, and overdue fines to date per BR-07."
        badge="Lost Desk"
        badgeColor="amber"
        breadcrumbs={[{ label: "Circulation", href: "/circulation" }, { label: "Declare Lost" }]}
      />

      <CirculationDeskClient
        initialCheckouts={checkouts}
        csrfToken={staffContext.session.csrfToken}
        canIssue={false}
        canReturn={false}
        canRenew={false}
        canMarkLost={true}
        defaultTab="lost"
        standalone={true}
      />
    </div>
  );
}
