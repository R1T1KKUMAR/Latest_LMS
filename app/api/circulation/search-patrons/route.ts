import { type NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser, type StaffAuthContext } from "@/lib/auth";
import { searchPatronsForCirculation } from "@/services/circulation";

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
    const query = searchParams.get("query") || searchParams.get("q") || undefined;
    const identifier =
      searchParams.get("identifier") ||
      searchParams.get("cardNo") ||
      searchParams.get("employeeId") ||
      undefined;
    const patronType = searchParams.get("patronType") || undefined;
    const institutionId = searchParams.get("institutionId")
      ? Number(searchParams.get("institutionId"))
      : undefined;
    const courseId = searchParams.get("courseId")
      ? Number(searchParams.get("courseId"))
      : undefined;
    const departmentId = searchParams.get("departmentId")
      ? Number(searchParams.get("departmentId"))
      : undefined;
    const hasActiveLoans = searchParams.get("hasActiveLoans") === "true";
    const limit = searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined;

    const patrons = await searchPatronsForCirculation({
      query,
      identifier,
      patronType,
      institutionId,
      courseId,
      departmentId,
      hasActiveLoans,
      limit,
    });

    return NextResponse.json({ success: true, patrons });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode ?? 500;
    return NextResponse.json({ success: false, error: err.message ?? "Server error" }, { status });
  }
}
