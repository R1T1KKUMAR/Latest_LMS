"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface TopNavProps {
  userName: string;
  userRole: string;
  roleCode: string;
  libraryName: string;
  csrfToken: string;
}

const roleBadgeColors: Record<string, string> = {
  SUPER_ADMIN: "bg-purple-100 text-purple-800 border-purple-200",
  LIBRARY_ADMIN: "bg-indigo-100 text-indigo-800 border-indigo-200",
  LIBRARIAN: "bg-blue-100 text-blue-800 border-blue-200",
  ASSISTANT_LIBRARIAN: "bg-slate-100 text-slate-800 border-slate-200",
};

export function TopNav({ userName, userRole, roleCode, libraryName, csrfToken }: TopNavProps) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

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

  return (
    <header className="h-16 border-b border-slate-200 bg-white px-6 flex items-center justify-between shadow-xs">
      {/* Branch & Institution Context */}
      <div className="flex items-center space-x-3 text-xs">
        <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
        <span className="font-semibold text-slate-800">{libraryName}</span>
        <span className="text-slate-400">&bull;</span>
        <span className="text-slate-500">RBMI Group of Institutions</span>
      </div>

      {/* Right Controls */}
      <div className="flex items-center space-x-4">
        {/* Link to public OPAC */}
        <Link
          href="/opac"
          target="_blank"
          className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
        >
          View Public OPAC ↗
        </Link>

        {/* User Profile Pill */}
        <div className="flex items-center space-x-2.5 border-l border-slate-200 pl-4">
          <div className="text-right">
            <div className="text-xs font-bold text-slate-900">{userName}</div>
            <div className="text-[10px] text-slate-500">{userRole}</div>
          </div>
          <span
            className={`rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              roleBadgeColors[roleCode] ?? "bg-slate-100 text-slate-800 border-slate-200"
            }`}
          >
            {roleCode}
          </span>
        </div>

        {/* Sign Out Button */}
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-red-50 hover:text-red-700 transition disabled:opacity-50"
        >
          {loggingOut ? "Signing out..." : "Sign Out"}
        </button>
      </div>
    </header>
  );
}
