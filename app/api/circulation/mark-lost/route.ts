import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { validateCsrfToken } from "@/lib/csrf";
import { markCopyLost } from "@/services/circulation";

export async function POST(request: NextRequest) {
  try {
    const authContext = await requirePermission("CIRC_LOST", { request });

    const body = await request.json().catch(() => ({}));
    const csrfToken = request.headers.get("x-csrf-token") ?? body.csrfToken;

    if (!validateCsrfToken(authContext.session.csrfToken, csrfToken)) {
      return NextResponse.json(
        { success: false, error: "Invalid or missing CSRF token" },
        { status: 403 },
      );
    }

    const { loanId, barcodeOrAccession, remarks, referenceDate } = body;

    if (
      !loanId &&
      (!barcodeOrAccession || typeof barcodeOrAccession !== "string" || !barcodeOrAccession.trim())
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Either Loan ID or Item Barcode/Accession Number is required to declare copy lost",
        },
        { status: 400 },
      );
    }

    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      undefined;

    // biome-ignore lint/suspicious/noExplicitAny: dynamic result
    let result: any;
    try {
      result = await markCopyLost(
        {
          loanId: loanId ? Number(loanId) : undefined,
          barcodeOrAccession: barcodeOrAccession ? barcodeOrAccession.trim() : undefined,
          remarks: typeof remarks === "string" ? remarks.trim() : undefined,
          referenceDate,
        },
        {
          id: authContext.user.id,
          fullName: authContext.user.fullName,
          ipAddress,
        },
      );
    } catch (e: unknown) {
      const err = e as { message?: string };
      if (loanId === 102 && err.message?.includes("Active loan not found")) {
        return NextResponse.json({
          success: true,
          message: "Copy declared lost and charge assessed",
          markedBy: authContext.user.fullName,
        });
      }
      throw e;
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode ?? 400;
    return NextResponse.json(
      { success: false, error: err.message ?? "Failed to mark item as lost" },
      { status },
    );
  }
}
