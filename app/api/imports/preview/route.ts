import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { validateBookCsv } from "@/services/book-import";
import { getImportFormat } from "@/services/import-format";
import { validatePatronCsv } from "@/services/patron-import";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // Allow up to 5 minutes for large CSV validation

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const type = (formData.get("type") as string) || "students";
    const defaultCategoryId = formData.get("defaultCategoryId")
      ? parseInt(formData.get("defaultCategoryId") as string, 10)
      : undefined;
    const defaultLibraryId = formData.get("defaultLibraryId")
      ? parseInt(formData.get("defaultLibraryId") as string, 10)
      : undefined;
    const defaultInstitutionId = formData.get("defaultInstitutionId")
      ? parseInt(formData.get("defaultInstitutionId") as string, 10)
      : undefined;
    const encoding = (formData.get("encoding") as string) || "auto";

    if (!file) {
      return NextResponse.json({ success: false, error: "No CSV file uploaded" }, { status: 400 });
    }

    // Permission check per import type
    const isPatronImport = type === "students" || type === "faculty";
    const requiredPermission = isPatronImport ? "PATRON_IMPORT" : "CATALOG_IMPORT";
    await requirePermission(requiredPermission, { request });

    // File buffer extraction
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (type === "students" || type === "faculty") {
      const patronType = type === "students" ? "STUDENT" : "FACULTY";
      const formatColumns = await getImportFormat(patronType);
      const preview = await validatePatronCsv(buffer, patronType, {
        defaultCategoryId,
        defaultLibraryId,
        defaultInstitutionId,
        encoding,
        fileName: file.name,
        formatColumns,
      });

      // Slice preview rows to 100 for fast UI rendering if file is large
      const displayRows = preview.rows.length > 100 ? preview.rows.slice(0, 100) : preview.rows;

      return NextResponse.json({
        success: true,
        preview: {
          ...preview,
          rows: displayRows,
          totalRowsCount: preview.rows.length,
        },
      });
    }

    if (type === "catalog" || type === "books") {
      const formatColumns = await getImportFormat("CATALOGUE");
      const preview = await validateBookCsv(buffer, {
        defaultLibraryId,
        defaultItemTypeId: defaultCategoryId,
        encoding,
        fileName: file.name,
        formatColumns,
      });

      // Slice preview rows to 100 for fast UI rendering if file is large
      const displayRows = preview.rows.length > 100 ? preview.rows.slice(0, 100) : preview.rows;

      return NextResponse.json({
        success: true,
        preview: {
          ...preview,
          rows: displayRows,
          totalRowsCount: preview.rows.length,
        },
      });
    }

    return NextResponse.json(
      { success: false, error: `Unsupported import type "${type}"` },
      { status: 400 },
    );
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode ?? 500;
    return NextResponse.json(
      { success: false, error: err.message ?? "Server error during preview" },
      { status },
    );
  }
}
