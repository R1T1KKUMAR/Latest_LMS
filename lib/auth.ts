import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";
import { db as defaultDb } from "@/db";
import * as schema from "@/db/schema";
import { recordAuditLog } from "@/services/audit";
import { getSession, invalidateSession, type SessionRecord } from "@/services/session";
import type { PermissionCode } from "@/types/auth";

export const STAFF_SESSION_COOKIE = "rbmi_staff_session";
export const PATRON_SESSION_COOKIE = "rbmi_patron_session";

export class AuthenticationError extends Error {
  public readonly statusCode = 401;
  constructor(message = "Authentication required") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class ForbiddenError extends Error {
  public readonly statusCode = 403;
  constructor(message = "Forbidden: Insufficient permissions") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export interface StaffAuthContext {
  session: SessionRecord;
  user: {
    id: number;
    username: string;
    fullName: string;
    roleId: number;
    roleCode: string;
    roleName: string;
    libraryId: number;
  };
  role: typeof schema.roles.$inferSelect;
  permissions: string[];
}

export interface PatronAuthContext {
  session: SessionRecord;
  patron: typeof schema.patrons.$inferSelect;
}

// biome-ignore lint/suspicious/noExplicitAny: Generic database instance support for testing
type DbInstance = any;

interface AuthOptions {
  sessionId?: string;
  request?: Request;
  db?: DbInstance;
}

/**
 * Reads the active session ID from Next.js cookies, explicit request headers, or options.
 */
async function resolveSessionId(
  userType?: "STAFF" | "PATRON",
  options?: AuthOptions,
): Promise<string | undefined> {
  if (options?.sessionId) {
    return options.sessionId;
  }

  if (options?.request) {
    const cookieHeader = options.request.headers.get("cookie") || "";
    const staffMatch = cookieHeader.match(new RegExp(`(?:^|;\\s*)${STAFF_SESSION_COOKIE}=([^;]+)`));
    const patronMatch = cookieHeader.match(
      new RegExp(`(?:^|;\\s*)${PATRON_SESSION_COOKIE}=([^;]+)`),
    );

    if (userType === "STAFF" && staffMatch) return decodeURIComponent(staffMatch[1]);
    if (userType === "PATRON" && patronMatch) return decodeURIComponent(patronMatch[1]);
    if (!userType) {
      if (staffMatch) return decodeURIComponent(staffMatch[1]);
      if (patronMatch) return decodeURIComponent(patronMatch[1]);
    }
  }

  try {
    const cookieStore = await cookies();
    if (userType === "STAFF") {
      return cookieStore.get(STAFF_SESSION_COOKIE)?.value;
    }
    if (userType === "PATRON") {
      return cookieStore.get(PATRON_SESSION_COOKIE)?.value;
    }
    return (
      cookieStore.get(STAFF_SESSION_COOKIE)?.value ?? cookieStore.get(PATRON_SESSION_COOKIE)?.value
    );
  } catch {
    // cookies() unavailable outside of request contexts (e.g. some unit test runners)
    return undefined;
  }
}

/**
 * Retrieves and validates the current active session.
 * Enforces boundary separation between STAFF and PATRON sessions (NFR-S-05).
 * Cached per request using React.cache to avoid redundant queries across Layout and Page.
 */
export const getCurrentSession = cache(
  async (
    userType?: "STAFF" | "PATRON",
    options?: AuthOptions,
  ): Promise<StaffAuthContext | PatronAuthContext | null> => {
    const db = options?.db ?? defaultDb;
    const sessionId = await resolveSessionId(userType, options);

    if (!sessionId) {
      return null;
    }

    const session = await getSession(sessionId, db);
  if (!session) {
    return null;
  }

  // Strict session separation: A patron session must never satisfy a staff check
  if (userType && session.userType !== userType) {
    return null;
  }

// In-memory profile cache to eliminate 3x cloud database queries on every navigation
interface CachedStaffProfile {
  user: {
    id: number;
    username: string;
    fullName: string;
    roleId: number;
    roleCode: string;
    roleName: string;
    libraryId: number;
  };
  role: typeof schema.roles.$inferSelect;
  permissions: string[];
  cachedAt: number;
}
const staffProfileCache = new Map<number, CachedStaffProfile>();
const patronProfileCache = new Map<number, { patron: typeof schema.patrons.$inferSelect; cachedAt: number }>();
const PROFILE_CACHE_TTL_MS = 60 * 1000; // 60 seconds

  if (session.userType === "STAFF") {
    const nowMs = Date.now();
    const cached = staffProfileCache.get(session.userId);
    if (cached && nowMs - cached.cachedAt < PROFILE_CACHE_TTL_MS) {
      return {
        session,
        user: cached.user,
        role: cached.role,
        permissions: cached.permissions,
      };
    }

    const userRows = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, session.userId))
      .limit(1);

    const user = userRows[0];
    if (!user || !user.isActive) {
      staffProfileCache.delete(session.userId);
      // Invalidate orphaned or deactivated session
      await invalidateSession(sessionId, db);
      return null;
    }

    const roleRows = await db
      .select()
      .from(schema.roles)
      .where(eq(schema.roles.id, user.roleId))
      .limit(1);

    const role = roleRows[0];

    const permRows = await db
      .select({ code: schema.permissions.code })
      .from(schema.rolePermissions)
      .innerJoin(schema.permissions, eq(schema.rolePermissions.permissionId, schema.permissions.id))
      .where(eq(schema.rolePermissions.roleId, user.roleId));

    const permissions = permRows.map((r: { code: string }) => r.code);

    const staffUser = {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      roleId: user.roleId,
      roleCode: role?.code ?? "",
      roleName: role?.name ?? "",
      libraryId: user.libraryId,
    };

    staffProfileCache.set(session.userId, {
      user: staffUser,
      role,
      permissions,
      cachedAt: nowMs,
    });

    return {
      session,
      user: staffUser,
      role,
      permissions,
    };
  }

  if (session.userType === "PATRON") {
    const patronRows = await db
      .select()
      .from(schema.patrons)
      .where(eq(schema.patrons.id, session.userId))
      .limit(1);

    const patron = patronRows[0];
    if (!patron || patron.status !== "ACTIVE") {
      await invalidateSession(sessionId, db);
      return null;
    }

    return {
      session,
      patron,
    };
  }

    return null;
  },
);

/**
 * Requires that a request is authenticated. Throws AuthenticationError (401)
 * if session is missing or invalid.
 */
export async function requireAuthenticatedUser(
  userType?: "STAFF" | "PATRON",
  options?: AuthOptions,
): Promise<StaffAuthContext | PatronAuthContext> {
  const context = await getCurrentSession(userType, options);

  if (!context) {
    throw new AuthenticationError("Authentication required to access this resource");
  }

  return context;
}

/**
 * Checks if a StaffAuthContext has a specific permission.
 */
export function hasStaffPermission(
  context: StaffAuthContext,
  permission: PermissionCode | string,
): boolean {
  return context.permissions.includes(permission);
}

/**
 * Requires that the authenticated staff user possesses the required permission.
 * Rejects unauthorized requests with HTTP 403 Forbidden and writes an audit log (FR-AU-02, NFR-S-01).
 */
export async function requirePermission(
  permissionCode: PermissionCode | string,
  options?: AuthOptions,
): Promise<StaffAuthContext> {
  const genericContext = await requireAuthenticatedUser(undefined, options);

  if (genericContext.session.userType !== "STAFF") {
    const db = options?.db ?? defaultDb;
    await recordAuditLog(
      {
        actorType: "PATRON",
        actorId: genericContext.session.userId,
        actorName: "Patron",
        action: "PERMISSION_DENIED",
        entity: "permissions",
        details: `Patron attempted to access staff permission '${permissionCode}'`,
      },
      db,
    );
    throw new ForbiddenError(
      `Forbidden: Staff privileges required to access permission (${permissionCode})`,
    );
  }

  const context = genericContext as StaffAuthContext;

  if (!context.permissions.includes(permissionCode)) {
    const db = options?.db ?? defaultDb;
    await recordAuditLog(
      {
        actorType: "STAFF",
        actorId: context.user.id,
        actorName: context.user.fullName,
        action: "PERMISSION_DENIED",
        entity: "permissions",
        details: `Access denied: missing permission '${permissionCode}'`,
      },
      db,
    );

    throw new ForbiddenError(
      `Forbidden: You do not have the required permission (${permissionCode})`,
    );
  }

  return context;
}

/**
 * Server Component page guard that verifies authentication and optional permission.
 * Returns structured authorization status without throwing, allowing clean UI rendering.
 */
export async function requirePageAuth(
  requiredPermission?: PermissionCode | string | (PermissionCode | string)[],
  options?: AuthOptions,
): Promise<
  | { authorized: true; context: StaffAuthContext }
  | {
      authorized: false;
      status: 401 | 403;
      message: string;
      context?: StaffAuthContext;
    }
> {
  const genericAuth = await getCurrentSession(undefined, options);
  if (genericAuth && "patron" in genericAuth) {
    return {
      authorized: false,
      status: 403,
      message: "Access Denied: Patron accounts cannot access staff administration pages.",
    };
  }

  const auth = genericAuth;

  if (!auth || !("user" in auth)) {
    return {
      authorized: false,
      status: 401,
      message: "Please sign in with your staff credentials to access this page.",
    };
  }

  const staffContext = auth as StaffAuthContext;

  if (requiredPermission) {
    const perms = Array.isArray(requiredPermission) ? requiredPermission : [requiredPermission];
    const hasAny = perms.some((p) => staffContext.permissions.includes(p));

    if (!hasAny) {
      const db = options?.db ?? defaultDb;
      const permStr = perms.join(" / ");
      await recordAuditLog(
        {
          actorType: "STAFF",
          actorId: staffContext.user.id,
          actorName: staffContext.user.fullName,
          action: "PERMISSION_DENIED",
          entity: "permissions",
          details: `Access denied to page: missing permission '${permStr}'`,
        },
        db,
      );

      return {
        authorized: false,
        status: 403,
        message: `Access Denied: You do not have permission (${permStr}) to access this page.`,
        context: staffContext,
      };
    }
  }

  return { authorized: true, context: staffContext };
}

/**
 * Standard cookie configuration for HttpOnly session cookies (NFR-S-04).
 */
export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60, // 60 minutes
};
