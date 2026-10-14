import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { validateCsrfToken } from "@/lib/csrf";
import { listCirculationRules, updateCirculationRule } from "@/services/admin-rules";
import { getAllSystemSettings, updateSystemSettings } from "@/services/settings";

export async function GET(request: NextRequest) {
  try {
    await requirePermission("ADMIN_SETTINGS", { request });

    const [allSettings, rules] = await Promise.all([
      getAllSystemSettings(),
      listCirculationRules(),
    ]);

    const fineSettings: Record<string, string> = {};
    for (const s of allSettings) {
      if (
        [
          "DEFAULT_FINE_PER_DAY",
          "DEFAULT_GRACE_DAYS",
          "FINE_BLOCK_LIMIT",
          "LOST_PROCESSING_FEE",
          "BLOCK_ISSUE_IF_OVERDUE",
          "DEFAULT_LOAN_DAYS",
        ].includes(s.settingKey)
      ) {
        fineSettings[s.settingKey] = s.settingValue;
      }
    }

    return NextResponse.json({
      success: true,
      fineSettings,
      rules,
    });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode ?? 500;
    return NextResponse.json({ success: false, error: err.message ?? "Server error" }, { status });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authContext = await requirePermission("ADMIN_SETTINGS", { request });

    const body = await request.json().catch(() => ({}));
    const csrfToken = request.headers.get("x-csrf-token") ?? body.csrfToken;

    if (!validateCsrfToken(authContext.session.csrfToken, csrfToken)) {
      return NextResponse.json(
        { success: false, error: "Invalid or missing CSRF token" },
        { status: 403 },
      );
    }

    const { settings, ruleId, ruleUpdates } = body;
    const actor = {
      id: authContext.user.id,
      fullName: authContext.user.fullName,
      ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    };

    let updatedKeys: string[] = [];
    if (settings && typeof settings === "object") {
      const res = await updateSystemSettings(settings, actor);
      updatedKeys = res.updatedKeys;
    }

    let updatedRule = null;
    if (ruleId && ruleUpdates) {
      updatedRule = await updateCirculationRule(Number(ruleId), ruleUpdates, actor);
    }

    return NextResponse.json({
      success: true,
      message: "Fine policy adjustments applied successfully.",
      updatedKeys,
      updatedRule,
    });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode ?? 400;
    return NextResponse.json({ success: false, error: err.message ?? "Server error" }, { status });
  }
}
