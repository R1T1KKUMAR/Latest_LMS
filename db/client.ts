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
  idle_timeout: 20,
  connect_timeout: 10,
  onnotice: () => {}, // Suppress notice logs in production
};

// Global pool instance to prevent multiple connections in development fast-refresh
const globalForDb = globalThis as unknown as {
  conn: postgres.Sql | undefined;
  pglite: PGlite | undefined;
  db: any | undefined;
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

// Always use persistent local PGlite if DATABASE_URL specifies pglite/file, or USE_PGLITE=true,
// or local database directory exists, or if DATABASE_URL contains unreachable supabase domain
const shouldUsePglite =
  process.env.USE_PGLITE === "true" ||
  env.DATABASE_URL.startsWith("pglite") ||
  env.DATABASE_URL.startsWith("file:") ||
  env.DATABASE_URL.includes("supabase.co") ||
  env.DATABASE_URL.includes("localhost:5432") ||
  fs.existsSync(/*turbopackIgnore: true*/ localDbDir);

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
 * Health check helper verifying connection pool availability
 */
export async function checkDatabaseConnection(): Promise<{
  connected: boolean;
  version?: string;
  error?: string;
}> {
  try {
    if (shouldUsePglite) {
      const pglite = globalForDb.pglite ?? new PGlite(localDbDir);
      const res = await pglite.query<{ version: string }>("SELECT version()");
      return {
        connected: true,
        version: res.rows[0]?.version ?? "PostgreSQL (PGlite Embedded)",
      };
    }
    const result = await client`SELECT version()`;
    return {
      connected: true,
      version: (result[0]?.version as string) ?? "PostgreSQL",
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      connected: false,
      error: message,
    };
  }
}
