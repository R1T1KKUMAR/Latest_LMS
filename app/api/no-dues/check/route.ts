import { type NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";
import { checkNoDuesEligibility } from "@/services/nodues";

export async function GET(request: NextRequest) {
  try {
    const authContext = await requireAuthenticatedUser(undefined, { request });
    const { searchParams } = new URL(request.url);

    const identifier =
      searchParams.get("identifier") ||
      searchParams.get("cardNo") ||
      searchParams.get("patronId") ||
      searchParams.get("q");

    if (!identifier?.trim()) {
      return NextResponse.json(
        { success: false, error: "Patron identifier (card number or roll number) is required" },
        { status: 400 },
      );
    }

    if (authContext.session.userType === "PATRON") {
      // Patrons can only verify their own eligibility
      const result = await checkNoDuesEligibility(authContext.session.userId);
      return NextResponse.json({ success: true, ...result });
    }

    // Staff access: requires NODUES_ISSUE, CIRC_VIEW, or PATRON_VIEW
    // biome-ignore lint/suspicious/noExplicitAny: Staff permissions check
    const staffContext = authContext as any;
    const permissions: string[] = staffContext.permissions ?? [];
    const hasAccess =
      permissions.includes("NODUES_ISSUE") ||
      permissions.includes("CIRC_ISSUE") ||
      permissions.includes("CIRC_RETURN") ||
      permissions.includes("PATRON_VIEW") ||
      permissions.includes("REPORT_VIEW") ||
      permissions.includes("DASHBOARD_VIEW");

    if (!hasAccess) {
      return NextResponse.json(
        { success: false, error: "Forbidden: No-dues clearance verification permission required" },
        { status: 403 },
      );
    }

    const result = await checkNoDuesEligibility(identifier.trim());
    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const message = err.message ?? "Failed to check no-dues eligibility";
    let status = err.statusCode ?? 400;
    if (message.includes("not found")) {
      status = 404;
    }
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
