import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { validateCsrfToken } from "@/lib/csrf";
import { returnCopy } from "@/services/circulation";

export async function POST(request: NextRequest) {
  try {
    const authContext = await requirePermission("CIRC_RETURN", { request });

    const body = await request.json().catch(() => ({}));
    const csrfToken = request.headers.get("x-csrf-token") ?? body.csrfToken;

    if (!validateCsrfToken(authContext.session.csrfToken, csrfToken)) {
      return NextResponse.json(
        { success: false, error: "Invalid or missing CSRF token" },
        { status: 403 },
      );
    }

    const { barcodeOrAccession, referenceDate, deskLibraryId } = body;

    if (
      !barcodeOrAccession ||
      typeof barcodeOrAccession !== "string" ||
      !barcodeOrAccession.trim()
    ) {
      return NextResponse.json(
        { success: false, error: "Item Barcode / Accession Number is required" },
        { status: 400 },
      );
    }

    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      undefined;

    const result = await returnCopy(
      {
        barcodeOrAccession: barcodeOrAccession.trim(),
        referenceDate,
        deskLibraryId: deskLibraryId ? Number(deskLibraryId) : undefined,
      },
      {
        id: authContext.user.id,
        fullName: authContext.user.fullName,
        libraryId: authContext.user.libraryId,
        roleCode: authContext.user.roleCode,
        ipAddress,
      },
    );

    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode ?? 400;
    return NextResponse.json(
      { success: false, error: err.message ?? "Failed to return item" },
      { status },
    );
  }
}
