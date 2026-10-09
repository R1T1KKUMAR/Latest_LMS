import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { getRolesWithPermissions } from "@/services/user";

export async function GET(request: NextRequest) {
  try {
    await requirePermission("ADMIN_USERS", { request });
    const roles = await getRolesWithPermissions();
    return NextResponse.json({ success: true, roles });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode ?? 500;
    return NextResponse.json({ success: false, error: err.message ?? "Server error" }, { status });
  }
}
