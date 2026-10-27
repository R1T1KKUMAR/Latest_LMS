import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";
import { GET as holidaysGet, POST as holidaysPost } from "@/app/api/admin/holidays/route";
import { POST as holidaysUploadPost } from "@/app/api/admin/holidays/upload/route";
import { GET as holidaysTemplateGet } from "@/app/api/admin/holidays/template/route";
import { DELETE as holidaysDelete } from "@/app/api/admin/holidays/[id]/route";
import { GET as finesGet, PUT as finesPut } from "@/app/api/admin/fines/route";
import { POST as finesAdjustPost } from "@/app/api/admin/fines/adjust/route";
import { setTestDb } from "@/db/client";
import * as schema from "@/db/schema";
import { seedDatabase } from "@/db/seed";
import { STAFF_SESSION_COOKIE } from "@/lib/auth";
import { loginStaff } from "@/services/auth";

describe("Admin Holiday Calendar & Dynamic Fine Adjustment API Routes", () => {
  // biome-ignore lint/suspicious/noExplicitAny: generic DB instance
  let db: any;
  let pg: PGlite;

  let adminSessionId: string;
  let adminCsrf: string;

  let asstSessionId: string;
  let asstCsrf: string;

  beforeAll(async () => {
    pg = new PGlite();
    const migrationPath = path.resolve(process.cwd(), "db/migrations/0000_abnormal_the_fallen.sql");
    const sql = fs.readFileSync(migrationPath, "utf8");
    const statements = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await pg.exec(statement);
    }

    db = drizzle(pg, { schema });
    setTestDb(db);

    await seedDatabase(db);

    const adminLogin = await loginStaff({ username: "admin", password: "Admin@123" }, db);
    adminSessionId = adminLogin.session?.id as string;
    adminCsrf = adminLogin.session?.csrfToken as string;

    const asstLogin = await loginStaff({ username: "assistant", password: "Asst@123" }, db);
    asstSessionId = asstLogin.session?.id as string;
    asstCsrf = asstLogin.session?.csrfToken as string;
  });

  describe("1. Holidays API Routes", () => {
    it("GET /api/admin/holidays refuses unauthenticated and unauthorized requests (HTTP 401 / 403)", async () => {
      // Unauthenticated
      const unauthReq = new NextRequest("http://localhost:3000/api/admin/holidays");
      const unauthRes = await holidaysGet(unauthReq);
      expect(unauthRes.status).toBe(401);

      // Assistant librarian lacks ADMIN_SETTINGS
      const asstReq = new NextRequest("http://localhost:3000/api/admin/holidays", {
        headers: { cookie: `${STAFF_SESSION_COOKIE}=${asstSessionId}` },
      });
      const asstRes = await holidaysGet(asstReq);
      expect(asstRes.status).toBe(403);
    });

    it("GET /api/admin/holidays returns empty list initially for admin", async () => {
      const req = new NextRequest("http://localhost:3000/api/admin/holidays", {
        headers: { cookie: `${STAFF_SESSION_COOKIE}=${adminSessionId}` },
      });
      const res = await holidaysGet(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.holidays)).toBe(true);
    });

    it("POST /api/admin/holidays refuses request with invalid CSRF token (HTTP 403)", async () => {
      const req = new NextRequest("http://localhost:3000/api/admin/holidays", {
        method: "POST",
        headers: {
          cookie: `${STAFF_SESSION_COOKIE}=${adminSessionId}`,
          "x-csrf-token": "bad-csrf-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          date: "2026-11-01",
          name: "Test Holiday",
        }),
      });
      const res = await holidaysPost(req);
      expect(res.status).toBe(403);
    });

    it("POST /api/admin/holidays adds ad-hoc college-off day successfully", async () => {
      const req = new NextRequest("http://localhost:3000/api/admin/holidays", {
        method: "POST",
        headers: {
          cookie: `${STAFF_SESSION_COOKIE}=${adminSessionId}`,
          "x-csrf-token": adminCsrf,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          date: "2026-11-04",
          name: "College off due to severe weather advisory",
          type: "AD_HOC",
          description: "Heavy rainfall alert",
        }),
      });
      const res = await holidaysPost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.holiday.date).toBe("2026-11-04");
      expect(data.holiday.name).toBe("College off due to severe weather advisory");
      expect(data.holiday.type).toBe("AD_HOC");
    });

    it("GET /api/admin/holidays/template downloads valid CSV attachment", async () => {
      const res = await holidaysTemplateGet();
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/csv");
      expect(res.headers.get("content-disposition")).toContain(
        "annual_holiday_calendar_template.csv",
      );
      const text = await res.text();
      expect(text).toContain("Republic Day");
      expect(text).toContain("Mahatma Gandhi Jayanti");
    });

    it("POST /api/admin/holidays/upload processes CSV preview and import", async () => {
      const csvData = `Date,Holiday Name,Type,Description
2026-12-25,Christmas Day,ANNUAL,Gazetted Holiday
2026-01-26,Republic Day,ANNUAL,National Holiday
`;

      // Preview only
      const previewReq = new NextRequest("http://localhost:3000/api/admin/holidays/upload", {
        method: "POST",
        headers: {
          cookie: `${STAFF_SESSION_COOKIE}=${adminSessionId}`,
          "x-csrf-token": adminCsrf,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          csvContent: csvData,
          previewOnly: true,
        }),
      });
      const previewRes = await holidaysUploadPost(previewReq);
      expect(previewRes.status).toBe(200);
      const previewData = await previewRes.json();
      expect(previewData.success).toBe(true);
      expect(previewData.preview).toBe(true);
      expect(previewData.validCount).toBe(2);

      // Full commit
      const commitReq = new NextRequest("http://localhost:3000/api/admin/holidays/upload", {
        method: "POST",
        headers: {
          cookie: `${STAFF_SESSION_COOKIE}=${adminSessionId}`,
          "x-csrf-token": adminCsrf,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          csvContent: csvData,
          mode: "MERGE",
        }),
      });
      const commitRes = await holidaysUploadPost(commitReq);
      expect(commitRes.status).toBe(200);
      const commitData = await commitRes.json();
      expect(commitData.success).toBe(true);
      expect(commitData.importedCount).toBe(2);
    });

    it("DELETE /api/admin/holidays/[id] removes scheduled holiday", async () => {
      const listReq = new NextRequest("http://localhost:3000/api/admin/holidays", {
        headers: { cookie: `${STAFF_SESSION_COOKIE}=${adminSessionId}` },
      });
      const listRes = await holidaysGet(listReq);
      const listData = await listRes.json();
      const target = listData.holidays.find((h: any) => h.date === "2026-11-04");
      expect(target).toBeDefined();

      const deleteReq = new NextRequest(`http://localhost:3000/api/admin/holidays/${target.id}`, {
        method: "DELETE",
        headers: {
          cookie: `${STAFF_SESSION_COOKIE}=${adminSessionId}`,
          "x-csrf-token": adminCsrf,
        },
      });
      const deleteRes = await holidaysDelete(deleteReq, {
        params: Promise.resolve({ id: target.id }),
      });
      expect(deleteRes.status).toBe(200);
      const deleteData = await deleteRes.json();
      expect(deleteData.success).toBe(true);
    });
  });

  describe("2. Dynamic Fine Adjustment API Routes", () => {
    it("GET /api/admin/fines returns current settings and circulation rules", async () => {
      const req = new NextRequest("http://localhost:3000/api/admin/fines", {
        headers: { cookie: `${STAFF_SESSION_COOKIE}=${adminSessionId}` },
      });
      const res = await finesGet(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.fineSettings).toBeDefined();
      expect(data.fineSettings.DEFAULT_FINE_PER_DAY).toBe("2.00");
      expect(Array.isArray(data.rules)).toBe(true);
    });

    it("PUT /api/admin/fines updates global fine parameters and rule fine rate", async () => {
      const req = new NextRequest("http://localhost:3000/api/admin/fines", {
        method: "PUT",
        headers: {
          cookie: `${STAFF_SESSION_COOKIE}=${adminSessionId}`,
          "x-csrf-token": adminCsrf,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          settings: {
            DEFAULT_FINE_PER_DAY: "3.50",
            DEFAULT_GRACE_DAYS: "1",
          },
          ruleId: 1,
          ruleUpdates: {
            finePerDay: "3.50",
            graceDays: 1,
          },
        }),
      });
      const res = await finesPut(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.updatedKeys).toContain("DEFAULT_FINE_PER_DAY");
      expect(data.updatedKeys).toContain("DEFAULT_GRACE_DAYS");
      expect(data.updatedRule).toBeDefined();
      expect(Number(data.updatedRule.finePerDay)).toBe(3.5);
    });

    it("POST /api/admin/fines/adjust dynamically overrides an outstanding fine record", async () => {
      // Insert test fine
      const [fine] = await db
        .insert(schema.fines)
        .values({
          patronId: 1,
          amount: "40.00",
          paidAmount: "0.00",
          fineType: "OVERDUE",
          reason: "Late return fine",
          status: "OUTSTANDING",
          createdBy: 1,
        })
        .returning();

      const req = new NextRequest("http://localhost:3000/api/admin/fines/adjust", {
        method: "POST",
        headers: {
          cookie: `${STAFF_SESSION_COOKIE}=${adminSessionId}`,
          "x-csrf-token": adminCsrf,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          fineId: fine.id,
          newAmount: 15.0,
          reason: "Admin fine calibration after student grievance",
        }),
      });
      const res = await finesAdjustPost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(Number(data.result.newAmount)).toBe(15.0);
      expect(data.result.fine.status).toBe("OUTSTANDING");
    });
  });
});
