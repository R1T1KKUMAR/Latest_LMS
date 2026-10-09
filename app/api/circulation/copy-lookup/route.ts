import { type NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser, type StaffAuthContext } from "@/lib/auth";
import { lookupCopyForCirculation } from "@/services/circulation";

export async function GET(request: NextRequest) {
  try {
    const context = (await requireAuthenticatedUser("STAFF", { request })) as StaffAuthContext;

    const allowed = ["CIRC_ISSUE", "CIRC_RETURN", "CIRC_RENEW", "CIRC_LOST", "CATALOG_VIEW"];
    if (!allowed.some((perm) => context.permissions.includes(perm))) {
      return NextResponse.json(
        { success: false, error: "Forbidden: Insufficient circulation permissions" },
        { status: 403 },
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const term =
      searchParams.get("term") ||
      searchParams.get("q") ||
      searchParams.get("barcode") ||
      searchParams.get("accessionNo");

    if (!term || !term.trim()) {
      return NextResponse.json(
        { success: false, error: "Item identifier (barcode or accession number) is required" },
        { status: 400 },
      );
    }

    const copy = await lookupCopyForCirculation(term.trim());
    if (!copy) {
      return NextResponse.json(
        {
          success: false,
          error: `Physical copy with barcode or accession number "${term}" not found`,
        },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, copy });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode ?? 500;
    return NextResponse.json({ success: false, error: err.message ?? "Server error" }, { status });
  }
}
