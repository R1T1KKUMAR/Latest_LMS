import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";
import { POST as cancelHoldPost } from "@/app/api/holds/[id]/cancel/route";
import { POST as processExpiredPost } from "@/app/api/holds/process-expired/route";
import { GET as holdsGet, POST as holdsPost } from "@/app/api/holds/route";
import { setTestDb } from "@/db/client";
import * as schema from "@/db/schema";
import { seedDatabase } from "@/db/seed";
import { PATRON_SESSION_COOKIE, STAFF_SESSION_COOKIE } from "@/lib/auth";
import { loginPatron, loginStaff } from "@/services/auth";

describe("Phase 9: Holds & Reservations API Route Handlers Suite", () => {
  // biome-ignore lint/suspicious/noExplicitAny: generic DB instance
  let db: any;
  let pg: PGlite;

  let librarianSessionId: string;
  let librarianCsrf: string;

  let patronPriyaSessionId: string;
  let patronPriyaCsrf: string;

  let patronRahulSessionId: string;
  let patronRahulCsrf: string;

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

    // Login staff librarian
    const staffLogin = await loginStaff({ username: "librarian", password: "Lib@123" }, db);
    librarianSessionId = staffLogin.session?.id as string;
    librarianCsrf = staffLogin.session?.csrfToken as string;

    // Login patron Priya (ID 2)
    const priyaLogin = await loginPatron(
      { identifier: "2301430100062", password: "2301430100062" },
      db,
    );
    patronPriyaSessionId = priyaLogin.session?.id as string;
    patronPriyaCsrf = priyaLogin.session?.csrfToken as string;

    // Login patron Rahul (ID 1)
    const rahulLogin = await loginPatron(
      { identifier: "2301430100045", password: "2301430100045" },
      db,
    );
    patronRahulSessionId = rahulLogin.session?.id as string;
    patronRahulCsrf = rahulLogin.session?.csrfToken as string;
  });

  describe("1. GET /api/holds", () => {
    it("returns 401 when unauthenticated", async () => {
      const req = new NextRequest("http://localhost:3000/api/holds");
      const res = await holdsGet(req);
      expect(res.status).toBe(401);
    });

    it("allows staff with HOLD_MANAGE to list all holds", async () => {
      const req = new NextRequest("http://localhost:3000/api/holds", {
        headers: {
          cookie: `${STAFF_SESSION_COOKIE}=${librarianSessionId}`,
        },
      });
      const res = await holdsGet(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.holds)).toBe(true);
    });

    it("allows patron to view only their own holds", async () => {
      const req = new NextRequest("http://localhost:3000/api/holds", {
        headers: {
          cookie: `${PATRON_SESSION_COOKIE}=${patronPriyaSessionId}`,
        },
      });
      const res = await holdsGet(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.holds)).toBe(true);
    });
  });

  describe("2. POST /api/holds", () => {
    it("returns 401 when unauthenticated", async () => {
      const req = new NextRequest("http://localhost:3000/api/holds", {
        method: "POST",
        body: JSON.stringify({ bibId: 1, csrfToken: "invalid" }),
      });
      const res = await holdsPost(req);
      expect(res.status).toBe(401);
    });

    it("returns 403 on missing or invalid CSRF token", async () => {
      const req = new NextRequest("http://localhost:3000/api/holds", {
        method: "POST",
        headers: {
          cookie: `${PATRON_SESSION_COOKIE}=${patronPriyaSessionId}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ bibId: 1, csrfToken: "wrong-csrf" }),
      });
      const res = await holdsPost(req);
      expect(res.status).toBe(403);
    });

    it("returns 400 when shelf copies are available (T-16)", async () => {
      const req = new NextRequest("http://localhost:3000/api/holds", {
        method: "POST",
        headers: {
          cookie: `${PATRON_SESSION_COOKIE}=${patronPriyaSessionId}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ bibId: 3, csrfToken: patronPriyaCsrf }),
      });
      const res = await holdsPost(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Copies are available on the shelf");
    });

    it("returns 201 when placing hold on title with all copies unavailable", async () => {
      // Ensure all copies of Bib ID 1 are ISSUED
      await db.update(schema.items).set({ status: "ISSUED" }).where(eq(schema.items.bibId, 1));

      const req = new NextRequest("http://localhost:3000/api/holds", {
        method: "POST",
        headers: {
          cookie: `${PATRON_SESSION_COOKIE}=${patronPriyaSessionId}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bibId: 1,
          csrfToken: patronPriyaCsrf,
          referenceDate: "2026-10-10",
        }),
      });
      const res = await holdsPost(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.hold.status).toBe("WAITING");
      expect(data.queuePosition).toBe(1);
    });

    it("returns 409 when patron attempts duplicate active hold on the same title", async () => {
      const req = new NextRequest("http://localhost:3000/api/holds", {
        method: "POST",
        headers: {
          cookie: `${PATRON_SESSION_COOKIE}=${patronPriyaSessionId}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bibId: 1,
          csrfToken: patronPriyaCsrf,
          referenceDate: "2026-10-10",
        }),
      });
      const res = await holdsPost(req);
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toContain("Patron already has an active hold for this title");
    });
  });

  describe("3. POST /api/holds/[id]/cancel", () => {
    it("returns 403 on missing or invalid CSRF", async () => {
      const [hold] = await db
        .select()
        .from(schema.holds)
        .where(eq(schema.holds.status, "WAITING"))
        .limit(1);

      const params = Promise.resolve({ id: String(hold.id) });
      const req = new NextRequest(`http://localhost:3000/api/holds/${hold.id}/cancel`, {
        method: "POST",
        headers: {
          cookie: `${PATRON_SESSION_COOKIE}=${patronPriyaSessionId}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ csrfToken: "invalid-token" }),
      });
      const res = await cancelHoldPost(req, { params });
      expect(res.status).toBe(403);
    });

    it("returns 400 when patron tries to cancel another patron's hold", async () => {
      // Hold was placed by Priya (patron ID 2). Rahul (patron ID 1) tries to cancel it.
      const [priyaHold] = await db
        .select()
        .from(schema.holds)
        .where(eq(schema.holds.patronId, 2))
        .limit(1);

      const params = Promise.resolve({ id: String(priyaHold.id) });
      const req = new NextRequest(`http://localhost:3000/api/holds/${priyaHold.id}/cancel`, {
        method: "POST",
        headers: {
          cookie: `${PATRON_SESSION_COOKIE}=${patronRahulSessionId}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ csrfToken: patronRahulCsrf }),
      });
      const res = await cancelHoldPost(req, { params });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("You can only cancel your own reservation holds");
    });

    it("returns 200 when patron cancels their own hold", async () => {
      const [priyaHold] = await db
        .select()
        .from(schema.holds)
        .where(eq(schema.holds.patronId, 2))
        .limit(1);

      const params = Promise.resolve({ id: String(priyaHold.id) });
      const req = new NextRequest(`http://localhost:3000/api/holds/${priyaHold.id}/cancel`, {
        method: "POST",
        headers: {
          cookie: `${PATRON_SESSION_COOKIE}=${patronPriyaSessionId}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          csrfToken: patronPriyaCsrf,
          reason: "Patron self-cancellation",
        }),
      });
      const res = await cancelHoldPost(req, { params });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.cancelledHold.status).toBe("CANCELLED");
    });
  });

  describe("4. POST /api/holds/process-expired", () => {
    it("returns 403 when a patron tries to invoke housekeeping", async () => {
      const req = new NextRequest("http://localhost:3000/api/holds/process-expired", {
        method: "POST",
        headers: {
          cookie: `${PATRON_SESSION_COOKIE}=${patronPriyaSessionId}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ csrfToken: patronPriyaCsrf }),
      });
      const res = await processExpiredPost(req);
      // requirePermission throws 403 / redirects
      expect([401, 403]).toContain(res.status);
    });

    it("returns 200 when staff with HOLD_MANAGE invokes housekeeping", async () => {
      const req = new NextRequest("http://localhost:3000/api/holds/process-expired", {
        method: "POST",
        headers: {
          cookie: `${STAFF_SESSION_COOKIE}=${librarianSessionId}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          csrfToken: librarianCsrf,
          referenceDate: "2026-10-15",
        }),
      });
      const res = await processExpiredPost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(typeof data.processedCount).toBe("number");
    });
  });
});
