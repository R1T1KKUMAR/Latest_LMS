import fs from "fs";
import path from "path";
import { eq, sql } from "drizzle-orm";
import { validatePatronCsv } from "../services/patron-import";
import { db } from "../db";
import * as schema from "../db/schema";

async function main() {
  const itemLibs = await db.select({
    libId: schema.items.libraryId,
    count: sql`count(*)`,
  }).from(schema.items).groupBy(schema.items.libraryId);
  console.log("Items per library:", itemLibs);

  const bibDepts = await db.select({
    deptId: schema.bibRecords.departmentId,
    deptCode: schema.departments.code,
    deptName: schema.departments.name,
    instId: schema.departments.institutionId,
    count: sql`count(*)`,
  })
  .from(schema.bibRecords)
  .leftJoin(schema.departments, eq(schema.bibRecords.departmentId, schema.departments.id))
  .groupBy(schema.bibRecords.departmentId, schema.departments.code, schema.departments.name, schema.departments.institutionId);

  console.log("Bib records with department details:", bibDepts);
  process.exit(0);
}

main().catch(err => {
  console.error("Error running test:", err);
  process.exit(1);
});
