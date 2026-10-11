import { type NextRequest, NextResponse } from "next/server";
import { searchOpac } from "@/services/opac";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") ?? undefined;
    const field = (searchParams.get("field") as any) ?? undefined;
    const departmentIdParam = searchParams.get("departmentId");
    const departmentId = departmentIdParam ? parseInt(departmentIdParam, 10) : undefined;
    const onlyAvailable = searchParams.get("onlyAvailable") === "true";
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : 50;
    const offsetParam = searchParams.get("offset");
    const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

    const result = await searchOpac({
      q,
      field,
      departmentId: Number.isNaN(departmentId) ? undefined : departmentId,
      onlyAvailable,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      books: result.books,
      total: result.total,
    });
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json(
      { success: false, error: err.message || "Failed to search catalogue" },
      { status: 500 },
    );
  }
}
