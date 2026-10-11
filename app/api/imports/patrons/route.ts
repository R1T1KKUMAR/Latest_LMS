import { type NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { validateCsrfToken } from "@/lib/csrf";
import { commitPatronImport, validatePatronCsv } from "@/services/patron-import";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission("PATRON_IMPORT", { request });

    const contentType = request.headers.get("content-type") || "";
    let buffer: Buffer;
    let fileName = "patrons.csv";
    let importType: "STUDENT" | "FACULTY" = "STUDENT";
    let csrfToken: string | null = request.headers.get("x-csrf-token");

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File | null;
      csrfToken = csrfToken ?? (formData.get("csrfToken") as string);
      if (formData.get("type") === "faculty") importType = "FACULTY";

      if (!file) {
        return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
      }
      fileName = file.name;
      buffer = Buffer.from(await file.arrayBuffer());
    } else {
      const body = await request.json().catch(() => ({}));
      csrfToken = csrfToken ?? body.csrfToken;
      if (body.type === "faculty") importType = "FACULTY";
      fileName = body.fileName || "patrons.csv";
      buffer = Buffer.from(body.csvContent || "", "utf8");
    }

    if (!validateCsrfToken(auth.session.csrfToken, csrfToken)) {
      return NextResponse.json(
        { success: false, error: "Invalid or missing CSRF token" },
        { status: 403 },
      );
    }

    const preview = await validatePatronCsv(buffer, importType, { fileName });
    const actor = { id: auth.user.id, fullName: auth.user.fullName };
    const result = await commitPatronImport(preview, actor);

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode ?? 500;
    return NextResponse.json({ success: false, error: err.message ?? "Server error" }, { status });
  }
}
