import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { validateCsrfToken } from "@/lib/csrf";
import { listCirculationRules, updateCirculationRule } from "@/services/admin-rules";

export async function GET(request: NextRequest) {
  try {
    await requirePermission("ADMIN_RULES", { request });
    const rules = await listCirculationRules();
    return NextResponse.json({ success: true, rules });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode ?? 500;
    return NextResponse.json({ success: false, error: err.message ?? "Server error" }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authContext = await requirePermission("ADMIN_RULES", { request });

    const body = await request.json().catch(() => ({}));
    const csrfToken = request.headers.get("x-csrf-token") ?? body.csrfToken;

    if (!validateCsrfToken(authContext.session.csrfToken, csrfToken)) {
      return NextResponse.json(
        { success: false, error: "Invalid or missing CSRF token" },
        { status: 403 },
      );
    }

    const { ruleId, ...updates } = body;
    let updatedRule = null;

    if (ruleId) {
      updatedRule = await updateCirculationRule(
        Number(ruleId),
        updates,
        {
          id: authContext.user.id,
          fullName: authContext.user.fullName,
          ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
        },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Circulation rule configured",
      updatedBy: authContext.user.fullName,
      updatedRule,
    });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode ?? 500;
    return NextResponse.json({ success: false, error: err.message ?? "Server error" }, { status });
  }
}
