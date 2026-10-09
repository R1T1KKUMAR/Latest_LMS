import { type NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser, type StaffAuthContext } from "@/lib/auth";
import { lookupPatronForCirculation } from "@/services/circulation";

export async function GET(request: NextRequest) {
  try {
    const context = (await requireAuthenticatedUser("STAFF", { request })) as StaffAuthContext;

    const allowed = ["CIRC_ISSUE", "CIRC_RETURN", "CIRC_RENEW", "CIRC_LOST", "PATRON_VIEW"];
    if (!allowed.some((perm) => context.permissions.includes(perm))) {
      return NextResponse.json(
        { success: false, error: "Forbidden: Insufficient circulation permissions" },
        { status: 403 },
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const term = searchParams.get("term") || searchParams.get("q") || searchParams.get("cardNo");

    if (!term || !term.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: "Patron identifier (card, roll, employee ID, or username) is required",
        },
        { status: 400 },
      );
    }

    const patron = await lookupPatronForCirculation(term.trim());
    if (!patron) {
      return NextResponse.json(
        { success: false, error: `Patron with identifier "${term}" not found` },
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
