import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { validateCsrfToken } from "@/lib/csrf";
import { createStaffUser, listStaffUsers } from "@/services/user";

export async function GET(request: NextRequest) {
  try {
    await requirePermission("ADMIN_USERS", { request });
    const users = await listStaffUsers();
    return NextResponse.json({ success: true, users });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode ?? 500;
    return NextResponse.json({ success: false, error: err.message ?? "Server error" }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authContext = await requirePermission("ADMIN_USERS", { request });

    const body = await request.json().catch(() => ({}));
    const csrfToken = request.headers.get("x-csrf-token") ?? body.csrfToken;

    if (!validateCsrfToken(authContext.session.csrfToken, csrfToken)) {
      return NextResponse.json(
        { success: false, error: "Invalid or missing CSRF token" },
        { status: 403 },
      );
    }

    const { username, fullName, password, roleId, libraryId } = body;
    if (!username || !fullName || !password || !roleId || !libraryId) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: username, fullName, password, roleId, libraryId",
        },
        { status: 400 },
      );
    }

    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      undefined;

    const result = await createStaffUser(
      {
        username,
        fullName,
        password,
        roleId: Number(roleId),
        libraryId: Number(libraryId),
      },
      {
        actorId: authContext.user.id,
        actorName: authContext.user.fullName,
        ipAddress,
      },
    );

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, user: result.user }, { status: 201 });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode ?? 500;
    return NextResponse.json({ success: false, error: err.message ?? "Server error" }, { status });
  }
}
