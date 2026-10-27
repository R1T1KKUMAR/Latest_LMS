import { type NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser, type StaffAuthContext } from "@/lib/auth";
import { searchBooksForCirculation } from "@/services/circulation";

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
    const query = searchParams.get("query") || searchParams.get("q") || undefined;
    const status = searchParams.get("status") || undefined;
    const patronId = searchParams.get("patronId")
      ? Number(searchParams.get("patronId"))
      : undefined;
    const departmentId = searchParams.get("departmentId")
      ? Number(searchParams.get("departmentId"))
      : undefined;
    const institutionId = searchParams.get("institutionId")
      ? Number(searchParams.get("institutionId"))
      : undefined;
    const courseId = searchParams.get("courseId")
      ? Number(searchParams.get("courseId"))
      : undefined;
    const limit = searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined;

    const books = await searchBooksForCirculation({
      query,
      status,
      patronId,
      departmentId,
      institutionId,
      courseId,
      limit,
    });

    return NextResponse.json({ success: true, books });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode ?? 500;
    return NextResponse.json({ success: false, error: err.message ?? "Server error" }, { status });
  }
}
