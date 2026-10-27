import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { setTestDb } from "@/db/client";
import * as schema from "@/db/schema";
import { seedDatabase } from "@/db/seed";
import { ForbiddenError, requirePageAuth, requirePermission } from "@/lib/auth";
import { hashPassword } from "@/lib/crypto";
import { loginStaff } from "@/services/auth";
import { getSession } from "@/services/session";
import {
  createStaffUser,
  deleteStaffUser,
  getRolesWithPermissions,
  getStaffUserById,
  listStaffUsers,
  resetStaffUserPassword,
  updateStaffUser,
} from "@/services/user";
import {
  ALL_PERMISSIONS,
  type PermissionCode,
  ROLE_PERMISSIONS_MATRIX,
  type RoleCode,
} from "@/types/auth";

describe("Phase 4: RBAC & Permission Matrix Verification Suite", () => {
  // biome-ignore lint/suspicious/noExplicitAny: generic DB instance
  let db: any;
  let pg: PGlite;

  let superAdminSessionId: string;
  let libAdminSessionId: string;
  let librarianSessionId: string;
  let asstLibrarianSessionId: string;

  let superAdminUserId: number;
  let _libAdminUserId: number;
  let librarianUserId: number;
  let asstLibrarianUserId: number;

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

    // Apply baseline seed data (creates roles, permissions, matrix, and 3 default staff users)
    await seedDatabase(db);

    // Get Library Admin role ID
    const libAdminRole = await db
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.code, "LIBRARY_ADMIN"))
      .limit(1);

    // Insert dedicated Library Admin staff user for testing
    const [libAdminUser] = await db
      .insert(schema.users)
      .values({
        username: "lib_admin",
        fullName: "Library Administrator",
        passwordHash: hashPassword("LibAdmin@123"),
        roleId: libAdminRole[0].id,
        libraryId: 1,
        isActive: true,
      })
      .returning();

    _libAdminUserId = libAdminUser.id;

    // Log in all 4 roles to obtain active authenticated sessions
    const adminLogin = await loginStaff({ username: "admin", password: "Admin@123" }, db);
    superAdminSessionId = adminLogin.session?.id as string;
    superAdminUserId = adminLogin.user?.id as number;

    const libAdminLogin = await loginStaff({ username: "lib_admin", password: "LibAdmin@123" }, db);
    libAdminSessionId = libAdminLogin.session?.id as string;

    const libLogin = await loginStaff({ username: "librarian", password: "Lib@123" }, db);
    librarianSessionId = libLogin.session?.id as string;
    librarianUserId = libLogin.user?.id as number;

    const asstLogin = await loginStaff({ username: "assistant", password: "Asst@123" }, db);
    asstLibrarianSessionId = asstLogin.session?.id as string;
    asstLibrarianUserId = asstLogin.user?.id as number;
  });

  describe("1. Complete Role & Permission Matrix Verification (SRS §10.3)", () => {
    it("Super Administrator holds all 21 permissions with 0 denials", async () => {
      for (const permission of ALL_PERMISSIONS) {
        const result = await requirePermission(permission, {
          sessionId: superAdminSessionId,
          db,
        });
        expect(result.permissions).toContain(permission);
        expect(result.user.roleCode).toBe("SUPER_ADMIN");
      }
    });

    it("Library Administrator holds exactly 20 permissions and is refused ADMIN_USERS", async () => {
      const allowed = ROLE_PERMISSIONS_MATRIX.LIBRARY_ADMIN;
      expect(allowed.length).toBe(20);

      // Verify all 20 allowed permissions succeed
      for (const permission of allowed) {
        const result = await requirePermission(permission, {
          sessionId: libAdminSessionId,
          db,
        });
        expect(result.permissions).toContain(permission);
      }

      // Verify ADMIN_USERS throws ForbiddenError (403)
      await expect(
        requirePermission("ADMIN_USERS", {
          sessionId: libAdminSessionId,
          db,
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it("Librarian holds exactly 16 permissions and is refused all ADMIN_* and AUDIT_VIEW", async () => {
      const allowed = ROLE_PERMISSIONS_MATRIX.LIBRARIAN;
      expect(allowed.length).toBe(16);

      // 16 allowed operations succeed
      for (const permission of allowed) {
        const result = await requirePermission(permission, {
          sessionId: librarianSessionId,
          db,
        });
        expect(result.permissions).toContain(permission);
      }

      // 5 admin operations refuse with 403
      const forbiddenForLibrarian: PermissionCode[] = [
        "ADMIN_RULES",
        "ADMIN_SETTINGS",
        "ADMIN_MASTERS",
        "AUDIT_VIEW",
        "ADMIN_USERS",
      ];

      for (const permission of forbiddenForLibrarian) {
        await expect(
          requirePermission(permission, {
            sessionId: librarianSessionId,
            db,
          }),
        ).rejects.toThrow(ForbiddenError);
      }
    });

    it("Assistant Librarian holds exactly 9 desk permissions and is refused all other 12", async () => {
      const allowed = ROLE_PERMISSIONS_MATRIX.ASSISTANT_LIBRARIAN;
      expect(allowed.length).toBe(9);

      // 9 desk operations succeed
      for (const permission of allowed) {
        const result = await requirePermission(permission, {
          sessionId: asstLibrarianSessionId,
          db,
        });
        expect(result.permissions).toContain(permission);
      }

      // 12 back-office / admin operations refuse with 403
      const forbiddenForAssistant = ALL_PERMISSIONS.filter((p) => !allowed.includes(p));
      expect(forbiddenForAssistant.length).toBe(12);

      for (const permission of forbiddenForAssistant) {
        await expect(
          requirePermission(permission, {
            sessionId: asstLibrarianSessionId,
            db,
          }),
        ).rejects.toThrow(ForbiddenError);
      }
    });

    it("verifies that database roles and role_permissions match the SRS matrix", async () => {
      const matrixFromDb = await getRolesWithPermissions(db);
      expect(matrixFromDb.length).toBe(4);

      for (const roleEntry of matrixFromDb) {
        const expectedPermissions = ROLE_PERMISSIONS_MATRIX[roleEntry.code as RoleCode];
        expect(expectedPermissions).toBeDefined();
        expect(roleEntry.permissions.length).toBe(expectedPermissions.length);
        expect(roleEntry.permissions.sort()).toEqual([...expectedPermissions].sort());
      }
    });
  });

  describe("2. Audit Logging on Permission Refusal (FR-AU-02, NFR-S-01, FR-AT-01)", () => {
    it("logs PERMISSION_DENIED to audit_logs when Assistant Librarian attempts unpermitted action", async () => {
      try {
        await requirePermission("FINE_WAIVE", {
          sessionId: asstLibrarianSessionId,
          db,
        });
      } catch (e) {
        expect(e).toBeInstanceOf(ForbiddenError);
      }

      const logs = await db
        .select()
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.action, "PERMISSION_DENIED"));

      const waiverDeniedLog = logs.find(
        (l: typeof schema.auditLogs.$inferSelect) =>
          l.actorId === asstLibrarianUserId && l.details?.includes("FINE_WAIVE"),
      );

      expect(waiverDeniedLog).toBeDefined();
      expect(waiverDeniedLog?.actorName).toBe("Circulation Assistant");
      expect(waiverDeniedLog?.entity).toBe("permissions");
    });
  });

  describe("3. Server Component Page Authorization Guard (requirePageAuth)", () => {
    it("grants page access to Super Admin for ADMIN_USERS", async () => {
      const auth = await requirePageAuth("ADMIN_USERS", {
        sessionId: superAdminSessionId,
        db,
      });

      expect(auth.authorized).toBe(true);
      if (auth.authorized) {
        expect(auth.context.user.roleCode).toBe("SUPER_ADMIN");
      }
    });

    it("refuses page access (HTTP 403) to Library Admin for ADMIN_USERS", async () => {
      const auth = await requirePageAuth("ADMIN_USERS", {
        sessionId: libAdminSessionId,
        db,
      });

      expect(auth.authorized).toBe(false);
      if (!auth.authorized) {
        expect(auth.status).toBe(403);
        expect(auth.message).toContain("ADMIN_USERS");
      }
    });

    it("refuses page access (HTTP 403) to Assistant Librarian for ADMIN_USERS", async () => {
      const auth = await requirePageAuth("ADMIN_USERS", {
        sessionId: asstLibrarianSessionId,
        db,
      });

      expect(auth.authorized).toBe(false);
      if (!auth.authorized) {
        expect(auth.status).toBe(403);
      }
    });

    it("refuses page access (HTTP 401) when no session is present", async () => {
      const auth = await requirePageAuth("ADMIN_USERS", {
        sessionId: "non-existent-session-id",
        db,
      });

      expect(auth.authorized).toBe(false);
      if (!auth.authorized) {
        expect(auth.status).toBe(401);
      }
    });
  });

  describe("4. Staff User Administration Service (FR-AU-04, UC-11)", () => {
    let createdStaffId: number;

    it("allows Super Administrator to list all staff accounts", async () => {
      const staffList = await listStaffUsers(db);
      expect(staffList.length).toBeGreaterThanOrEqual(4);
      expect(staffList.some((u) => u.username === "admin")).toBe(true);
      expect(staffList.some((u) => u.username === "librarian")).toBe(true);
      expect(staffList.some((u) => u.username === "assistant")).toBe(true);
      expect(staffList.some((u) => u.username === "lib_admin")).toBe(true);
    });

    it("allows Super Administrator to create a new staff account with Argon2id hash", async () => {
      const asstRole = await db
        .select()
        .from(schema.roles)
        .where(eq(schema.roles.code, "ASSISTANT_LIBRARIAN"))
        .limit(1);

      const createResult = await createStaffUser(
        {
          username: "new_desk_assistant",
          fullName: "Priya Sharma",
          password: "SecurePass@2026",
          roleId: asstRole[0].id,
          libraryId: 1,
        },
        {
          actorId: superAdminUserId,
          actorName: "Super Administrator",
          ipAddress: "127.0.0.1",
        },
        db,
      );

      expect(createResult.success).toBe(true);
      expect(createResult.user).toBeDefined();
      expect(createResult.user?.username).toBe("new_desk_assistant");
      expect(createResult.user?.roleCode).toBe("ASSISTANT_LIBRARIAN");
      expect(createResult.user?.isActive).toBe(true);

      createdStaffId = createResult.user?.id as number;

      // Verify audit log for staff creation
      const auditLogs = await db
        .select()
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.action, "STAFF_USER_CREATED"));
      const creationLog = auditLogs.find(
        (a: typeof schema.auditLogs.$inferSelect) => a.entityId === String(createdStaffId),
      );
      expect(creationLog).toBeDefined();

      // Test login with new credentials
      const loginResult = await loginStaff(
        { username: "new_desk_assistant", password: "SecurePass@2026" },
        db,
      );
      expect(loginResult.success).toBe(true);
    });

    it("prevents creating a staff account with duplicate username", async () => {
      const result = await createStaffUser(
        {
          username: "admin",
          fullName: "Duplicate Admin",
          password: "Admin@123",
          roleId: 1,
          libraryId: 1,
        },
        {
          actorId: superAdminUserId,
          actorName: "Super Administrator",
        },
        db,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("already in use");
    });

    it("allows Super Administrator to update staff account profile and role", async () => {
      const libRole = await db
        .select()
        .from(schema.roles)
        .where(eq(schema.roles.code, "LIBRARIAN"))
        .limit(1);

      const updateResult = await updateStaffUser(
        createdStaffId,
        {
          fullName: "Priya Sharma (Promoted)",
          roleId: libRole[0].id,
        },
        {
          actorId: superAdminUserId,
          actorName: "Super Administrator",
        },
        db,
      );

      expect(updateResult.success).toBe(true);
      expect(updateResult.user?.fullName).toBe("Priya Sharma (Promoted)");
      expect(updateResult.user?.roleCode).toBe("LIBRARIAN");
    });

    it("deactivating a staff account immediately invalidates their active sessions", async () => {
      // 1. Log in the staff account
      const login = await loginStaff(
        { username: "new_desk_assistant", password: "SecurePass@2026" },
        db,
      );
      expect(login.success).toBe(true);
      const activeSessionId = login.session?.id as string;

      // Verify session exists
      const sessionBefore = await getSession(activeSessionId, db);
      expect(sessionBefore).toBeDefined();

      // 2. Super Admin deactivates the account
      const deactResult = await updateStaffUser(
        createdStaffId,
        { isActive: false },
        {
          actorId: superAdminUserId,
          actorName: "Super Administrator",
        },
        db,
      );
      expect(deactResult.success).toBe(true);
      expect(deactResult.user?.isActive).toBe(false);

      // 3. Verify session was invalidated immediately
      const sessionAfter = await getSession(activeSessionId, db);
      expect(sessionAfter).toBeNull();

      // 4. Verify login is blocked
      const loginAttempt = await loginStaff(
        { username: "new_desk_assistant", password: "SecurePass@2026" },
        db,
      );
      expect(loginAttempt.success).toBe(false);
    });

    it("allows Super Administrator to reset password of any staff account and enforces session invalidation", async () => {
      // Re-activate user first
      await updateStaffUser(
        createdStaffId,
        { isActive: true },
        { actorId: superAdminUserId, actorName: "Super Administrator" },
        db,
      );

      // Log in to create a session
      const login = await loginStaff(
        { username: "new_desk_assistant", password: "SecurePass@2026" },
        db,
      );
      const preResetSessionId = login.session?.id as string;

      // Super Admin resets password
      const resetResult = await resetStaffUserPassword(
        createdStaffId,
        "BrandNewPassword@2026",
        {
          actorId: superAdminUserId,
          actorName: "Super Administrator",
        },
        db,
      );
      expect(resetResult.success).toBe(true);

      // Verify previous session is destroyed
      const sessionCheck = await getSession(preResetSessionId, db);
      expect(sessionCheck).toBeNull();

      // Verify login with old password fails
      const oldLogin = await loginStaff(
        { username: "new_desk_assistant", password: "SecurePass@2026" },
        db,
      );
      expect(oldLogin.success).toBe(false);

      // Verify login with new password succeeds
      const newLogin = await loginStaff(
        { username: "new_desk_assistant", password: "BrandNewPassword@2026" },
        db,
      );
      expect(newLogin.success).toBe(true);
    });

    it("prohibits self-deletion of an account", async () => {
      const result = await deleteStaffUser(
        superAdminUserId,
        { actorId: superAdminUserId, actorName: "System Administrator" },
        db,
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("cannot delete your own account");
    });

    it("prohibits deleting the primary Super Administrator account", async () => {
      const result = await deleteStaffUser(
        superAdminUserId,
        { actorId: librarianUserId, actorName: "Head Librarian" },
        db,
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("primary Super Administrator");
    });

    it("blocks deletion of a staff account with linked circulation transactions", async () => {
      const result = await deleteStaffUser(
        librarianUserId,
        { actorId: superAdminUserId, actorName: "System Administrator" },
        db,
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain("issued loans");
    });

    it("allows Super Administrator to delete an unused staff account", async () => {
      // Create an active session for createdStaffId
      const login = await loginStaff(
        { username: "new_desk_assistant", password: "BrandNewPassword@2026" },
        db,
      );
      expect(login.success).toBe(true);
      const sessionId = login.session?.id as string;

      const deleteResult = await deleteStaffUser(
        createdStaffId,
        { actorId: superAdminUserId, actorName: "System Administrator" },
        db,
      );
      expect(deleteResult.success).toBe(true);

      // Verify user is gone
      const user = await getStaffUserById(createdStaffId, db);
      expect(user).toBeNull();

      // Verify sessions are invalidated
      const sessionAfter = await getSession(sessionId, db);
      expect(sessionAfter).toBeNull();

      // Verify login is impossible
      const relogin = await loginStaff(
        { username: "new_desk_assistant", password: "BrandNewPassword@2026" },
        db,
      );
      expect(relogin.success).toBe(false);

      // Verify audit log entry exists
      const audit = await db
        .select()
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.action, "STAFF_USER_DELETED"));
      expect(audit.length).toBeGreaterThan(0);
      expect(audit[0].entityId).toBe(String(createdStaffId));
    });
  });
});
