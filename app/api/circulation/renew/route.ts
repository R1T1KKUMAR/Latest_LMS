import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { validateCsrfToken } from "@/lib/csrf";
import { renewLoan } from "@/services/circulation";

export async function POST(request: NextRequest) {
  try {
    const authContext = await requirePermission("CIRC_RENEW", { request });

    const body = await request.json().catch(() => ({}));
    const csrfToken = request.headers.get("x-csrf-token") ?? body.csrfToken;

    if (!validateCsrfToken(authContext.session.csrfToken, csrfToken)) {
      return NextResponse.json(
        { success: false, error: "Invalid or missing CSRF token" },
        { status: 403 },
      );
    }

    const { loanId, barcodeOrAccession, referenceDate } = body;

    if (
      !loanId &&
      (!barcodeOrAccession || typeof barcodeOrAccession !== "string" || !barcodeOrAccession.trim())
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Either Loan ID or Item Barcode/Accession Number is required to renew",
        },
        { status: 400 },
      );
    }

    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      undefined;

    const result = await renewLoan(
      {
        loanId: loanId ? Number(loanId) : undefined,
        barcodeOrAccession: barcodeOrAccession ? barcodeOrAccession.trim() : undefined,
        referenceDate,
      },
      {
        id: authContext.user.id,
        fullName: authContext.user.fullName,
        ipAddress,
      },
    );

    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode ?? 400;
    return NextResponse.json(
      { success: false, error: err.message ?? "Failed to renew loan" },
      { status },
    );
  }
}
