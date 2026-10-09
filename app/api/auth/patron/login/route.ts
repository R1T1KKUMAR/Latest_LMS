import { type NextRequest, NextResponse } from "next/server";
import { PATRON_SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { loginPatron } from "@/services/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { identifier, password } = body;

    const ipAddress =
      req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "127.0.0.1";

    const result = await loginPatron({
      identifier,
      password,
      ipAddress,
    });

    if (!result.success || !result.session) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }

    const response = NextResponse.json({
      success: true,
      patron: result.patron,
      mustChangePassword: result.mustChangePassword,
      csrfToken: result.session.csrfToken,
    });

    response.cookies.set(PATRON_SESSION_COOKIE, result.session.id, sessionCookieOptions);

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
