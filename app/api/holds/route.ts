import { type NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";
import { validateCsrfToken } from "@/lib/csrf";
import { listHolds, placeHold } from "@/services/holds";

export async function GET(request: NextRequest) {
  try {
    const authContext = await requireAuthenticatedUser(undefined, { request });
    const { searchParams } = new URL(request.url);

    const bibIdParam = searchParams.get("bibId");
    const bibId = bibIdParam ? parseInt(bibIdParam, 10) : undefined;
    const patronIdParam = searchParams.get("patronId");
    let patronId = patronIdParam ? parseInt(patronIdParam, 10) : undefined;
    const status = searchParams.get("status") ?? undefined;
    const search = searchParams.get("search") ?? undefined;

    if (authContext.session.userType === "PATRON") {
      // Patrons can only view their own holds
      patronId = authContext.session.userId;
    } else {
      // Staff: check HOLD_MANAGE or CIRC_VIEW permissions
      // biome-ignore lint/suspicious/noExplicitAny: StaffAuthContext permissions check
      const staffContext = authContext as any;
      if (
        !staffContext.permissions?.includes("HOLD_MANAGE") &&
        !staffContext.permissions?.includes("CIRC_VIEW")
      ) {
        return NextResponse.json(
          { success: false, error: "Forbidden: HOLD_MANAGE permission required" },
          { status: 403 },
        );
      }
    }

    const holds = await listHolds({ bibId, patronId, status, search });
    return NextResponse.json({ success: true, holds });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode ?? 400;
    return NextResponse.json(
      { success: false, error: err.message ?? "Failed to fetch holds" },
      { status },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authContext = await requireAuthenticatedUser(undefined, { request });
    const body = await request.json().catch(() => ({}));
    const csrfToken = request.headers.get("x-csrf-token") ?? body.csrfToken;

    if (!validateCsrfToken(authContext.session.csrfToken, csrfToken)) {
      return NextResponse.json(
        { success: false, error: "Invalid or missing CSRF token" },
        { status: 403 },
      );
    }

    const { bibId, referenceDate } = body;
    let patronId = body.patronId;

    if (!bibId || Number.isNaN(Number(bibId))) {
      return NextResponse.json(
        { success: false, error: "Valid Bibliographic ID (bibId) is required" },
        { status: 400 },
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
      patronId = patronCtx.session.userId;
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
      if (!patronId || Number.isNaN(Number(patronId))) {
        return NextResponse.json(
          { success: false, error: "Patron ID is required when placing hold as staff" },
          { status: 400 },
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

    const result = await placeHold(
      {
        patronId: Number(patronId),
        bibId: Number(bibId),
        referenceDate,
      },
      actor,
    );

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const message = err.message ?? "Failed to place hold";
    let status = err.statusCode ?? 400;
    if (
      message.includes("Patron already has an active hold") ||
      message.includes("duplicate key")
    ) {
      status = 409;
    }
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
