import { PGlite } from "@electric-sql/pglite";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync } from "fs";
import { resolve } from "path";
import { beforeAll, describe, expect, it } from "vitest";
import { setTestDb } from "@/db/client";
import * as schema from "@/db/schema";
import { issueCopy, returnCopy } from "@/services/circulation";
import {
  cancelHold,
  type HoldListItem,
  listHolds,
  placeHold,
  processExpiredHolds,
} from "@/services/holds";

describe("Phase 9: Reservations & Holds Integration Suite (FR-HO-01 to FR-HO-05, UC-07, BR-05, T-10, T-16)", () => {
  let pglite: PGlite;
  // biome-ignore lint/suspicious/noExplicitAny: generic DB instance
  let db: any;

  const staffActor = {
    id: 1,
    fullName: "Admin Librarian",
    actorType: "STAFF" as const,
  };

  beforeAll(async () => {
    pglite = new PGlite();
    db = drizzle(pglite, { schema });
    setTestDb(db);

    const migrationPath = resolve(process.cwd(), "db/migrations/0000_abnormal_the_fallen.sql");
    const migrationSql = readFileSync(migrationPath, "utf-8");
    await pglite.exec(migrationSql);

    const { seedDatabase } = await import("@/db/seed");
    await seedDatabase(db);

    // Ensure patron 3 (Neha Gupta) card is valid through 2027
    await db
      .update(schema.patrons)
      .set({ cardExpiry: "2027-06-30" })
      .where(eq(schema.patrons.id, 3));
  });

  it("1. Refusal on title with available shelf copy (T-16 / BR-05)", async () => {
    // Bib ID 3 (Database System Concepts) has copy CL000009 AVAILABLE on shelf
    // Patron 2 (Priya Sharma) attempts to place a hold
    await expect(
      placeHold(
        {
          patronId: 2,
          bibId: 3,
          referenceDate: new Date("2026-10-10"),
        },
        {
          id: 2,
          fullName: "Priya Sharma",
          actorType: "PATRON",
        },
        db,
      ),
    ).rejects.toThrow("Copies are available on the shelf");
  });

  it("2. Refusal if patron is already borrowing the title", async () => {
    // Bib ID 1 (Fluid Mechanics) copy CL000001 is on active loan to Patron 1 (Rahul Kumar)
    await expect(
      placeHold(
        {
          patronId: 1,
          bibId: 1,
          referenceDate: new Date("2026-10-10"),
        },
        {
          id: 1,
          fullName: "Rahul Kumar",
          actorType: "PATRON",
        },
        db,
      ),
    ).rejects.toThrow(/active loan for this title/);
  });

  it("3. Refusal on inactive or expired patron (BR-02)", async () => {
    // Set patron 3 (Neha) to BLOCKED status
    await db.update(schema.patrons).set({ status: "BLOCKED" }).where(eq(schema.patrons.id, 3));

    // Ensure all copies of Bib ID 1 are unavailable
    await db.update(schema.items).set({ status: "ISSUED" }).where(eq(schema.items.bibId, 1));

    await expect(
      placeHold(
        {
          patronId: 3,
          bibId: 1,
          referenceDate: new Date("2026-10-10"),
        },
        {
          id: 3,
          fullName: "Blocked Patron",
          actorType: "PATRON",
        },
        db,
      ),
    ).rejects.toThrow(/Patron account is/);

    // Restore patron 3
    await db.update(schema.patrons).set({ status: "ACTIVE" }).where(eq(schema.patrons.id, 3));
  });

  it("4. Refusal if circulation rule disallows holds", async () => {
    // Disable holdsAllowed in circulation rules for Student (categoryId 1)
    await db
      .update(schema.circulationRules)
      .set({ holdsAllowed: false })
      .where(eq(schema.circulationRules.categoryId, 1));

    try {
      await expect(
        placeHold(
          {
            patronId: 2,
            bibId: 1,
            referenceDate: new Date("2026-10-10"),
          },
          {
            id: 2,
            fullName: "Priya Sharma",
            actorType: "PATRON",
          },
          db,
        ),
      ).rejects.toThrow(/Holds are not allowed/);
    } finally {
      // Guaranteed restoration of holdsAllowed
      await db
        .update(schema.circulationRules)
        .set({ holdsAllowed: true })
        .where(eq(schema.circulationRules.categoryId, 1));
    }
  });

  it("5. Successful hold placement in FIFO WAITING queue (FR-HO-01, FR-HO-02)", async () => {
    // Ensure all copies of Bib ID 1 are ISSUED
    await db.update(schema.items).set({ status: "ISSUED" }).where(eq(schema.items.bibId, 1));

    // Patron 2 (Priya Sharma) places hold on Bib ID 1
    const res1 = await placeHold(
      {
        patronId: 2,
        bibId: 1,
        referenceDate: new Date("2026-10-10T10:00:00Z"),
      },
      {
        id: 2,
        fullName: "Priya Sharma",
        actorType: "PATRON",
      },
      db,
    );

    expect(res1.success).toBe(true);
    expect(res1.hold.status).toBe("WAITING");
    expect(res1.queuePosition).toBe(1);

    // Patron 3 (Neha Gupta) places hold on Bib ID 1 shortly after
    const res2 = await placeHold(
      {
        patronId: 3,
        bibId: 1,
        referenceDate: new Date("2026-10-10T11:00:00Z"),
      },
      {
        id: 3,
        fullName: "Neha Gupta",
        actorType: "PATRON",
      },
      db,
    );

    expect(res2.success).toBe(true);
    expect(res2.hold.status).toBe("WAITING");
    expect(res2.queuePosition).toBe(2);

    // Verify listHolds reflects accurate dynamic queue ordering
    const holds = await listHolds({ bibId: 1 }, db);
    const waitingHolds = holds.filter((h: HoldListItem) => h.status === "WAITING");
    expect(waitingHolds.length).toBe(2);
    expect(waitingHolds[0].id).toBe(res1.hold.id);
    expect(waitingHolds[0].queuePosition).toBe(1);
    expect(waitingHolds[1].id).toBe(res2.hold.id);
    expect(waitingHolds[1].queuePosition).toBe(2);
  });

  it("6. Database constraint uq_active_hold_per_patron_title rejects duplicate active hold", async () => {
    // Patron 2 already has an active WAITING hold on Bib ID 1
    await expect(
      placeHold(
        {
          patronId: 2,
          bibId: 1,
          referenceDate: new Date("2026-10-10T12:00:00Z"),
        },
        {
          id: 2,
          fullName: "Priya Sharma",
          actorType: "PATRON",
        },
        db,
      ),
    ).rejects.toThrow("Patron already has an active hold for this title");

    // Direct database insertion of duplicate hold violates unique partial index
    await expect(
      db.insert(schema.holds).values({
        patronId: 2,
        bibId: 1,
        status: "WAITING",
        requestDate: new Date(),
      }),
    ).rejects.toThrow();
  });

  it("7. Hold cancellation of WAITING hold updates queue positions (FR-HO-05)", async () => {
    // Patron 2 cancels their waiting hold (#1)
    const activeHolds = await listHolds({ bibId: 1 }, db);
    const holdPriya = activeHolds.find((h: HoldListItem) => h.patronCardNo === "2301430100062")!;

    const cancelRes = await cancelHold(
      {
        holdId: holdPriya.id,
        reason: "Patron decided to cancel",
      },
      {
        id: 2,
        fullName: "Priya Sharma",
        actorType: "PATRON",
      },
      db,
    );

    expect(cancelRes.success).toBe(true);
    expect(cancelRes.cancelledHold.status).toBe("CANCELLED");

    // Patron 3 (Neha Gupta) is now promoted to queue position #1
    const remainingHolds = await listHolds({ bibId: 1, status: "WAITING" }, db);
    expect(remainingHolds.length).toBe(1);
    expect(remainingHolds[0].patronCardNo).toBe("2201430100033");
    expect(remainingHolds[0].queuePosition).toBe(1);
  });

  it("8. Return of copy assigns hold to AVAILABLE_FOR_PICKUP with 2-day deadline (FR-HO-03, T-10)", async () => {
    // Current state: Patron 3 (Neha Gupta) has WAITING hold on Bib ID 1.
    // Rahul returns copy CL000001 (Bib ID 1) on 2026-10-12
    const returnDate = new Date("2026-10-12T10:00:00Z");
    const ret = await returnCopy(
      {
        barcodeOrAccession: "CL000001",
        referenceDate: returnDate,
      },
      staffActor,
      db,
    );

    expect(ret.success).toBe(true);
    // Copy status set to RESERVED
    expect(ret.copy.status).toBe("RESERVED");
    // Hold alert returned
    expect(ret.holdAlert).toBeDefined();
    expect(ret.holdAlert?.patronCard).toBe("2201430100033");
    expect(ret.holdAlert?.pickupExpiryDate).toBe("2026-10-14"); // 2026-10-12 + 2 days = 2026-10-14

    // Verify hold in DB
    const [hold] = await db
      .select()
      .from(schema.holds)
      .where(eq(schema.holds.id, ret.holdAlert!.holdId));

    expect(hold.status).toBe("AVAILABLE_FOR_PICKUP");
    expect(hold.itemId).toBe(ret.copy.id);
    expect(String(hold.expiryDate)).toBe("2026-10-14");
  });

  it("9. Issue of reserved copy fulfills and marks hold COMPLETED (FR-HO-03)", async () => {
    // Issue copy CL000001 to reserving patron Neha Gupta (card 2201430100033)
    const issueDate = new Date("2026-10-13T10:00:00Z");
    const issueRes = await issueCopy(
      {
        patronIdentifier: "2201430100033",
        barcodeOrAccession: "CL000001",
        referenceDate: issueDate,
      },
      staffActor,
      db,
    );

    expect(issueRes.success).toBe(true);
    expect(issueRes.copy.status).toBe("ISSUED");

    // Hold is now COMPLETED
    const holds = await listHolds({ patronId: 3, bibId: 1 }, db);
    const completedHold = holds.find((h: HoldListItem) => h.status === "COMPLETED");
    expect(completedHold).toBeDefined();
    expect(completedHold?.status).toBe("COMPLETED");
  });

  it("10. Expiration housekeeping (FR-HO-04) and next-patron promotion", async () => {
    // Make copy CL000009 of Bib ID 3 (Database System Concepts) unavailable
    await db.update(schema.items).set({ status: "ISSUED" }).where(eq(schema.items.bibId, 3));

    // Patron 1 places hold
    const h1 = await placeHold(
      {
        patronId: 1,
        bibId: 3,
        referenceDate: new Date("2026-10-10T10:00:00Z"),
      },
      staffActor,
      db,
    );

    // Patron 2 places hold
    const h2 = await placeHold(
      {
        patronId: 2,
        bibId: 3,
        referenceDate: new Date("2026-10-10T11:00:00Z"),
      },
      staffActor,
      db,
    );

    // Fetch copy CL000009
    const [copy9] = await db
      .select()
      .from(schema.items)
      .where(eq(schema.items.accessionNo, "CL000009"));

    // Manually set Patron 1's hold to AVAILABLE_FOR_PICKUP with expiry date 2026-10-12
    await db
      .update(schema.holds)
      .set({
        status: "AVAILABLE_FOR_PICKUP",
        itemId: copy9.id,
        availableDate: sql`'2026-10-10'::date`,
        expiryDate: sql`'2026-10-12'::date`,
      })
      .where(eq(schema.holds.id, h1.hold.id));

    await db.update(schema.items).set({ status: "RESERVED" }).where(eq(schema.items.id, copy9.id));

    // On 2026-10-13, Patron 1 has not picked up the book (expiryDate was 2026-10-12).
    // Run processExpiredHolds(2026-10-13)
    const housekeeping = await processExpiredHolds("2026-10-13", db);

    expect(housekeeping.processedCount).toBeGreaterThanOrEqual(1);

    // Patron 1's hold should be EXPIRED
    const [p1Hold] = await db.select().from(schema.holds).where(eq(schema.holds.id, h1.hold.id));
    expect(p1Hold.status).toBe("EXPIRED");

    // Patron 2's hold should be PROMOTED to AVAILABLE_FOR_PICKUP
    const [p2Hold] = await db.select().from(schema.holds).where(eq(schema.holds.id, h2.hold.id));
    expect(p2Hold.status).toBe("AVAILABLE_FOR_PICKUP");
    expect(p2Hold.itemId).toBe(copy9.id);
    expect(String(p2Hold.expiryDate)).toBe("2026-10-15"); // 2026-10-13 + 2 days = 2026-10-15

    // If Patron 2 also expires without pickup on 2026-10-16:
    const housekeeping2 = await processExpiredHolds("2026-10-16", db);
    expect(housekeeping2.processedCount).toBeGreaterThanOrEqual(1);

    const [p2HoldAfter] = await db
      .select()
      .from(schema.holds)
      .where(eq(schema.holds.id, h2.hold.id));
    expect(p2HoldAfter.status).toBe("EXPIRED");

    // With no more waiting patrons, copy9 should be released back to AVAILABLE!
    const [copy9After] = await db.select().from(schema.items).where(eq(schema.items.id, copy9.id));
    expect(copy9After.status).toBe("AVAILABLE");
  });
});
