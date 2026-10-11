import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";
import { GET as accountGet } from "@/app/api/account/route";
import { POST as changePasswordPost } from "@/app/api/auth/change-password/route";
import { POST as circulationIssuePost } from "@/app/api/circulation/issue/route";
import { POST as finesPayPost } from "@/app/api/fines/pay/route";
import { POST as holdCancelPost } from "@/app/api/holds/[id]/cancel/route";
import { GET as holdsGet, POST as holdsPost } from "@/app/api/holds/route";
import { POST as noDuesIssuePost } from "@/app/api/no-dues/issue/route";
import { GET as departmentsGet } from "@/app/api/opac/departments/route";
import { GET as mostBorrowedGet } from "@/app/api/opac/most-borrowed/route";
import { GET as newArrivalsGet } from "@/app/api/opac/new-arrivals/route";
import { GET as searchGet } from "@/app/api/opac/search/route";
import { GET as titleGet } from "@/app/api/opac/title/[id]/route";
import { setTestDb } from "@/db/client";
import * as schema from "@/db/schema";
import { PATRON_SESSION_COOKIE, STAFF_SESSION_COOKIE } from "@/lib/auth";
import { loginPatron, loginStaff } from "@/services/auth";

describe("Phase 12: OPAC & Patron Portal Route Handlers & Security Boundaries", () => {
  // biome-ignore lint/suspicious/noExplicitAny: generic DB instance
  let db: any;
  let pglite: PGlite;

  // Sessions
  let patron1SessionId: string;
  let patron1Csrf: string;
  let patron2SessionId: string;
  let patron2Csrf: string;
  let librarianSessionId: string;
  let librarianCsrf: string;

  beforeAll(async () => {
    pglite = new PGlite();
    db = drizzle(pglite, { schema });
    setTestDb(db);

    const migrationPath = resolve(process.cwd(), "db/migrations/0000_abnormal_the_fallen.sql");
    const migrationSql = readFileSync(migrationPath, "utf-8");
    await pglite.exec(migrationSql);

    const { seedDatabase } = await import("@/db/seed");
    await seedDatabase(db);

    // Login Patron 1 (Rahul Kumar, Student)
    const p1Login = await loginPatron(
      { identifier: "2301430100045", password: "2301430100045" },
      db,
    );
    patron1SessionId = p1Login.session!.id;
    patron1Csrf = p1Login.session!.csrfToken;

    // Login Patron 2 (Priya Sharma, Student, ID 2)
    const p2Login = await loginPatron(
      { identifier: "2301430100062", password: "2301430100062" },
      db,
    );
    patron2SessionId = p2Login.session!.id;
    patron2Csrf = p2Login.session!.csrfToken;

    // Login Staff Librarian (librarian)
    const staffLogin = await loginStaff({ username: "librarian", password: "Lib@123" }, db);
    librarianSessionId = staffLogin.session!.id;
    librarianCsrf = staffLogin.session!.csrfToken;
  });

  // Section 1: Public Endpoints (FR-OP-01, No Auth Required)
  describe("1. Public OPAC Search & Discovery Endpoints", () => {
    it("GET /api/opac/search returns 200 without authentication", async () => {
      const req = new NextRequest("http://localhost:3000/api/opac/search?q=Data&limit=10");
      const res = await searchGet(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.books)).toBe(true);
      expect(typeof data.total).toBe("number");
    });

    it("GET /api/opac/title/[id] returns 200 with copies shelf locations", async () => {
      const req = new NextRequest("http://localhost:3000/api/opac/title/1");
      const res = await titleGet(req, { params: Promise.resolve({ id: "1" }) });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.title.id).toBe(1);
      expect(Array.isArray(data.title.copies)).toBe(true);
      expect(data.title.copies[0].shelfLocation).toBeDefined();
    });

    it("GET /api/opac/title/[id] returns 404 for non-existent title", async () => {
      const req = new NextRequest("http://localhost:3000/api/opac/title/9999");
      const res = await titleGet(req, { params: Promise.resolve({ id: "9999" }) });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.success).toBe(false);
    });

    it("GET /api/opac/new-arrivals returns 200 without authentication", async () => {
      const req = new NextRequest("http://localhost:3000/api/opac/new-arrivals");
      const res = await newArrivalsGet(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.books)).toBe(true);
    });

    it("GET /api/opac/most-borrowed returns 200 without authentication", async () => {
      const req = new NextRequest("http://localhost:3000/api/opac/most-borrowed");
      const res = await mostBorrowedGet(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.books)).toBe(true);
    });

    it("GET /api/opac/departments returns 200 without authentication", async () => {
      const req = new NextRequest("http://localhost:3000/api/opac/departments");
      const res = await departmentsGet(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.departments)).toBe(true);
    });
  });

  // Section 2: Patron Account Data & Access Controls (FR-OP-02)
  describe("2. Patron Account Endpoint & Session Separation", () => {
    it("GET /api/account returns 401 when unauthenticated", async () => {
      const req = new NextRequest("http://localhost:3000/api/account");
      const res = await accountGet(req);

      expect(res.status).toBe(401);
    });

    it("GET /api/account returns 403 when accessed with STAFF session cookie (NFR-S-05)", async () => {
      const req = new NextRequest("http://localhost:3000/api/account", {
        headers: {
          cookie: `${STAFF_SESSION_COOKIE}=${librarianSessionId}`,
        },
      });
      const res = await accountGet(req);

      expect(res.status).toBe(403);
    });

    it("GET /api/account returns 200 with patron account data when authenticated as PATRON", async () => {
      const req = new NextRequest("http://localhost:3000/api/account", {
        headers: {
          cookie: `${PATRON_SESSION_COOKIE}=${patron1SessionId}`,
        },
      });
      const res = await accountGet(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.profile.cardNo).toBe("2301430100045");
      expect(Array.isArray(data.data.currentLoans)).toBe(true);
      expect(Array.isArray(data.data.loanHistory)).toBe(true);
      expect(Array.isArray(data.data.holds)).toBe(true);
      expect(Array.isArray(data.data.fines)).toBe(true);
    });
  });

  // Section 3: Patron Hold Operations & Refusal Rules (FR-HO-01, FR-OP-03, T-16, T-17)
  describe("3. Hold Placement & Cancellation", () => {
    it("refuses hold when copies are available on shelf (T-16 / FR-HO-01)", async () => {
      // In seed data: Title 3 (Database System Concepts) has copy CL000009 available on shelf
      const req = new NextRequest("http://localhost:3000/api/holds", {
        method: "POST",
        headers: {
          cookie: `${PATRON_SESSION_COOKIE}=${patron2SessionId}`,
          "Content-Type": "application/json",
          "x-csrf-token": patron2Csrf,
        },
        body: JSON.stringify({
          bibId: 3,
          csrfToken: patron2Csrf,
        }),
      });
      const res = await holdsPost(req);

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.toLowerCase()).toContain("shelf");
    });

    it("rejects hold placement with invalid CSRF token", async () => {
      const req = new NextRequest("http://localhost:3000/api/holds", {
        method: "POST",
        headers: {
          cookie: `${PATRON_SESSION_COOKIE}=${patron2SessionId}`,
          "Content-Type": "application/json",
          "x-csrf-token": "bad-csrf-token",
        },
        body: JSON.stringify({
          bibId: 3,
          csrfToken: "bad-csrf-token",
        }),
      });
      const res = await holdsPost(req);

      expect(res.status).toBe(403);
    });

    it("places hold on checked-out title and displays queue position 1 (T-17)", async () => {
      // Ensure all copies of Bib ID 1 (Algorithms) are ISSUED / unavailable
      await db.update(schema.items).set({ status: "ISSUED" }).where(eq(schema.items.bibId, 1));

      const req = new NextRequest("http://localhost:3000/api/holds", {
        method: "POST",
        headers: {
          cookie: `${PATRON_SESSION_COOKIE}=${patron2SessionId}`,
          "Content-Type": "application/json",
          "x-csrf-token": patron2Csrf,
        },
        body: JSON.stringify({
          bibId: 1,
          csrfToken: patron2Csrf,
          referenceDate: "2026-10-10",
        }),
      });
      const res = await holdsPost(req);

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.queuePosition).toBe(1);
      expect(data.hold.status).toBe("WAITING");

      // Verify patron cancelling their own hold succeeds (T-17)
      const holdId = data.hold.id;
      const cancelReq = new NextRequest(`http://localhost:3000/api/holds/${holdId}/cancel`, {
        method: "POST",
        headers: {
          cookie: `${PATRON_SESSION_COOKIE}=${patron2SessionId}`,
          "Content-Type": "application/json",
          "x-csrf-token": patron2Csrf,
        },
        body: JSON.stringify({
          csrfToken: patron2Csrf,
          reason: "Cancelled by patron",
        }),
      });
      const cancelRes = await holdCancelPost(cancelReq, {
        params: Promise.resolve({ id: String(holdId) }),
      });

      expect(cancelRes.status).toBe(200);
      const cancelData = await cancelRes.json();
      expect(cancelData.success).toBe(true);
      expect(cancelData.cancelledHold.status).toBe("CANCELLED");
    });

    it("refuses cancellation when a patron tries to cancel another patron's hold", async () => {
      // Place hold as Patron 2 on Bib ID 1
      const placeReq = new NextRequest("http://localhost:3000/api/holds", {
        method: "POST",
        headers: {
          cookie: `${PATRON_SESSION_COOKIE}=${patron2SessionId}`,
          "Content-Type": "application/json",
          "x-csrf-token": patron2Csrf,
        },
        body: JSON.stringify({
          bibId: 1,
          csrfToken: patron2Csrf,
          referenceDate: "2026-10-10",
        }),
      });
      const placeRes = await holdsPost(placeReq);
      expect(placeRes.status).toBe(201);
      const placeData = await placeRes.json();
      const holdId = placeData.hold.id;

      // Attempt to cancel using Patron 1's credentials
      const cancelReq = new NextRequest(`http://localhost:3000/api/holds/${holdId}/cancel`, {
        method: "POST",
        headers: {
          cookie: `${PATRON_SESSION_COOKIE}=${patron1SessionId}`,
          "Content-Type": "application/json",
          "x-csrf-token": patron1Csrf,
        },
        body: JSON.stringify({
          csrfToken: patron1Csrf,
          reason: "Unauthorized cancellation attempt",
        }),
      });
      const cancelRes = await holdCancelPost(cancelReq, {
        params: Promise.resolve({ id: String(holdId) }),
      });

      expect([400, 403]).toContain(cancelRes.status);
    });
  });

  // Section 4: Password Change Endpoint (FR-OP-03, T-20)
  describe("4. Patron Password Change Endpoint", () => {
    it("rejects password change if new password is under 6 characters", async () => {
      const req = new NextRequest("http://localhost:3000/api/auth/change-password", {
        method: "POST",
        headers: {
          cookie: `${PATRON_SESSION_COOKIE}=${patron2SessionId}`,
          "Content-Type": "application/json",
          "x-csrf-token": patron2Csrf,
        },
        body: JSON.stringify({
          currentPassword: "2301430100062",
          newPassword: "short",
          csrfToken: patron2Csrf,
        }),
      });
      const res = await changePasswordPost(req);

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("6 characters");
    });

    it("succeeds with valid credentials and clears initial password flag (T-20)", async () => {
      const req = new NextRequest("http://localhost:3000/api/auth/change-password", {
        method: "POST",
        headers: {
          cookie: `${PATRON_SESSION_COOKIE}=${patron2SessionId}`,
          "Content-Type": "application/json",
          "x-csrf-token": patron2Csrf,
        },
        body: JSON.stringify({
          currentPassword: "2301430100062",
          newPassword: "UpdatedPriyaPassword2026",
          csrfToken: patron2Csrf,
        }),
      });
      const res = await changePasswordPost(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      // Verify in DB that mustChangePassword is false
      const [p] = await db
        .select({ mustChangePassword: schema.patrons.mustChangePassword })
        .from(schema.patrons)
        .where(eq(schema.patrons.id, 2));
      expect(p.mustChangePassword).toBe(false);
    });
  });

  // Section 5: Authorization Boundaries (Patrons Cannot Access Staff Functions)
  describe("5. Strict Authorization Boundaries for Patrons", () => {
    it("rejects Patron calling /api/circulation/issue with HTTP 403", async () => {
      const req = new NextRequest("http://localhost:3000/api/circulation/issue", {
        method: "POST",
        headers: {
          cookie: `${PATRON_SESSION_COOKIE}=${patron1SessionId}`,
          "Content-Type": "application/json",
          "x-csrf-token": patron1Csrf,
        },
        body: JSON.stringify({
          patronId: 1,
          itemId: 1,
          csrfToken: patron1Csrf,
        }),
      });
      const res = await circulationIssuePost(req);

      expect(res.status).toBe(403);
    });

    it("rejects Patron calling /api/fines/pay with HTTP 403", async () => {
      const req = new NextRequest("http://localhost:3000/api/fines/pay", {
        method: "POST",
        headers: {
          cookie: `${PATRON_SESSION_COOKIE}=${patron1SessionId}`,
          "Content-Type": "application/json",
          "x-csrf-token": patron1Csrf,
        },
        body: JSON.stringify({
          fineId: 1,
          amount: "10.00",
          paymentMethod: "CASH",
          csrfToken: patron1Csrf,
        }),
      });
      const res = await finesPayPost(req);

      expect(res.status).toBe(403);
    });

    it("rejects Patron calling /api/no-dues/issue with HTTP 403", async () => {
      const req = new NextRequest("http://localhost:3000/api/no-dues/issue", {
        method: "POST",
        headers: {
          cookie: `${PATRON_SESSION_COOKIE}=${patron1SessionId}`,
          "Content-Type": "application/json",
          "x-csrf-token": patron1Csrf,
        },
        body: JSON.stringify({
          patronId: 2,
          csrfToken: patron1Csrf,
        }),
      });
      const res = await noDuesIssuePost(req);

      expect(res.status).toBe(403);
    });
  });
});
