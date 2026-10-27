import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { getCurrentSession, invalidateAuthProfileCache, requirePermission } from "@/lib/auth";
import { validateCsrfToken } from "@/lib/csrf";
import { recordAuditLog } from "@/services/audit";

/**
 * GET /api/circulation/librarian-availability
 * Returns availability statuses for libraries and current staff user.
 */
export async function GET() {
  try {
    const authContext = await getCurrentSession("STAFF");
    if (!authContext || !("user" in authContext)) {
      return NextResponse.json({ error: "Staff authentication required" }, { status: 401 });
    }

    const libs = await db
      .select({
        id: schema.libraries.id,
        name: schema.libraries.name,
        code: schema.libraries.code,
        isLibrarianAvailable: schema.libraries.isLibrarianAvailable,
        librarianStatusNote: schema.libraries.librarianStatusNote,
        librarianStatusUpdatedAt: schema.libraries.librarianStatusUpdatedAt,
      })
      .from(schema.libraries)
      .where(eq(schema.libraries.isActive, true))
      .orderBy(schema.libraries.id);

    return NextResponse.json({
      success: true,
      libraries: libs,
      userAvailability: {
        userId: authContext.user.id,
        libraryId: authContext.user.libraryId,
        isAvailable: authContext.user.isAvailable,
        roleCode: authContext.user.roleCode,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch availability";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/circulation/librarian-availability
 * Toggles librarian availability in library and updates fine exemption trigger.
 */
export async function POST(request: NextRequest) {
  try {
    const authContext = await requirePermission("CIRC_RETURN", { request });

    const body = await request.json().catch(() => ({}));
    const csrfToken = request.headers.get("x-csrf-token") ?? body.csrfToken;

    if (!validateCsrfToken(authContext.session.csrfToken, csrfToken)) {
      return NextResponse.json(
        { success: false, error: "Invalid or missing CSRF token" },
        { status: 403 },
      );
    }

    const isAvailable = Boolean(body.isAvailable);
    const isSuperAdmin = authContext.user.roleCode === "SUPER_ADMIN";

    // Target library: Super Admin can specify libraryId, else use librarian's assigned library
    const targetLibraryId =
      isSuperAdmin && body.libraryId ? Number(body.libraryId) : authContext.user.libraryId;

    const note =
      typeof body.note === "string" && body.note.trim()
        ? body.note.trim()
        : isAvailable
          ? "Librarian is present in library"
          : "Librarian is away / not available (Fines Exempted)";

    const now = new Date();

    // 1. Update library availability flag
    await db
      .update(schema.libraries)
      .set({
        isLibrarianAvailable: isAvailable,
        librarianStatusNote: note,
        librarianStatusUpdatedAt: now,
      })
      .where(eq(schema.libraries.id, targetLibraryId));

    // 2. Update staff user availability flag
    await db
      .update(schema.users)
      .set({
        isAvailable: isAvailable,
      })
      .where(eq(schema.users.id, authContext.user.id));

    // 3. Clear auth profile cache
    invalidateAuthProfileCache(authContext.user.id);

    // 4. Audit log
    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      undefined;

    await recordAuditLog({
      actorType: "STAFF",
      actorId: authContext.user.id,
      actorName: authContext.user.fullName,
      action: "LIBRARIAN_AVAILABILITY_CHANGE",
      entity: "libraries",
      entityId: String(targetLibraryId),
      details: `Librarian availability updated to ${
        isAvailable ? "AVAILABLE" : "UNAVAILABLE (FINES EXEMPTED)"
      } for library #${targetLibraryId} by ${authContext.user.fullName} (${authContext.user.roleCode}). Note: ${note}`,
      ipAddress,
    });

    return NextResponse.json({
      success: true,
      libraryId: targetLibraryId,
      isAvailable,
      note,
      updatedAt: now.toISOString(),
      message: `Library availability successfully set to ${isAvailable ? "Available" : "Away (Fines Exempted)"}`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update availability";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
