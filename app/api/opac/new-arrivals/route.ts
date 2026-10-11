import { type NextRequest, NextResponse } from "next/server";
import { getNewArrivals } from "@/services/opac";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const daysParam = searchParams.get("days");
    const days = daysParam ? parseInt(daysParam, 10) : undefined;
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : 20;

    const books = await getNewArrivals({
      days: Number.isNaN(days) ? undefined : days,
      limit,
    });

    return NextResponse.json({
      success: true,
      books,
      total: books.length,
    });
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch new arrivals" },
      { status: 500 },
    );
  }
}
