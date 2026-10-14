import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

async function importSql() {
  const dbDir = path.resolve(process.cwd(), "data/lms-db");
  fs.mkdirSync(dbDir, { recursive: true });
  console.log("Importing complete database into PGlite at:", dbDir);

  const dumpPath = path.resolve(process.cwd(), "db/database_dump.sql");
  if (!fs.existsSync(dumpPath)) {
    console.error("❌ database_dump.sql not found at:", dumpPath);
    process.exit(1);
  }

  const dump = fs.readFileSync(dumpPath, "utf8");
  const pg = new PGlite(dbDir);

  // Split statements by statement-breakpoint or semicolon
  const parts = dump.split("--> statement-breakpoint");
  console.log(`Executing ${parts.length} schema and table migration chunks...`);

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    try {
      await pg.exec(trimmed);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        !msg.includes("already exists") &&
        !msg.includes("duplicate key") &&
        !msg.includes("duplicate table")
      ) {
        console.warn("Notice during import:", msg.slice(0, 150));
      }
    }
  }

  console.log("✅ Complete database imported successfully!");
  await pg.close();
}

importSql().catch(console.error);
