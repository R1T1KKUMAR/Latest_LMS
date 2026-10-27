"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export interface LibraryOption {
  id: number;
  name: string;
  code: string;
  isLibrarianAvailable?: boolean;
}

interface TopNavProps {
  userName: string;
  userRole: string;
  roleCode: string;
  libraryName: string;
  libraryId?: number;
  isAvailable?: boolean;
  libraries?: LibraryOption[];
  csrfToken: string;
  onToggleMobileSidebar?: () => void;
}

const roleBadgeColors: Record<string, string> = {
  SUPER_ADMIN: "bg-purple-100 text-purple-800 border-purple-200",
  LIBRARY_ADMIN: "bg-indigo-100 text-indigo-800 border-indigo-200",
  LIBRARIAN: "bg-blue-100 text-blue-800 border-blue-200",
  ASSISTANT_LIBRARIAN: "bg-slate-100 text-slate-800 border-slate-200",
};

export function TopNav({
  userName,
  userRole,
  roleCode,
  libraryName,
  libraryId,
  isAvailable = true,
  libraries = [],
  csrfToken,
  onToggleMobileSidebar,
}: TopNavProps) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [available, setAvailable] = useState<boolean>(isAvailable);
  const [updatingAvailability, setUpdatingAvailability] = useState(false);
  const [showStatusToast, setShowStatusToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const handleToggleAvailability = async () => {
    if (updatingAvailability) return;
    const nextState = !available;
    setUpdatingAvailability(true);

    try {
      const res = await fetch("/api/circulation/librarian-availability", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          libraryId,
          isAvailable: nextState,
          csrfToken,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setAvailable(nextState);
        setToastMessage(
          nextState
            ? "Marked Available: Overdue fines apply as normal"
            : "Marked Away: Overdue fines are now EXEMPTED",
        );
        setShowStatusToast(true);
        setTimeout(() => setShowStatusToast(false), 4000);
        router.refresh();
      } else {
        alert(data.error ?? "Failed to update availability status");
      }
    } catch {
      alert("Network error updating librarian availability");
    } finally {
      setUpdatingAvailability(false);
    }
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({ csrfToken }),
      });
    } finally {
      router.push("/login");
      router.refresh();
    }
  };

  const isSuperAdmin = roleCode === "SUPER_ADMIN";

  return (
    <header className="h-16 border-b border-slate-200 bg-white px-3 sm:px-6 flex items-center justify-between shadow-xs shrink-0 relative">
      {/* Left: Mobile Menu Toggle & Branch Context */}
      <div className="flex items-center space-x-2 sm:space-x-3 text-xs min-w-0">
        {onToggleMobileSidebar && (
          <button
            type="button"
            onClick={onToggleMobileSidebar}
            aria-label="Toggle Navigation Menu"
            className="md:hidden flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 transition"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}

        <span
          className={`flex h-2.5 w-2.5 flex-shrink-0 rounded-full ${
            available ? "bg-emerald-500" : "bg-amber-500 animate-pulse"
          }`}
        />
        <div className="flex items-center space-x-1.5 sm:space-x-2 truncate">
          <span className="font-bold text-slate-900 truncate text-xs sm:text-sm">
            {libraryName}
          </span>
          {isSuperAdmin && libraries.length > 0 && (
            <span className="hidden sm:inline-flex rounded bg-purple-50 px-1.5 py-0.5 text-[9px] sm:text-[10px] font-semibold text-purple-700 border border-purple-200">
              4 Libraries
            </span>
          )}
        </div>
        <span className="text-slate-300 hidden md:inline">&bull;</span>
        <span className="text-slate-500 hidden md:inline truncate">RBMI Group of Institutions</span>
      </div>

      {/* Right Controls */}
      <div className="flex items-center space-x-2 sm:space-x-3 flex-shrink-0">
        {/* Librarian Availability Switcher Pill */}
        <button
          type="button"
          onClick={handleToggleAvailability}
          disabled={updatingAvailability}
          title={
            available
              ? "Click to mark Librarian as Away (Overdue fines will be EXEMPTED)"
              : "Click to mark Librarian as Present (Normal circulation fines apply)"
          }
          className={`group flex items-center gap-1 sm:gap-1.5 rounded-full px-2 sm:px-3 py-1 text-xs font-semibold border transition shadow-2xs cursor-pointer ${
            available
              ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
              : "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
          } ${updatingAvailability ? "opacity-60 cursor-not-allowed" : ""}`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              available ? "bg-emerald-500" : "bg-amber-500 animate-ping"
            }`}
          />
          <span className="hidden sm:inline">
            {updatingAvailability
              ? "Updating..."
              : available
                ? "Librarian: Present"
                : "Librarian: Away (Fine Exempt)"}
          </span>
          <span className="sm:hidden text-[11px]">
            {updatingAvailability ? "..." : available ? "Present" : "Away"}
          </span>
          <span className="text-[10px] text-slate-400 group-hover:text-slate-600 hidden xs:inline ml-0.5">
            ⇄
          </span>
        </button>

        {/* Link to public OPAC */}
        <Link
          href="/opac"
          target="_blank"
          className="hidden lg:inline-flex rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
        >
          OPAC ↗
        </Link>

        {/* User Profile Pill */}
        <div className="flex items-center space-x-1.5 sm:space-x-2 border-l border-slate-200 pl-2 sm:pl-3">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-bold text-slate-900 truncate max-w-[120px]">{userName}</div>
            <div className="text-[10px] text-slate-500 truncate max-w-[120px]">{userRole}</div>
          </div>
          <span
            className={`rounded border px-1.5 py-0.5 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider ${
              roleBadgeColors[roleCode] ?? "bg-slate-100 text-slate-800 border-slate-200"
            }`}
          >
            {roleCode === "ASSISTANT_LIBRARIAN" ? "ASST" : roleCode}
          </span>
        </div>

        {/* Sign Out Button */}
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="rounded-md bg-slate-100 px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs font-semibold text-slate-700 hover:bg-red-50 hover:text-red-700 transition disabled:opacity-50"
        >
          {loggingOut ? "..." : "Sign Out"}
        </button>
      </div>

      {/* Floating Status Notification Toast */}
      {showStatusToast && (
        <div className="absolute top-16 right-3 sm:right-6 mt-2 z-50 rounded-lg border border-slate-200 bg-white p-3 shadow-lg flex items-center space-x-3 text-xs max-w-[90vw]">
          <span
            className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${available ? "bg-emerald-500" : "bg-amber-500"}`}
          />
          <div className="font-medium text-slate-800">{toastMessage}</div>
        </div>
      )}
    </header>
  );
}
