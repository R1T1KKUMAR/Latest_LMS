import { type NextRequest, NextResponse } from "next/server";
import { AuthenticationError, ForbiddenError, requireAuthenticatedUser } from "@/lib/auth";
import { getPatronAccountData } from "@/services/opac";

export async function GET(request: NextRequest) {
  try {
    const authContext = await requireAuthenticatedUser(undefined, { request });

    if (authContext.session.userType !== "PATRON") {
      return NextResponse.json(
        {
          success: false,
          error: "Forbidden: Only authenticated library patrons may access patron account data",
        },
        { status: 403 },
      );
    }

    const patronId = authContext.session.userId;
    const accountData = await getPatronAccountData(patronId);

    if (!accountData) {
      return NextResponse.json(
        { success: false, error: "Patron account records not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      data: accountData,
    });
  } catch (error: unknown) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
    const err = error as Error;
    return NextResponse.json(
      { success: false, error: err.message || "Failed to retrieve patron account data" },
      { status: 500 },
    );
  }
}
