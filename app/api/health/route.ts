import { NextResponse } from "next/server";
import { env } from "@/config/env";

export async function GET() {
  const healthData = {
    status: "ok",
    application: "rbmi-lms",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    environment: env.NODE_ENV,
    checks: {
      application: "healthy",
      nodeVersion: process.version,
    },
  };

  return NextResponse.json(healthData, { status: 200 });
}
