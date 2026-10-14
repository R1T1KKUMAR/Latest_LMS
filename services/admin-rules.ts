/**
 * Admin Circulation Rules Service (FR-AD-01).
 * Supports listing, creating, and dynamically updating policy rules and fine parameters.
 */

import { eq, sql } from "drizzle-orm";
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

export interface CirculationRuleDetail {
  id: number;
  libraryId: number | null;
  libraryName: string | null;
  categoryId: number | null;
  categoryName: string | null;
  itemTypeId: number | null;
  itemTypeName: string | null;
  maxBooks: number;
  loanDays: number;
  maxRenewals: number;
  finePerDay: string;
  graceDays: number;
  maxFine: string | null;
  holdsAllowed: boolean;
  updatedAt: Date | string;
}

/**
 * Lists all circulation rules with resolved relation names.
 */
export async function listCirculationRules(
  db: DbInstance = defaultDb,
): Promise<CirculationRuleDetail[]> {
  const rows = await db
    .select({
      id: schema.circulationRules.id,
      libraryId: schema.circulationRules.libraryId,
      libraryName: schema.libraries.name,
      categoryId: schema.circulationRules.categoryId,
      categoryName: schema.patronCategories.name,
      itemTypeId: schema.circulationRules.itemTypeId,
      itemTypeName: schema.itemTypes.name,
      maxBooks: schema.circulationRules.maxBooks,
      loanDays: schema.circulationRules.loanDays,
      maxRenewals: schema.circulationRules.maxRenewals,
      finePerDay: schema.circulationRules.finePerDay,
      graceDays: schema.circulationRules.graceDays,
      maxFine: schema.circulationRules.maxFine,
      holdsAllowed: schema.circulationRules.holdsAllowed,
      updatedAt: schema.circulationRules.updatedAt,
    })
    .from(schema.circulationRules)
    .leftJoin(schema.libraries, eq(schema.circulationRules.libraryId, schema.libraries.id))
    .leftJoin(
      schema.patronCategories,
      eq(schema.circulationRules.categoryId, schema.patronCategories.id),
    )
    .leftJoin(schema.itemTypes, eq(schema.circulationRules.itemTypeId, schema.itemTypes.id))
    .orderBy(schema.circulationRules.id);

  // biome-ignore lint/suspicious/noExplicitAny: joined query row type
  return rows.map((r: any) => ({
    ...r,
    finePerDay: Number(r.finePerDay).toFixed(2),
    maxFine: r.maxFine ? Number(r.maxFine).toFixed(2) : null,
  }));
}

/**
 * Dynamically updates fine rates and policy parameters for a specific circulation rule (BR-01, BR-06).
 */
export async function updateCirculationRule(
  ruleId: number,
  values: {
    finePerDay?: number | string;
    graceDays?: number;
    maxFine?: number | string | null;
    loanDays?: number;
    maxBooks?: number;
    maxRenewals?: number;
    holdsAllowed?: boolean;
  },
  actor: Actor,
  db: DbInstance = defaultDb,
) {
  const [targetRule] = await db
    .select()
    .from(schema.circulationRules)
    .where(eq(schema.circulationRules.id, ruleId))
    .limit(1);

  if (!targetRule) {
    throw new Error(`Circulation rule #${ruleId} not found`);
  }

  // biome-ignore lint/suspicious/noExplicitAny: dynamic sql update values
  const updates: Record<string, any> = {
    updatedAt: new Date(),
  };

  if (values.finePerDay !== undefined) {
    const rate = Number(values.finePerDay);
    if (Number.isNaN(rate) || rate < 0) {
      throw new Error("Fine per day must be a non-negative number");
    }
    updates.finePerDay = sql`${rate.toFixed(2)}::numeric`;
  }

  if (values.graceDays !== undefined) {
    const grace = Number(values.graceDays);
    if (!Number.isInteger(grace) || grace < 0) {
      throw new Error("Grace days must be a non-negative integer");
    }
    updates.graceDays = grace;
  }

  if (values.maxFine !== undefined) {
    if (values.maxFine === null || values.maxFine === "" || values.maxFine === "0") {
      updates.maxFine = null;
    } else {
      const cap = Number(values.maxFine);
      if (Number.isNaN(cap) || cap < 0) {
        throw new Error("Max fine must be a non-negative number or null");
      }
      updates.maxFine = sql`${cap.toFixed(2)}::numeric`;
    }
  }

  if (values.loanDays !== undefined) {
    const loanDays = Number(values.loanDays);
    if (!Number.isInteger(loanDays) || loanDays < 0) {
      throw new Error("Loan days must be a non-negative integer");
    }
    updates.loanDays = loanDays;
  }

  if (values.maxBooks !== undefined) {
    const maxBooks = Number(values.maxBooks);
    if (!Number.isInteger(maxBooks) || maxBooks < 0) {
      throw new Error("Max books must be a non-negative integer");
    }
    updates.maxBooks = maxBooks;
  }

  if (values.maxRenewals !== undefined) {
    const maxRenewals = Number(values.maxRenewals);
    if (!Number.isInteger(maxRenewals) || maxRenewals < 0) {
      throw new Error("Max renewals must be a non-negative integer");
    }
    updates.maxRenewals = maxRenewals;
  }

  if (values.holdsAllowed !== undefined) {
    updates.holdsAllowed = Boolean(values.holdsAllowed);
  }

  const [updated] = await db
    .update(schema.circulationRules)
    .set(updates)
    .where(eq(schema.circulationRules.id, ruleId))
    .returning();

  await recordAuditLog(
    {
      actorType: actor.actorType ?? "STAFF",
      actorId: actor.id,
      actorName: actor.fullName,
      action: "RULE_UPDATE",
      entity: "circulation_rules",
      entityId: String(ruleId),
      details: `Updated rule #${ruleId}: finePerDay=${values.finePerDay ?? targetRule.finePerDay}, graceDays=${values.graceDays ?? targetRule.graceDays}, maxFine=${values.maxFine ?? targetRule.maxFine}`,
      ipAddress: actor.ipAddress,
    },
    db,
  );

  return updated;
}
