import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { validateCsrfToken } from "@/lib/csrf";
import { importHolidayCalendar, parseHolidayCalendarCsv } from "@/services/holidays";

export async function POST(request: NextRequest) {
  try {
    const authContext = await requirePermission("ADMIN_SETTINGS", { request });

    let csvContent = "";
    let mode: "MERGE" | "REPLACE" = "MERGE";
    let csrfToken = request.headers.get("x-csrf-token");
    let previewOnly = false;

    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      csrfToken = (formData.get("csrfToken") as string) || csrfToken;
      mode =
        ((formData.get("mode") as string) || "MERGE").toUpperCase() === "REPLACE"
          ? "REPLACE"
          : "MERGE";
      previewOnly = formData.get("previewOnly") === "true";

      if (!file) {
        return NextResponse.json(
          { success: false, error: "No calendar file provided" },
          { status: 400 },
        );
      }

      csvContent = await file.text();
    } else {
      const body = await request.json().catch(() => ({}));
      csrfToken = body.csrfToken || csrfToken;
      mode = (body.mode || "MERGE").toUpperCase() === "REPLACE" ? "REPLACE" : "MERGE";
      previewOnly = Boolean(body.previewOnly);
      csvContent = body.csvContent || "";
    }

    if (!validateCsrfToken(authContext.session.csrfToken, csrfToken)) {
      return NextResponse.json(
        { success: false, error: "Invalid or missing CSRF token" },
        { status: 403 },
      );
    }

    if (!csvContent.trim()) {
      return NextResponse.json(
        { success: false, error: "Calendar file or CSV content is empty" },
        { status: 400 },
      );
    }

    const { valid, errors } = parseHolidayCalendarCsv(csvContent);

    if (valid.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No valid holiday records found in the uploaded file.",
          errors,
        },
        { status: 400 },
      );
    }

    // If client requested validation preview only
    if (previewOnly) {
      return NextResponse.json({
        success: true,
        preview: true,
        validCount: valid.length,
        errorCount: errors.length,
        items: valid.slice(0, 50),
        errors,
      });
    }

    const importResult = await importHolidayCalendar(valid, mode, {
      id: authContext.user.id,
      fullName: authContext.user.fullName,
      ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    });

    return NextResponse.json({
      success: true,
      message: `Successfully imported ${importResult.importedCount} holidays from calendar file (${mode} mode).`,
      importedCount: importResult.importedCount,
      totalCount: importResult.totalCount,
      errorCount: errors.length,
      errors: errors.slice(0, 10),
    });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode ?? 500;
    return NextResponse.json({ success: false, error: err.message ?? "Server error" }, { status });
  }
}
