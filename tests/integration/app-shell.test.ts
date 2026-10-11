import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFileSync } from "fs";
import { resolve } from "path";
import { beforeAll, describe, expect, it } from "vitest";
import { setTestDb } from "@/db/client";
import * as schema from "@/db/schema";
import { getCurrentSession, requirePageAuth } from "@/lib/auth";
import { loginPatron, loginStaff } from "@/services/auth";

describe("Phase 5: Application Shell & Route Guards Verification", () => {
  let pglite: PGlite;
  // biome-ignore lint/suspicious/noExplicitAny: test db instance
  let db: any;

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

  it("1. Unauthenticated request to requirePageAuth returns status 401", async () => {
    const result = await requirePageAuth("DASHBOARD_VIEW", { db, sessionId: undefined });
    expect(result.authorized).toBe(false);
    if (!result.authorized) {
      expect(result.status).toBe(401);
      expect(result.message).toContain("Please sign in with your staff credentials");
    }
  });

  it("2. Super Admin satisfies all shell page permissions", async () => {
    const authResult = await loginStaff({ username: "admin", password: "Admin@123" }, db);
    expect(authResult.success).toBe(true);
    const sessionId = authResult.session?.id;
    expect(sessionId).toBeDefined();

    const pagesToTest = [
      { page: "/dashboard", perm: "DASHBOARD_VIEW" },
      { page: "/circulation", perm: ["CIRC_ISSUE", "CIRC_RETURN", "CIRC_RENEW"] },
      { page: "/catalogue", perm: "CATALOG_VIEW" },
      { page: "/patrons", perm: "PATRON_VIEW" },
      { page: "/reservations", perm: "HOLD_MANAGE" },
      { page: "/fines", perm: ["FINE_COLLECT", "FINE_WAIVE"] },
      { page: "/no-dues", perm: "NODUES_ISSUE" },
      { page: "/reports", perm: "REPORT_VIEW" },
      { page: "/import", perm: ["PATRON_IMPORT", "CATALOG_IMPORT"] },
      {
        page: "/admin",
        perm: ["ADMIN_RULES", "ADMIN_SETTINGS", "ADMIN_MASTERS", "AUDIT_VIEW", "ADMIN_USERS"],
      },
      { page: "/admin/users", perm: "ADMIN_USERS" },
    ];

    for (const { page, perm } of pagesToTest) {
      const guardResult = await requirePageAuth(perm, { db, sessionId });
      expect(guardResult.authorized, `Super Admin should have access to ${page}`).toBe(true);
    }
  });

  it("3. Assistant Librarian is authorized for circulation desk and dashboard", async () => {
    const authResult = await loginStaff({ username: "assistant", password: "Asst@123" }, db);
    expect(authResult.success).toBe(true);
    const sessionId = authResult.session?.id;

    // Allowed pages
    const circResult = await requirePageAuth(["CIRC_ISSUE", "CIRC_RETURN", "CIRC_RENEW"], {
      db,
      sessionId,
    });
    expect(circResult.authorized).toBe(true);

    const dashResult = await requirePageAuth("DASHBOARD_VIEW", { db, sessionId });
    expect(dashResult.authorized).toBe(true);
  });

  it("4. Assistant Librarian is refused access (HTTP 403) to Super Admin area (ADMIN_USERS)", async () => {
    const authResult = await loginStaff({ username: "assistant", password: "Asst@123" }, db);
    expect(authResult.success).toBe(true);
    const sessionId = authResult.session?.id;

    const guardResult = await requirePageAuth("ADMIN_USERS", { db, sessionId });
    expect(guardResult.authorized).toBe(false);
    if (!guardResult.authorized) {
      expect(guardResult.status).toBe(403);
      expect(guardResult.message).toContain("Access Denied");
      expect(guardResult.context?.user.roleCode).toBe("ASSISTANT_LIBRARIAN");
    }
  });

  it("5. Assistant Librarian is refused access (HTTP 403) to No-Dues Clearance (NODUES_ISSUE)", async () => {
    const authResult = await loginStaff({ username: "assistant", password: "Asst@123" }, db);
    expect(authResult.success).toBe(true);
    const sessionId = authResult.session?.id;

    const guardResult = await requirePageAuth("NODUES_ISSUE", { db, sessionId });
    expect(guardResult.authorized).toBe(false);
    if (!guardResult.authorized) {
      expect(guardResult.status).toBe(403);
      expect(guardResult.message).toContain("NODUES_ISSUE");
    }
  });

  it("6. Patron session separation: getCurrentSession('PATRON') returns null for unauthenticated guests", async () => {
    const patronSession = await getCurrentSession("PATRON", { db, sessionId: undefined });
    expect(patronSession).toBeNull();
  });

  it("7. Patron session cannot satisfy requirePageAuth staff guard", async () => {
    const patronAuth = await loginPatron(
      { identifier: "2301430100045", password: "2301430100045" },
      db,
    );
    expect(patronAuth.success).toBe(true);
    const patronSessionId = patronAuth.session?.id;

    // A patron session must be rejected by staff guard with status 403 or 401
    const guardResult = await requirePageAuth("DASHBOARD_VIEW", { db, sessionId: patronSessionId });
    expect(guardResult.authorized).toBe(false);
    if (!guardResult.authorized) {
      expect([401, 403]).toContain(guardResult.status);
    }
  });
});
