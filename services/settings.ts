/**
 * System Settings Service (FR-AD-02).
 * Reads and updates runtime configuration keys with immediate effect and tamper-evident audit logging.
 */

import { eq } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import * as schema from "@/db/schema";
import { recordAuditLog } from "./audit";

// biome-ignore lint/suspicious/noExplicitAny: generic DB instance support
type DbInstance = any;

export interface Actor {
  id: number;
  fullName: string;
  actorType?: "STAFF" | "PATRON";
  ipAddress?: string;
}

export interface SettingItem {
  id: number;
  settingKey: string;
  settingValue: string;
  description: string | null;
  updatedAt: Date | string;
}

/**
 * Loads all system settings rows.
 */
export async function getAllSystemSettings(db: DbInstance = defaultDb): Promise<SettingItem[]> {
  const rows = await db
    .select()
    .from(schema.systemSettings)
    .orderBy(schema.systemSettings.settingKey);

  return rows;
}

/**
 * Updates one or more system setting keys (e.g. DEFAULT_FINE_PER_DAY, DEFAULT_GRACE_DAYS, FINE_BLOCK_LIMIT).
 * Validates formats and records append-only audit log entry.
 */
export async function updateSystemSettings(
  updates: Record<string, string>,
  actor: Actor,
  db: DbInstance = defaultDb,
): Promise<{ updatedKeys: string[] }> {
  const updatedKeys: string[] = [];

  const existingRows = await db.select().from(schema.systemSettings);
  const existingMap = new Map<string, typeof schema.systemSettings.$inferSelect>();
  for (const row of existingRows) {
    existingMap.set(row.settingKey, row);
  }

  for (const [key, rawVal] of Object.entries(updates)) {
    const val = String(rawVal).trim();

    // Validation rules for known fine and circulation keys
    if (key === "DEFAULT_FINE_PER_DAY") {
      const num = Number(val);
      if (Number.isNaN(num) || num < 0) {
        throw new Error("Default fine per day must be a non-negative number");
      }
    } else if (key === "DEFAULT_GRACE_DAYS") {
      const num = Number(val);
      if (!Number.isInteger(num) || num < 0) {
        throw new Error("Default grace days must be a non-negative integer");
      }
    } else if (key === "FINE_BLOCK_LIMIT") {
      const num = Number(val);
      if (Number.isNaN(num) || num < 0) {
        throw new Error("Fine block limit must be a non-negative number");
      }
    } else if (key === "LOST_PROCESSING_FEE") {
      const num = Number(val);
      if (Number.isNaN(num) || num < 0) {
        throw new Error("Lost processing fee must be a non-negative number");
      }
    } else if (key === "BLOCK_ISSUE_IF_OVERDUE") {
      if (val !== "true" && val !== "false") {
        throw new Error("BLOCK_ISSUE_IF_OVERDUE must be 'true' or 'false'");
      }
    }

    const prev = existingMap.get(key);
    if (prev) {
      if (prev.settingValue !== val) {
        await db
          .update(schema.systemSettings)
          .set({
            settingValue: val,
            updatedAt: new Date(),
          })
          .where(eq(schema.systemSettings.id, prev.id));

        await recordAuditLog(
          {
            actorType: actor.actorType ?? "STAFF",
            actorId: actor.id,
            actorName: actor.fullName,
            action: "SETTINGS_UPDATE",
            entity: "system_settings",
            entityId: key,
            details: `Updated ${key} from "${prev.settingValue}" to "${val}"`,
            ipAddress: actor.ipAddress,
          },
          db,
        );

        updatedKeys.push(key);
      }
    } else {
      await db.insert(schema.systemSettings).values({
        settingKey: key,
        settingValue: val,
        description: `Runtime configuration for ${key}`,
      });

      await recordAuditLog(
        {
          actorType: actor.actorType ?? "STAFF",
          actorId: actor.id,
          actorName: actor.fullName,
          action: "SETTINGS_UPDATE",
          entity: "system_settings",
          entityId: key,
          details: `Created new setting key ${key} with value "${val}"`,
          ipAddress: actor.ipAddress,
        },
        db,
      );

      updatedKeys.push(key);
    }
  }

  return { updatedKeys };
}
