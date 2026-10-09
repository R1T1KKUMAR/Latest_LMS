import { eq } from "drizzle-orm";
import type React from "react";
import { ForbiddenCard } from "@/components/auth/ForbiddenCard";
import { StaffSidebar } from "@/components/layout/StaffSidebar";
import { TopNav } from "@/components/layout/TopNav";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { requirePageAuth } from "@/lib/auth";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const auth = await requirePageAuth();

  if (!auth.authorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-6">
        <ForbiddenCard
          title="Staff Authentication Required"
          message="You must be signed in with an active staff account to access the staff workspace."
        />
      </div>
    );
  }

  const staffContext = auth.context;

  // Resolve Home Library Name
  const libRows = await db
    .select({ name: schema.libraries.name })
    .from(schema.libraries)
    .where(eq(schema.libraries.id, staffContext.user.libraryId))
    .limit(1);

  const libraryName = libRows[0]?.name ?? "RBMI Central Library";

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Permission-filtered Sidebar (FR-AU-02, UI-2) */}
      <StaffSidebar
        userPermissions={staffContext.permissions}
        roleName={staffContext.user.roleName}
      />

      {/* Main Workspace Body */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopNav
          userName={staffContext.user.fullName}
          userRole={staffContext.user.roleName}
          roleCode={staffContext.user.roleCode}
          libraryName={libraryName}
          csrfToken={staffContext.session.csrfToken}
        />

        <main className="flex-1 p-6 sm:p-8 max-w-7xl w-full mx-auto">{children}</main>

        <footer className="border-t border-slate-200 bg-white py-3 text-center text-xs text-slate-500">
          RBMI Group of Institutions &bull; Campus Central Library System &bull; Version 1.0
        </footer>
      </div>
    </div>
  );
}
