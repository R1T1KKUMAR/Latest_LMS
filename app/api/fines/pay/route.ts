import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { validateCsrfToken } from "@/lib/csrf";
import { collectPayment, type PaymentMethod } from "@/services/fines";

export async function POST(request: NextRequest) {
  try {
    const authContext = await requirePermission("FINE_COLLECT", { request });
    const body = await request.json().catch(() => ({}));
    const csrfToken = request.headers.get("x-csrf-token") ?? body.csrfToken;

    if (!validateCsrfToken(authContext.session.csrfToken, csrfToken)) {
      return NextResponse.json(
        { success: false, error: "Invalid or missing CSRF token" },
        { status: 403 },
      );
    }

    const { fineId, amount, paymentMethod, remarks, referenceDate } = body;

    const parsedFineId = parseInt(fineId, 10);
    if (Number.isNaN(parsedFineId)) {
      return NextResponse.json(
        { success: false, error: "Valid fine ID is required" },
        { status: 400 },
      );
    }

    const parsedAmount = Number(amount);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      return NextResponse.json(
        { success: false, error: "Payment amount must be greater than zero" },
        { status: 400 },
      );
    }

    const validMethods: PaymentMethod[] = ["CASH", "UPI", "CARD", "ONLINE"];
    if (!paymentMethod || !validMethods.includes(paymentMethod)) {
      return NextResponse.json(
        {
          success: false,
          error: `Payment method must be one of: ${validMethods.join(", ")}`,
        },
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

    const result = await collectPayment(
      {
        fineId: parsedFineId,
        amount: parsedAmount,
        paymentMethod,
        remarks,
        referenceDate,
      },
      actor,
    );

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const message = err.message ?? "Failed to collect payment";
    let status = err.statusCode ?? 400;
    if (message.includes("not found")) {
      status = 404;
    }
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
