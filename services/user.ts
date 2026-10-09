import { eq } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import * as schema from "@/db/schema";
import { hashPassword } from "@/lib/crypto";
import { recordAuditLog } from "@/services/audit";
import { invalidateAllUserSessions } from "@/services/session";
import type { PermissionCode, RoleCode } from "@/types/auth";

// biome-ignore lint/suspicious/noExplicitAny: Generic database instance support for testing
type DbInstance = any;

export interface StaffUserListItem {
  id: number;
  username: string;
  fullName: string;
  roleId: number;
  roleCode: RoleCode | string;
  roleName: string;
  libraryId: number;
  libraryName: string;
  isActive: boolean;
  lastLogin: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateStaffUserInput {
  username: string;
  fullName: string;
  password: string;
  roleId: number;
  libraryId: number;
}

export interface UpdateStaffUserInput {
  fullName?: string;
  roleId?: number;
  libraryId?: number;
  isActive?: boolean;
}

export interface ActorAuditContext {
  actorId: number;
  actorName: string;
  ipAddress?: string;
}

/**
 * Lists all staff users with their associated role and home library.
 */
export async function listStaffUsers(db: DbInstance = defaultDb): Promise<StaffUserListItem[]> {
  const rows = await db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      fullName: schema.users.fullName,
      roleId: schema.users.roleId,
      roleCode: schema.roles.code,
      roleName: schema.roles.name,
      libraryId: schema.users.libraryId,
      libraryName: schema.libraries.name,
      isActive: schema.users.isActive,
      lastLogin: schema.users.lastLogin,
      createdAt: schema.users.createdAt,
      updatedAt: schema.users.updatedAt,
    })
    .from(schema.users)
    .innerJoin(schema.roles, eq(schema.users.roleId, schema.roles.id))
    .innerJoin(schema.libraries, eq(schema.users.libraryId, schema.libraries.id))
    .orderBy(schema.users.id);

  return rows as StaffUserListItem[];
}

/**
 * Gets a single staff user by ID.
 */
export async function getStaffUserById(
  userId: number,
  db: DbInstance = defaultDb,
): Promise<StaffUserListItem | null> {
  const rows = await db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      fullName: schema.users.fullName,
      roleId: schema.users.roleId,
      roleCode: schema.roles.code,
      roleName: schema.roles.name,
      libraryId: schema.users.libraryId,
      libraryName: schema.libraries.name,
      isActive: schema.users.isActive,
      lastLogin: schema.users.lastLogin,
      createdAt: schema.users.createdAt,
      updatedAt: schema.users.updatedAt,
    })
    .from(schema.users)
    .innerJoin(schema.roles, eq(schema.users.roleId, schema.roles.id))
    .innerJoin(schema.libraries, eq(schema.users.libraryId, schema.libraries.id))
    .where(eq(schema.users.id, userId))
    .limit(1);

  return (rows[0] as StaffUserListItem) ?? null;
}

/**
 * Creates a new staff user account with Argon2id hashed password (FR-AU-04, UC-11).
 */
export async function createStaffUser(
  input: CreateStaffUserInput,
  actor: ActorAuditContext,
  db: DbInstance = defaultDb,
): Promise<{ success: boolean; user?: StaffUserListItem; error?: string }> {
  const trimmedUsername = input.username.trim().toLowerCase();
  if (!trimmedUsername) {
    return { success: false, error: "Username is required" };
  }
  if (!input.fullName.trim()) {
    return { success: false, error: "Full name is required" };
  }
  if (!input.password || input.password.length < 6) {
    return { success: false, error: "Password must be at least 6 characters" };
  }

  // Check unique username
  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.username, trimmedUsername))
    .limit(1);

  if (existing.length > 0) {
    return { success: false, error: `Username '${trimmedUsername}' is already in use` };
  }

  // Verify role exists
  const role = await db
    .select({ id: schema.roles.id, name: schema.roles.name })
    .from(schema.roles)
    .where(eq(schema.roles.id, input.roleId))
    .limit(1);
  if (role.length === 0) {
    return { success: false, error: "Invalid role selected" };
  }

  // Verify library exists
  const library = await db
    .select({ id: schema.libraries.id, name: schema.libraries.name })
    .from(schema.libraries)
    .where(eq(schema.libraries.id, input.libraryId))
    .limit(1);
  if (library.length === 0) {
    return { success: false, error: "Invalid library selected" };
  }

  const passwordHash = hashPassword(input.password);
  const now = new Date();

  const [newUser] = await db
    .insert(schema.users)
    .values({
      username: trimmedUsername,
      fullName: input.fullName.trim(),
      passwordHash,
      roleId: input.roleId,
      libraryId: input.libraryId,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  await recordAuditLog(
    {
      actorType: "STAFF",
      actorId: actor.actorId,
      actorName: actor.actorName,
      action: "STAFF_USER_CREATED",
      entity: "users",
      entityId: String(newUser.id),
      details: `Created staff user '${trimmedUsername}' with role '${role[0].name}' at '${library[0].name}'`,
      ipAddress: actor.ipAddress,
    },
    db,
  );

  const fullUser = await getStaffUserById(newUser.id, db);
  return { success: true, user: fullUser! };
}

/**
 * Updates a staff user account's profile, role, library, or active status (FR-AU-04, UC-11).
 * Note: Staff users are never deleted per SRS requirements.
 */
export async function updateStaffUser(
  userId: number,
  input: UpdateStaffUserInput,
  actor: ActorAuditContext,
  db: DbInstance = defaultDb,
): Promise<{ success: boolean; user?: StaffUserListItem; error?: string }> {
  const existing = await getStaffUserById(userId, db);
  if (!existing) {
    return { success: false, error: "Staff user not found" };
  }

  // Validate role if changing
  if (input.roleId !== undefined && input.roleId !== existing.roleId) {
    const role = await db
      .select({ id: schema.roles.id })
      .from(schema.roles)
      .where(eq(schema.roles.id, input.roleId))
      .limit(1);
    if (role.length === 0) {
      return { success: false, error: "Invalid role selected" };
    }
  }

  // Validate library if changing
  if (input.libraryId !== undefined && input.libraryId !== existing.libraryId) {
    const lib = await db
      .select({ id: schema.libraries.id })
      .from(schema.libraries)
      .where(eq(schema.libraries.id, input.libraryId))
      .limit(1);
    if (lib.length === 0) {
      return { success: false, error: "Invalid library selected" };
    }
  }

  const updateValues: Partial<typeof schema.users.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.fullName !== undefined) updateValues.fullName = input.fullName.trim();
  if (input.roleId !== undefined) updateValues.roleId = input.roleId;
  if (input.libraryId !== undefined) updateValues.libraryId = input.libraryId;
  if (input.isActive !== undefined) updateValues.isActive = input.isActive;

  await db.update(schema.users).set(updateValues).where(eq(schema.users.id, userId));

  // If deactivated, invalidate all active sessions
  if (input.isActive === false) {
    await invalidateAllUserSessions("STAFF", userId, db);
  }

  await recordAuditLog(
    {
      actorType: "STAFF",
      actorId: actor.actorId,
      actorName: actor.actorName,
      action: "STAFF_USER_UPDATED",
      entity: "users",
      entityId: String(userId),
      details: `Updated staff user '${existing.username}': ${JSON.stringify(input)}`,
      ipAddress: actor.ipAddress,
    },
    db,
  );

  const updated = await getStaffUserById(userId, db);
  return { success: true, user: updated! };
}

/**
 * Sets a new password for any staff account by Super Administrator (FR-AU-04).
 * Invalidates all active sessions for the user to enforce immediate re-authentication.
 */
export async function resetStaffUserPassword(
  userId: number,
  newPassword: string,
  actor: ActorAuditContext,
  db: DbInstance = defaultDb,
): Promise<{ success: boolean; error?: string }> {
  if (!newPassword || newPassword.length < 6) {
    return { success: false, error: "Password must be at least 6 characters" };
  }

  const existing = await getStaffUserById(userId, db);
  if (!existing) {
    return { success: false, error: "Staff user not found" };
  }

  const passwordHash = hashPassword(newPassword);

  await db
    .update(schema.users)
    .set({
      passwordHash,
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, userId));

  // Invalidate previous sessions
  await invalidateAllUserSessions("STAFF", userId, db);

  await recordAuditLog(
    {
      actorType: "STAFF",
      actorId: actor.actorId,
      actorName: actor.actorName,
      action: "STAFF_PASSWORD_RESET",
      entity: "users",
      entityId: String(userId),
      details: `Super Admin reset password for staff account '${existing.username}'`,
      ipAddress: actor.ipAddress,
    },
    db,
  );

  return { success: true };
}

/**
 * Returns roles and their permissions matrix from the database.
 */
export async function getRolesWithPermissions(db: DbInstance = defaultDb): Promise<
  Array<{
    id: number;
    code: RoleCode | string;
    name: string;
    description: string | null;
    permissions: PermissionCode[];
  }>
> {
  const allRoles = await db.select().from(schema.roles).orderBy(schema.roles.id);

  const result = [];
  for (const role of allRoles) {
    const permRows = await db
      .select({ code: schema.permissions.code })
      .from(schema.rolePermissions)
      .innerJoin(schema.permissions, eq(schema.rolePermissions.permissionId, schema.permissions.id))
      .where(eq(schema.rolePermissions.roleId, role.id));

    result.push({
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description,
      permissions: permRows.map((r: { code: string }) => r.code as PermissionCode),
    });
  }

  return result;
}
