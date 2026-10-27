"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { PermissionCode } from "@/types/auth";

interface StaffSidebarProps {
  userPermissions: string[];
  roleName: string;
  isMobileDrawer?: boolean;
  onCloseMobile?: () => void;
}

interface NavItem {
  label: string;
  href: string;
  icon: string;
  requiredPermissions: PermissionCode[];
  requireAll?: boolean;
}

interface NavGroup {
  groupName: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    groupName: "Overview",
    items: [
      {
        label: "Dashboard",
        href: "/dashboard",
        icon: "📊",
        requiredPermissions: ["DASHBOARD_VIEW"],
      },
    ],
  },
  {
    groupName: "Circulation Desk",
    items: [
      {
        label: "Issue & Return",
        href: "/circulation",
        icon: "🔄",
        requiredPermissions: ["CIRC_ISSUE", "CIRC_RETURN", "CIRC_RENEW"],
      },
      {
        label: "Reservations",
        href: "/reservations",
        icon: "📌",
        requiredPermissions: ["HOLD_MANAGE"],
      },
      {
        label: "Fines & Payments",
        href: "/fines",
        icon: "💰",
        requiredPermissions: ["FINE_COLLECT", "FINE_WAIVE"],
      },
      {
        label: "No-Dues Clearance",
        href: "/no-dues",
        icon: "🎓",
        requiredPermissions: ["NODUES_ISSUE"],
      },
    ],
  },
  {
    groupName: "Catalog & Patrons",
    items: [
      {
        label: "Catalogue",
        href: "/catalogue",
        icon: "📚",
        requiredPermissions: ["CATALOG_VIEW"],
      },
      {
        label: "Patron Roster",
        href: "/patrons",
        icon: "👥",
        requiredPermissions: ["PATRON_VIEW"],
      },
      {
        label: "Bulk Import",
        href: "/import",
        icon: "📥",
        requiredPermissions: ["PATRON_IMPORT", "CATALOG_IMPORT"],
      },
    ],
  },
  {
    groupName: "Analytics",
    items: [
      {
        label: "Reports (13)",
        href: "/reports",
        icon: "📈",
        requiredPermissions: ["REPORT_VIEW"],
      },
    ],
  },
  {
    groupName: "Administration",
    items: [
      {
        label: "Admin Portal",
        href: "/admin",
        icon: "⚙️",
        requiredPermissions: [
          "ADMIN_RULES",
          "ADMIN_SETTINGS",
          "ADMIN_MASTERS",
          "AUDIT_VIEW",
          "ADMIN_USERS",
        ],
      },
      {
        label: "Staff Accounts",
        href: "/admin/users",
        icon: "🛡️",
        requiredPermissions: ["ADMIN_USERS"],
        requireAll: true,
      },
      {
        label: "Fine Adjustment",
        href: "/admin/fines",
        icon: "💰",
        requiredPermissions: ["ADMIN_SETTINGS", "ADMIN_RULES"],
      },
      {
        label: "Holiday Calendar",
        href: "/admin/holidays",
        icon: "📅",
        requiredPermissions: ["ADMIN_SETTINGS"],
      },
    ],
  },
];

export function StaffSidebar({
  userPermissions,
  roleName,
  isMobileDrawer = false,
  onCloseMobile,
}: StaffSidebarProps) {
  const pathname = usePathname();

  const isItemVisible = (item: NavItem) => {
    if (item.requireAll) {
      return item.requiredPermissions.every((p) => userPermissions.includes(p));
    }
    return item.requiredPermissions.some((p) => userPermissions.includes(p));
  };

  const asideClasses = isMobileDrawer
    ? "w-72 max-w-[85vw] bg-white flex flex-col h-full shadow-2xl select-none"
    : "w-64 flex-shrink-0 border-r border-slate-200 bg-white hidden md:flex flex-col h-full select-none";

  return (
    <aside className={asideClasses}>
      {/* Brand Header */}
      <div className="flex h-16 items-center justify-between px-4 sm:px-5 border-b border-slate-200 bg-slate-900 text-white shrink-0">
        <div className="flex items-center min-w-0">
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white shadow-xs">
            LMS
          </span>
          <div className="ml-3 truncate">
            <div className="text-sm font-bold tracking-tight text-white leading-tight truncate">
              RBMI Central Library
            </div>
            <div className="text-[10px] text-slate-400 font-medium truncate">
              Staff Workspace &bull; {roleName}
            </div>
          </div>
        </div>

        {isMobileDrawer && onCloseMobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close navigation"
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Navigation Sections */}
      <nav className="p-3 space-y-6 overflow-y-auto flex-1">
        {navGroups.map((group) => {
          const visibleItems = group.items.filter(isItemVisible);
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.groupName}>
              <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {group.groupName}
              </div>
              <ul className="mt-1.5 space-y-0.5">
                {visibleItems.map((item) => {
                  const isActive =
                    item.href === "/admin"
                      ? pathname === "/admin"
                      : pathname === item.href || pathname.startsWith(`${item.href}/`);

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => {
                          if (isMobileDrawer && onCloseMobile) {
                            onCloseMobile();
                          }
                        }}
                        className={`flex items-center rounded-md px-3 py-2 text-xs font-medium transition ${
                          isActive
                            ? "bg-blue-900 text-white shadow-xs font-semibold"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        }`}
                      >
                        <span className="mr-2.5 text-sm">{item.icon}</span>
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      {/* Mobile Drawer Footer with OPAC shortcut */}
      {isMobileDrawer && (
        <div className="p-3 border-t border-slate-200 bg-slate-50">
          <Link
            href="/opac"
            target="_blank"
            className="flex items-center justify-center w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition shadow-2xs"
          >
            View Public OPAC ↗
          </Link>
        </div>
      )}
    </aside>
  );
}
