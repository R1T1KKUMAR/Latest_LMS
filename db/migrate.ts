import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import { client, db, isPglite } from "./client";

export async function runMigrations() {
  console.log("Applying database migrations...");
  if (isPglite) {
    // biome-ignore lint/suspicious/noExplicitAny: Support both drivers
    await migratePglite(db as any, { migrationsFolder: "./db/migrations" });
  } else {
    // biome-ignore lint/suspicious/noExplicitAny: Support both drivers
    await migratePostgres(db as any, { migrationsFolder: "./db/migrations" });
  }
  console.log("✅ Migrations applied successfully.");
}

async function main() {
  try {
    await runMigrations();
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

if (process.argv[1]?.includes("migrate")) {
  main();
}
