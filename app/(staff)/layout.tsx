import { eq } from "drizzle-orm";
import type React from "react";
import { ForbiddenCard } from "@/components/auth/ForbiddenCard";
import { StaffWorkspaceShell } from "@/components/layout/StaffWorkspaceShell";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { requirePageAuth } from "@/lib/auth";
import { getCachedLibraries } from "@/lib/master-data-cache";

const libraryNameCache = new Map<number, string>();

async function getCachedLibraryName(libraryId: number): Promise<string> {
  const cached = libraryNameCache.get(libraryId);
  if (cached) return cached;

  const libRows = await db
    .select({ name: schema.libraries.name })
    .from(schema.libraries)
    .where(eq(schema.libraries.id, libraryId))
    .limit(1);

  const name = libRows[0]?.name ?? "RBMI Central Library";
  libraryNameCache.set(libraryId, name);
  return name;
}

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const auth = await requirePageAuth();

  if (!auth.authorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4 sm:p-6">
        <ForbiddenCard
          title="Staff Authentication Required"
          message="You must be signed in with an active staff account to access the staff workspace."
        />
      </div>
    );
  }

  const staffContext = auth.context;

  // Resolve Home Library & all active libraries in parallel
  const [libraryName, allLibraries] = await Promise.all([
    getCachedLibraryName(staffContext.user.libraryId),
    getCachedLibraries(),
  ]);

  const currentLib = allLibraries.find((l) => l.id === staffContext.user.libraryId);
  const isAvailable = currentLib?.isLibrarianAvailable ?? staffContext.user.isAvailable ?? true;

  return (
    <StaffWorkspaceShell
      userPermissions={staffContext.permissions}
      roleName={staffContext.user.roleName}
      userName={staffContext.user.fullName}
      userRole={staffContext.user.roleName}
      roleCode={staffContext.user.roleCode}
      libraryName={libraryName}
      libraryId={staffContext.user.libraryId}
      isAvailable={isAvailable}
      libraries={allLibraries}
      csrfToken={staffContext.session.csrfToken}
    >
      {children}
    </StaffWorkspaceShell>
  );
}
