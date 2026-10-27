"use client";

import type React from "react";
import { useState } from "react";
import { StaffSidebar } from "@/components/layout/StaffSidebar";
import { type LibraryOption, TopNav } from "@/components/layout/TopNav";

interface StaffWorkspaceShellProps {
  userPermissions: string[];
  roleName: string;
  userName: string;
  userRole: string;
  roleCode: string;
  libraryName: string;
  libraryId: number;
  isAvailable: boolean;
  libraries: LibraryOption[];
  csrfToken: string;
  children: React.ReactNode;
}

export function StaffWorkspaceShell({
  userPermissions,
  roleName,
  userName,
  userRole,
  roleCode,
  libraryName,
  libraryId,
  isAvailable,
  libraries,
  csrfToken,
  children,
}: StaffWorkspaceShellProps) {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  return (
    <div className="h-screen flex overflow-hidden bg-slate-50 text-slate-900">
      {/* Desktop Sidebar (hidden on mobile, visible on md+) */}
      <StaffSidebar userPermissions={userPermissions} roleName={roleName} />

      {/* Mobile Sidebar Overlay Drawer */}
      {isMobileSidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={() => setIsMobileSidebarOpen(false)}
            aria-hidden="true"
          />

          {/* Sliding Drawer Content */}
          <div className="relative z-50 flex-1 flex max-w-xs w-full animate-in slide-in-from-left duration-200">
            <StaffSidebar
              userPermissions={userPermissions}
              roleName={roleName}
              isMobileDrawer={true}
              onCloseMobile={() => setIsMobileSidebarOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main Workspace Body */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <TopNav
          userName={userName}
          userRole={userRole}
          roleCode={roleCode}
          libraryName={libraryName}
          libraryId={libraryId}
          isAvailable={isAvailable}
          libraries={libraries}
          csrfToken={csrfToken}
          onToggleMobileSidebar={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
        />

        <div className="flex-1 overflow-y-auto flex flex-col">
          <main className="flex-1 p-3 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">{children}</main>

          <footer className="border-t border-slate-200 bg-white py-3 text-center text-xs text-slate-500">
            RBMI Group of Institutions &bull; Campus Central Library System &bull; Version 1.0
          </footer>
        </div>
      </div>
    </div>
  );
}
