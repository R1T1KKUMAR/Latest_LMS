import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

async function exportSql() {
  const dbDir = path.resolve(process.cwd(), "data/lms-db");
  const pg = new PGlite(dbDir);
  const migrationPath = path.resolve(process.cwd(), "db/migrations/0000_abnormal_the_fallen.sql");
  const migrationSql = fs.readFileSync(migrationPath, "utf8");

  let dump = "-- ========================================================\n";
  dump += "-- RBMI LIBRARY MANAGEMENT SYSTEM - COMPLETE DATABASE DUMP\n";
  dump += `-- Generated: ${new Date().toISOString()}\n`;
  dump += "-- Includes full schema DDL, views, triggers, and all table data\n";
  dump += "-- ========================================================\n\n";

  dump += "-- ========================================================\n";
  dump += "-- 1. SCHEMA DDL & MIGRATIONS\n";
  dump += "-- ========================================================\n\n";
  dump += migrationSql;
  dump += "\n\n-- ========================================================\n";
  dump += "-- 2. TABLE DATA DUMP (INSERT STATEMENTS)\n";
  dump += "-- ========================================================\n\n";

  // Foreign key order
  const tables = [
    "institutions",
    "libraries",
    "departments",
    "courses",
    "roles",
    "permissions",
    "role_permissions",
    "users",
    "patron_categories",
    "patrons",
    "item_types",
    "bib_records",
    "items",
    "vendors",
    "circulation_rules",
    "fines",
    "loans",
    "holds",
    "system_settings",
    "import_batches",
    "payments",
    "audit_logs",
    "sessions",
  ];

  for (const table of tables) {
    try {
      const res = await pg.query<Record<string, unknown>>(`SELECT * FROM "${table}"`);
      if (res.rows.length === 0) continue;

      dump += `-- Table: ${table} (${res.rows.length} records)\n`;
      for (const row of res.rows) {
        const cols = Object.keys(row);
        const colList = cols.map((c) => `"${c}"`).join(", ");
        const valList = cols
          .map((c) => {
            const val = row[c];
            if (val === null || val === undefined) return "NULL";
            if (typeof val === "number" || typeof val === "boolean") return String(val);
            if (val instanceof Date) return `'${val.toISOString()}'`;
            if (typeof val === "object") return `'${JSON.stringify(val).replaceAll("'", "''")}'`;
            return `'${String(val).replaceAll("'", "''")}'`;
          })
          .join(", ");

        dump += `INSERT INTO "${table}" (${colList}) VALUES (${valList}) ON CONFLICT DO NOTHING;\n`;
      }
      dump += "\n";
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`Table ${table} skipped or empty: ${msg}`);
    }
  }

  const dumpPath1 = path.resolve(process.cwd(), "db/database_dump.sql");
  const dumpPath2 = path.resolve(process.cwd(), "db/complete_database.sql");
  fs.writeFileSync(dumpPath1, dump, "utf8");
  fs.writeFileSync(dumpPath2, dump, "utf8");

  console.log(`✅ Complete database dump successfully written to:`);
  console.log(`   - ${dumpPath1}`);
  console.log(`   - ${dumpPath2}`);
  console.log(`   Total size: ${(dump.length / 1024).toFixed(2)} KB`);

  await pg.close();
}

exportSql().catch(console.error);
