import { ForbiddenCard } from "@/components/auth/ForbiddenCard";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { requirePageAuth } from "@/lib/auth";
import { listStaffUsers } from "@/services/user";
import { StaffUserManagementClient } from "./StaffUserManagementClient";

export const metadata = {
  title: "Staff Accounts Administration — RBMI LMS",
  description: "Manage staff accounts, roles, and security permissions",
};

export default async function AdminUsersPage() {
  const auth = await requirePageAuth("ADMIN_USERS");

  if (!auth.authorized) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ForbiddenCard
          message={
            auth.status === 401
              ? "You must be signed in with a staff account to access this page."
              : "Access to Staff User Administration is restricted to Super Administrators (ADMIN_USERS). Other roles (Library Administrator, Librarian, Assistant Librarian) are refused access per SRS Section 10.3."
          }
          requiredPermission="ADMIN_USERS"
          userRole={auth.context?.user.roleName}
        />
      </div>
    );
  }

  const staffContext = auth.context;
  const [users, roles, libraries] = await Promise.all([
    listStaffUsers(db),
    db
      .select({
        id: schema.roles.id,
        code: schema.roles.code,
        name: schema.roles.name,
      })
      .from(schema.roles)
      .orderBy(schema.roles.id),
    db
      .select({
        id: schema.libraries.id,
        code: schema.libraries.code,
        name: schema.libraries.name,
      })
      .from(schema.libraries)
      .orderBy(schema.libraries.id),
  ]);

  const activeCount = users.filter((u) => u.isActive).length;
  const inactiveCount = users.filter((u) => !u.isActive).length;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Page Header */}
      <div className="mb-6 flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center space-x-2">
            <span className="rounded bg-purple-100 px-2.5 py-0.5 text-xs font-bold text-purple-900 uppercase tracking-wide">
              Super Admin Area
            </span>
            <span className="text-xs text-slate-500">FR-AU-04 &bull; UC-11</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Staff Accounts &amp; Permissions
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Create, edit, deactivate staff accounts and reset passwords. View the complete SRS
            permission matrix.
          </p>
        </div>

        {/* User stats */}
        <div className="flex items-center space-x-3 text-xs">
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center shadow-xs">
            <div className="text-slate-500">Total Accounts</div>
            <div className="text-base font-bold text-slate-900">{users.length}</div>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2 text-center shadow-xs">
            <div className="text-emerald-700">Active</div>
            <div className="text-base font-bold text-emerald-900">{activeCount}</div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center shadow-xs">
            <div className="text-slate-500">Inactive</div>
            <div className="text-base font-bold text-slate-700">{inactiveCount}</div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <StaffUserManagementClient
        initialUsers={users}
        roles={roles}
        libraries={libraries}
        csrfToken={staffContext.session.csrfToken}
        currentUserId={staffContext.user.id}
      />
    </div>
  );
}
