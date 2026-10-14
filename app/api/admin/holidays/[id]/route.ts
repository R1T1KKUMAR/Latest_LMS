import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { validateCsrfToken } from "@/lib/csrf";
import { deleteHoliday } from "@/services/holidays";

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const authContext = await requirePermission("ADMIN_SETTINGS", { request });
    const { id } = await context.params;

    const csrfToken = request.headers.get("x-csrf-token");
    if (!validateCsrfToken(authContext.session.csrfToken, csrfToken)) {
      return NextResponse.json(
        { success: false, error: "Invalid or missing CSRF token" },
        { status: 403 },
      );
    }

    const deleted = await deleteHoliday(id, {
      id: authContext.user.id,
      fullName: authContext.user.fullName,
      ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    });

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: "Holiday record not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Holiday removed successfully.",
    });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode ?? 500;
    return NextResponse.json({ success: false, error: err.message ?? "Server error" }, { status });
  }
}
