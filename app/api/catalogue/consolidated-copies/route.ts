import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { getConsolidatedBookCopies } from "@/services/catalogue";

export async function GET(request: NextRequest) {
  try {
    const authContext = await requirePermission("CATALOG_VIEW", { request });

    const searchParams = request.nextUrl.searchParams;
    const title = searchParams.get("title");
    const authors = searchParams.get("authors") || undefined;

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

    if (!title) {
      return NextResponse.json(
        { success: false, error: "Missing required parameter: title" },
        { status: 400 },
      );
    }

    const copies = await getConsolidatedBookCopies(title, authors, libraryId);

    return NextResponse.json({ success: true, copies });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode ?? 500;
    return NextResponse.json({ success: false, error: err.message ?? "Server error" }, { status });
  }
}
