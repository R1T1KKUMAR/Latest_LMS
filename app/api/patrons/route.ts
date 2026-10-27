import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { validateCsrfToken } from "@/lib/csrf";
import { listPatrons, registerPatron } from "@/services/patron";

export async function GET(request: NextRequest) {
  try {
    const authContext = await requirePermission("PATRON_VIEW", { request });

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search") || undefined;
    const categoryId = searchParams.get("categoryId")
      ? Number(searchParams.get("categoryId"))
      : undefined;
    const patronType = searchParams.get("patronType") || undefined;
    const status = searchParams.get("status") || undefined;
    const departmentId = searchParams.get("departmentId")
      ? Number(searchParams.get("departmentId"))
      : undefined;
    const institutionId = searchParams.get("institutionId")
      ? Number(searchParams.get("institutionId"))
      : undefined;
    const courseId = searchParams.get("courseId")
      ? Number(searchParams.get("courseId"))
      : undefined;
    const academicYear = searchParams.get("academicYear")
      ? Number(searchParams.get("academicYear"))
      : undefined;
    const semester = searchParams.get("semester")
      ? Number(searchParams.get("semester"))
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

    const result = await listPatrons({
      search,
      categoryId,
      libraryId,
      patronType,
      status,
      departmentId,
      institutionId,
      courseId,
      academicYear,
      semester,
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
    const authContext = await requirePermission("PATRON_MANAGE", { request });

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

    const patronData = { ...body };
    if (authContext.user.roleCode !== "SUPER_ADMIN") {
      patronData.libraryId = authContext.user.libraryId;
    } else if (body.libraryId) {
      patronData.libraryId = Number(body.libraryId);
    }

    const created = await registerPatron(patronData, {
      id: authContext.user.id,
      fullName: authContext.user.fullName,
      ipAddress,
    });

    return NextResponse.json({ success: true, patron: created }, { status: 201 });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string; issues?: unknown };
    const status = err.statusCode ?? 400;
    return NextResponse.json(
      {
        success: false,
        error: err.message ?? "Failed to register patron",
        issues: err.issues,
      },
      { status },
    );
  }
}
