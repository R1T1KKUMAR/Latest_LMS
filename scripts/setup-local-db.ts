import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../db/schema";
import { seedDatabase } from "../db/seed";

export async function initLocalPglite() {
  const dbDir = path.resolve(process.cwd(), "data/lms-db");
  fs.mkdirSync(dbDir, { recursive: true });

  console.log("Initializing persistent PGlite at:", dbDir);
  const pg = new PGlite(dbDir);

  const migrationPath = path.resolve(process.cwd(), "db/migrations/0000_abnormal_the_fallen.sql");
  const sql = fs.readFileSync(migrationPath, "utf8");
  const statements = sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

  console.log(`Executing ${statements.length} migration statements...`);
  for (const stmt of statements) {
    try {
      await pg.exec(stmt);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("already exists")) {
        console.warn("Migration warning:", msg);
      }
    }
  }

  console.log("Seeding baseline data...");
  const db = drizzle(pg, { schema });
  try {
    await seedDatabase(db as any);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("duplicate key") && !msg.includes("already exists")) {
      console.warn("Seed warning:", msg);
    }
  }

  console.log("✅ Local persistent database is ready!");
  await pg.close();
}

if (process.argv[1]?.includes("setup-local-db")) {
  initLocalPglite().catch(console.error);
}
