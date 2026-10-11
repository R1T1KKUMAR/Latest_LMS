import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";
import { POST as confirmPost } from "@/app/api/imports/confirm/route";
import { POST as patronsImportPost } from "@/app/api/imports/patrons/route";
import { POST as previewPost } from "@/app/api/imports/preview/route";
import { setTestDb } from "@/db/client";
import * as schema from "@/db/schema";
import { STAFF_SESSION_COOKIE } from "@/lib/auth";
import { loginStaff } from "@/services/auth";

describe("Phase 13: Import API Route Handlers Suite (Auth, RBAC, CSRF, Multipart)", () => {
  let pglite: PGlite;
  // biome-ignore lint/suspicious/noExplicitAny: generic DB instance
  let db: any;

  let librarianSessionId: string;
  let librarianCsrf: string;
  let asstLibSessionId: string;
  let asstLibCsrf: string;

  beforeAll(async () => {
    pglite = new PGlite();
    const migrationPath = resolve(process.cwd(), "db/migrations/0000_abnormal_the_fallen.sql");
    const migrationSql = readFileSync(migrationPath, "utf-8");
    const statements = migrationSql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await pglite.exec(statement);
    }

    db = drizzle(pglite, { schema });
    setTestDb(db);

    const { seedDatabase } = await import("@/db/seed");
    await seedDatabase(db);

    // Login Head Librarian (has PATRON_IMPORT, CATALOG_IMPORT)
    const libLogin = await loginStaff({ username: "librarian", password: "Lib@123" }, db);
    librarianSessionId = libLogin.session?.id as string;
    librarianCsrf = libLogin.session?.csrfToken as string;

    // Login Assistant Librarian (does NOT have PATRON_IMPORT or CATALOG_IMPORT)
    const asstLogin = await loginStaff({ username: "assistant", password: "Asst@123" }, db);
    asstLibSessionId = asstLogin.session?.id as string;
    asstLibCsrf = asstLogin.session?.csrfToken as string;
  });

  describe("1. POST /api/imports/preview", () => {
    it("returns 401 when unauthenticated", async () => {
      const formData = new FormData();
      formData.append("file", new Blob(["roll_no,name\n101,A"], { type: "text/csv" }), "test.csv");
      formData.append("type", "students");

      const req = new NextRequest("http://localhost:3000/api/imports/preview", {
        method: "POST",
        body: formData,
      });

      const res = await previewPost(req);
      expect(res.status).toBe(401);
    });

    it("returns 403 when user lacks PATRON_IMPORT (Assistant Librarian)", async () => {
      const formData = new FormData();
      formData.append("file", new Blob(["roll_no,name\n101,A"], { type: "text/csv" }), "test.csv");
      formData.append("type", "students");

      const req = new NextRequest("http://localhost:3000/api/imports/preview", {
        method: "POST",
        headers: {
          cookie: `${STAFF_SESSION_COOKIE}=${asstLibSessionId}`,
        },
        body: formData,
      });

      const res = await previewPost(req);
      expect(res.status).toBe(403);
    });

    it("returns 400 when no file is uploaded", async () => {
      const formData = new FormData();
      formData.append("type", "students");

      const req = new NextRequest("http://localhost:3000/api/imports/preview", {
        method: "POST",
        headers: {
          cookie: `${STAFF_SESSION_COOKIE}=${librarianSessionId}`,
        },
        body: formData,
      });

      const res = await previewPost(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("No CSV file uploaded");
    });

    it("returns 200 with preview summary for authorized librarian", async () => {
      const csv = "roll_no,first_name,last_name\n310001,Kunal,Kapoor\n310002,Pooja,Hegde";
      const formData = new FormData();
      formData.append("file", new Blob([csv], { type: "text/csv" }), "students.csv");
      formData.append("type", "students");

      const req = new NextRequest("http://localhost:3000/api/imports/preview", {
        method: "POST",
        headers: {
          cookie: `${STAFF_SESSION_COOKIE}=${librarianSessionId}`,
        },
        body: formData,
      });

      const res = await previewPost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.preview.summary.totalRows).toBe(2);
      expect(data.preview.summary.validCount).toBe(2);
    });
  });

  describe("2. POST /api/imports/confirm", () => {
    it("returns 401 when unauthenticated", async () => {
      const req = new NextRequest("http://localhost:3000/api/imports/confirm", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ type: "students" }),
      });

      const res = await confirmPost(req);
      expect(res.status).toBe(401);
    });

    it("returns 403 when CSRF token is invalid or missing", async () => {
      const req = new NextRequest("http://localhost:3000/api/imports/confirm", {
        method: "POST",
        headers: {
          cookie: `${STAFF_SESSION_COOKIE}=${librarianSessionId}`,
          "content-type": "application/json",
          "x-csrf-token": "invalid-csrf-token",
        },
        body: JSON.stringify({ type: "students", csrfToken: "invalid" }),
      });

      const res = await confirmPost(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain("CSRF");
    });

    it("returns 403 when user lacks CATALOG_IMPORT (Assistant Librarian)", async () => {
      const formData = new FormData();
      formData.append("file", new Blob(["title\nBook A"], { type: "text/csv" }), "books.csv");
      formData.append("type", "catalog");
      formData.append("csrfToken", asstLibCsrf);

      const req = new NextRequest("http://localhost:3000/api/imports/confirm", {
        method: "POST",
        headers: {
          cookie: `${STAFF_SESSION_COOKIE}=${asstLibSessionId}`,
          "x-csrf-token": asstLibCsrf,
        },
        body: formData,
      });

      const res = await confirmPost(req);
      expect(res.status).toBe(403);
    });

    it("returns 200 and commits rows for authorized librarian with valid CSRF", async () => {
      const csv = "roll_no,first_name,last_name\n320001,Ananya,Pandey";
      const formData = new FormData();
      formData.append("file", new Blob([csv], { type: "text/csv" }), "students_confirm.csv");
      formData.append("type", "students");
      formData.append("csrfToken", librarianCsrf);

      const req = new NextRequest("http://localhost:3000/api/imports/confirm", {
        method: "POST",
        headers: {
          cookie: `${STAFF_SESSION_COOKIE}=${librarianSessionId}`,
          "x-csrf-token": librarianCsrf,
        },
        body: formData,
      });

      const res = await confirmPost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.result.importedCount).toBe(1);
      expect(data.result.cardNumbers).toContain("320001");
    });
  });

  describe("3. POST /api/imports/patrons (Direct Endpoint)", () => {
    it("successfully validates and commits patron roster", async () => {
      const csv = "roll_no,first_name,last_name\n330001,Kartik,Aaryan";
      const req = new NextRequest("http://localhost:3000/api/imports/patrons", {
        method: "POST",
        headers: {
          cookie: `${STAFF_SESSION_COOKIE}=${librarianSessionId}`,
          "content-type": "application/json",
          "x-csrf-token": librarianCsrf,
        },
        body: JSON.stringify({
          csvContent: csv,
          fileName: "direct_patrons.csv",
          csrfToken: librarianCsrf,
        }),
      });

      const res = await patronsImportPost(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.result.importedCount).toBe(1);
    });
  });
});
