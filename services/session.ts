import { and, eq, lte } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import * as schema from "@/db/schema";
import { generateRandomToken } from "@/lib/crypto";
import { generateCsrfToken } from "@/lib/csrf";

export const SESSION_TTL_MS = 60 * 60 * 1000; // 60 minutes inactivity timeout (FR-AU-06)

export type SessionRecord = typeof schema.sessions.$inferSelect;

// biome-ignore lint/suspicious/noExplicitAny: Generic database instance support for testing
type DbInstance = any;

/**
 * Creates a new active session and returns its data including CSRF token.
 */
export async function createSession(
  params: {
    userType: "STAFF" | "PATRON";
    userId: number;
  },
  db: DbInstance = defaultDb,
): Promise<SessionRecord> {
  const sessionId = generateRandomToken(32);
  const csrfToken = generateCsrfToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  const [session] = await db
    .insert(schema.sessions)
    .values({
      id: sessionId,
      userType: params.userType,
      userId: params.userId,
      csrfToken,
      expiresAt,
      createdAt: now,
      lastActiveAt: now,
    })
    .returning();

  return session;
}

/**
 * Validates and retrieves an active session. If expired, automatically deletes
 * it from the database and returns null.
 * If valid, updates lastActiveAt and extends expiresAt using a sliding window.
 */
export async function getSession(
  sessionId: string,
  db: DbInstance = defaultDb,
): Promise<SessionRecord | null> {
  if (!sessionId) return null;

  const results = await db
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.id, sessionId))
    .limit(1);

  const session = results[0];
  if (!session) {
    return null;
  }

  const now = new Date();

  // Check expiration
  if (now.getTime() > new Date(session.expiresAt).getTime()) {
    // Invalidate expired session
    await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
    return null;
  }

  // Sliding window extension
  const newExpiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await db
    .update(schema.sessions)
    .set({
      lastActiveAt: now,
      expiresAt: newExpiresAt,
    })
    .where(eq(schema.sessions.id, sessionId));

  return {
    ...session,
    lastActiveAt: now,
    expiresAt: newExpiresAt,
  };
}

/**
 * Destroys a single session (e.g. on user logout).
 */
export async function invalidateSession(
  sessionId: string,
  db: DbInstance = defaultDb,
): Promise<void> {
  if (!sessionId) return;
  await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
}

/**
 * Destroys all active sessions for a user (e.g. on password change).
 */
export async function invalidateAllUserSessions(
  userType: "STAFF" | "PATRON",
  userId: number,
  db: DbInstance = defaultDb,
): Promise<void> {
  await db
    .delete(schema.sessions)
    .where(and(eq(schema.sessions.userType, userType), eq(schema.sessions.userId, userId)));
}

/**
 * Sweeps and purges all expired sessions from the database.
 */
export async function cleanupExpiredSessions(db: DbInstance = defaultDb): Promise<number> {
  const result = await db
    .delete(schema.sessions)
    .where(lte(schema.sessions.expiresAt, new Date()))
    .returning({ id: schema.sessions.id });

  return result.length;
}
