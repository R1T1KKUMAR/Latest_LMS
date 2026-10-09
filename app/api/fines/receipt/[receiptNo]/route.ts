import { type NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";
import { getReceiptDetails } from "@/services/fines";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ receiptNo: string }> },
) {
  try {
    const { receiptNo } = await params;

    if (!receiptNo || !receiptNo.trim()) {
      return NextResponse.json(
        { success: false, error: "Receipt number is required" },
        { status: 400 },
      );
    }

    const authContext = await requireAuthenticatedUser(undefined, { request });
    const receipt = await getReceiptDetails(receiptNo.trim());

    if (!receipt) {
      return NextResponse.json(
        { success: false, error: `Receipt '${receiptNo}' not found` },
        { status: 404 },
      );
    }

    if (authContext.session.userType === "PATRON") {
      // Patrons can only view their own payment receipts
      if (receipt.patron.id !== authContext.session.userId) {
        return NextResponse.json(
          { success: false, error: "Forbidden: You can only view your own receipts" },
          { status: 403 },
        );
      }
    }

    return NextResponse.json({ success: true, receipt });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode ?? 400;
    return NextResponse.json(
      { success: false, error: err.message ?? "Failed to fetch receipt" },
      { status },
    );
  }
}
