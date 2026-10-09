import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { validateCsrfToken } from "@/lib/csrf";
import { processExpiredHolds } from "@/services/holds";

export async function POST(request: NextRequest) {
  try {
    const authContext = await requirePermission("HOLD_MANAGE", { request });
    const body = await request.json().catch(() => ({}));
    const csrfToken = request.headers.get("x-csrf-token") ?? body.csrfToken;

    if (!validateCsrfToken(authContext.session.csrfToken, csrfToken)) {
      return NextResponse.json(
        { success: false, error: "Invalid or missing CSRF token" },
        { status: 403 },
      );
    }

    const { referenceDate } = body;
    const result = await processExpiredHolds(referenceDate);

    return NextResponse.json(
      {
        success: true,
        processedCount: result.processedCount,
        results: result.results,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode ?? 400;
    return NextResponse.json(
      { success: false, error: err.message ?? "Failed to process expired holds" },
      { status },
    );
  }
}
