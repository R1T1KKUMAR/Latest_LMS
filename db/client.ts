import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/config/env";
import * as schema from "@/db/schema";

// Connection pool options for Supabase / PostgreSQL
const connectionOptions = {
  max: 10,
  idle_timeout: 60,
  connect_timeout: 10,
  prepare: false, // Supabase transaction pooler on port 6543 requires prepare: false
  onnotice: () => {}, // Suppress notice logs
};

// Global pool instance to prevent multiple connections in development fast-refresh
const globalForDb = globalThis as unknown as {
  conn: postgres.Sql | undefined;
};

const conn = globalForDb.conn ?? postgres(env.DATABASE_URL, connectionOptions);

if (env.NODE_ENV !== "production") {
  globalForDb.conn = conn;
}

// biome-ignore lint/suspicious/noExplicitAny: Dynamic database instance supporting PGlite test DB
export let db: any = drizzle(conn, { schema });

/**
 * Health check helper verifying connection pool availability
 */
export async function checkDatabaseConnection(): Promise<{
  connected: boolean;
  version?: string;
  error?: string;
}> {
  try {
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

/**
 * Allows integration tests to provide a test database instance
 */
// biome-ignore lint/suspicious/noExplicitAny: Test database instance
export function setTestDb(testDbInstance: any) {
  db = testDbInstance;
}

export type AnyDatabase = any;
export const isPglite = false;
