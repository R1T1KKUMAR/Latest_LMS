import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { listImportBatches } from "@/services/batch-import-management";

export async function GET(request: NextRequest) {
  try {
    await requirePermission("ADMIN_SETTINGS", { request }).catch(async () => {
      return await requirePermission("PATRON_IMPORT", { request });
    });

    const batches = await listImportBatches();
    return NextResponse.json({ success: true, batches });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode ?? 500;
    return NextResponse.json({ success: false, error: err.message ?? "Server error" }, { status });
  }
}
