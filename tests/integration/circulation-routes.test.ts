import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";
import { GET as copyLookupGet } from "@/app/api/circulation/copy-lookup/route";
import { POST as issuePost } from "@/app/api/circulation/issue/route";
import { POST as markLostPost } from "@/app/api/circulation/mark-lost/route";
import { GET as patronLookupGet } from "@/app/api/circulation/patron-lookup/route";
import { POST as renewPost } from "@/app/api/circulation/renew/route";
import { POST as returnPost } from "@/app/api/circulation/return/route";
import { setTestDb } from "@/db/client";
import * as schema from "@/db/schema";
import { seedDatabase } from "@/db/seed";
import { STAFF_SESSION_COOKIE } from "@/lib/auth";
import { loginStaff } from "@/services/auth";

describe("Phase 8: Circulation API Route Handlers (Auth, CSRF, Permissions, Desk Operations)", () => {
  // biome-ignore lint/suspicious/noExplicitAny: generic DB instance
  let db: any;
  let pg: PGlite;

  let librarianSessionId: string;
  let librarianCsrf: string;

  let asstLibrarianSessionId: string;
  let asstLibrarianCsrf: string;

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

    const libLogin = await loginStaff({ username: "librarian", password: "Lib@123" }, db);
    librarianSessionId = libLogin.session?.id as string;
    librarianCsrf = libLogin.session?.csrfToken as string;

    const asstLogin = await loginStaff({ username: "assistant", password: "Asst@123" }, db);
    asstLibrarianSessionId = asstLogin.session?.id as string;
    asstLibrarianCsrf = asstLogin.session?.csrfToken as string;
  });

  describe("1. Patron and Copy Lookups", () => {
    it("returns 401 when unauthenticated", async () => {
      const req = new NextRequest(
        "http://localhost:3000/api/circulation/patron-lookup?term=2301430100045",
      );
      const res = await patronLookupGet(req);
      expect(res.status).toBe(401);
    });

    it("returns patron details when authenticated", async () => {
      const req = new NextRequest(
        "http://localhost:3000/api/circulation/patron-lookup?term=2301430100045",
        {
          headers: {
            cookie: `${STAFF_SESSION_COOKIE}=${asstLibrarianSessionId}`,
          },
        },
      );
      const res = await patronLookupGet(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.patron.cardNo).toBe("2301430100045");
      expect(data.patron.firstName).toBe("Rahul");
    });

    it("returns copy details by accession barcode", async () => {
      const req = new NextRequest(
        "http://localhost:3000/api/circulation/copy-lookup?term=CL000009",
        {
          headers: {
            cookie: `${STAFF_SESSION_COOKIE}=${asstLibrarianSessionId}`,
          },
        },
      );
      const res = await copyLookupGet(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.copy.accessionNo).toBe("CL000009");
      expect(data.copy.title).toBe("Database System Concepts");
    });
  });

  describe("2. Checkout (Issue)", () => {
    it("rejects issue request without valid CSRF (HTTP 403)", async () => {
      const req = new NextRequest("http://localhost:3000/api/circulation/issue", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `${STAFF_SESSION_COOKIE}=${asstLibrarianSessionId}`,
        },
        body: JSON.stringify({
          patronIdentifier: "2301430100062",
          barcodeOrAccession: "CL000009",
          csrfToken: "invalid-token",
        }),
      });
      const res = await issuePost(req);
      expect(res.status).toBe(403);
    });

    it("executes checkout successfully with valid session and CSRF (HTTP 201)", async () => {
      const req = new NextRequest("http://localhost:3000/api/circulation/issue", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": asstLibrarianCsrf,
          cookie: `${STAFF_SESSION_COOKIE}=${asstLibrarianSessionId}`,
        },
        body: JSON.stringify({
          patronIdentifier: "2301430100062",
          barcodeOrAccession: "CL000009",
        }),
      });
      const res = await issuePost(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.loanDays).toBe(14);
      expect(data.copy.status).toBe("ISSUED");
    });
  });

  describe("3. Return (Check-In)", () => {
    it("returns copy and calculates late fine (HTTP 200)", async () => {
      const req = new NextRequest("http://localhost:3000/api/circulation/return", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": asstLibrarianCsrf,
          cookie: `${STAFF_SESSION_COOKIE}=${asstLibrarianSessionId}`,
        },
        body: JSON.stringify({
          barcodeOrAccession: "CL000001", // Rahul's overdue loan in seed
        }),
      });
      const res = await returnPost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.fineAmount).toBe(24);
      expect(data.copy.status).toBe("AVAILABLE");
    });
  });

  describe("4. Renewal", () => {
    it("renews loan and extends due date (HTTP 200)", async () => {
      const req = new NextRequest("http://localhost:3000/api/circulation/renew", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": asstLibrarianCsrf,
          cookie: `${STAFF_SESSION_COOKIE}=${asstLibrarianSessionId}`,
        },
        body: JSON.stringify({
          barcodeOrAccession: "CL000009", // Priya's active loan from test #2
        }),
      });
      const res = await renewPost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.renewalCount).toBe(1);
    });
  });

  describe("5. Declare Lost Authorization (CIRC_LOST)", () => {
    it("forbids Assistant Librarian from declaring copy lost (HTTP 403 Forbidden)", async () => {
      const req = new NextRequest("http://localhost:3000/api/circulation/mark-lost", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": asstLibrarianCsrf,
          cookie: `${STAFF_SESSION_COOKIE}=${asstLibrarianSessionId}`,
        },
        body: JSON.stringify({
          barcodeOrAccession: "CL000009",
        }),
      });
      const res = await markLostPost(req);
      expect(res.status).toBe(403);
    });

    it("allows Librarian to declare copy lost and assess replacement fee (HTTP 200)", async () => {
      const req = new NextRequest("http://localhost:3000/api/circulation/mark-lost", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": librarianCsrf,
          cookie: `${STAFF_SESSION_COOKIE}=${librarianSessionId}`,
        },
        body: JSON.stringify({
          barcodeOrAccession: "CL000009",
          remarks: "Item lost in cafeteria",
        }),
      });
      const res = await markLostPost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.totalCharged).toBe(800); // 750 + 50
    });
  });
});
