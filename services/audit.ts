import { db as defaultDb } from "@/db";
import * as schema from "@/db/schema";
import { logger } from "@/lib/logger";

export interface CreateAuditLogParams {
  actorType: "STAFF" | "PATRON" | "SYSTEM" | "ANONYMOUS";
  actorId?: number | null;
  actorName: string;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  details?: string | null;
  ipAddress?: string | null;
}

// Any database instance that supports inserting into auditLogs (e.g. Postgres.js or PGlite)
// biome-ignore lint/suspicious/noExplicitAny: Generic database instance support for testing
type DbInstance = any;

/**
 * Creates an append-only audit trail entry in the database.
 * Protects against logging passwords or tokens (NFR-S-02).
 */
export async function recordAuditLog(
  params: CreateAuditLogParams,
  db: DbInstance = defaultDb,
): Promise<void> {
  try {
    // Sanitize details to guarantee no secrets are leaked
    let sanitizedDetails = params.details;
    if (sanitizedDetails) {
      sanitizedDetails = sanitizedDetails.replace(
        /(password|passwordHash|csrfToken|token)\s*[:=]\s*[^,\s]+/gi,
        "$1=[REDACTED]",
      );
    }

    await db.insert(schema.auditLogs).values({
      actorType: params.actorType,
      actorId: params.actorId ?? null,
      actorName: params.actorName,
      action: params.action,
      entity: params.entity ?? null,
      entityId: params.entityId ?? null,
      details: sanitizedDetails ?? null,
      ipAddress: params.ipAddress ?? null,
    });
  } catch (err) {
    // Never fail the entire application operation if audit logging encounters a database hiccup,
    // but log a severe system error.
    logger.error(
      { err, params: { ...params, details: "[REDACTED]" } },
      "Failed to write audit log entry",
    );
  }
}
