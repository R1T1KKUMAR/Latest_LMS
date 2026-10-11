import { type NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";
import { getNoDuesCertificateDetails } from "@/services/nodues";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    if (!id?.trim()) {
      return NextResponse.json(
        { success: false, error: "Patron ID or certificate reference number is required" },
        { status: 400 },
      );
    }

    const authContext = await requireAuthenticatedUser(undefined, { request });
    const certificate = await getNoDuesCertificateDetails(id.trim());

    if (!certificate) {
      return NextResponse.json(
        { success: false, error: `No-Dues clearance certificate not found for '${id}'` },
        { status: 404 },
      );
    }

    if (authContext.session.userType === "PATRON") {
      // Patrons can only view their own clearance certificate
      if (certificate.patron.id !== authContext.session.userId) {
        return NextResponse.json(
          { success: false, error: "Forbidden: You can only view your own No-Dues certificate" },
          { status: 403 },
        );
      }
    }

    return NextResponse.json({ success: true, certificate });
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    const status = err.statusCode ?? 400;
    return NextResponse.json(
      { success: false, error: err.message ?? "Failed to fetch No-Dues certificate" },
      { status },
    );
  }
}
