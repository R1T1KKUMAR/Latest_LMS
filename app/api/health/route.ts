import { NextResponse } from "next/server";
import { env } from "@/config/env";
import { checkDatabaseConnection } from "@/db/client";

export async function GET() {
  const dbCheck = await checkDatabaseConnection();
  const isHealthy = dbCheck.connected;

  const healthData = {
    status: isHealthy ? "ok" : "degraded",
    application: "rbmi-lms",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    environment: env.NODE_ENV,
    checks: {
      application: "healthy",
      nodeVersion: process.version,
      database: dbCheck,
    },
  };

  return NextResponse.json(healthData, { status: isHealthy ? 200 : 503 });
}
