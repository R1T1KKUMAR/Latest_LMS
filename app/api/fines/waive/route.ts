import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { validateCsrfToken } from "@/lib/csrf";
import { waiveFine } from "@/services/fines";

export async function POST(request: NextRequest) {
  try {
    const authContext = await requirePermission("FINE_WAIVE", { request });
    const body = await request.json().catch(() => ({}));
    const csrfToken = request.headers.get("x-csrf-token") ?? body.csrfToken;

    if (!validateCsrfToken(authContext.session.csrfToken, csrfToken)) {
      return NextResponse.json(
        { success: false, error: "Invalid or missing CSRF token" },
        { status: 403 },
      );
    }

    const { fineId, remarks, referenceDate } = body;

    const parsedFineId = parseInt(fineId, 10);
    if (Number.isNaN(parsedFineId)) {
      return NextResponse.json(
        { success: false, error: "Valid fine ID is required" },
        { status: 400 },
      );
    }

    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      undefined;

    const actor = {
      id: authContext.user.id,
      fullName: authContext.user.fullName,
      actorType: "STAFF" as const,
      ipAddress,
    };

    const result = await waiveFine(
      {
        fineId: parsedFineId,
        remarks,
        referenceDate,
      },
      actor,
    );

    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const message = err.message ?? "Failed to waive fine";
    let status = err.statusCode ?? 400;
    if (message.includes("not found")) {
      status = 404;
    }
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
