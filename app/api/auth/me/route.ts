import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";

export async function GET() {
  try {
    const authContext = await getCurrentSession();

    if (!authContext) {
      return NextResponse.json({ authenticated: false }, { status: 200 });
    }

    if ("user" in authContext) {
      return NextResponse.json({
        authenticated: true,
        userType: "STAFF",
        user: authContext.user,
        permissions: authContext.permissions,
        csrfToken: authContext.session.csrfToken,
      });
    }

    if ("patron" in authContext) {
      return NextResponse.json({
        authenticated: true,
        userType: "PATRON",
        patron: {
          id: authContext.patron.id,
          cardNo: authContext.patron.cardNo,
          employeeId: authContext.patron.employeeId,
          name: `${authContext.patron.firstName} ${authContext.patron.lastName ?? ""}`.trim(),
          patronType: authContext.patron.patronType,
          libraryId: authContext.patron.libraryId,
          mustChangePassword: authContext.patron.mustChangePassword,
        },
        csrfToken: authContext.session.csrfToken,
      });
    }

    return NextResponse.json({ authenticated: false }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
