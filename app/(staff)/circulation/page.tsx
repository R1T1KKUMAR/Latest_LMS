import { desc, eq } from "drizzle-orm";
import { ForbiddenCard } from "@/components/auth/ForbiddenCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { requirePageAuth } from "@/lib/auth";
import { CirculationDeskClient } from "./CirculationDeskClient";

export const metadata = {
  title: "Circulation Desk — RBMI LMS",
  description: "Issue books, process returns, renew loans, and monitor active borrowings",
};

export default async function CirculationPage() {
  const auth = await requirePageAuth(["CIRC_ISSUE", "CIRC_RETURN", "CIRC_RENEW", "CIRC_LOST"]);

  if (!auth.authorized) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ForbiddenCard
          message="Access to the Circulation Desk requires circulation permissions (CIRC_ISSUE, CIRC_RETURN, CIRC_RENEW, or CIRC_LOST)."
          requiredPermission="CIRC_ISSUE / CIRC_RETURN / CIRC_RENEW / CIRC_LOST"
          userRole={auth.context?.user.roleName}
        />
      </div>
    );
  }

  const staffContext = auth.context;
  const permissions = staffContext.permissions;

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
        title="Circulation Desk"
        description="Barcode-driven issue, return, and renewal terminal with live patron eligibility verification."
        badge="Terminal"
        badgeColor="blue"
        breadcrumbs={[{ label: "Circulation" }, { label: "Issue & Return" }]}
      />

      <CirculationDeskClient
        initialCheckouts={checkouts}
        csrfToken={staffContext.session.csrfToken}
        canIssue={permissions.includes("CIRC_ISSUE")}
        canReturn={permissions.includes("CIRC_RETURN")}
        canRenew={permissions.includes("CIRC_RENEW")}
        canMarkLost={permissions.includes("CIRC_LOST")}
      />
    </div>
  );
}
