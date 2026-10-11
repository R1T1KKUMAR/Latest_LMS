import { type NextRequest, NextResponse } from "next/server";
import { getMostBorrowedTitles } from "@/services/opac";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : 10;

    const books = await getMostBorrowedTitles({ limit });

    return NextResponse.json({
      success: true,
      books,
      total: books.length,
    });
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch most borrowed titles" },
      { status: 500 },
    );
  }
}
