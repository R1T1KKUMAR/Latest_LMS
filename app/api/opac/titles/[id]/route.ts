import { type NextRequest, NextResponse } from "next/server";
import { getOpacTitleDetails } from "@/services/opac";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const bibId = parseInt(id, 10);

    if (Number.isNaN(bibId) || bibId <= 0) {
      return NextResponse.json(
        { success: false, error: "Valid bibliographic title ID is required" },
        { status: 400 },
      );
    }

    const titleDetail = await getOpacTitleDetails(bibId);
    if (!titleDetail) {
      return NextResponse.json(
        { success: false, error: `Bibliographic title #${bibId} not found` },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      title: titleDetail,
    });
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json(
      { success: false, error: err.message || "Failed to retrieve title details" },
      { status: 500 },
    );
  }
}
