import { PGlite } from "@electric-sql/pglite";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync } from "fs";
import { resolve } from "path";
import { beforeAll, describe, expect, it } from "vitest";
import { setTestDb } from "@/db/client";
import * as schema from "@/db/schema";
import { returnCopy } from "@/services/circulation";
import { adjustFineAmount } from "@/services/fines";
import {
  addHoliday,
  deleteHoliday,
  generateSampleCalendarCsv,
  getHolidayDateSet,
  getHolidays,
  importHolidayCalendar,
  parseHolidayCalendarCsv,
} from "@/services/holidays";
import { updateCirculationRule } from "@/services/admin-rules";
import { getAllSystemSettings, updateSystemSettings } from "@/services/settings";
import { addCalendarDays, formatDateIso } from "@/rules/dates";

describe("Holiday Calendar & Dynamic Fine Adjustment Integration Suite", () => {
  let pglite: PGlite;
  // biome-ignore lint/suspicious/noExplicitAny: generic DB instance
  let db: any;

  const adminActor = {
    id: 1,
    fullName: "System Administrator",
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
  });

  describe("1. Holiday Management & Storage in system_settings", () => {
    it("starts with empty holiday list by default", async () => {
      const holidays = await getHolidays(db);
      expect(holidays).toEqual([]);
      const dateSet = await getHolidayDateSet(db);
      expect(dateSet.size).toBe(0);
    });

    it("admin can add an ad-hoc holiday due to unexpected college closure", async () => {
      const holiday = await addHoliday(
        {
          date: "2026-10-05",
          name: "College off due to heavy rain advisory",
          type: "AD_HOC",
          description: "DM District Advisory Order #204",
        },
        adminActor,
        db,
      );

      expect(holiday).toBeDefined();
      expect(holiday.date).toBe("2026-10-05");
      expect(holiday.name).toBe("College off due to heavy rain advisory");
      expect(holiday.type).toBe("AD_HOC");

      const holidays = await getHolidays(db);
      expect(holidays.length).toBe(1);
      expect(holidays[0].name).toBe("College off due to heavy rain advisory");

      const dateSet = await getHolidayDateSet(db);
      expect(dateSet.has("2026-10-05")).toBe(true);
    });

    it("parses CSV annual calendar text and handles valid/invalid entries", () => {
      const csv = `Date,Holiday Name,Type,Description
2026-01-26,Republic Day,ANNUAL,National Holiday
2026-08-15,Independence Day,ANNUAL,National Holiday
2026-10-02,Gandhi Jayanti,ANNUAL,National Holiday
bad-date,Invalid Date Row,ANNUAL,Should error
`;

      const result = parseHolidayCalendarCsv(csv);
      expect(result.valid).toHaveLength(3);
      expect(result.valid[0].name).toBe("Republic Day");
      expect(result.valid[1].date).toBe("2026-08-15");
      expect(result.valid[2].date).toBe("2026-10-02");
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].row).toBe(5);
    });

    it("imports annual holiday calendar via batch import in MERGE mode", async () => {
      const sampleCsv = generateSampleCalendarCsv();
      const parsed = parseHolidayCalendarCsv(sampleCsv);
      expect(parsed.valid.length).toBeGreaterThan(5);

      const importRes = await importHolidayCalendar(parsed.valid, "MERGE", adminActor, db);
      expect(importRes.importedCount).toBe(parsed.valid.length);

      const holidays = await getHolidays(db);
      // Previous 1 ad-hoc + imported
      expect(holidays.length).toBe(parsed.valid.length + 1);
      const dates = await getHolidayDateSet(db);
      expect(dates.has("2026-10-05")).toBe(true);
      expect(dates.has(`${new Date().getFullYear()}-01-26`)).toBe(true);
    });

    it("deletes a holiday record by id", async () => {
      const holidaysBefore = await getHolidays(db);
      const target = holidaysBefore.find((h) => h.date === "2026-10-05")!;
      expect(target).toBeDefined();

      const deleted = await deleteHoliday(target.id, adminActor, db);
      expect(deleted).toBe(true);

      const holidaysAfter = await getHolidays(db);
      expect(holidaysAfter.length).toBe(holidaysBefore.length - 1);
      const dates = await getHolidayDateSet(db);
      expect(dates.has("2026-10-05")).toBe(false);
    });
  });

  describe("2. Fine Exemption on Holidays during Book Returns", () => {
    it("exempts college holidays from overdue return charges", async () => {
      // In seed data:
      // Rahul Kumar borrowed CL000001 (Fluid Mechanics), due 12 days ago.
      // If we declare 4 holiday dates within those 12 days:
      // Overdue days = 12, holiday exemptions = 4 -> Net chargeable = 8 days.
      // Fine = 8 days * ₹2.00 = ₹16.00 (instead of ₹24.00!)
      const today = new Date();
      const h1 = formatDateIso(addCalendarDays(today, -1));
      const h2 = formatDateIso(addCalendarDays(today, -2));
      const h3 = formatDateIso(addCalendarDays(today, -3));
      const h4 = formatDateIso(addCalendarDays(today, -4));

      await addHoliday({ date: h1, name: "College Closure Day 1", type: "AD_HOC" }, adminActor, db);
      await addHoliday({ date: h2, name: "College Closure Day 2", type: "AD_HOC" }, adminActor, db);
      await addHoliday({ date: h3, name: "College Closure Day 3", type: "AD_HOC" }, adminActor, db);
      await addHoliday({ date: h4, name: "College Closure Day 4", type: "AD_HOC" }, adminActor, db);

      const returnRes = await returnCopy(
        {
          barcodeOrAccession: "CL000001",
          referenceDate: today,
        },
        adminActor,
        db,
      );

      expect(returnRes.success).toBe(true);
      // 12 days late - 4 ad-hoc holidays = 8 chargeable days * 2.00 = 16.00
      expect(Number(returnRes.fineRecord?.amount)).toBe(16.0);
      expect(returnRes.fineRecord?.reason).toContain("4 holiday days exempted");
      expect(returnRes.fineRecord?.reason).toContain("8 chargeable days");
    });
  });

  describe("3. Dynamic Fine Adjustment & Administrative Override", () => {
    it("updates global system fine parameters dynamically", async () => {
      const res = await updateSystemSettings(
        {
          DEFAULT_FINE_PER_DAY: "5.00",
          DEFAULT_GRACE_DAYS: "3",
          FINE_BLOCK_LIMIT: "250.00",
        },
        adminActor,
        db,
      );

      expect(res.updatedKeys).toContain("DEFAULT_FINE_PER_DAY");
      expect(res.updatedKeys).toContain("DEFAULT_GRACE_DAYS");
      expect(res.updatedKeys).toContain("FINE_BLOCK_LIMIT");

      const allSettings = await getAllSystemSettings(db);
      const map = new Map(allSettings.map((s) => [s.settingKey, s.settingValue]));
      expect(map.get("DEFAULT_FINE_PER_DAY")).toBe("5.00");
      expect(map.get("DEFAULT_GRACE_DAYS")).toBe("3");
      expect(map.get("FINE_BLOCK_LIMIT")).toBe("250.00");
    });

    it("updates circulation rule fine rates", async () => {
      // Update Rule #1 finePerDay to 4.00 and graceDays to 1
      const updated = await updateCirculationRule(
        1,
        {
          finePerDay: "4.00",
          graceDays: 1,
          maxFine: "300.00",
        },
        adminActor,
        db,
      );

      expect(updated).toBeDefined();
      expect(Number(updated.finePerDay)).toBe(4.0);
      expect(updated.graceDays).toBe(1);
      expect(Number(updated.maxFine)).toBe(300.0);
    });

    it("dynamically adjusts an outstanding fine with administrative justification", async () => {
      // Create a dummy fine to adjust
      const [fine] = await db
        .insert(schema.fines)
        .values({
          patronId: 1,
          amount: "50.00",
          paidAmount: "0.00",
          fineType: "OVERDUE",
          reason: "Overdue return fine",
          status: "OUTSTANDING",
          createdBy: adminActor.id,
        })
        .returning();

      const adjusted = await adjustFineAmount(
        {
          fineId: fine.id,
          newAmount: 20.0,
          reason: "Reduced fine on administrative appeal due to documented medical leave",
        },
        adminActor,
        db,
      );

      expect(adjusted.success).toBe(true);
      expect(Number(adjusted.fine.amount)).toBe(20.0);
      expect(adjusted.fine.reason).toContain("Adjusted from ₹50.00 to ₹20.00");
      expect(adjusted.fine.status).toBe("OUTSTANDING");

      // Verify in database
      const [fetched] = await db
        .select()
        .from(schema.fines)
        .where(eq(schema.fines.id, fine.id));
      expect(Number(fetched.amount)).toBe(20.0);
    });

    it("marks fine as PAID when adjusted amount is reduced to ₹0", async () => {
      const [fine] = await db
        .insert(schema.fines)
        .values({
          patronId: 1,
          amount: "30.00",
          paidAmount: "0.00",
          fineType: "OVERDUE",
          reason: "Overdue return fine",
          status: "OUTSTANDING",
          createdBy: adminActor.id,
        })
        .returning();

      const adjusted = await adjustFineAmount(
        {
          fineId: fine.id,
          newAmount: 0.0,
          reason: "Complete administrative fine exemption",
        },
        adminActor,
        db,
      );

      expect(adjusted.success).toBe(true);
      expect(adjusted.fine.status).toBe("WAIVED");
      expect(adjusted.status).toBe("WAIVED");
    });
  });
});
