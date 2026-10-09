import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { seedDatabase } from "@/db/seed";
import {
  AuthenticationError,
  ForbiddenError,
  requireAuthenticatedUser,
  requirePermission,
} from "@/lib/auth";
import { hashPassword } from "@/lib/crypto";
import { validateCsrfToken } from "@/lib/csrf";
import {
  changePatronPassword,
  changeStaffPassword,
  GENERIC_PATRON_AUTH_ERROR,
  GENERIC_STAFF_AUTH_ERROR,
  loginPatron,
  loginStaff,
  logout,
} from "@/services/auth";
import { getSession } from "@/services/session";

describe("Authentication & Session Management Suite", () => {
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
    // Seed default master data, roles, permissions, staff and patrons
    await seedDatabase(db as unknown as Parameters<typeof seedDatabase>[0]);

    // Insert test cases: Inactive staff, blocked patron, expired patron
    await db.insert(schema.users).values({
      username: "inactive_staff",
      fullName: "Inactive Staff Member",
      passwordHash: hashPassword("Test@123"),
      roleId: 3, // LIBRARIAN
      libraryId: 1, // Central Library
      isActive: false, // Inactive account
    });

    await db.insert(schema.patrons).values([
      {
        cardNo: "BLOCKED001",
        rollNo: "ROLL_BLOCKED_01",
        firstName: "Blocked",
        lastName: "User",
        username: "blocked_user",
        patronType: "STUDENT",
        categoryId: 1,
        cardExpiry: "2028-12-31",
        passwordHash: hashPassword("Test@123"),
        status: "BLOCKED",
        mustChangePassword: false,
      },
      {
        cardNo: "EXPIRED001",
        rollNo: "ROLL_EXPIRED_01",
        firstName: "Expired",
        lastName: "User",
        username: "expired_user",
        patronType: "STUDENT",
        categoryId: 1,
        cardExpiry: "2020-01-01", // Past date
        passwordHash: hashPassword("Test@123"),
        status: "ACTIVE",
        mustChangePassword: false,
      },
      {
        cardNo: "TEST_PATRON_01",
        rollNo: "TEST_ROLL_01",
        firstName: "Test",
        lastName: "Patron",
        username: "test_patron_01",
        patronType: "STUDENT",
        categoryId: 1,
        cardExpiry: "2028-12-31",
        passwordHash: hashPassword("TestPatron@123"),
        status: "ACTIVE",
        mustChangePassword: true,
      },
    ]);
  });

  describe("1. Staff Login Flow (FR-AU-01, FR-AU-02, FR-AU-03)", () => {
    it("successfully logs in valid staff and returns user profile, role, permissions, and session", async () => {
      const result = await loginStaff(
        {
          username: "librarian",
          password: "Lib@123",
          ipAddress: "192.168.1.50",
        },
        db,
      );

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user?.username).toBe("librarian");
      expect(result.user?.roleCode).toBe("LIBRARIAN");
      expect(result.session).toBeDefined();
      expect(result.session?.userType).toBe("STAFF");
      expect(result.session?.csrfToken).toBeDefined();
      expect(result.permissions).toContain("CIRC_ISSUE");
      expect(result.permissions).toContain("CIRC_RETURN");
      expect(result.permissions).not.toContain("ADMIN_USERS"); // Librarian cannot manage admin users

      // Verify audit log entry
      const auditRows = await db
        .select()
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.action, "LOGIN"));
      expect(auditRows.length).toBeGreaterThanOrEqual(1);
      const lastAudit = auditRows[auditRows.length - 1];
      expect(lastAudit.actorType).toBe("STAFF");
      expect(lastAudit.ipAddress).toBe("192.168.1.50");
    });

    it("rejects invalid staff password with generic message and audits failure", async () => {
      const result = await loginStaff(
        {
          username: "admin",
          password: "WrongPassword!999",
          ipAddress: "192.168.1.100",
        },
        db,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe(GENERIC_STAFF_AUTH_ERROR);
      expect(result.session).toBeUndefined();

      // Verify failed login audit
      const auditRows = await db
        .select()
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.action, "LOGIN_FAILED"));
      const failLog = auditRows.find(
        (a: typeof schema.auditLogs.$inferSelect) => a.actorName === "admin",
      );
      expect(failLog).toBeDefined();
      expect(failLog?.actorType).toBe("STAFF");
      expect(failLog?.ipAddress).toBe("192.168.1.100");
    });

    it("rejects non-existent staff username with identical generic message and audits failure", async () => {
      const result = await loginStaff(
        {
          username: "does_not_exist",
          password: "SomePassword",
        },
        db,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe(GENERIC_STAFF_AUTH_ERROR);

      const auditRows = await db
        .select()
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.action, "LOGIN_FAILED"));
      const failLog = auditRows.find(
        (a: typeof schema.auditLogs.$inferSelect) => a.actorName === "does_not_exist",
      );
      expect(failLog).toBeDefined();
    });

    it("rejects inactive staff account with generic message and audits failure", async () => {
      const result = await loginStaff(
        {
          username: "inactive_staff",
          password: "Test@123",
          ipAddress: "10.0.0.1",
        },
        db,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe(GENERIC_STAFF_AUTH_ERROR);

      const auditRows = await db
        .select()
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.action, "LOGIN_FAILED"));
      const failLog = auditRows.find(
        (a: typeof schema.auditLogs.$inferSelect) => a.actorName === "inactive_staff",
      );
      expect(failLog).toBeDefined();
      expect(failLog?.details).toContain("Inactive");
    });
  });

  describe("2. Patron Login Flow (FR-AU-05)", () => {
    it("successfully logs in patron via roll number and returns mustChangePassword flag", async () => {
      // Rahul Kumar has rollNo = 2301430100045, password = 2301430100045, mustChangePassword = true
      const result = await loginPatron(
        {
          identifier: "2301430100045",
          password: "2301430100045",
          ipAddress: "192.168.1.75",
        },
        db,
      );

      expect(result.success).toBe(true);
      expect(result.patron).toBeDefined();
      expect(result.patron?.rollNo).toBe("2301430100045");
      expect(result.mustChangePassword).toBe(true);
      expect(result.session).toBeDefined();
      expect(result.session?.userType).toBe("PATRON");

      const auditRows = await db
        .select()
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.action, "LOGIN"));
      const patronLog = auditRows.find(
        (a: typeof schema.auditLogs.$inferSelect) => a.actorType === "PATRON",
      );
      expect(patronLog).toBeDefined();
    });

    it("allows patron login via card number, employee id, or username", async () => {
      // Login via username: test_patron_01
      const result = await loginPatron(
        {
          identifier: "test_patron_01",
          password: "TestPatron@123",
        },
        db,
      );

      expect(result.success).toBe(true);
      expect(result.patron?.cardNo).toBe("TEST_PATRON_01");
    });

    it("rejects blocked patron with generic error message and audits failure", async () => {
      const result = await loginPatron(
        {
          identifier: "BLOCKED001",
          password: "Test@123",
        },
        db,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe(GENERIC_PATRON_AUTH_ERROR);

      const auditRows = await db
        .select()
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.action, "LOGIN_FAILED"));
      const failLog = auditRows.find(
        (a: typeof schema.auditLogs.$inferSelect) => a.actorName === "BLOCKED001",
      );
      expect(failLog).toBeDefined();
    });

    it("rejects expired patron with generic error message and audits failure", async () => {
      const result = await loginPatron(
        {
          identifier: "EXPIRED001",
          password: "Test@123",
        },
        db,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe(GENERIC_PATRON_AUTH_ERROR);
    });
  });

  describe("3. Session Lifecycle & Expiration (FR-AU-06, NFR-S-04)", () => {
    it("invalidates session upon logout and audits the action", async () => {
      const loginResult = await loginStaff({ username: "librarian", password: "Lib@123" }, db);
      const sessionId = loginResult.session!.id;

      // Session is valid before logout
      const sessionBefore = await getSession(sessionId, db);
      expect(sessionBefore).toBeDefined();

      // Logout
      await logout(sessionId, "192.168.1.1", db);

      // Session is now deleted
      const sessionAfter = await getSession(sessionId, db);
      expect(sessionAfter).toBeNull();

      // Logout audit entry
      const auditRows = await db
        .select()
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.action, "LOGOUT"));
      expect(auditRows.length).toBeGreaterThanOrEqual(1);
    });

    it("automatically deletes and rejects an expired session (inactivity > 60m)", async () => {
      const loginResult = await loginStaff({ username: "librarian", password: "Lib@123" }, db);
      const sessionId = loginResult.session!.id;

      // Manually set expiration in the past (simulate 65 minutes of inactivity)
      const pastDate = new Date(Date.now() - 5 * 60 * 1000); // 5 mins ago
      await db
        .update(schema.sessions)
        .set({ expiresAt: pastDate })
        .where(eq(schema.sessions.id, sessionId));

      // Attempting to retrieve expired session
      const expiredSession = await getSession(sessionId, db);
      expect(expiredSession).toBeNull();

      // Verify row is physically purged from the sessions table
      const rows = await db.select().from(schema.sessions).where(eq(schema.sessions.id, sessionId));
      expect(rows).toHaveLength(0);
    });

    it("extends session expiration on active requests (sliding window)", async () => {
      const loginResult = await loginStaff({ username: "librarian", password: "Lib@123" }, db);
      const sessionId = loginResult.session!.id;
      const initialExpires = loginResult.session!.expiresAt.getTime();

      // Simulate passage of 100ms
      await new Promise((r) => setTimeout(r, 100));

      const activeSession = await getSession(sessionId, db);
      expect(activeSession).toBeDefined();
      expect(new Date(activeSession!.expiresAt).getTime()).toBeGreaterThanOrEqual(initialExpires);
    });
  });

  describe("4. CSRF Protection (FR-AU-07, NFR-S-04)", () => {
    it("validates identical CSRF tokens correctly", () => {
      const token = "a1b2c3d4e5f6g7h8";
      expect(validateCsrfToken(token, token)).toBe(true);
    });

    it("rejects mismatched, empty, or truncated CSRF tokens", () => {
      const token = "a1b2c3d4e5f6g7h8";
      expect(validateCsrfToken(token, "wrong_token_value")).toBe(false);
      expect(validateCsrfToken(token, "")).toBe(false);
      expect(validateCsrfToken(token, null)).toBe(false);
      expect(validateCsrfToken(token, undefined)).toBe(false);
      expect(validateCsrfToken(token, "a1b2c3d4")).toBe(false); // Different length
    });
  });

  describe("5. Authorization & Permissions (FR-AU-02, NFR-S-01, NFR-S-05)", () => {
    it("allows staff possessing the required permission", async () => {
      // Admin has ADMIN_USERS
      const adminLogin = await loginStaff({ username: "admin", password: "Admin@123" }, db);
      const context = await requirePermission("ADMIN_USERS", {
        sessionId: adminLogin.session!.id,
        db,
      });

      expect(context.user.username).toBe("admin");
      expect(context.permissions).toContain("ADMIN_USERS");
    });

    it("rejects staff lacking the required permission with HTTP 403 Forbidden and audits failure", async () => {
      // Assistant Librarian has only 9 desk permissions, lacks ADMIN_USERS
      const asstLogin = await loginStaff({ username: "assistant", password: "Asst@123" }, db);

      await expect(
        requirePermission("ADMIN_USERS", {
          sessionId: asstLogin.session!.id,
          db,
        }),
      ).rejects.toThrow(ForbiddenError);

      // Verify audit log recorded PERMISSION_DENIED
      const auditRows = await db
        .select()
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.action, "PERMISSION_DENIED"));
      expect(auditRows.length).toBeGreaterThanOrEqual(1);
      const deniedLog = auditRows[auditRows.length - 1];
      expect(deniedLog.actorName).toBe("Circulation Assistant");
      expect(deniedLog.details).toContain("ADMIN_USERS");
    });

    it("strictly separates STAFF and PATRON sessions (NFR-S-05)", async () => {
      const patronLogin = await loginPatron(
        { identifier: "TEST_PATRON_01", password: "TestPatron@123" },
        db,
      );
      const patronSessionId = patronLogin.session!.id;

      // Attempting to access staff resource with a patron session must throw AuthenticationError
      await expect(
        requireAuthenticatedUser("STAFF", {
          sessionId: patronSessionId,
          db,
        }),
      ).rejects.toThrow(AuthenticationError);

      // Staff session attempting patron-only resource must also fail
      const staffLogin = await loginStaff({ username: "librarian", password: "Lib@123" }, db);
      await expect(
        requireAuthenticatedUser("PATRON", {
          sessionId: staffLogin.session!.id,
          db,
        }),
      ).rejects.toThrow(AuthenticationError);
    });

    it("rejects unauthenticated requests without session with HTTP 401", async () => {
      await expect(
        requireAuthenticatedUser("STAFF", {
          sessionId: "non_existent_session_id",
          db,
        }),
      ).rejects.toThrow(AuthenticationError);
    });
  });

  describe("6. Password Change Flow (FR-AU-04, FR-AU-05)", () => {
    it("allows staff to change password after verifying current credentials", async () => {
      const login = await loginStaff({ username: "librarian", password: "Lib@123" }, db);
      const userId = login.user!.id;

      // 1. Wrong current password -> fails
      const failResult = await changeStaffPassword(
        {
          userId,
          currentPassword: "IncorrectPassword",
          newPassword: "BrandNewPassword@2026",
        },
        db,
      );
      expect(failResult.success).toBe(false);
      expect(failResult.error).toContain("incorrect");

      // 2. Correct current password -> succeeds
      const successResult = await changeStaffPassword(
        {
          userId,
          currentPassword: "Lib@123",
          newPassword: "BrandNewPassword@2026",
          ipAddress: "127.0.0.1",
        },
        db,
      );
      expect(successResult.success).toBe(true);

      // 3. Login with new password succeeds
      const newLogin = await loginStaff(
        { username: "librarian", password: "BrandNewPassword@2026" },
        db,
      );
      expect(newLogin.success).toBe(true);

      // 4. Login with old password fails
      const oldLogin = await loginStaff({ username: "librarian", password: "Lib@123" }, db);
      expect(oldLogin.success).toBe(false);
    });

    it("allows patron to change password and clears mustChangePassword flag", async () => {
      const patronLogin = await loginPatron(
        { identifier: "TEST_PATRON_01", password: "TestPatron@123" },
        db,
      );
      const patronId = patronLogin.patron!.id;
      expect(patronLogin.mustChangePassword).toBe(true);

      // Change password
      const changeResult = await changePatronPassword(
        {
          patronId,
          currentPassword: "TestPatron@123",
          newPassword: "RahulNewPassword@2026",
          ipAddress: "192.168.1.15",
        },
        db,
      );
      expect(changeResult.success).toBe(true);

      // Re-login: mustChangePassword must now be false
      const reLogin = await loginPatron(
        { identifier: "TEST_PATRON_01", password: "RahulNewPassword@2026" },
        db,
      );
      expect(reLogin.success).toBe(true);
      expect(reLogin.mustChangePassword).toBe(false);

      // Verify audit log
      const auditRows = await db
        .select()
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.action, "PASSWORD_CHANGE"));
      const patronLog = auditRows.find(
        (a: typeof schema.auditLogs.$inferSelect) => a.actorType === "PATRON",
      );
      expect(patronLog).toBeDefined();
    });
  });
});
