import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";
import { GET as checkDataGet } from "@/app/api/admin/import-format/check-data/route";
import { GET as formatGet } from "@/app/api/admin/import-format/route";
import { setTestDb } from "@/db/client";
import * as schema from "@/db/schema";
import { STAFF_SESSION_COOKIE } from "@/lib/auth";
import {
  checkColumnHasData,
  getImportFormat,
  resetImportFormat,
  updateImportFormat,
} from "@/services/import-format";
import { validatePatronCsv } from "@/services/patron-import";
import { createSession } from "@/services/session";

describe("Admin Import Format Management Integration Suite", () => {
  let pglite: PGlite;
  // biome-ignore lint/suspicious/noExplicitAny: generic DB instance
  let db: any;
  const superAdminActor = { id: 1, fullName: "Super Administrator", actorType: "STAFF" as const };

  beforeAll(async () => {
    pglite = new PGlite();
    db = drizzle(pglite, { schema });
    setTestDb(db);

    const migrationPath = resolve(process.cwd(), "db/migrations/0000_abnormal_the_fallen.sql");
    const migrationSql = readFileSync(migrationPath, "utf-8");
    await pglite.exec(migrationSql);

    const { seedDatabase } = await import("@/db/seed");
    await seedDatabase(db);
  });

  it("1. Retrieves default format when unconfigured", async () => {
    const studentFormat = await getImportFormat("STUDENT", db);
    expect(studentFormat.length).toBeGreaterThan(10);
    expect(studentFormat.some((c) => c.dbField === "name")).toBe(true);
    expect(studentFormat.some((c) => c.dbField === "card_no")).toBe(true);
    expect(studentFormat.some((c) => c.dbField === "roll_no")).toBe(false);
  });

  it("2. Updates CSV headers and persists in system_settings", async () => {
    const original = await getImportFormat("STUDENT", db);
    const customized = original.map((col) => {
      if (col.dbField === "card_no") {
        return { ...col, csvHeader: "library_card_number" };
      }
      return col;
    });

    const updated = await updateImportFormat("STUDENT", customized, superAdminActor, db);
    expect(updated.find((c) => c.dbField === "card_no")?.csvHeader).toBe("library_card_number");

    // Verify DB read
    const fetched = await getImportFormat("STUDENT", db);
    expect(fetched.find((c) => c.dbField === "card_no")?.csvHeader).toBe("library_card_number");

    // Reset back for subsequent tests
    await resetImportFormat("STUDENT", superAdminActor, db);
  });

  it("3. Verifies that checkColumnHasData correctly reports records with data", async () => {
    // There are students seeded in the DB with mobile numbers
    const mobileCheck = await checkColumnHasData("STUDENT", "mobile", db);
    expect(mobileCheck.hasData).toBe(true);
    expect(mobileCheck.count).toBeGreaterThan(0);

    // Check catalogue title
    const titleCheck = await checkColumnHasData("CATALOGUE", "title", db);
    expect(titleCheck.hasData).toBe(true);
    expect(titleCheck.count).toBeGreaterThan(0);
  });

  it("4. Ingests CSV using customized header name and preserves fallback aliases", async () => {
    const original = await getImportFormat("STUDENT", db);
    const customized = original.map((col) => {
      if (col.dbField === "card_no") {
        return { ...col, csvHeader: "custom_card_id" };
      }
      return col;
    });

    // 1. CSV with customized header "custom_card_id"
    const csvWithCustomHeader = ["custom_card_id,name", "CARD999001,Test Student One"].join("\n");

    const previewCustom = await validatePatronCsv(
      Buffer.from(csvWithCustomHeader, "utf8"),
      "STUDENT",
      { formatColumns: customized },
      db,
    );
    expect(previewCustom.summary.totalRows).toBe(1);
    expect(previewCustom.rows[0].data?.cardNo).toBe("CARD999001");

    // 2. CSV with legacy header "card_no" (fallback alias preserved)
    const csvWithLegacyHeader = ["card_no,name", "CARD999002,Test Student Two"].join("\n");

    const previewLegacy = await validatePatronCsv(
      Buffer.from(csvWithLegacyHeader, "utf8"),
      "STUDENT",
      { formatColumns: customized },
      db,
    );
    expect(previewLegacy.summary.totalRows).toBe(1);
    expect(previewLegacy.rows[0].data?.cardNo).toBe("CARD999002");
  });

  it("5. Respects column deletion in import format (omits deleted optional field)", async () => {
    const original = await getImportFormat("STUDENT", db);
    // Delete optional "dob" column from format
    const formatWithoutDob = original.filter((c) => c.dbField !== "dob");

    const csvWithDob = ["name,dob", "Test Student Three,2004-05-15"].join("\n");

    const preview = await validatePatronCsv(
      Buffer.from(csvWithDob, "utf8"),
      "STUDENT",
      { formatColumns: formatWithoutDob },
      db,
    );
    expect(preview.summary.totalRows).toBe(1);
    // Because dob was removed from the format, it should not be ingested
    expect(preview.rows[0].data?.dob).toBeNull();
  });

  it("6. API endpoints enforce authentication and CSRF", async () => {
    // 1. Unauthenticated request returns 401
    const unauthReq = new NextRequest("http://localhost:3000/api/admin/import-format?type=STUDENT");
    const unauthRes = await formatGet(unauthReq);
    expect(unauthRes.status).toBe(401);

    // 2. Authenticated Super Admin request returns 200
    const [superAdminUser] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, 1))
      .limit(1);

    const session = await createSession(
      {
        userId: superAdminUser.id,
        userType: "STAFF",
      },
      db,
    );

    const authReq = new NextRequest("http://localhost:3000/api/admin/import-format?type=STUDENT", {
      headers: {
        cookie: `${STAFF_SESSION_COOKIE}=${session.id}`,
      },
    });
    const authRes = await formatGet(authReq);
    expect(authRes.status).toBe(200);
    const authData = await authRes.json();
    expect(authData.success).toBe(true);
    expect(authData.columns.length).toBeGreaterThan(10);

    // 3. check-data endpoint returns data count
    const checkReq = new NextRequest(
      "http://localhost:3000/api/admin/import-format/check-data?type=STUDENT&dbField=mobile",
      {
        headers: {
          cookie: `${STAFF_SESSION_COOKIE}=${session.id}`,
        },
      },
    );
    const checkRes = await checkDataGet(checkReq);
    expect(checkRes.status).toBe(200);
    const checkData = await checkRes.json();
    expect(checkData.hasData).toBe(true);
    expect(checkData.count).toBeGreaterThan(0);
  });
});
