import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { validateCsrfToken } from "@/lib/csrf";
import { deleteImportBatch } from "@/services/batch-import-management";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authContext = await requirePermission("ADMIN_SETTINGS", { request }).catch(async () => {
      return await requirePermission("PATRON_IMPORT", { request });
    });

    const { id } = await params;
    const batchId = Number(id);

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

    const result = await deleteImportBatch(
      batchId,
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
        error: err.message ?? "Failed to delete batch",
      },
      { status },
    );
  }
}
