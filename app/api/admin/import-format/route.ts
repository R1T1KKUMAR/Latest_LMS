import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { validateCsrfToken } from "@/lib/csrf";
import {
  getImportFormat,
  normalizeImportType,
  resetImportFormat,
  updateImportFormat,
} from "@/services/import-format";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/import-format?type=STUDENT|FACULTY|CATALOGUE
 * Returns the current active column format definitions.
 */
export async function GET(request: NextRequest) {
  try {
    await requirePermission("ADMIN_SETTINGS", { request });

    const { searchParams } = new URL(request.url);
    const rawType = searchParams.get("type") || "STUDENT";
    const type = normalizeImportType(rawType);

    const columns = await getImportFormat(type);

    return NextResponse.json({
      success: true,
      type,
      columns,
    });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode ?? 500;
    return NextResponse.json(
      { success: false, error: err.message ?? "Failed to fetch import format" },
      { status },
    );
  }
}

/**
 * PUT /api/admin/import-format
 * Updates the column format definitions for the specified import type.
 */
export async function PUT(request: NextRequest) {
  try {
    const auth = await requirePermission("ADMIN_SETTINGS", { request });

    const body = await request.json().catch(() => ({}));
    const rawType = body.type || "STUDENT";
    const type = normalizeImportType(rawType);
    const columns = body.columns;
    const csrfToken = request.headers.get("x-csrf-token") ?? body.csrfToken;

    if (!validateCsrfToken(auth.session.csrfToken, csrfToken)) {
      return NextResponse.json(
        { success: false, error: "Invalid or missing CSRF token" },
        { status: 403 },
      );
    }

    if (!Array.isArray(columns)) {
      return NextResponse.json(
        { success: false, error: "Columns array is required" },
        { status: 400 },
      );
    }

    const actor = {
      id: auth.user.id,
      fullName: auth.user.fullName,
      actorType: "STAFF" as const,
      ipAddress: request.headers.get("x-forwarded-for") || undefined,
    };

    const updated = await updateImportFormat(type, columns, actor);

    return NextResponse.json({
      success: true,
      type,
      columns: updated,
    });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode ?? 400;
    return NextResponse.json(
      { success: false, error: err.message ?? "Failed to update import format" },
      { status },
    );
  }
}

/**
 * POST /api/admin/import-format
 * Resets the specified format back to institutional defaults.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission("ADMIN_SETTINGS", { request });

    const body = await request.json().catch(() => ({}));
    const rawType = body.type || "STUDENT";
    const type = normalizeImportType(rawType);
    const action = body.action || "reset";
    const csrfToken = request.headers.get("x-csrf-token") ?? body.csrfToken;

    if (!validateCsrfToken(auth.session.csrfToken, csrfToken)) {
      return NextResponse.json(
        { success: false, error: "Invalid or missing CSRF token" },
        { status: 403 },
      );
    }

    if (action !== "reset") {
      return NextResponse.json(
        { success: false, error: `Unsupported action "${action}"` },
        { status: 400 },
      );
    }

    const actor = {
      id: auth.user.id,
      fullName: auth.user.fullName,
      actorType: "STAFF" as const,
      ipAddress: request.headers.get("x-forwarded-for") || undefined,
    };

    const resetColumns = await resetImportFormat(type, actor);

    return NextResponse.json({
      success: true,
      type,
      columns: resetColumns,
    });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode ?? 500;
    return NextResponse.json(
      { success: false, error: err.message ?? "Failed to reset import format" },
      { status },
    );
  }
}
