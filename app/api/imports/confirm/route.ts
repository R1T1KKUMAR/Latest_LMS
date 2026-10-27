import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { validateCsrfToken } from "@/lib/csrf";
import { type BookImportPreview, commitBookImport, validateBookCsv } from "@/services/book-import";
import { getImportFormat } from "@/services/import-format";
import {
  commitPatronImport,
  type PatronImportPreview,
  validatePatronCsv,
} from "@/services/patron-import";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // Allow up to 5 minutes for large batch import commits

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      const type = (formData.get("type") as string) || "students";
      const csrfToken =
        request.headers.get("x-csrf-token") ?? (formData.get("csrfToken") as string);

      const isPatronImport = type === "students" || type === "faculty";
      const requiredPermission = isPatronImport ? "PATRON_IMPORT" : "CATALOG_IMPORT";
      const auth = await requirePermission(requiredPermission, { request });

      if (!validateCsrfToken(auth.session.csrfToken, csrfToken)) {
        return NextResponse.json(
          { success: false, error: "Invalid or missing CSRF token" },
          { status: 403 },
        );
      }

      if (!file) {
        return NextResponse.json(
          { success: false, error: "No CSV file uploaded for confirmation" },
          { status: 400 },
        );
      }

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

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const actor = {
        id: auth.user.id,
        fullName: auth.user.fullName,
      };

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

        const result = await commitPatronImport(preview, actor);
        return NextResponse.json({ success: true, result });
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

        const result = await commitBookImport(preview, actor);
        return NextResponse.json({ success: true, result });
      }

      return NextResponse.json(
        { success: false, error: `Unsupported import type "${type}"` },
        { status: 400 },
      );
    }

    // JSON payload support
    const body = await request.json().catch(() => ({}));
    const type = body.type || "students";
    const csrfToken = request.headers.get("x-csrf-token") ?? body.csrfToken;

    const isPatronImport = type === "students" || type === "faculty";
    const requiredPermission = isPatronImport ? "PATRON_IMPORT" : "CATALOG_IMPORT";
    const auth = await requirePermission(requiredPermission, { request });

    if (!validateCsrfToken(auth.session.csrfToken, csrfToken)) {
      return NextResponse.json(
        { success: false, error: "Invalid or missing CSRF token" },
        { status: 403 },
      );
    }

    const actor = {
      id: auth.user.id,
      fullName: auth.user.fullName,
    };

    if (body.preview) {
      if (type === "students" || type === "faculty") {
        const result = await commitPatronImport(body.preview as PatronImportPreview, actor);
        return NextResponse.json({ success: true, result });
      }
      if (type === "catalog" || type === "books") {
        const result = await commitBookImport(body.preview as BookImportPreview, actor);
        return NextResponse.json({ success: true, result });
      }
    }

    return NextResponse.json(
      { success: false, error: "Missing preview payload or CSV file" },
      { status: 400 },
    );
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode ?? 500;
    return NextResponse.json(
      { success: false, error: err.message ?? "Server error during import confirmation" },
      { status },
    );
  }
}
