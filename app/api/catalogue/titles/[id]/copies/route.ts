import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { validateCsrfToken } from "@/lib/csrf";
import { addCopiesToTitle } from "@/services/catalogue";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authContext = await requirePermission("CATALOG_MANAGE", { request });
    const { id } = await params;
    const bibId = Number(id);

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

    const copies = await addCopiesToTitle(
      {
        ...body,
        bibId,
        libraryId: Number(body.libraryId || authContext.user.libraryId),
        count: Number(body.count || 1),
      },
      {
        id: authContext.user.id,
        fullName: authContext.user.fullName,
        ipAddress,
      },
    );

    return NextResponse.json({ success: true, copies }, { status: 201 });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string; issues?: unknown };
    const status = err.statusCode ?? 400;
    return NextResponse.json(
      {
        success: false,
        error: err.message ?? "Failed to add copies",
        issues: err.issues,
      },
      { status },
    );
  }
}
