import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { validateCsrfToken } from "@/lib/csrf";
import { addHoliday, getHolidays } from "@/services/holidays";

export async function GET(request: NextRequest) {
  try {
    await requirePermission("ADMIN_SETTINGS", { request });
    const holidays = await getHolidays();

    const stats = {
      total: holidays.length,
      annual: holidays.filter((h) => h.type === "ANNUAL").length,
      adHoc: holidays.filter((h) => h.type === "AD_HOC").length,
    };

    return NextResponse.json({ success: true, holidays, stats });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode ?? 500;
    return NextResponse.json({ success: false, error: err.message ?? "Server error" }, { status });
  }
}

export async function POST(request: NextRequest) {
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

    const { date, name, type, description, libraryId } = body;

    if (!date || !name) {
      return NextResponse.json(
        { success: false, error: "Holiday date and name are required" },
        { status: 400 },
      );
    }

    const holiday = await addHoliday(
      {
        date,
        name,
        type: type === "ANNUAL" ? "ANNUAL" : "AD_HOC",
        description,
        libraryId: libraryId ? Number(libraryId) : null,
      },
      {
        id: authContext.user.id,
        fullName: authContext.user.fullName,
        ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
      },
    );

    return NextResponse.json({
      success: true,
      message: `Holiday "${holiday.name}" scheduled on ${holiday.date} with fine exemption.`,
      holiday,
    });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode ?? 400;
    return NextResponse.json({ success: false, error: err.message ?? "Server error" }, { status });
  }
}
