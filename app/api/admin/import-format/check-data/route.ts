import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { checkColumnHasData, normalizeImportType } from "@/services/import-format";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/import-format/check-data?type=STUDENT&dbField=semester
 * Checks if there is existing non-null data for this dbField in the database.
 */
export async function GET(request: NextRequest) {
  try {
    await requirePermission("ADMIN_SETTINGS", { request });

    const { searchParams } = new URL(request.url);
    const rawType = searchParams.get("type") || "STUDENT";
    const type = normalizeImportType(rawType);
    const dbField = searchParams.get("dbField") || "";

    if (!dbField) {
      return NextResponse.json(
        { success: false, error: "dbField parameter is required" },
        { status: 400 },
      );
    }

    const { hasData, count } = await checkColumnHasData(type, dbField);

    return NextResponse.json({
      success: true,
      type,
      dbField,
      hasData,
      count,
    });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode ?? 500;
    return NextResponse.json(
      { success: false, error: err.message ?? "Failed to check column data" },
      { status },
    );
  }
}
