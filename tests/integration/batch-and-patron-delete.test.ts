import { describe, expect, it } from "vitest";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import { deletePatron, registerPatron } from "@/services/patron";
import { listImportBatches } from "@/services/batch-import-management";

describe("Patron & Batch Deletion Capabilities", () => {
  const actor = { id: 1, fullName: "Test Administrator" };

  it("should successfully list import batches", async () => {
    const batches = await listImportBatches(db);
    expect(Array.isArray(batches)).toBe(true);
  });

  it("should successfully register and permanently delete a patron", async () => {
    const cardNo = `TEST_CARD_${Date.now()}`;
    const patron = await registerPatron(
      {
        cardNo,
        patronType: "STUDENT",
        categoryId: 1,
        firstName: "Automated",
        lastName: "TestPatron",
        academicYear: 1,
        semester: 1,
      },
      actor,
      db,
    );

    expect(patron.id).toBeDefined();

    // Verify patron exists
    const [fetched] = await db
      .select()
      .from(schema.patrons)
      .where(eq(schema.patrons.id, patron.id));
    expect(fetched).toBeDefined();

    // Delete patron
    const deleteRes = await deletePatron(patron.id, actor, {}, db);
    expect(deleteRes.success).toBe(true);
    expect(deleteRes.deletedId).toBe(patron.id);

    // Verify patron no longer exists
    const [deleted] = await db
      .select()
      .from(schema.patrons)
      .where(eq(schema.patrons.id, patron.id));
    expect(deleted).toBeUndefined();
  });
});
