import { type NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";
import { listFines } from "@/services/fines";

export async function GET(request: NextRequest) {
  try {
    const authContext = await requireAuthenticatedUser(undefined, { request });
    const { searchParams } = new URL(request.url);

    const patronIdParam = searchParams.get("patronId");
    let patronId = patronIdParam ? parseInt(patronIdParam, 10) : undefined;
    const cardNo = searchParams.get("cardNo") ?? undefined;
    const status = searchParams.get("status") ?? undefined;
    const fineType = searchParams.get("fineType") ?? undefined;
    const search = searchParams.get("search") ?? undefined;

    if (authContext.session.userType === "PATRON") {
      // Patrons can only view their own fines
      patronId = authContext.session.userId;
    } else {
      // Staff authorization: requires FINE_COLLECT, FINE_WAIVE, REPORT_VIEW, or CIRC_VIEW
      // biome-ignore lint/suspicious/noExplicitAny: StaffAuthContext permissions check
      const staffContext = authContext as any;
      const staffPermissions: string[] = staffContext.permissions ?? [];
      const hasFineAccess =
        staffPermissions.includes("FINE_COLLECT") ||
        staffPermissions.includes("FINE_WAIVE") ||
        staffPermissions.includes("REPORT_VIEW") ||
        staffPermissions.includes("CIRC_VIEW") ||
        staffPermissions.includes("DASHBOARD_VIEW");

      if (!hasFineAccess) {
        return NextResponse.json(
          { success: false, error: "Forbidden: Fine collection or view permission required" },
          { status: 403 },
        );
      }
    }

    const result = await listFines({
      patronId,
      cardNo,
      status,
      fineType,
      search,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode ?? 400;
    return NextResponse.json(
      { success: false, error: err.message ?? "Failed to fetch fines" },
      { status },
    );
  }
}
