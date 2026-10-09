import { desc, eq } from "drizzle-orm";
import { PublicFooter, PublicHeader } from "@/components/layout/PublicHeader";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { getCurrentSession } from "@/lib/auth";
import { type HoldListItem, listHolds, processExpiredHolds } from "@/services/holds";
import {
  AccountClient,
  type PatronFine,
  type PatronHold,
  type PatronLoan,
  type PatronProfile,
} from "./AccountClient";

export const metadata = {
  title: "My Account — RBMI Central Library",
  description: "View active book loans, title holds, and fine statements",
};

export default async function AccountPage() {
  const auth = await getCurrentSession("PATRON");

  let patron: PatronProfile | null = null;
  let loans: PatronLoan[] = [];
  let holds: PatronHold[] = [];
  let fines: PatronFine[] = [];
  let csrfToken = "";

  if (auth && "patron" in auth) {
    const p = auth.patron;
    csrfToken = auth.session.csrfToken;
    patron = {
      id: p.id,
      cardNo: p.cardNo,
      fullName: [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" "),
      patronType: p.patronType,
      email: p.email,
      mobile: p.mobile,
      rollNo: p.rollNo,
      employeeId: p.employeeId,
      cardExpiry: String(p.cardExpiry),
      status: p.status,
    };

    // Query active loans
    const rawLoans = await db
      .select({
        id: schema.loans.id,
        issueDate: schema.loans.issueDate,
        dueDate: schema.loans.dueDate,
        status: schema.loans.status,
        renewalCount: schema.loans.renewalCount,
        title: schema.bibRecords.title,
        accessionNo: schema.items.accessionNo,
      })
      .from(schema.loans)
      .innerJoin(schema.items, eq(schema.loans.itemId, schema.items.id))
      .innerJoin(schema.bibRecords, eq(schema.items.bibId, schema.bibRecords.id))
      .where(eq(schema.loans.patronId, p.id))
      .orderBy(desc(schema.loans.issueDate))
      .limit(20);

    loans = rawLoans.map((l) => ({
      id: l.id,
      title: l.title,
      accessionNo: l.accessionNo,
      issueDate: String(l.issueDate),
      dueDate: String(l.dueDate),
      status: l.status,
      renewalCount: l.renewalCount,
    }));

    // Process expired holds and query patron holds (FR-HO-02, FR-HO-04)
    try {
      await processExpiredHolds();
    } catch {
      // Non-fatal
    }

    const rawHolds = await listHolds({ patronId: p.id, limit: 50 });

    holds = rawHolds.map((h: HoldListItem) => ({
      id: h.id,
      title: h.title,
      requestDate: String(h.requestDate ?? ""),
      queuePosition: h.queuePosition ?? 1,
      status: h.status,
      expiryDate: h.pickupExpiryDate,
    }));

    // Query fines
    const rawFines = await db
      .select({
        id: schema.fines.id,
        reason: schema.fines.reason,
        amount: schema.fines.amount,
        status: schema.fines.status,
        createdAt: schema.fines.createdAt,
      })
      .from(schema.fines)
      .where(eq(schema.fines.patronId, p.id))
      .orderBy(desc(schema.fines.createdAt))
      .limit(20);

    fines = rawFines.map((f) => ({
      id: f.id,
      reason: f.reason,
      amount: f.amount,
      status: f.status,
      createdAt: String(f.createdAt),
    }));
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <PublicHeader />
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        <AccountClient
          patron={patron}
          loans={loans}
          holds={holds}
          fines={fines}
          csrfToken={csrfToken}
        />
      </main>
      <PublicFooter />
    </div>
  );
}
