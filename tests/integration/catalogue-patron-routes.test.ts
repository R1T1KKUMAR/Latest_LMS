import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";
import { PATCH as copyPatch } from "@/app/api/catalogue/copies/[id]/route";
import { POST as copyAddPost } from "@/app/api/catalogue/titles/[id]/copies/route";
import { GET as titleGet, PATCH as titlePatch } from "@/app/api/catalogue/titles/[id]/route";
import { GET as titlesGet, POST as titlesPost } from "@/app/api/catalogue/titles/route";
import { POST as patronResetPasswordPost } from "@/app/api/patrons/[id]/reset-password/route";
import { GET as patronGet, PATCH as patronPatch } from "@/app/api/patrons/[id]/route";
import { PATCH as patronStatusPatch } from "@/app/api/patrons/[id]/status/route";
import { GET as patronsGet, POST as patronsPost } from "@/app/api/patrons/route";
import { setTestDb } from "@/db/client";
import * as schema from "@/db/schema";
import { seedDatabase } from "@/db/seed";
import { loginStaff } from "@/services/auth";

describe("Phase 6: Catalogue & Patron Route Handlers Authorization (HTTP 403, 401, 200, 201)", () => {
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

  describe("1. Catalogue Endpoints Authorization", () => {
    it("allows Assistant Librarian to view titles (CATALOG_VIEW -> HTTP 200)", async () => {
      const req = new NextRequest("http://localhost:3000/api/catalogue/titles", {
        headers: {
          cookie: `rbmi_staff_session=${asstLibrarianSessionId}`,
        },
      });

      const res = await titlesGet(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.records)).toBe(true);
    });

    it("allows Assistant Librarian to view individual title details (CATALOG_VIEW -> HTTP 200)", async () => {
      const req = new NextRequest("http://localhost:3000/api/catalogue/titles/1", {
        headers: {
          cookie: `rbmi_staff_session=${asstLibrarianSessionId}`,
        },
      });

      const res = await titleGet(req, { params: Promise.resolve({ id: "1" }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.title.id).toBe(1);
    });

    it("refuses Assistant Librarian from creating title (CATALOG_MANAGE missing -> HTTP 403)", async () => {
      const req = new NextRequest("http://localhost:3000/api/catalogue/titles", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": asstLibrarianCsrf,
          cookie: `rbmi_staff_session=${asstLibrarianSessionId}`,
        },
        body: JSON.stringify({
          title: "Forbidden Title",
          itemTypeId: 1,
        }),
      });

      const res = await titlesPost(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain("Forbidden");
    });

    it("refuses Assistant Librarian from adding copies (CATALOG_MANAGE missing -> HTTP 403)", async () => {
      const req = new NextRequest("http://localhost:3000/api/catalogue/titles/1/copies", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": asstLibrarianCsrf,
          cookie: `rbmi_staff_session=${asstLibrarianSessionId}`,
        },
        body: JSON.stringify({
          count: 2,
        }),
      });

      const res = await copyAddPost(req, { params: Promise.resolve({ id: "1" }) });
      expect(res.status).toBe(403);
    });

    it("refuses Assistant Librarian from updating copy status (CATALOG_MANAGE missing -> HTTP 403)", async () => {
      const req = new NextRequest("http://localhost:3000/api/catalogue/copies/1", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": asstLibrarianCsrf,
          cookie: `rbmi_staff_session=${asstLibrarianSessionId}`,
        },
        body: JSON.stringify({
          status: "DAMAGED",
        }),
      });

      const res = await copyPatch(req, { params: Promise.resolve({ id: "1" }) });
      expect(res.status).toBe(403);
    });

    it("allows Librarian with CATALOG_MANAGE to create title (HTTP 201)", async () => {
      const req = new NextRequest("http://localhost:3000/api/catalogue/titles", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": librarianCsrf,
          cookie: `rbmi_staff_session=${librarianSessionId}`,
        },
        body: JSON.stringify({
          title: "Operating System Concepts",
          authors: "Abraham Silberschatz, Peter B. Galvin, Greg Gagne",
          isbn: "978-1118063330",
          edition: "9th",
          pubYear: 2012,
          publisher: "Wiley",
          itemTypeId: 1,
        }),
      });

      const res = await titlesPost(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.title.title).toBe("Operating System Concepts");
    });

    it("refuses mutating request without CSRF token (HTTP 403)", async () => {
      const req = new NextRequest("http://localhost:3000/api/catalogue/titles", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `rbmi_staff_session=${librarianSessionId}`,
        },
        body: JSON.stringify({
          title: "CSRF Attack Attempt",
          itemTypeId: 1,
        }),
      });

      const res = await titlesPost(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain("CSRF");
    });
  });

  describe("2. Patron Endpoints Authorization", () => {
    it("allows Assistant Librarian to view patrons (PATRON_VIEW -> HTTP 200)", async () => {
      const req = new NextRequest("http://localhost:3000/api/patrons", {
        headers: {
          cookie: `rbmi_staff_session=${asstLibrarianSessionId}`,
        },
      });

      const res = await patronsGet(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.records)).toBe(true);
    });

    it("allows Assistant Librarian to view patron profile details (PATRON_VIEW -> HTTP 200)", async () => {
      const req = new NextRequest("http://localhost:3000/api/patrons/1", {
        headers: {
          cookie: `rbmi_staff_session=${asstLibrarianSessionId}`,
        },
      });

      const res = await patronGet(req, { params: Promise.resolve({ id: "1" }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.patron.id).toBe(1);
    });

    it("refuses Assistant Librarian from registering patron (PATRON_MANAGE missing -> HTTP 403)", async () => {
      const req = new NextRequest("http://localhost:3000/api/patrons", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": asstLibrarianCsrf,
          cookie: `rbmi_staff_session=${asstLibrarianSessionId}`,
        },
        body: JSON.stringify({
          patronType: "STUDENT",
          categoryId: 1,
          rollNo: "UNAUTH_ROLL",
          firstName: "Unauthorized",
          lastName: "Patron",
        }),
      });

      const res = await patronsPost(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain("Forbidden");
    });

    it("refuses Assistant Librarian from updating patron profile (PATRON_MANAGE missing -> HTTP 403)", async () => {
      const req = new NextRequest("http://localhost:3000/api/patrons/1", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": asstLibrarianCsrf,
          cookie: `rbmi_staff_session=${asstLibrarianSessionId}`,
        },
        body: JSON.stringify({
          mobile: "9999999999",
        }),
      });

      const res = await patronPatch(req, { params: Promise.resolve({ id: "1" }) });
      expect(res.status).toBe(403);
    });

    it("refuses Assistant Librarian from changing patron status (PATRON_MANAGE missing -> HTTP 403)", async () => {
      const req = new NextRequest("http://localhost:3000/api/patrons/1/status", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": asstLibrarianCsrf,
          cookie: `rbmi_staff_session=${asstLibrarianSessionId}`,
        },
        body: JSON.stringify({
          status: "BLOCKED",
          reason: "Unauthorized attempt",
        }),
      });

      const res = await patronStatusPatch(req, { params: Promise.resolve({ id: "1" }) });
      expect(res.status).toBe(403);
    });

    it("refuses Assistant Librarian from resetting patron password (PATRON_MANAGE missing -> HTTP 403)", async () => {
      const req = new NextRequest("http://localhost:3000/api/patrons/1/reset-password", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": asstLibrarianCsrf,
          cookie: `rbmi_staff_session=${asstLibrarianSessionId}`,
        },
      });

      const res = await patronResetPasswordPost(req, { params: Promise.resolve({ id: "1" }) });
      expect(res.status).toBe(403);
    });

    it("allows Librarian with PATRON_MANAGE to register patron (HTTP 201)", async () => {
      const req = new NextRequest("http://localhost:3000/api/patrons", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": librarianCsrf,
          cookie: `rbmi_staff_session=${librarianSessionId}`,
        },
        body: JSON.stringify({
          patronType: "STUDENT",
          categoryId: 1,
          institutionId: 1,
          departmentId: 1,
          courseId: 1,
          rollNo: "21CS099",
          firstName: "Rohan",
          lastName: "Mehta",
          email: "rohan.mehta@rbmi.in",
          mobile: "9876543299",
          academicYear: 2021,
          semester: 5,
        }),
      });

      const res = await patronsPost(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.patron.cardNo).toBe("21CS099");
    });
  });
});
