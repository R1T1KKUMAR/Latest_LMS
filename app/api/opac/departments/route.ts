import { type NextRequest, NextResponse } from "next/server";
import { getDepartmentsWithCounts } from "@/services/opac";

export async function GET(_request: NextRequest) {
  try {
    const departments = await getDepartmentsWithCounts();
    return NextResponse.json({
      success: true,
      departments,
      total: departments.length,
    });
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch departments" },
      { status: 500 },
    );
  }
}
