import { type NextRequest, NextResponse } from "next/server";
import { STAFF_SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { checkDatabaseConnection, ensureDbReady, getSanitizedDatabaseUrl } from "@/db/client";
import { loginStaff } from "@/services/auth";

export async function POST(req: NextRequest) {
  try {
    // 1. Check database connectivity per FR-ST-02
    const dbCheck = await checkDatabaseConnection();
    if (!dbCheck.connected) {
      return NextResponse.json(
        {
          success: false,
          dbUnreachable: true,
          error: `Database not reachable. Unable to connect to ${dbCheck.sanitizedUrl}. Error: ${dbCheck.error}`,
          dbUrl: dbCheck.sanitizedUrl,
        },
        { status: 503 },
      );
    }

    // 2. Ensure schema & seed are ready per FR-ST-01
    await ensureDbReady();

    const body = await req.json();
    const { username, password } = body;

    const ipAddress =
      req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "127.0.0.1";

    const result = await loginStaff({
      username,
      password,
      ipAddress,
    });

    if (!result.success || !result.session) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }

    const response = NextResponse.json({
      success: true,
      user: result.user,
      permissions: result.permissions,
      csrfToken: result.session.csrfToken,
    });

    response.cookies.set(STAFF_SESSION_COOKIE, result.session.id, sessionCookieOptions);

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const isConnError =
      message.includes("ECONNREFUSED") ||
      message.includes("ENOTFOUND") ||
      message.includes("Connection terminated") ||
      message.includes("timeout") ||
      message.includes("not reachable");

    if (isConnError) {
      const sanitizedUrl = getSanitizedDatabaseUrl();
      return NextResponse.json(
        {
          success: false,
          dbUnreachable: true,
          error: `Database not reachable. Unable to connect to ${sanitizedUrl}. Error: ${message}`,
          dbUrl: sanitizedUrl,
        },
        { status: 503 },
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
