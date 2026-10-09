import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const authContext = await requirePermission("REPORT_VIEW", { request });
    return NextResponse.json({
      success: true,
      report: "Circulation Statistics Report",
      generatedFor: authContext.user.fullName,
    });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode ?? 500;
    return NextResponse.json({ success: false, error: err.message ?? "Server error" }, { status });
  }
}
