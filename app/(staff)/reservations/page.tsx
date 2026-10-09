import { ForbiddenCard } from "@/components/auth/ForbiddenCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { requirePageAuth } from "@/lib/auth";
import { type HoldListItem, listHolds, processExpiredHolds } from "@/services/holds";
import { ReservationsClient } from "./ReservationsClient";

export const metadata = {
  title: "Reservations Queue — RBMI LMS",
  description: "Manage book reservations, queue priority, and pickup notifications",
};

export default async function ReservationsPage() {
  const auth = await requirePageAuth("HOLD_MANAGE");

  if (!auth.authorized || !auth.context) {
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

  // Automatic expiration housekeeping on page access (FR-HO-04, FR-DB-03)
  try {
    await processExpiredHolds();
  } catch {
    // Non-fatal if concurrent or read-only edge case
  }

  // Retrieve holds with dynamic queue positions (FR-HO-02)
  const rawHolds = await listHolds({ limit: 100 });

  const reservations = rawHolds.map((h: HoldListItem) => ({
    id: h.id,
    queuePosition: h.queuePosition ?? 1,
    status: h.status,
    reservationDate: h.requestDate,
    pickupExpiryDate: h.pickupExpiryDate,
    patronName: h.patronName,
    patronCard: h.patronCardNo,
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

      <ReservationsClient
        initialReservations={reservations}
        csrfToken={auth.context.session.csrfToken}
      />
    </div>
  );
}
