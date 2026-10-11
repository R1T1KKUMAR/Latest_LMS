import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { validateCsrfToken } from "@/lib/csrf";
import { issueNoDuesCertificate } from "@/services/nodues";

export async function POST(request: NextRequest) {
  try {
    const authContext = await requirePermission("NODUES_ISSUE", { request });
    const body = await request.json().catch(() => ({}));
    const csrfToken = request.headers.get("x-csrf-token") ?? body.csrfToken;

    if (!validateCsrfToken(authContext.session.csrfToken, csrfToken)) {
      return NextResponse.json(
        { success: false, error: "Invalid or missing CSRF token" },
        { status: 403 },
      );
    }

    const { patronId, closeAccount, remarks, referenceDate } = body;

    const parsedPatronId = parseInt(patronId, 10);
    if (Number.isNaN(parsedPatronId) || parsedPatronId <= 0) {
      return NextResponse.json(
        { success: false, error: "Valid patron ID is required" },
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

    const result = await issueNoDuesCertificate(
      {
        patronId: parsedPatronId,
        closeAccount: closeAccount !== false, // default true
        remarks,
        referenceDate: referenceDate ? new Date(referenceDate) : undefined,
      },
      actor,
    );

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const message = err.message ?? "Failed to issue No-Dues certificate";
    let status = err.statusCode ?? 400;
    if (message.includes("not found")) {
      status = 404;
    }
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
