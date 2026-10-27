import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";
import { GET as certificateGet } from "@/app/api/no-dues/certificate/[id]/route";
import { GET as checkGet } from "@/app/api/no-dues/check/route";
import { POST as issuePost } from "@/app/api/no-dues/issue/route";
import { GET as noduesGet } from "@/app/api/no-dues/route";
import { setTestDb } from "@/db/client";
import * as schema from "@/db/schema";
import { seedDatabase } from "@/db/seed";
import { PATRON_SESSION_COOKIE, STAFF_SESSION_COOKIE } from "@/lib/auth";
import { loginPatron, loginStaff } from "@/services/auth";

describe("Phase 11: No-Dues API Route Handlers Suite (Auth, RBAC, CSRF, Liabilities)", () => {
  // biome-ignore lint/suspicious/noExplicitAny: generic DB instance
  let db: any;
  let pg: PGlite;

  let librarianSessionId: string;
  let librarianCsrf: string;

  let asstLibSessionId: string;
  let asstLibCsrf: string;

  let patronRahulSessionId: string;
  let patronRahulCsrf: string;

  let patronPriyaSessionId: string;
  let _patronPriyaCsrf: string;

  let cleanPatronId: number;

  beforeAll(async () => {
    pg = new PGlite();
    const migrationPath = path.resolve(process.cwd(), "db/migrations/0000_abnormal_the_fallen.sql");
    const migrationSql = fs.readFileSync(migrationPath, "utf8");
    const statements = migrationSql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await pg.exec(statement);
    }

    db = drizzle(pg, { schema });
    setTestDb(db);

    await seedDatabase(db);

    // Login Head Librarian (has NODUES_ISSUE)
    const libLogin = await loginStaff({ username: "librarian", password: "Lib@123" }, db);
    librarianSessionId = libLogin.session?.id as string;
    librarianCsrf = libLogin.session?.csrfToken as string;

    // Login Assistant Librarian (does NOT have NODUES_ISSUE)
    const asstLogin = await loginStaff({ username: "assistant", password: "Asst@123" }, db);
    asstLibSessionId = asstLogin.session?.id as string;
    asstLibCsrf = asstLogin.session?.csrfToken as string;

    // Login Patron Rahul (Patron ID 1) - has active loans & overdue materials
    const rahulLogin = await loginPatron(
      { identifier: "2301430100045", password: "2301430100045" },
      db,
    );
    patronRahulSessionId = rahulLogin.session?.id as string;
    patronRahulCsrf = rahulLogin.session?.csrfToken as string;

    // Login Patron Priya (Patron ID 2)
    const priyaLogin = await loginPatron(
      { identifier: "2301430100062", password: "2301430100062" },
      db,
    );
    patronPriyaSessionId = priyaLogin.session?.id as string;
    _patronPriyaCsrf = priyaLogin.session?.csrfToken as string;

    // Seed a clean student patron (no loans, no fines)
    const [cleanPatron] = await db
      .insert(schema.patrons)
      .values({
        cardNo: "CLEAN-STUDENT-01",
        patronType: "STUDENT",
        categoryId: 1,
        institutionId: 1,
        departmentId: 1,
        firstName: "Aarav",
        lastName: "Verma",
        cardExpiry: "2028-06-30",
        status: "ACTIVE",
        username: "CLEAN-STUDENT-01",
        passwordHash: "hash",
      })
      .returning();
    cleanPatronId = cleanPatron.id;
  });

  describe("1. GET /api/no-dues/check", () => {
    it("returns 401 when unauthenticated", async () => {
      const req = new NextRequest("http://localhost:3000/api/no-dues/check?cardNo=2301430100045");
      const res = await checkGet(req);
      expect(res.status).toBe(401);
    });

    it("returns 400 when identifier is missing", async () => {
      const req = new NextRequest("http://localhost:3000/api/no-dues/check", {
        headers: {
          cookie: `${STAFF_SESSION_COOKIE}=${librarianSessionId}`,
        },
      });
      const res = await checkGet(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("is required");
    });

    it("returns 404 for nonexistent patron identifier", async () => {
      const req = new NextRequest(
        "http://localhost:3000/api/no-dues/check?identifier=NONEXISTENT",
        {
          headers: {
            cookie: `${STAFF_SESSION_COOKIE}=${librarianSessionId}`,
          },
        },
      );
      const res = await checkGet(req);
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toContain("not found");
    });

    it("returns 200 with ineligibility details when staff checks patron with active loans (Rahul)", async () => {
      const req = new NextRequest(
        "http://localhost:3000/api/no-dues/check?identifier=2301430100045",
        {
          headers: {
            cookie: `${STAFF_SESSION_COOKIE}=${librarianSessionId}`,
          },
        },
      );
      const res = await checkGet(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.isEligible).toBe(false);
      expect(data.activeLoansCount).toBeGreaterThanOrEqual(1);
      expect(data.pendingLoans.length).toBeGreaterThanOrEqual(1);
      expect(data.pendingLoans[0].returnShortcutUrl).toBeDefined();
    });

    it("returns 200 with clean eligibility when staff checks clean patron", async () => {
      const req = new NextRequest(
        `http://localhost:3000/api/no-dues/check?identifier=${cleanPatronId}`,
        {
          headers: {
            cookie: `${STAFF_SESSION_COOKIE}=${librarianSessionId}`,
          },
        },
      );
      const res = await checkGet(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.isEligible).toBe(true);
      expect(data.activeLoansCount).toBe(0);
      expect(data.totalUnpaidFines).toBe(0);
      expect(data.refusalReasons.length).toBe(0);
    });

    it("allows patron to verify their own clearance status", async () => {
      const req = new NextRequest("http://localhost:3000/api/no-dues/check?identifier=irrelevant", {
        headers: {
          cookie: `${PATRON_SESSION_COOKIE}=${patronRahulSessionId}`,
        },
      });
      const res = await checkGet(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.patron.id).toBe(1);
    });
  });

  describe("2. POST /api/no-dues/issue", () => {
    it("returns 401 when unauthenticated", async () => {
      const req = new NextRequest("http://localhost:3000/api/no-dues/issue", {
        method: "POST",
        body: JSON.stringify({ patronId: cleanPatronId }),
      });
      const res = await issuePost(req);
      expect(res.status).toBe(401);
    });

    it("returns 403 on missing or invalid CSRF token", async () => {
      const req = new NextRequest("http://localhost:3000/api/no-dues/issue", {
        method: "POST",
        headers: {
          cookie: `${STAFF_SESSION_COOKIE}=${librarianSessionId}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          patronId: cleanPatronId,
          csrfToken: "bad-csrf-token",
        }),
      });
      const res = await issuePost(req);
      expect(res.status).toBe(403);
    });

    it("returns 403 when Assistant Librarian tries to issue certificate (Lacks NODUES_ISSUE permission)", async () => {
      const req = new NextRequest("http://localhost:3000/api/no-dues/issue", {
        method: "POST",
        headers: {
          cookie: `${STAFF_SESSION_COOKIE}=${asstLibSessionId}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          patronId: cleanPatronId,
          csrfToken: asstLibCsrf,
        }),
      });
      const res = await issuePost(req);
      expect(res.status).toBe(403);
    });

    it("returns 401 or 403 when Patron tries to issue certificate", async () => {
      const req = new NextRequest("http://localhost:3000/api/no-dues/issue", {
        method: "POST",
        headers: {
          cookie: `${PATRON_SESSION_COOKIE}=${patronRahulSessionId}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          patronId: cleanPatronId,
          csrfToken: patronRahulCsrf,
        }),
      });
      const res = await issuePost(req);
      expect([401, 403]).toContain(res.status);
    });

    it("returns 400 when attempting to issue clearance for patron with active liabilities", async () => {
      // Patron 1 (Rahul) has active book loans
      const req = new NextRequest("http://localhost:3000/api/no-dues/issue", {
        method: "POST",
        headers: {
          cookie: `${STAFF_SESSION_COOKIE}=${librarianSessionId}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          patronId: 1,
          csrfToken: librarianCsrf,
        }),
      });
      const res = await issuePost(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("active book loan");
    });

    it("returns 201 when Librarian issues certificate for clean patron and graduates account", async () => {
      const req = new NextRequest("http://localhost:3000/api/no-dues/issue", {
        method: "POST",
        headers: {
          cookie: `${STAFF_SESSION_COOKIE}=${librarianSessionId}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          patronId: cleanPatronId,
          closeAccount: true,
          remarks: "Convocation 2026 Clearance",
          csrfToken: librarianCsrf,
        }),
      });
      const res = await issuePost(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.certificateNo).toMatch(/^ND-\d{4}-\d{5}$/);
      expect(data.accountStatus).toBe("GRADUATED");
      expect(data.closedAccount).toBe(true);
    });

    it("returns 400 when attempting to re-issue certificate for already GRADUATED patron", async () => {
      const req = new NextRequest("http://localhost:3000/api/no-dues/issue", {
        method: "POST",
        headers: {
          cookie: `${STAFF_SESSION_COOKIE}=${librarianSessionId}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          patronId: cleanPatronId,
          csrfToken: librarianCsrf,
        }),
      });
      const res = await issuePost(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("already GRADUATED");
    });
  });

  describe("3. GET /api/no-dues/certificate/[id]", () => {
    it("returns 401 when unauthenticated", async () => {
      const params = Promise.resolve({ id: String(cleanPatronId) });
      const req = new NextRequest(`http://localhost:3000/api/no-dues/certificate/${cleanPatronId}`);
      const res = await certificateGet(req, { params });
      expect(res.status).toBe(401);
    });

    it("returns 404 for patron without clearance certificate", async () => {
      const params = Promise.resolve({ id: "4" });
      const req = new NextRequest("http://localhost:3000/api/no-dues/certificate/4", {
        headers: {
          cookie: `${STAFF_SESSION_COOKIE}=${librarianSessionId}`,
        },
      });
      const res = await certificateGet(req, { params });
      expect(res.status).toBe(404);
    });

    it("returns 200 with certificate details for staff", async () => {
      const params = Promise.resolve({ id: String(cleanPatronId) });
      const req = new NextRequest(
        `http://localhost:3000/api/no-dues/certificate/${cleanPatronId}`,
        {
          headers: {
            cookie: `${STAFF_SESSION_COOKIE}=${librarianSessionId}`,
          },
        },
      );
      const res = await certificateGet(req, { params });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.certificate.certificateNo).toMatch(/^ND-\d{4}-\d{5}$/);
      expect(data.certificate.patron.id).toBe(cleanPatronId);
      expect(data.certificate.institutionName).toContain("RBMI");
      expect(data.certificate.libraryName).toContain("RBMI Central Library");
    });

    it("returns 403 when different patron tries to view certificate", async () => {
      // Priya tries to view Aarav's certificate
      const params = Promise.resolve({ id: String(cleanPatronId) });
      const req = new NextRequest(
        `http://localhost:3000/api/no-dues/certificate/${cleanPatronId}`,
        {
          headers: {
            cookie: `${PATRON_SESSION_COOKIE}=${patronPriyaSessionId}`,
          },
        },
      );
      const res = await certificateGet(req, { params });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain("You can only view your own");
    });
  });

  describe("4. GET /api/no-dues", () => {
    it("returns 401 when unauthenticated", async () => {
      const req = new NextRequest("http://localhost:3000/api/no-dues");
      const res = await noduesGet(req);
      expect(res.status).toBe(401);
    });

    it("returns 403 when Assistant Librarian calls without NODUES_ISSUE permission", async () => {
      const req = new NextRequest("http://localhost:3000/api/no-dues", {
        headers: {
          cookie: `${STAFF_SESSION_COOKIE}=${asstLibSessionId}`,
        },
      });
      const res = await noduesGet(req);
      expect(res.status).toBe(403);
    });

    it("returns 200 with recent clearances list for Librarian", async () => {
      const req = new NextRequest("http://localhost:3000/api/no-dues", {
        headers: {
          cookie: `${STAFF_SESSION_COOKIE}=${librarianSessionId}`,
        },
      });
      const res = await noduesGet(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.clearances)).toBe(true);
      expect(data.clearances.length).toBeGreaterThanOrEqual(1);
    });
  });
});
