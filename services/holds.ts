/**
 * Reservations & Holds Service (Phase 9).
 * Orchestrates title holds, FIFO WAITING queues, auto-assignment on return,
 * pickup deadlines, expiration housekeeping, and next-patron promotion (FR-HO-01 to FR-HO-05, UC-07).
 */

import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import * as schema from "@/db/schema";
import {
  addCalendarDays,
  calculateHoldPickupExpiry,
  evaluateHoldPlacementEligibility,
  formatDateIso,
  isBeforeDay,
  type SystemSettingsConfig,
  selectRule,
} from "@/rules";
import { recordAuditLog } from "./audit";
import { getSystemSettingsConfig } from "./circulation";

// biome-ignore lint/suspicious/noExplicitAny: generic DB instance support
type DbInstance = any;

export interface Actor {
  id: number;
  fullName: string;
  actorType: "STAFF" | "PATRON";
  ipAddress?: string;
}

export interface PlaceHoldParams {
  patronId: number;
  bibId: number;
  isOpac?: boolean;
  referenceDate?: string | Date;
}

/**
 * Places a reservation hold on a bibliographic title (FR-HO-01, UC-07).
 * Enforces all 7 eligibility checks and database constraint uq_active_hold_per_patron_title (DR-01).
 */
export async function placeHold(params: PlaceHoldParams, actor: Actor, db: DbInstance = defaultDb) {
  const today = params.referenceDate ? new Date(params.referenceDate) : new Date();

  return await db.transaction(async (tx: DbInstance) => {
    // 1. Fetch Patron
    const [patron] = await tx
      .select({
        id: schema.patrons.id,
        cardNo: schema.patrons.cardNo,
        status: schema.patrons.status,
        cardExpiry: schema.patrons.cardExpiry,
        categoryId: schema.patrons.categoryId,
        firstName: schema.patrons.firstName,
        lastName: schema.patrons.lastName,
      })
      .from(schema.patrons)
      .where(eq(schema.patrons.id, params.patronId))
      .limit(1);

    if (!patron) {
      throw new Error(`Patron with ID ${params.patronId} not found`);
    }

    // 2. Fetch Bibliographic Record
    const [bib] = await tx
      .select({
        id: schema.bibRecords.id,
        title: schema.bibRecords.title,
        itemTypeId: schema.bibRecords.itemTypeId,
        isReference: schema.itemTypes.isReference,
      })
      .from(schema.bibRecords)
      .innerJoin(schema.itemTypes, eq(schema.bibRecords.itemTypeId, schema.itemTypes.id))
      .where(eq(schema.bibRecords.id, params.bibId))
      .limit(1);

    if (!bib) {
      throw new Error(`Bibliographic title with ID ${params.bibId} not found`);
    }

    // 3. Count Available Physical Copies on Shelf (T-16)
    const [copiesRes] = await tx
      .select({
        availableCount: sql<number>`count(case when ${schema.items.status} = 'AVAILABLE' then 1 end)::int`,
        totalCount: sql<number>`count(*)::int`,
      })
      .from(schema.items)
      .where(eq(schema.items.bibId, bib.id));

    const availableCopiesCount = copiesRes?.availableCount ?? 0;
    const totalCopiesCount = copiesRes?.totalCount ?? 0;

    if (totalCopiesCount === 0) {
      throw new Error("This title has no catalogued physical copies to reserve");
    }

    // 4. Check If Patron Already Borrows This Title
    const [activeLoan] = await tx
      .select({ id: schema.loans.id })
      .from(schema.loans)
      .innerJoin(schema.items, eq(schema.loans.itemId, schema.items.id))
      .where(
        and(
          eq(schema.items.bibId, bib.id),
          eq(schema.loans.patronId, patron.id),
          eq(schema.loans.status, "ISSUED"),
        ),
      )
      .limit(1);

    const patronActiveLoansOnTitle = activeLoan ? 1 : 0;

    // 5. Check If Patron Already Has An Active Hold (WAITING or AVAILABLE_FOR_PICKUP)
    const [activeHold] = await tx
      .select({ id: schema.holds.id })
      .from(schema.holds)
      .where(
        and(
          eq(schema.holds.bibId, bib.id),
          eq(schema.holds.patronId, patron.id),
          sql`${schema.holds.status} IN ('WAITING', 'AVAILABLE_FOR_PICKUP')`,
        ),
      )
      .limit(1);

    const patronActiveHoldsOnTitle = activeHold ? 1 : 0;

    // 6. Fetch Circulation Rules and System Settings
    const allRules = await tx.select().from(schema.circulationRules);
    const settings = await getSystemSettingsConfig(tx);

    const { rule } = selectRule(
      allRules,
      {
        categoryId: patron.categoryId,
        itemTypeId: bib.itemTypeId,
        isReference: bib.isReference,
      },
      settings,
    );

    // 7. Evaluate Eligibility via Pure Rules Engine
    const eligibility = evaluateHoldPlacementEligibility(
      {
        patron: {
          id: patron.id,
          status: patron.status,
          cardExpiry: patron.cardExpiry,
        },
        title: {
          availableCopiesCount,
        },
        patronActiveHoldsOnTitle,
        patronActiveLoansOnTitle,
        rule,
        settings,
      },
      today,
    );

    if (!eligibility.eligible) {
      throw new Error(eligibility.reason);
    }

    // 8. Insert Hold Record into WAITING Queue
    try {
      const [newHold] = await tx
        .insert(schema.holds)
        .values({
          patronId: patron.id,
          bibId: bib.id,
          status: "WAITING",
          requestDate: today,
        })
        .returning();

      // 9. Compute Queue Position
      const [queueRes] = await tx
        .select({
          pos: sql<number>`count(*)::int`,
        })
        .from(schema.holds)
        .where(
          and(
            eq(schema.holds.bibId, bib.id),
            eq(schema.holds.status, "WAITING"),
            sql`${schema.holds.requestDate} <= ${newHold.requestDate}`,
          ),
        );

      const queuePosition = queueRes?.pos ?? 1;

      // 10. Audit Log
      await recordAuditLog(
        {
          actorType: actor.actorType,
          actorId: actor.id,
          actorName: actor.fullName,
          action: "HOLD_CREATE",
          entity: "holds",
          entityId: String(newHold.id),
          details: `Hold placed on "${bib.title}" for patron ${patron.cardNo}. Queue position: #${queuePosition}`,
          ipAddress: actor.ipAddress,
        },
        tx,
      );

      return {
        success: true,
        hold: newHold,
        queuePosition,
        title: bib.title,
        patronCard: patron.cardNo,
      };
    } catch (dbError: any) {
      // Catch duplicate constraint violation uq_active_hold_per_patron_title (DR-01)
      if (
        dbError?.code === "23505" ||
        dbError?.message?.includes("uq_active_hold_per_patron_title") ||
        dbError?.message?.includes("duplicate key")
      ) {
        throw new Error("Patron already has an active hold for this title");
      }
      throw dbError;
    }
  });
}

/**
 * Cancels an active hold (WAITING or AVAILABLE_FOR_PICKUP) (FR-HO-05, FR-OP-03).
 * If the cancelled hold was waiting for pickup, automatically reassigns the held copy
 * to the next waiting hold in FIFO order, or releases it back to shelf.
 */
export async function cancelHold(
  params: {
    holdId: number;
    reason?: string;
    referenceDate?: string | Date;
  },
  actor: Actor,
  db: DbInstance = defaultDb,
) {
  const today = params.referenceDate ? new Date(params.referenceDate) : new Date();

  return await db.transaction(async (tx: DbInstance) => {
    // 1. Fetch Target Hold with Row Lock
    const [hold] = await tx
      .select()
      .from(schema.holds)
      .where(eq(schema.holds.id, params.holdId))
      .for("update");

    if (!hold) {
      throw new Error(`Hold #${params.holdId} not found`);
    }

    if (hold.status !== "WAITING" && hold.status !== "AVAILABLE_FOR_PICKUP") {
      throw new Error(`Cannot cancel hold with status '${hold.status}'`);
    }

    // If PATRON actor, verify ownership
    if (actor.actorType === "PATRON" && hold.patronId !== actor.id) {
      throw new Error("You can only cancel your own reservation holds");
    }

    const settings = await getSystemSettingsConfig(tx);
    let nextHoldPromoted = null;

    // 2. If hold was AVAILABLE_FOR_PICKUP, reassign physical copy
    if (hold.status === "AVAILABLE_FOR_PICKUP" && hold.itemId) {
      const [copy] = await tx
        .select({
          id: schema.items.id,
          bibId: schema.items.bibId,
          status: schema.items.status,
          accessionNo: schema.items.accessionNo,
          isReference: schema.itemTypes.isReference,
        })
        .from(schema.items)
        .innerJoin(schema.bibRecords, eq(schema.items.bibId, schema.bibRecords.id))
        .innerJoin(schema.itemTypes, eq(schema.bibRecords.itemTypeId, schema.itemTypes.id))
        .where(eq(schema.items.id, hold.itemId))
        .for("update");

      if (copy) {
        // Find next waiting hold in strict FIFO order (requestDate ASC, id ASC)
        const [nextWaitingHold] = await tx
          .select()
          .from(schema.holds)
          .where(and(eq(schema.holds.bibId, hold.bibId), eq(schema.holds.status, "WAITING")))
          .orderBy(asc(schema.holds.requestDate), asc(schema.holds.id))
          .limit(1)
          .for("update");

        if (nextWaitingHold) {
          const expiryDate = calculateHoldPickupExpiry(today, settings.holdPickupDays);

          const [updatedNext] = await tx
            .update(schema.holds)
            .set({
              status: "AVAILABLE_FOR_PICKUP",
              itemId: copy.id,
              availableDate: sql`${formatDateIso(today)}::date`,
              expiryDate: sql`${formatDateIso(expiryDate)}::date`,
              updatedAt: new Date(),
            })
            .where(eq(schema.holds.id, nextWaitingHold.id))
            .returning();

          nextHoldPromoted = {
            ...updatedNext,
            pickupExpiryDate: formatDateIso(expiryDate),
          };

          await recordAuditLog(
            {
              actorType: actor.actorType,
              actorId: actor.id,
              actorName: actor.fullName,
              action: "HOLD_PROMOTION",
              entity: "holds",
              entityId: String(nextWaitingHold.id),
              details: `Hold #${nextWaitingHold.id} promoted to AVAILABLE_FOR_PICKUP on copy ${copy.accessionNo} after hold #${hold.id} cancellation. Pickup deadline: ${formatDateIso(expiryDate)}`,
              ipAddress: actor.ipAddress,
            },
            tx,
          );
        } else {
          // No next waiting holds: restore copy status to AVAILABLE or REFERENCE_ONLY
          const targetStatus = copy.isReference ? "REFERENCE_ONLY" : "AVAILABLE";
          await tx
            .update(schema.items)
            .set({
              status: targetStatus,
              updatedAt: new Date(),
            })
            .where(eq(schema.items.id, copy.id));

          await recordAuditLog(
            {
              actorType: actor.actorType,
              actorId: actor.id,
              actorName: actor.fullName,
              action: "COPY_STATUS_CHANGE",
              entity: "items",
              entityId: String(copy.id),
              details: `Copy ${copy.accessionNo} released to ${targetStatus} after hold #${hold.id} cancellation`,
              ipAddress: actor.ipAddress,
            },
            tx,
          );
        }
      }
    }

    // 3. Mark target hold CANCELLED
    const [cancelledHold] = await tx
      .update(schema.holds)
      .set({
        status: "CANCELLED",
        updatedAt: new Date(),
      })
      .where(eq(schema.holds.id, hold.id))
      .returning();

    // 4. Audit Log
    await recordAuditLog(
      {
        actorType: actor.actorType,
        actorId: actor.id,
        actorName: actor.fullName,
        action: "HOLD_CANCEL",
        entity: "holds",
        entityId: String(hold.id),
        details: `Cancelled hold #${hold.id}${params.reason ? `: ${params.reason}` : ""}`,
        ipAddress: actor.ipAddress,
      },
      tx,
    );

    return {
      success: true,
      cancelledHold,
      nextHoldPromoted,
    };
  });
}

/**
 * Runs housekeeping to expire uncollected holds past their pickup deadline (FR-HO-04, FR-DB-03).
 * Invoked on dashboard load, reservations page load, or maintenance call.
 * Promotes the next waiting hold in FIFO order or releases the held copy to AVAILABLE.
 */
export async function processExpiredHolds(
  referenceDate: string | Date = new Date(),
  db: DbInstance = defaultDb,
) {
  const today = new Date(referenceDate);
  const settings = await getSystemSettingsConfig(db);

  // Find all holds currently in AVAILABLE_FOR_PICKUP whose expiryDate is in the past
  const expiredCandidates = await db
    .select({
      id: schema.holds.id,
      patronId: schema.holds.patronId,
      bibId: schema.holds.bibId,
      itemId: schema.holds.itemId,
      expiryDate: schema.holds.expiryDate,
    })
    .from(schema.holds)
    .where(
      and(
        eq(schema.holds.status, "AVAILABLE_FOR_PICKUP"),
        sql`${schema.holds.expiryDate} < ${formatDateIso(today)}::date`,
      ),
    );

  const results: Array<{
    expiredHoldId: number;
    promotedHoldId?: number;
    copyStatusUpdatedTo: string;
  }> = [];

  for (const exp of expiredCandidates) {
    await db.transaction(async (tx: DbInstance) => {
      // Lock target hold
      const [hold] = await tx
        .select()
        .from(schema.holds)
        .where(eq(schema.holds.id, exp.id))
        .for("update");

      if (!hold || hold.status !== "AVAILABLE_FOR_PICKUP") return;

      // Mark hold EXPIRED
      await tx
        .update(schema.holds)
        .set({
          status: "EXPIRED",
          updatedAt: new Date(),
        })
        .where(eq(schema.holds.id, hold.id));

      await recordAuditLog(
        {
          actorType: "SYSTEM",
          actorId: 0,
          actorName: "System Housekeeping",
          action: "HOLD_EXPIRE",
          entity: "holds",
          entityId: String(hold.id),
          details: `Hold #${hold.id} expired (pickup deadline ${hold.expiryDate} passed)`,
        },
        tx,
      );

      let copyStatus = "AVAILABLE";
      let promotedHoldId: number | undefined;

      // If hold had an assigned copy, reassign or release
      if (hold.itemId) {
        const [copy] = await tx
          .select({
            id: schema.items.id,
            accessionNo: schema.items.accessionNo,
            isReference: schema.itemTypes.isReference,
          })
          .from(schema.items)
          .innerJoin(schema.bibRecords, eq(schema.items.bibId, schema.bibRecords.id))
          .innerJoin(schema.itemTypes, eq(schema.bibRecords.itemTypeId, schema.itemTypes.id))
          .where(eq(schema.items.id, hold.itemId))
          .for("update");

        if (copy) {
          // Find next waiting hold in FIFO order
          const [nextWaitingHold] = await tx
            .select()
            .from(schema.holds)
            .where(and(eq(schema.holds.bibId, hold.bibId), eq(schema.holds.status, "WAITING")))
            .orderBy(asc(schema.holds.requestDate), asc(schema.holds.id))
            .limit(1)
            .for("update");

          if (nextWaitingHold) {
            const newExpiry = calculateHoldPickupExpiry(today, settings.holdPickupDays);

            await tx
              .update(schema.holds)
              .set({
                status: "AVAILABLE_FOR_PICKUP",
                itemId: copy.id,
                availableDate: sql`${formatDateIso(today)}::date`,
                expiryDate: sql`${formatDateIso(newExpiry)}::date`,
                updatedAt: new Date(),
              })
              .where(eq(schema.holds.id, nextWaitingHold.id));

            promotedHoldId = nextWaitingHold.id;
            copyStatus = "RESERVED";

            await recordAuditLog(
              {
                actorType: "SYSTEM",
                actorId: 0,
                actorName: "System Housekeeping",
                action: "HOLD_PROMOTION",
                entity: "holds",
                entityId: String(nextWaitingHold.id),
                details: `Hold #${nextWaitingHold.id} promoted to AVAILABLE_FOR_PICKUP following expiration of hold #${hold.id}`,
              },
              tx,
            );
          } else {
            // No next waiting holds: restore copy status
            copyStatus = copy.isReference ? "REFERENCE_ONLY" : "AVAILABLE";
            await tx
              .update(schema.items)
              .set({
                status: copyStatus,
                updatedAt: new Date(),
              })
              .where(eq(schema.items.id, copy.id));

            await recordAuditLog(
              {
                actorType: "SYSTEM",
                actorId: 0,
                actorName: "System Housekeeping",
                action: "COPY_STATUS_CHANGE",
                entity: "items",
                entityId: String(copy.id),
                details: `Copy ${copy.accessionNo} released to ${copyStatus} following hold #${hold.id} expiration`,
              },
              tx,
            );
          }
        }
      }

      results.push({
        expiredHoldId: hold.id,
        promotedHoldId,
        copyStatusUpdatedTo: copyStatus,
      });
    });
  }

  return {
    processedCount: expiredCandidates.length,
    results,
  };
}

export interface HoldListItem {
  id: number;
  patronId: number;
  bibId: number;
  itemId: number | null;
  status: string;
  requestDate: string | null;
  availableDate: string | null;
  expiryDate: Date | null;
  pickupExpiryDate: string | null;
  createdAt: Date;
  title: string;
  authors: string;
  isbn: string | null;
  patronFirstName: string;
  patronLastName: string;
  patronCardNo: string;
  patronMobile: string | null;
  copyAccessionNo: string | null;
  copyBarcode: string | null;
  queuePosition: number | null;
  patronName: string;
}

/**
 * Lists holds with live dynamic queue positions and filters (FR-HO-02).
 */
export async function listHolds(
  filters: {
    bibId?: number;
    patronId?: number;
    status?: string | string[];
    search?: string;
    limit?: number;
    offset?: number;
  } = {},
  db: DbInstance = defaultDb,
): Promise<HoldListItem[]> {
  let query = db
    .select({
      id: schema.holds.id,
      patronId: schema.holds.patronId,
      bibId: schema.holds.bibId,
      itemId: schema.holds.itemId,
      status: schema.holds.status,
      requestDate: schema.holds.requestDate,
      availableDate: schema.holds.availableDate,
      expiryDate: schema.holds.expiryDate,
      createdAt: schema.holds.createdAt,
      title: schema.bibRecords.title,
      authors: schema.bibRecords.authors,
      isbn: schema.bibRecords.isbn,
      patronFirstName: schema.patrons.firstName,
      patronLastName: schema.patrons.lastName,
      patronCardNo: schema.patrons.cardNo,
      patronMobile: schema.patrons.mobile,
      copyAccessionNo: schema.items.accessionNo,
      copyBarcode: schema.items.barcode,
    })
    .from(schema.holds)
    .innerJoin(schema.bibRecords, eq(schema.holds.bibId, schema.bibRecords.id))
    .innerJoin(schema.patrons, eq(schema.holds.patronId, schema.patrons.id))
    .leftJoin(schema.items, eq(schema.holds.itemId, schema.items.id));

  const conditions = [];

  if (filters.bibId) {
    conditions.push(eq(schema.holds.bibId, filters.bibId));
  }

  if (filters.patronId) {
    conditions.push(eq(schema.holds.patronId, filters.patronId));
  }

  if (filters.status) {
    if (Array.isArray(filters.status)) {
      conditions.push(inArray(schema.holds.status, filters.status));
    } else {
      conditions.push(eq(schema.holds.status, filters.status));
    }
  }

  if (filters.search && filters.search.trim()) {
    const term = `%${filters.search.trim().toLowerCase()}%`;
    conditions.push(
      or(
        sql`lower(${schema.bibRecords.title}) LIKE ${term}`,
        sql`lower(${schema.patrons.firstName}) LIKE ${term}`,
        sql`lower(${schema.patrons.cardNo}) LIKE ${term}`,
      ),
    );
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  const rawRows = await query
    .orderBy(asc(schema.holds.requestDate), asc(schema.holds.id))
    .limit(filters.limit ?? 100)
    .offset(filters.offset ?? 0);

  // Group by bibId to compute queue position among active WAITING holds
  const bibWaitingQueues = new Map<number, number[]>();
  for (const row of rawRows) {
    if (row.status === "WAITING") {
      const list = bibWaitingQueues.get(row.bibId) ?? [];
      list.push(row.id);
      bibWaitingQueues.set(row.bibId, list);
    }
  }

  return rawRows.map((r: any) => {
    let queuePosition: number | null = null;
    if (r.status === "AVAILABLE_FOR_PICKUP") {
      queuePosition = 1;
    } else if (r.status === "WAITING") {
      const list = bibWaitingQueues.get(r.bibId) ?? [];
      const idx = list.indexOf(r.id);
      queuePosition = idx !== -1 ? idx + 1 : 1;
    }

    return {
      ...r,
      queuePosition,
      patronName: [r.patronFirstName, r.patronLastName].filter(Boolean).join(" "),
      pickupExpiryDate: r.expiryDate ? String(r.expiryDate) : null,
      availableDate: r.availableDate ? String(r.availableDate) : null,
      requestDate: r.requestDate ? String(r.requestDate) : null,
    };
  });
}
