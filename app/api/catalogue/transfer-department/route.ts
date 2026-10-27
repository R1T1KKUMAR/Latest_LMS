import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { validateCsrfToken } from "@/lib/csrf";
import { transferBooksDepartment } from "@/services/catalogue";

export async function POST(request: NextRequest) {
  try {
    const authContext = await requirePermission("CATALOG_MANAGE", { request });

    const body = await request.json().catch(() => ({}));
    const csrfToken = request.headers.get("x-csrf-token") ?? body.csrfToken;

    if (!validateCsrfToken(authContext.session.csrfToken, csrfToken)) {
      return NextResponse.json(
        { success: false, error: "Invalid or missing CSRF token" },
        { status: 403 },
      );
    }

    const { itemIds, targetDepartmentId } = body;

    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return NextResponse.json(
        { success: false, error: "Please select at least one book to transfer" },
        { status: 400 },
      );
    }

    if (!targetDepartmentId) {
      return NextResponse.json(
        { success: false, error: "Target department is required" },
        { status: 400 },
      );
    }

    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      undefined;

    const result = await transferBooksDepartment(itemIds.map(Number), Number(targetDepartmentId), {
      id: authContext.user.id,
      fullName: authContext.user.fullName,
      ipAddress,
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode ?? 400;
    return NextResponse.json(
      {
        success: false,
        error: err.message ?? "Failed to transfer books to department",
      },
      { status },
    );
  }
}
