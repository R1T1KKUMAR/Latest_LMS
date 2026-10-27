import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";
import { POST as adminRulesPost } from "@/app/api/admin/rules/route";
import { DELETE as adminUserDelete } from "@/app/api/admin/users/[id]/route";
import { GET as adminUsersGet, POST as adminUsersPost } from "@/app/api/admin/users/route";
import { POST as markLostPost } from "@/app/api/circulation/mark-lost/route";
import { POST as waiveFinePost } from "@/app/api/circulation/waive-fine/route";
import { setTestDb } from "@/db/client";
import * as schema from "@/db/schema";
import { seedDatabase } from "@/db/seed";
import { hashPassword } from "@/lib/crypto";
import { loginStaff } from "@/services/auth";

describe("Phase 4: RBAC Route Handlers & Unauthorized Mutation Refusals (HTTP 403)", () => {
  // biome-ignore lint/suspicious/noExplicitAny: generic DB instance
  let db: any;
  let pg: PGlite;

  let superAdminSessionId: string;
  let superAdminCsrf: string;

  let libAdminSessionId: string;
  let libAdminCsrf: string;

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

    // Create Library Admin user
    const libAdminRole = await db
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.code, "LIBRARY_ADMIN"))
      .limit(1);

    await db.insert(schema.users).values({
      username: "lib_admin_routes",
      fullName: "Route Library Admin",
      passwordHash: hashPassword("LibAdmin@123"),
      roleId: libAdminRole[0].id,
      libraryId: 1,
      isActive: true,
    });

    // Obtain sessions and CSRF tokens
    const adminLogin = await loginStaff({ username: "admin", password: "Admin@123" }, db);
    superAdminSessionId = adminLogin.session?.id as string;
    superAdminCsrf = adminLogin.session?.csrfToken as string;

    const libAdminLogin = await loginStaff(
      { username: "lib_admin_routes", password: "LibAdmin@123" },
      db,
    );
    libAdminSessionId = libAdminLogin.session?.id as string;
    libAdminCsrf = libAdminLogin.session?.csrfToken as string;

    const libLogin = await loginStaff({ username: "librarian", password: "Lib@123" }, db);
    librarianSessionId = libLogin.session?.id as string;
    librarianCsrf = libLogin.session?.csrfToken as string;

    const asstLogin = await loginStaff({ username: "assistant", password: "Asst@123" }, db);
    asstLibrarianSessionId = asstLogin.session?.id as string;
    asstLibrarianCsrf = asstLogin.session?.csrfToken as string;
  });

  describe("1. Admin Users API (ADMIN_USERS Guard)", () => {
    it("returns 200 to Super Admin when fetching staff users", async () => {
      const req = new NextRequest("http://localhost:3000/api/admin/users", {
        headers: {
          cookie: `rbmi_staff_session=${superAdminSessionId}`,
        },
      });

      const res = await adminUsersGet(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.users)).toBe(true);
    });

    it("returns 403 Forbidden when Assistant Librarian attempts to create a staff user", async () => {
      const req = new NextRequest("http://localhost:3000/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `rbmi_staff_session=${asstLibrarianSessionId}`,
          "x-csrf-token": asstLibrarianCsrf,
        },
        body: JSON.stringify({
          username: "hacked_user",
          fullName: "Hacked Account",
          password: "password123",
          roleId: 1,
          libraryId: 1,
        }),
      });

      const res = await adminUsersPost(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("ADMIN_USERS");
    });

    it("returns 403 Forbidden when Library Administrator attempts to create a staff user", async () => {
      const req = new NextRequest("http://localhost:3000/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `rbmi_staff_session=${libAdminSessionId}`,
          "x-csrf-token": libAdminCsrf,
        },
        body: JSON.stringify({
          username: "unauth_user",
          fullName: "Unauthorized Account",
          password: "password123",
          roleId: 2,
          libraryId: 1,
        }),
      });

      const res = await adminUsersPost(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("ADMIN_USERS");
    });

    it("returns 201 Created when Super Administrator creates a staff user with valid CSRF", async () => {
      const req = new NextRequest("http://localhost:3000/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `rbmi_staff_session=${superAdminSessionId}`,
          "x-csrf-token": superAdminCsrf,
        },
        body: JSON.stringify({
          username: "route_test_user",
          fullName: "Route Test User",
          password: "SecurePass@2026",
          roleId: 4, // Assistant Librarian
          libraryId: 1,
        }),
      });

      const res = await adminUsersPost(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.user.username).toBe("route_test_user");
    });

    it("returns 403 Forbidden when Assistant Librarian attempts to delete a staff user", async () => {
      const req = new NextRequest("http://localhost:3000/api/admin/users/4", {
        method: "DELETE",
        headers: {
          cookie: `rbmi_staff_session=${asstLibrarianSessionId}`,
          "x-csrf-token": asstLibrarianCsrf,
        },
      });

      const res = await adminUserDelete(req, { params: Promise.resolve({ id: "4" }) });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("ADMIN_USERS");
    });

    it("returns 403 Forbidden when Super Administrator attempts to delete with invalid CSRF token", async () => {
      const req = new NextRequest("http://localhost:3000/api/admin/users/4", {
        method: "DELETE",
        headers: {
          cookie: `rbmi_staff_session=${superAdminSessionId}`,
          "x-csrf-token": "invalid_csrf_token_value",
        },
      });

      const res = await adminUserDelete(req, { params: Promise.resolve({ id: "4" }) });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("CSRF");
    });

    it("returns 200 OK when Super Administrator deletes an unused staff user", async () => {
      const [testUser] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.username, "route_test_user"))
        .limit(1);

      expect(testUser).toBeDefined();

      const req = new NextRequest(`http://localhost:3000/api/admin/users/${testUser.id}`, {
        method: "DELETE",
        headers: {
          cookie: `rbmi_staff_session=${superAdminSessionId}`,
          "x-csrf-token": superAdminCsrf,
        },
      });

      const res = await adminUserDelete(req, {
        params: Promise.resolve({ id: String(testUser.id) }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.message).toContain("deleted successfully");

      const after = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, testUser.id))
        .limit(1);
      expect(after.length).toBe(0);
    });
  });

  describe("2. Fine Waiver & Lost Mutations (FINE_WAIVE & CIRC_LOST Guards)", () => {
    it("returns 403 Forbidden when Assistant Librarian attempts to waive fine", async () => {
      const req = new NextRequest("http://localhost:3000/api/circulation/waive-fine", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `rbmi_staff_session=${asstLibrarianSessionId}`,
          "x-csrf-token": asstLibrarianCsrf,
        },
        body: JSON.stringify({ loanId: 101, amount: 50 }),
      });

      const res = await waiveFinePost(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain("FINE_WAIVE");
    });

    it("returns 200 OK when Librarian authorizes fine waiver", async () => {
      const req = new NextRequest("http://localhost:3000/api/circulation/waive-fine", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `rbmi_staff_session=${librarianSessionId}`,
          "x-csrf-token": librarianCsrf,
        },
        body: JSON.stringify({ loanId: 101, amount: 50 }),
      });

      const res = await waiveFinePost(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.message).toBe("Fine waiver authorized");
    });

    it("returns 403 Forbidden when Assistant Librarian attempts to mark book lost", async () => {
      const req = new NextRequest("http://localhost:3000/api/circulation/mark-lost", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `rbmi_staff_session=${asstLibrarianSessionId}`,
          "x-csrf-token": asstLibrarianCsrf,
        },
        body: JSON.stringify({ loanId: 1 }),
      });

      const res = await markLostPost(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain("CIRC_LOST");
    });

    it("returns 200 OK when Librarian marks book lost", async () => {
      const req = new NextRequest("http://localhost:3000/api/circulation/mark-lost", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `rbmi_staff_session=${librarianSessionId}`,
          "x-csrf-token": librarianCsrf,
        },
        body: JSON.stringify({ loanId: 1 }),
      });

      const res = await markLostPost(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });
  });

  describe("3. Admin Rules Mutations (ADMIN_RULES Guard)", () => {
    it("returns 403 Forbidden when Librarian attempts to modify circulation rules", async () => {
      const req = new NextRequest("http://localhost:3000/api/admin/rules", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `rbmi_staff_session=${librarianSessionId}`,
          "x-csrf-token": librarianCsrf,
        },
        body: JSON.stringify({ ruleId: 1, maxBooks: 10 }),
      });

      const res = await adminRulesPost(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain("ADMIN_RULES");
    });

    it("returns 200 OK when Library Administrator updates circulation rules", async () => {
      const req = new NextRequest("http://localhost:3000/api/admin/rules", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: `rbmi_staff_session=${libAdminSessionId}`,
          "x-csrf-token": libAdminCsrf,
        },
        body: JSON.stringify({ ruleId: 1, maxBooks: 10 }),
      });

      const res = await adminRulesPost(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });
  });
});
