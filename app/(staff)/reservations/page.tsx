import { asc, eq } from "drizzle-orm";
import { ForbiddenCard } from "@/components/auth/ForbiddenCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { requirePageAuth } from "@/lib/auth";
import { ReservationsClient } from "./ReservationsClient";

export const metadata = {
  title: "Reservations Queue — RBMI LMS",
  description: "Manage book reservations, queue priority, and pickup notifications",
};

export default async function ReservationsPage() {
  const auth = await requirePageAuth("HOLD_MANAGE");

  if (!auth.authorized) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ForbiddenCard
          message="Access to the Reservations Queue requires the HOLD_MANAGE permission."
          requiredPermission="HOLD_MANAGE"
          userRole={auth.context?.user.roleName}
        />
      </div>
    );
  }

  // Retrieve holds
  const rawHolds = await db
    .select({
      id: schema.holds.id,
      status: schema.holds.status,
      requestDate: schema.holds.requestDate,
      expiryDate: schema.holds.expiryDate,
      firstName: schema.patrons.firstName,
      lastName: schema.patrons.lastName,
      cardNo: schema.patrons.cardNo,
      title: schema.bibRecords.title,
    })
    .from(schema.holds)
    .innerJoin(schema.patrons, eq(schema.holds.patronId, schema.patrons.id))
    .innerJoin(schema.bibRecords, eq(schema.holds.bibId, schema.bibRecords.id))
    .orderBy(asc(schema.holds.requestDate))
    .limit(100);

  const reservations = rawHolds.map((h, index) => ({
    id: h.id,
    queuePosition: index + 1,
    status: h.status,
    reservationDate: h.requestDate,
    pickupExpiryDate: h.expiryDate ? String(h.expiryDate) : null,
    patronName: [h.firstName, h.lastName].filter(Boolean).join(" "),
    patronCard: h.cardNo,
    title: h.title,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reservations &amp; Holds Queue"
        description="Monitor title reservation queues, prioritized hold orders, and pickup windows."
        badge="Queue Management"
        badgeColor="blue"
        breadcrumbs={[{ label: "Circulation" }, { label: "Reservations" }]}
      />

      <ReservationsClient initialReservations={reservations} />
    </div>
  );
}
