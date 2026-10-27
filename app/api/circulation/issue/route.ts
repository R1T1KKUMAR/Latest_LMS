import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { validateCsrfToken } from "@/lib/csrf";
import { issueCopy } from "@/services/circulation";

export async function POST(request: NextRequest) {
  try {
    const authContext = await requirePermission("CIRC_ISSUE", { request });

    const body = await request.json().catch(() => ({}));
    const csrfToken = request.headers.get("x-csrf-token") ?? body.csrfToken;

    if (!validateCsrfToken(authContext.session.csrfToken, csrfToken)) {
      return NextResponse.json(
        { success: false, error: "Invalid or missing CSRF token" },
        { status: 403 },
      );
    }

    const { patronIdentifier, barcodeOrAccession, referenceDate } = body;

    if (!patronIdentifier || typeof patronIdentifier !== "string" || !patronIdentifier.trim()) {
      return NextResponse.json(
        { success: false, error: "Patron identifier (Card No / Roll No) is required" },
        { status: 400 },
      );
    }

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

    const result = await issueCopy(
      {
        patronIdentifier: patronIdentifier.trim(),
        barcodeOrAccession: barcodeOrAccession.trim(),
        referenceDate,
      },
      {
        id: authContext.user.id,
        fullName: authContext.user.fullName,
        libraryId: authContext.user.libraryId,
        roleCode: authContext.user.roleCode,
        ipAddress,
      },
    );

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode ?? 400;
    return NextResponse.json(
      { success: false, error: err.message ?? "Failed to issue item" },
      { status },
    );
  }
}
