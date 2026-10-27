import { type NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser, type StaffAuthContext } from "@/lib/auth";
import {
  getCachedCourses,
  getCachedDepartments,
  getCachedInstitutions,
  getCachedPatronCategories,
} from "@/lib/master-data-cache";

export async function GET(request: NextRequest) {
  try {
    const context = (await requireAuthenticatedUser("STAFF", { request })) as StaffAuthContext;

    const allowed = ["CIRC_ISSUE", "CIRC_RETURN", "CIRC_RENEW", "CIRC_LOST", "PATRON_VIEW"];
    if (!allowed.some((perm) => context.permissions.includes(perm))) {
      return NextResponse.json(
        { success: false, error: "Forbidden: Insufficient circulation permissions" },
        { status: 403 },
      );
    }

    const [institutions, departments, courses, patronCategories] = await Promise.all([
      getCachedInstitutions(),
      getCachedDepartments(),
      getCachedCourses(),
      getCachedPatronCategories(),
    ]);

    return NextResponse.json({
      success: true,
      institutions,
      departments,
      courses,
      patronCategories,
    });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode ?? 500;
    return NextResponse.json({ success: false, error: err.message ?? "Server error" }, { status });
  }
}
