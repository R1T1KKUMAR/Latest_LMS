"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { PermissionCode } from "@/types/auth";

interface StaffSidebarProps {
  userPermissions: string[];
  roleName: string;
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
    ],
  },
];

export function StaffSidebar({ userPermissions, roleName }: StaffSidebarProps) {
  const pathname = usePathname();

  const isItemVisible = (item: NavItem) => {
    if (item.requireAll) {
      return item.requiredPermissions.every((p) => userPermissions.includes(p));
    }
    return item.requiredPermissions.some((p) => userPermissions.includes(p));
  };

  return (
    <aside className="w-64 flex-shrink-0 border-r border-slate-200 bg-white">
      {/* Brand Header */}
      <div className="flex h-16 items-center px-5 border-b border-slate-200 bg-slate-900 text-white">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white shadow-xs">
          LMS
        </span>
        <div className="ml-3">
          <div className="text-sm font-bold tracking-tight text-white leading-tight">
            RBMI Central Library
          </div>
          <div className="text-[10px] text-slate-400 font-medium">
            Staff Workspace &bull; {roleName}
          </div>
        </div>
      </div>

      {/* Navigation Sections */}
      <nav className="p-3 space-y-6 overflow-y-auto max-h-[calc(100vh-4rem)]">
        {navGroups.map((group) => {
          const visibleItems = group.items.filter(isItemVisible);
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.groupName}>
              <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-600">
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
    </aside>
  );
}
