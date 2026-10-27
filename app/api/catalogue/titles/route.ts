import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { validateCsrfToken } from "@/lib/csrf";
import {
  createBibRecord,
  listBibRecords,
  listConsolidatedBooks,
  listIndividualCopies,
} from "@/services/catalogue";

export async function GET(request: NextRequest) {
  try {
    const authContext = await requirePermission("CATALOG_VIEW", { request });

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search") || undefined;
    const viewMode = searchParams.get("viewMode") || "all";
    const itemTypeId = searchParams.get("itemTypeId")
      ? Number(searchParams.get("itemTypeId"))
      : undefined;
    const departmentId = searchParams.get("departmentId")
      ? Number(searchParams.get("departmentId"))
      : undefined;
    const institutionId = searchParams.get("institutionId")
      ? Number(searchParams.get("institutionId"))
      : undefined;

    let libraryId: number | undefined;
    if (authContext.user.roleCode !== "SUPER_ADMIN") {
      libraryId = authContext.user.libraryId ?? undefined;
    } else {
      const libParam = searchParams.get("libraryId");
      if (libParam && libParam !== "all") {
        const parsed = Number(libParam);
        if (!Number.isNaN(parsed) && parsed > 0) {
          libraryId = parsed;
        }
      }
    }

    const page = searchParams.get("page") ? Number(searchParams.get("page")) : undefined;
    const limit = searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined;

    const result =
      viewMode === "consolidated"
        ? await listConsolidatedBooks({
            search,
            itemTypeId,
            departmentId,
            institutionId,
            libraryId,
            page,
            limit,
          })
        : await listIndividualCopies({
            search,
            itemTypeId,
            departmentId,
            institutionId,
            libraryId,
            page,
            limit,
          });

    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode ?? 500;
    return NextResponse.json({ success: false, error: err.message ?? "Server error" }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authContext = await requirePermission("CATALOG_MANAGE", { request });

    const body = await request.json().catch(() => ({}));
    const csrfToken = request.headers.get("x-csrf-token") ?? body.csrfToken;

    if (!validateCsrfToken(authContext.session.csrfToken, csrfToken)) {
      return NextResponse.json(
        { success: false, error: "Invalid or missing CSRF token" },
        { status: 403 },
      );
    }

    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      undefined;

    const created = await createBibRecord(body, {
      id: authContext.user.id,
      fullName: authContext.user.fullName,
      ipAddress,
    });

    return NextResponse.json({ success: true, title: created }, { status: 201 });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string; issues?: unknown };
    const status = err.statusCode ?? 400;
    return NextResponse.json(
      {
        success: false,
        error: err.message ?? "Failed to create title",
        issues: err.issues,
      },
      { status },
    );
  }
}
