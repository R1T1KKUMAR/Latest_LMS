import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { validateCsrfToken } from "@/lib/csrf";
import { deletePatron, getPatronById, updatePatron } from "@/services/patron";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("PATRON_VIEW", { request });
    const { id } = await params;
    const patronId = Number(id);

    const patron = await getPatronById(patronId);
    if (!patron) {
      return NextResponse.json(
        { success: false, error: `Patron #${id} not found` },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, patron });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode ?? 500;
    return NextResponse.json({ success: false, error: err.message ?? "Server error" }, { status });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authContext = await requirePermission("PATRON_MANAGE", { request });
    const { id } = await params;
    const patronId = Number(id);

    const body = await request.json().catch(() => ({}));
    const csrfToken = request.headers.get("x-csrf-token") ?? body.csrfToken;

    if (!validateCsrfToken(authContext.session.csrfToken, csrfToken)) {
      return NextResponse.json(
        { success: false, error: "Invalid or missing CSRF token" },
        { status: 403 },
      );
    }

    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      undefined;

    const updated = await updatePatron(patronId, body, {
      id: authContext.user.id,
      fullName: authContext.user.fullName,
      ipAddress,
    });

    return NextResponse.json({ success: true, patron: updated });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string; issues?: unknown };
    const status = err.statusCode ?? 400;
    return NextResponse.json(
      {
        success: false,
        error: err.message ?? "Failed to update patron",
        issues: err.issues,
      },
      { status },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authContext = await requirePermission("PATRON_MANAGE", { request });
    const { id } = await params;
    const patronId = Number(id);

    const csrfToken = request.headers.get("x-csrf-token");
    if (!validateCsrfToken(authContext.session.csrfToken, csrfToken)) {
      return NextResponse.json(
        { success: false, error: "Invalid or missing CSRF token" },
        { status: 403 },
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const force = searchParams.get("force") === "true";

    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      undefined;

    const result = await deletePatron(
      patronId,
      {
        id: authContext.user.id,
        fullName: authContext.user.fullName,
        ipAddress,
      },
      { force },
    );

    return NextResponse.json(result);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode ?? 400;
    return NextResponse.json(
      {
        success: false,
        error: err.message ?? "Failed to delete patron",
      },
      { status },
    );
  }
}
