import { migrate } from "drizzle-orm/postgres-js/migrator";
import { client, db } from "./client";

export async function runMigrations() {
  console.log("Applying database migrations...");
  // biome-ignore lint/suspicious/noExplicitAny: Support both drivers
  await migrate(db as any, { migrationsFolder: "./db/migrations" });
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
