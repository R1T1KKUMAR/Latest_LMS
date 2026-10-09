import { type NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";
import { validateCsrfToken } from "@/lib/csrf";
import { cancelHold } from "@/services/holds";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const holdId = parseInt(id, 10);

    if (Number.isNaN(holdId)) {
      return NextResponse.json(
        { success: false, error: "Valid hold ID is required" },
        { status: 400 },
      );
    }

    const authContext = await requireAuthenticatedUser(undefined, { request });
    const body = await request.json().catch(() => ({}));
    const csrfToken = request.headers.get("x-csrf-token") ?? body.csrfToken;

    if (!validateCsrfToken(authContext.session.csrfToken, csrfToken)) {
      return NextResponse.json(
        { success: false, error: "Invalid or missing CSRF token" },
        { status: 403 },
      );
    }

    let actor: {
      id: number;
      fullName: string;
      actorType: "STAFF" | "PATRON";
      ipAddress?: string;
    };

    if (authContext.session.userType === "PATRON") {
      // biome-ignore lint/suspicious/noExplicitAny: PatronAuthContext access
      const patronCtx = authContext as any;
      actor = {
        id: patronCtx.patron.id,
        fullName: [patronCtx.patron.firstName, patronCtx.patron.lastName].filter(Boolean).join(" "),
        actorType: "PATRON",
      };
    } else {
      // biome-ignore lint/suspicious/noExplicitAny: StaffAuthContext access
      const staffCtx = authContext as any;
      if (!staffCtx.permissions?.includes("HOLD_MANAGE")) {
        return NextResponse.json(
          { success: false, error: "Forbidden: HOLD_MANAGE permission required" },
          { status: 403 },
        );
      }
      actor = {
        id: staffCtx.user.id,
        fullName: staffCtx.user.fullName,
        actorType: "STAFF",
      };
    }

    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      undefined;

    actor.ipAddress = ipAddress;

    const result = await cancelHold(
      {
        holdId,
        reason: body.reason,
        referenceDate: body.referenceDate,
      },
      actor,
    );

    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode ?? 400;
    return NextResponse.json(
      { success: false, error: err.message ?? "Failed to cancel hold" },
      { status },
    );
  }
}
