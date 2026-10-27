import { eq, or, sql } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import * as schema from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { recordAuditLog } from "./audit";
import { createSession, getSession, invalidateSession, type SessionRecord } from "./session";

export const GENERIC_STAFF_AUTH_ERROR = "Invalid username or password";
export const GENERIC_PATRON_AUTH_ERROR = "Invalid credentials";

// biome-ignore lint/suspicious/noExplicitAny: Generic database instance support for testing
type DbInstance = any;

export interface StaffAuthResult {
  success: boolean;
  error?: string;
  session?: SessionRecord;
  user?: {
    id: number;
    username: string;
    fullName: string;
    roleId: number;
    roleCode: string;
    roleName: string;
    libraryId: number;
  };
  permissions?: string[];
}

export interface PatronAuthResult {
  success: boolean;
  error?: string;
  session?: SessionRecord;
  patron?: {
    id: number;
    cardNo: string;
    employeeId: string | null;
    name: string;
    patronType: string;
    mustChangePassword: boolean;
  };
  mustChangePassword?: boolean;
}

/**
 * Authenticates a staff user. Enforces generic failure messages and writes
 * audit trail entries for both successful and failed attempts (FR-AU-01, FR-AU-02).
 */
export async function loginStaff(
  credentials: {
    username: string;
    password: string;
    ipAddress?: string;
  },
  db: DbInstance = defaultDb,
): Promise<StaffAuthResult> {
  const username = credentials.username?.trim();
  const password = credentials.password;

  if (!username || !password) {
    return { success: false, error: GENERIC_STAFF_AUTH_ERROR };
  }

  const normalizedUsername = username.toLowerCase();

  // 1. Fetch user by username (case-insensitive for reliable UX)
  const userRows = await db
    .select()
    .from(schema.users)
    .where(
      or(
        eq(schema.users.username, normalizedUsername),
        eq(schema.users.username, username),
        sql`LOWER(${schema.users.username}) = ${normalizedUsername}`,
      ),
    )
    .limit(1);

  const user = userRows[0];

  if (!user) {
    await recordAuditLog(
      {
        actorType: "STAFF",
        actorName: username,
        action: "LOGIN_FAILED",
        entity: "users",
        details: "Staff account not found",
        ipAddress: credentials.ipAddress,
      },
      db,
    );
    return { success: false, error: GENERIC_STAFF_AUTH_ERROR };
  }

  // 2. Verify password
  const isPasswordValid = verifyPassword(password, user.passwordHash);
  if (!isPasswordValid) {
    await recordAuditLog(
      {
        actorType: "STAFF",
        actorId: user.id,
        actorName: username,
        action: "LOGIN_FAILED",
        entity: "users",
        entityId: String(user.id),
        details: "Invalid password supplied",
        ipAddress: credentials.ipAddress,
      },
      db,
    );
    return { success: false, error: GENERIC_STAFF_AUTH_ERROR };
  }

  // 3. Verify account active status
  if (!user.isActive) {
    await recordAuditLog(
      {
        actorType: "STAFF",
        actorId: user.id,
        actorName: username,
        action: "LOGIN_FAILED",
        entity: "users",
        entityId: String(user.id),
        details: "Inactive staff account attempted sign-in",
        ipAddress: credentials.ipAddress,
      },
      db,
    );
    return { success: false, error: GENERIC_STAFF_AUTH_ERROR };
  }

  // 4. Fetch Role and Permissions
  const roleRows = await db
    .select()
    .from(schema.roles)
    .where(eq(schema.roles.id, user.roleId))
    .limit(1);

  const role = roleRows[0];

  const permRows = await db
    .select({
      code: schema.permissions.code,
    })
    .from(schema.rolePermissions)
    .innerJoin(schema.permissions, eq(schema.rolePermissions.permissionId, schema.permissions.id))
    .where(eq(schema.rolePermissions.roleId, user.roleId));

  const permissions = permRows.map((r: { code: string }) => r.code);

  // 5. Update last login timestamp
  await db.update(schema.users).set({ lastLogin: new Date() }).where(eq(schema.users.id, user.id));

  // 6. Create session
  const session = await createSession(
    {
      userType: "STAFF",
      userId: user.id,
    },
    db,
  );

  // 7. Record successful login audit
  await recordAuditLog(
    {
      actorType: "STAFF",
      actorId: user.id,
      actorName: user.fullName,
      action: "LOGIN",
      entity: "users",
      entityId: String(user.id),
      details: `Staff user signed in with role: ${role?.code ?? "UNKNOWN"}`,
      ipAddress: credentials.ipAddress,
    },
    db,
  );

  return {
    success: true,
    session,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      roleId: user.roleId,
      roleCode: role?.code ?? "",
      roleName: role?.name ?? "",
      libraryId: user.libraryId,
    },
    permissions,
  };
}

/**
 * Authenticates a patron into the OPAC. Identifier matches card_no, roll_no,
 * employee_id, or username (FR-AU-05).
 */
export async function loginPatron(
  credentials: {
    identifier: string;
    password: string;
    ipAddress?: string;
  },
  db: DbInstance = defaultDb,
): Promise<PatronAuthResult> {
  const identifier = credentials.identifier?.trim();
  const password = credentials.password;

  if (!identifier || !password) {
    return { success: false, error: GENERIC_PATRON_AUTH_ERROR };
  }

  const normalizedIdentifier = identifier.toLowerCase();
  const upperIdentifier = identifier.toUpperCase();

  // 1. Fetch patron by card_no, roll_no, employee_id, or username (case-insensitive)
  const patronRows = await db
    .select()
    .from(schema.patrons)
    .where(
      or(
        eq(schema.patrons.cardNo, identifier),
        eq(schema.patrons.cardNo, upperIdentifier),
        eq(schema.patrons.employeeId, identifier),
        eq(schema.patrons.employeeId, upperIdentifier),
        eq(schema.patrons.username, identifier),
        eq(schema.patrons.username, normalizedIdentifier),
        sql`LOWER(${schema.patrons.username}) = ${normalizedIdentifier}`,
        sql`LOWER(${schema.patrons.cardNo}) = ${normalizedIdentifier}`,
        sql`LOWER(${schema.patrons.employeeId}) = ${normalizedIdentifier}`,
      ),
    )
    .limit(1);

  const patron = patronRows[0];

  if (!patron) {
    await recordAuditLog(
      {
        actorType: "PATRON",
        actorName: identifier,
        action: "LOGIN_FAILED",
        entity: "patrons",
        details: "Patron not found",
        ipAddress: credentials.ipAddress,
      },
      db,
    );
    return { success: false, error: GENERIC_PATRON_AUTH_ERROR };
  }

  // 2. Verify password
  const isPasswordValid = verifyPassword(password, patron.passwordHash);
  if (!isPasswordValid) {
    await recordAuditLog(
      {
        actorType: "PATRON",
        actorId: patron.id,
        actorName: patron.cardNo,
        action: "LOGIN_FAILED",
        entity: "patrons",
        entityId: String(patron.id),
        details: "Invalid patron password supplied",
        ipAddress: credentials.ipAddress,
      },
      db,
    );
    return { success: false, error: GENERIC_PATRON_AUTH_ERROR };
  }

  // 3. Verify status and card expiry
  const now = new Date();
  const isExpired = patron.cardExpiry && new Date(patron.cardExpiry).getTime() < now.getTime();

  if (patron.status !== "ACTIVE" || isExpired) {
    await recordAuditLog(
      {
        actorType: "PATRON",
        actorId: patron.id,
        actorName: patron.cardNo,
        action: "LOGIN_FAILED",
        entity: "patrons",
        entityId: String(patron.id),
        details: isExpired
          ? "Patron membership expired"
          : `Patron account status is ${patron.status}`,
        ipAddress: credentials.ipAddress,
      },
      db,
    );
    return { success: false, error: GENERIC_PATRON_AUTH_ERROR };
  }

  // 4. Create session
  const session = await createSession(
    {
      userType: "PATRON",
      userId: patron.id,
    },
    db,
  );

  const fullName = `${patron.firstName} ${patron.lastName ?? ""}`.trim();

  // 5. Record successful login audit
  await recordAuditLog(
    {
      actorType: "PATRON",
      actorId: patron.id,
      actorName: fullName,
      action: "LOGIN",
      entity: "patrons",
      entityId: String(patron.id),
      details: "Patron signed in to OPAC",
      ipAddress: credentials.ipAddress,
    },
    db,
  );

  return {
    success: true,
    session,
    patron: {
      id: patron.id,
      cardNo: patron.cardNo,
      employeeId: patron.employeeId,
      name: fullName,
      patronType: patron.patronType,
      mustChangePassword: patron.mustChangePassword,
    },
    mustChangePassword: patron.mustChangePassword,
  };
}

/**
 * Logs out an active session and records an audit log entry.
 */
export async function logout(
  sessionId: string,
  ipAddress?: string,
  db: DbInstance = defaultDb,
): Promise<void> {
  if (!sessionId) return;

  const session = await getSession(sessionId, db);
  if (!session) return;

  let actorName = "Unknown";
  if (session.userType === "STAFF") {
    const userRows = await db
      .select({ fullName: schema.users.fullName })
      .from(schema.users)
      .where(eq(schema.users.id, session.userId))
      .limit(1);
    actorName = userRows[0]?.fullName ?? `Staff #${session.userId}`;
  } else {
    const patronRows = await db
      .select({
        firstName: schema.patrons.firstName,
        lastName: schema.patrons.lastName,
      })
      .from(schema.patrons)
      .where(eq(schema.patrons.id, session.userId))
      .limit(1);
    const p = patronRows[0];
    actorName = p ? `${p.firstName} ${p.lastName ?? ""}`.trim() : `Patron #${session.userId}`;
  }

  await invalidateSession(sessionId, db);

  await recordAuditLog(
    {
      actorType: session.userType as "STAFF" | "PATRON",
      actorId: session.userId,
      actorName,
      action: "LOGOUT",
      details: "User signed out",
      ipAddress,
    },
    db,
  );
}

/**
 * Changes a staff user's password after verifying current credentials.
 */
export async function changeStaffPassword(
  params: {
    userId: number;
    currentPassword: string;
    newPassword: string;
    ipAddress?: string;
  },
  db: DbInstance = defaultDb,
): Promise<{ success: boolean; error?: string }> {
  if (!params.newPassword || params.newPassword.length < 8) {
    return { success: false, error: "New password must be at least 8 characters" };
  }

  const userRows = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, params.userId))
    .limit(1);

  const user = userRows[0];
  if (!user) {
    return { success: false, error: "User not found" };
  }

  if (!verifyPassword(params.currentPassword, user.passwordHash)) {
    return { success: false, error: "Current password is incorrect" };
  }

  const newHash = hashPassword(params.newPassword);

  await db
    .update(schema.users)
    .set({
      passwordHash: newHash,
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, user.id));

  await recordAuditLog(
    {
      actorType: "STAFF",
      actorId: user.id,
      actorName: user.fullName,
      action: "PASSWORD_CHANGE",
      entity: "users",
      entityId: String(user.id),
      details: "Staff password changed successfully",
      ipAddress: params.ipAddress,
    },
    db,
  );

  return { success: true };
}

/**
 * Changes a patron's password after verifying current credentials.
 * Automatically clears the must_change_password flag (FR-AU-05).
 */
export async function changePatronPassword(
  params: {
    patronId: number;
    currentPassword: string;
    newPassword: string;
    ipAddress?: string;
  },
  db: DbInstance = defaultDb,
): Promise<{ success: boolean; error?: string }> {
  if (!params.newPassword || params.newPassword.length < 6) {
    return { success: false, error: "New password must be at least 6 characters" };
  }

  const patronRows = await db
    .select()
    .from(schema.patrons)
    .where(eq(schema.patrons.id, params.patronId))
    .limit(1);

  const patron = patronRows[0];
  if (!patron) {
    return { success: false, error: "Patron not found" };
  }

  if (!verifyPassword(params.currentPassword, patron.passwordHash)) {
    return { success: false, error: "Current password is incorrect" };
  }

  const newHash = hashPassword(params.newPassword);

  await db
    .update(schema.patrons)
    .set({
      passwordHash: newHash,
      mustChangePassword: false,
      updatedAt: new Date(),
    })
    .where(eq(schema.patrons.id, patron.id));

  const fullName = `${patron.firstName} ${patron.lastName ?? ""}`.trim();

  await recordAuditLog(
    {
      actorType: "PATRON",
      actorId: patron.id,
      actorName: fullName,
      action: "PASSWORD_CHANGE",
      entity: "patrons",
      entityId: String(patron.id),
      details: "Patron password changed; must_change_password cleared",
      ipAddress: params.ipAddress,
    },
    db,
  );

  return { success: true };
}
