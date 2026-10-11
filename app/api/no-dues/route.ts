import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { listRecentClearances } from "@/services/nodues";

export async function GET(request: NextRequest) {
  try {
    await requirePermission("NODUES_ISSUE", { request });
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    const clearances = await listRecentClearances(limit);
    return NextResponse.json({ success: true, clearances });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode ?? 400;
    return NextResponse.json(
      { success: false, error: err.message ?? "Failed to fetch clearances" },
      { status },
    );
  }
}
