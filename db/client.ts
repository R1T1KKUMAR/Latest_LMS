import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/config/env";
import * as schema from "@/db/schema";

export type AnyDatabase = PostgresJsDatabase<typeof schema> | PgliteDatabase<typeof schema>;

// Connection pool options for remote / standalone PostgreSQL
const connectionOptions = {
  max: 10,
  idle_timeout: 120, // Keep pooled connections alive for 2 minutes to eliminate repeated 1s TLS handshakes
  connect_timeout: 15,
  prepare: false, // Essential for Supabase pooler and serverless compatibility
  onnotice: () => {}, // Suppress notice logs in production
};

// Global pool instance to prevent multiple connections in development fast-refresh
const globalForDb = globalThis as unknown as {
  conn: postgres.Sql | undefined;
  pglite: PGlite | undefined;
  db: any | undefined;
  dbReady: Promise<void> | undefined;
};

// Find local database directory across potential working directories (root vs nested LMS folder)
function resolveLocalDbDir(): string {
  const candidates = [
    path.resolve(process.cwd(), "data/lms-db"),
    path.resolve(process.cwd(), "LMS/data/lms-db"),
    path.resolve(__dirname, "../data/lms-db"),
    path.resolve(__dirname, "../../data/lms-db"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(/*turbopackIgnore: true*/ dir)) return dir;
  }
  return path.resolve(process.cwd(), "data/lms-db");
}

const localDbDir = resolveLocalDbDir();

// Only use PGlite if explicitly configured via USE_PGLITE=true or a pglite: URL
const shouldUsePglite =
  process.env.USE_PGLITE === "true" ||
  env.DATABASE_URL.startsWith("pglite") ||
  env.DATABASE_URL.startsWith("file:");

let clientInstance: any;
let dbInstance: AnyDatabase;

if (shouldUsePglite) {
  if (!fs.existsSync(/*turbopackIgnore: true*/ localDbDir)) {
    fs.mkdirSync(localDbDir, { recursive: true });
  }

  const pglite = globalForDb.pglite ?? new PGlite(localDbDir);
  if (env.NODE_ENV !== "production") {
    globalForDb.pglite = pglite;
  }

  clientInstance = {
    end: async () => {
      try {
        await pglite.close();
      } catch {
        // ignore on close
      }
    },
  };

  dbInstance = drizzlePglite(pglite, { schema });
  globalForDb.db = dbInstance;
} else {
  const conn = globalForDb.conn ?? postgres(env.DATABASE_URL, connectionOptions);
  if (env.NODE_ENV !== "production") {
    globalForDb.conn = conn;
  }

  clientInstance = conn;
  dbInstance = drizzlePostgres(conn, { schema });
  globalForDb.db = dbInstance;
}

export const isPglite = shouldUsePglite;
export const client = clientInstance;

export let db: AnyDatabase = globalForDb.db ?? dbInstance;

if (env.NODE_ENV !== "production") {
  globalForDb.db = db;
}

/**
 * Allows integration tests to provide a test database instance (e.g. in-memory PGlite)
 */
export function setTestDb(testDbInstance: any) {
  db = testDbInstance;
  globalForDb.db = testDbInstance;
}

/**
 * Returns a sanitized database connection string with credentials masked for safe display and logging.
 */
export function getSanitizedDatabaseUrl(): string {
  if (shouldUsePglite) {
    return `pglite://${localDbDir}`;
  }
  try {
    const raw = env.DATABASE_URL;
    const u = new URL(raw);
    if (u.password) {
      u.password = "******";
    }
    return u.toString();
  } catch {
    return "postgresql://[host]/[db]";
  }
}

/**
 * Checks if the database schema has been initialized by probing for the system_settings table (FR-ST-01).
 * Returns true if the schema is present, false if it needs to be created.
 */
async function isSchemaInitialized(): Promise<boolean> {
  try {
    if (shouldUsePglite) {
      const pglite = globalForDb.pglite ?? new PGlite(localDbDir);
      const result = await pglite.query<{ exists: boolean }>(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'system_settings'
        ) AS exists`,
      );
      return result.rows[0]?.exists === true;
    }

    const result = await client`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'system_settings'
      ) AS exists
    `;
    return result[0]?.exists === true;
  } catch {
    return false;
  }
}

/**
 * Auto-initializes the database by running migrations and seeding
 * if the schema is not yet present (FR-ST-01, FR-ST-03).
 * This is idempotent and safe to call multiple times.
 */
async function autoInitDb(): Promise<void> {
  const initialized = await isSchemaInitialized();
  if (initialized) return;

  console.log(
    "📦 Auto-setup (FR-ST-01): system_settings table absent. Initializing database schema...",
  );

  try {
    const migrationPath = (() => {
      const candidates = [
        path.resolve(process.cwd(), "db/migrations/0000_abnormal_the_fallen.sql"),
        path.resolve(process.cwd(), "LMS/db/migrations/0000_abnormal_the_fallen.sql"),
        path.resolve(__dirname, "migrations/0000_abnormal_the_fallen.sql"),
        path.resolve(__dirname, "../db/migrations/0000_abnormal_the_fallen.sql"),
      ];
      for (const p of candidates) {
        if (fs.existsSync(/*turbopackIgnore: true*/ p)) return p;
      }
      return path.resolve(process.cwd(), "db/migrations/0000_abnormal_the_fallen.sql");
    })();

    if (shouldUsePglite) {
      const { migrate } = await import("drizzle-orm/pglite/migrator");
      const migrationsFolder = path.dirname(migrationPath);
      console.log("📦 Applying PGlite migrations from:", migrationsFolder);
      await migrate(db as PgliteDatabase<typeof schema>, { migrationsFolder });
    } else {
      if (fs.existsSync(migrationPath)) {
        console.log("📦 Applying PostgreSQL migrations from:", migrationPath);
        const sqlContent = fs.readFileSync(migrationPath, "utf8");
        await client.unsafe(sqlContent);
      }
    }
    console.log("✅ Database schema created successfully.");

    // Seed initial master data, rules, settings, users per FR-ST-03
    const { seedDatabase } = await import("./seed");
    await seedDatabase(db);
    console.log(
      "🌱 Database seeded with initial master data, roles, rules, settings, and users (FR-ST-03).",
    );
  } catch (err) {
    console.error("❌ Auto-setup failed:", err);
    throw err;
  }
}

/**
 * Returns a promise that resolves once the database is ready (schema + seed applied).
 * On failure, clears cached promise so subsequent requests retry automatically when DB recovers (FR-ST-02).
 */
export function ensureDbReady(): Promise<void> {
  if (!globalForDb.dbReady) {
    globalForDb.dbReady = autoInitDb().catch((err) => {
      // Clear cached promise on failure so subsequent requests can retry once DB is online (FR-ST-02)
      globalForDb.dbReady = undefined;
      throw err;
    });
  }
  return globalForDb.dbReady;
}

// Kick off auto-init eagerly so it's ready before the first request
if (typeof window === "undefined") {
  ensureDbReady().catch((err) => {
    console.warn(
      "⚠️ Initial DB check/auto-init deferred:",
      err instanceof Error ? err.message : String(err),
    );
  });
}

/**
 * Health check helper verifying connection pool availability and returning sanitized URL (FR-ST-02).
 */
export async function checkDatabaseConnection(): Promise<{
  connected: boolean;
  version?: string;
  error?: string;
  sanitizedUrl: string;
}> {
  const sanitizedUrl = getSanitizedDatabaseUrl();
  try {
    if (shouldUsePglite) {
      const pglite = globalForDb.pglite ?? new PGlite(localDbDir);
      const res = await pglite.query<{ version: string }>("SELECT version()");
      return {
        connected: true,
        version: res.rows[0]?.version ?? "PostgreSQL (PGlite Embedded)",
        sanitizedUrl,
      };
    }
    const result = await client`SELECT version()`;
    return {
      connected: true,
      version: (result[0]?.version as string) ?? "PostgreSQL",
      sanitizedUrl,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      connected: false,
      error: message,
      sanitizedUrl,
    };
  }
}
