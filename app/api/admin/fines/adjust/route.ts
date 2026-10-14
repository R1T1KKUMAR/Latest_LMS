import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { validateCsrfToken } from "@/lib/csrf";
import { adjustFineAmount } from "@/services/fines";

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

    const { fineId, newAmount, reason } = body;

    if (!fineId || newAmount === undefined || !reason) {
      return NextResponse.json(
        { success: false, error: "fineId, newAmount, and reason are required" },
        { status: 400 },
      );
    }

    const result = await adjustFineAmount(
      {
        fineId: Number(fineId),
        newAmount: Number(newAmount),
        reason: String(reason),
      },
      {
        id: authContext.user.id,
        fullName: authContext.user.fullName,
        actorType: "STAFF",
        ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
      },
    );

    return NextResponse.json({
      success: true,
      message: `Fine #${fineId} adjusted to ₹${Number(newAmount).toFixed(2)}.`,
      result,
    });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode ?? 400;
    return NextResponse.json({ success: false, error: err.message ?? "Server error" }, { status });
  }
}
