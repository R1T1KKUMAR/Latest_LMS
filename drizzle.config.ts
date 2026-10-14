import * as dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

// Load .env.local for CLI commands (db:migrate, db:seed, db:generate)
dotenv.config({ path: ".env.local" });

export default defineConfig({
  schema: "./db/schema/index.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
