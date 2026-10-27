import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { generateReportData } from "@/services/reports";

export async function GET(request: NextRequest) {
  try {
    const authContext = await requirePermission("REPORT_VIEW", { request });

    const searchParams = request.nextUrl.searchParams;
    const reportId = searchParams.get("reportId") || searchParams.get("id");

    if (!reportId) {
      return NextResponse.json(
        { success: false, error: "Missing required query parameter: reportId" },
        { status: 400 },
      );
    }

    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;
    const search = searchParams.get("search") || undefined;
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;

    const reportData = await generateReportData(reportId, {
      startDate,
      endDate,
      search,
      limit,
    });

    return NextResponse.json({
      success: true,
      report: reportData,
      requestedBy: authContext.user.fullName,
    });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode ?? 500;
    return NextResponse.json(
      { success: false, error: err.message ?? "Failed to generate report" },
      { status },
    );
  }
}
