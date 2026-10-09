import { desc, eq } from "drizzle-orm";
import { ForbiddenCard } from "@/components/auth/ForbiddenCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { requirePageAuth } from "@/lib/auth";
import { CirculationDeskClient } from "../CirculationDeskClient";

export const metadata = {
  title: "Book Checkout (Issue) — RBMI LMS",
  description: "Checkout books to registered patrons with 9-step policy validation",
};

export default async function IssuePage() {
  const auth = await requirePageAuth("CIRC_ISSUE");

  if (!auth.authorized) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ForbiddenCard
          message="Access to the Book Checkout Terminal requires the CIRC_ISSUE permission."
          requiredPermission="CIRC_ISSUE"
          userRole={auth.context?.user.roleName}
        />
      </div>
    );
  }

  const staffContext = auth.context;

  // Retrieve recent active loans
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
        title="Book Checkout Terminal"
        description="Scan patron card barcode, verify borrowing eligibility and active quotas, then scan item barcode to issue."
        badge="Issue Desk"
        badgeColor="blue"
        breadcrumbs={[
          { label: "Circulation", href: "/circulation" },
          { label: "Book Checkout (Issue)" },
        ]}
      />

      <CirculationDeskClient
        initialCheckouts={checkouts}
        csrfToken={staffContext.session.csrfToken}
        canIssue={true}
        canReturn={false}
        canRenew={false}
        canMarkLost={false}
        defaultTab="issue"
        standalone={true}
      />
    </div>
  );
}
