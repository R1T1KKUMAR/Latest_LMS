import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import * as schema from "@/db/schema";
import { recordAuditLog } from "./audit";

// biome-ignore lint/suspicious/noExplicitAny: generic DB instance support
type DbInstance = any;

export interface Actor {
  id: number;
  fullName: string;
  ipAddress?: string;
}

export interface ImportBatchListItem {
  id: number;
  importType: string;
  fileName: string;
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  importedBy: number;
  importedByName: string;
  createdAt: string;
  currentActiveRecords: number;
  hasActiveLoans: boolean;
  activeLoansCount: number;
}

/**
 * Lists all uploaded CSV batches with real-time statistics of remaining records and loans.
 */
export async function listImportBatches(
  db: DbInstance = defaultDb,
): Promise<ImportBatchListItem[]> {
  const batches = await db
    .select({
      id: schema.importBatches.id,
      importType: schema.importBatches.importType,
      fileName: schema.importBatches.fileName,
      totalRows: schema.importBatches.totalRows,
      importedRows: schema.importBatches.importedRows,
      skippedRows: schema.importBatches.skippedRows,
      importedBy: schema.importBatches.importedBy,
      importedByName: schema.users.fullName,
      createdAt: schema.importBatches.createdAt,
    })
    .from(schema.importBatches)
    .innerJoin(schema.users, eq(schema.importBatches.importedBy, schema.users.id))
    .orderBy(desc(schema.importBatches.createdAt));

  const results: ImportBatchListItem[] = [];

  for (const b of batches) {
    let currentActiveRecords = 0;
    let activeLoansCount = 0;

    if (b.importType === "STUDENT" || b.importType === "FACULTY") {
      const [patronCountRes] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.patrons)
        .where(eq(schema.patrons.importBatchId, b.id));
      currentActiveRecords = patronCountRes?.count ?? 0;

      if (currentActiveRecords > 0) {
        const [activeLoansRes] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(schema.loans)
          .innerJoin(schema.patrons, eq(schema.loans.patronId, schema.patrons.id))
          .where(and(eq(schema.patrons.importBatchId, b.id), eq(schema.loans.status, "ISSUED")));
        activeLoansCount = activeLoansRes?.count ?? 0;
      }
    } else if (b.importType === "CATALOGUE") {
      const [itemCountRes] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.items)
        .where(eq(schema.items.importBatchId, b.id));
      currentActiveRecords = itemCountRes?.count ?? 0;

      if (currentActiveRecords > 0) {
        const [activeLoansRes] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(schema.items)
          .where(and(eq(schema.items.importBatchId, b.id), eq(schema.items.status, "ISSUED")));
        activeLoansCount = activeLoansRes?.count ?? 0;
      }
    }

    results.push({
      id: b.id,
      importType: b.importType,
      fileName: b.fileName,
      totalRows: b.totalRows,
      importedRows: b.importedRows,
      skippedRows: b.skippedRows,
      importedBy: b.importedBy,
      importedByName: b.importedByName,
      createdAt: b.createdAt.toISOString(),
      currentActiveRecords,
      hasActiveLoans: activeLoansCount > 0,
      activeLoansCount,
    });
  }

  return results;
}

/**
 * Permanently deletes an uploaded CSV batch and rolls back/removes all associated records.
 */
export async function deleteImportBatch(
  batchId: number,
  actor: Actor,
  options: { force?: boolean } = {},
  db: DbInstance = defaultDb,
) {
  const [batch] = await db
    .select()
    .from(schema.importBatches)
    .where(eq(schema.importBatches.id, batchId))
    .limit(1);

  if (!batch) {
    throw new Error(`Import batch #${batchId} not found`);
  }

  let deletedRecordsCount = 0;

  if (batch.importType === "STUDENT" || batch.importType === "FACULTY") {
    // 1. Find all patrons imported in this batch
    const batchPatrons = await db
      .select({ id: schema.patrons.id, cardNo: schema.patrons.cardNo })
      .from(schema.patrons)
      .where(eq(schema.patrons.importBatchId, batchId));

    const patronIds = batchPatrons.map((p: { id: number }) => p.id);

    if (patronIds.length > 0) {
      // Check active unreturned loans
      const activeLoans = await db
        .select({
          id: schema.loans.id,
          itemId: schema.loans.itemId,
          patronId: schema.loans.patronId,
        })
        .from(schema.loans)
        .where(and(inArray(schema.loans.patronId, patronIds), eq(schema.loans.status, "ISSUED")));

      if (activeLoans.length > 0) {
        if (!options.force) {
          throw new Error(
            `Cannot delete batch "${batch.fileName}" because ${activeLoans.length} book(s) are currently issued to patrons in this batch. Please return them first, or enable force deletion.`,
          );
        }
        // Force: restore items to AVAILABLE
        for (const loan of activeLoans) {
          await db
            .update(schema.items)
            .set({ status: "AVAILABLE", updatedAt: new Date() })
            .where(eq(schema.items.id, loan.itemId));
        }
      }

      await db.transaction(async (tx: DbInstance) => {
        // Delete sessions
        await tx
          .delete(schema.sessions)
          .where(
            and(eq(schema.sessions.userType, "PATRON"), inArray(schema.sessions.userId, patronIds)),
          );

        // Delete holds
        await tx.delete(schema.holds).where(inArray(schema.holds.patronId, patronIds));

        // Delete payments
        await tx.delete(schema.payments).where(inArray(schema.payments.patronId, patronIds));

        // Delete fines
        await tx.delete(schema.fines).where(inArray(schema.fines.patronId, patronIds));

        // Delete loans
        await tx.delete(schema.loans).where(inArray(schema.loans.patronId, patronIds));

        // Delete patrons
        await tx.delete(schema.patrons).where(eq(schema.patrons.importBatchId, batchId));
      });

      deletedRecordsCount = patronIds.length;
    }
  } else if (batch.importType === "CATALOGUE") {
    // 1. Find items in this batch
    const batchItems = await db
      .select({ id: schema.items.id, bibId: schema.items.bibId, status: schema.items.status })
      .from(schema.items)
      .where(eq(schema.items.importBatchId, batchId));

    const itemIds = batchItems.map((i: { id: number }) => i.id);

    if (itemIds.length > 0) {
      const issuedItems = batchItems.filter((i: { status: string }) => i.status === "ISSUED");
      if (issuedItems.length > 0 && !options.force) {
        throw new Error(
          `Cannot delete catalogue batch "${batch.fileName}" because ${issuedItems.length} book copy/copies are currently issued to patrons. Please return the books first, or enable force deletion.`,
        );
      }

      await db.transaction(async (tx: DbInstance) => {
        // Delete payments referencing fines of these items
        const itemLoans = await tx
          .select({ id: schema.loans.id })
          .from(schema.loans)
          .where(inArray(schema.loans.itemId, itemIds));
        const loanIds = itemLoans.map((l: { id: number }) => l.id);

        if (loanIds.length > 0) {
          const itemFines = await tx
            .select({ id: schema.fines.id })
            .from(schema.fines)
            .where(inArray(schema.fines.loanId, loanIds));
          const fineIds = itemFines.map((f: { id: number }) => f.id);

          if (fineIds.length > 0) {
            await tx.delete(schema.payments).where(inArray(schema.payments.fineId, fineIds));
            await tx.delete(schema.fines).where(inArray(schema.fines.id, fineIds));
          }

          await tx.delete(schema.loans).where(inArray(schema.loans.id, loanIds));
        }

        // Delete holds
        await tx.delete(schema.holds).where(inArray(schema.holds.itemId, itemIds));

        // Delete items
        await tx.delete(schema.items).where(eq(schema.items.importBatchId, batchId));

        // Delete bib_records that were part of this batch or now have 0 copies
        await tx.delete(schema.bibRecords).where(eq(schema.bibRecords.importBatchId, batchId));
      });

      deletedRecordsCount = itemIds.length;
    }
  }

  // Delete the batch record itself
  await db.delete(schema.importBatches).where(eq(schema.importBatches.id, batchId));

  // Audit log
  await recordAuditLog(
    {
      actorType: "STAFF",
      actorId: actor.id,
      actorName: actor.fullName,
      action: "BATCH_DELETE",
      entity: "import_batches",
      entityId: String(batchId),
      details: `Deleted uploaded CSV batch #${batchId} ("${batch.fileName}", ${batch.importType}) and rolled back ${deletedRecordsCount} records`,
      ipAddress: actor.ipAddress,
    },
    db,
  );

  return {
    success: true,
    batchId,
    fileName: batch.fileName,
    deletedCount: deletedRecordsCount,
    message: `Batch #${batchId} ("${batch.fileName}") and ${deletedRecordsCount} record(s) were successfully deleted.`,
  };
}
