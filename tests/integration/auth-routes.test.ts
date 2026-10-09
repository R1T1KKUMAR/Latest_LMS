import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";
import { POST as changePasswordRoute } from "@/app/api/auth/change-password/route";
import { POST as logoutRoute } from "@/app/api/auth/logout/route";
import { GET as meRoute } from "@/app/api/auth/me/route";
import { POST as patronLoginRoute } from "@/app/api/auth/patron/login/route";
import { POST as staffLoginRoute } from "@/app/api/auth/staff/login/route";
import { POST as testPermissionRoute } from "@/app/api/auth/test-permission/route";
import { setTestDb } from "@/db/client";
import * as schema from "@/db/schema";
import { seedDatabase } from "@/db/seed";
import { PATRON_SESSION_COOKIE, STAFF_SESSION_COOKIE } from "@/lib/auth";

describe("Authentication Route Handlers (HTTP APIs)", () => {
  // biome-ignore lint/suspicious/noExplicitAny: Generic database instance support for testing
  let db: any;
  let pg: PGlite;

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
    await seedDatabase(db as unknown as Parameters<typeof seedDatabase>[0]);

    // Set test db globally so route handlers using defaultDb connect to this in-memory instance
    setTestDb(db);
  });

  it("POST /api/auth/staff/login sets HttpOnly cookie and returns permissions and CSRF token", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/staff/login", {
      method: "POST",
      body: JSON.stringify({
        username: "admin",
        password: "Admin@123",
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    const res = await staffLoginRoute(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.user.username).toBe("admin");
    expect(body.csrfToken).toBeDefined();
    expect(body.permissions).toContain("ADMIN_USERS");

    // Verify HttpOnly cookie header
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toBeDefined();
    expect(setCookie).toContain(STAFF_SESSION_COOKIE);
    expect(setCookie).toContain("HttpOnly");
  });

  it("POST /api/auth/staff/login returns 401 with generic message on wrong password", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/staff/login", {
      method: "POST",
      body: JSON.stringify({
        username: "admin",
        password: "WrongPassword999",
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    const res = await staffLoginRoute(req);
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toBe("Invalid username or password");
  });

  it("POST /api/auth/patron/login sets HttpOnly cookie and returns mustChangePassword flag", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/patron/login", {
      method: "POST",
      body: JSON.stringify({
        identifier: "2301430100045",
        password: "2301430100045",
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    const res = await patronLoginRoute(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.patron.cardNo).toBe("2301430100045");
    expect(body.mustChangePassword).toBe(true);
    expect(body.csrfToken).toBeDefined();

    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toBeDefined();
    expect(setCookie).toContain(PATRON_SESSION_COOKIE);
    expect(setCookie).toContain("HttpOnly");
  });

  it("POST /api/auth/patron/login returns 401 on wrong password", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/patron/login", {
      method: "POST",
      body: JSON.stringify({
        identifier: "2301430100045",
        password: "BadPassword",
      }),
      headers: {
        "content-type": "application/json",
      },
    });

    const res = await patronLoginRoute(req);
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toBe("Invalid credentials");
  });
});
