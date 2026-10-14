"use client";

import { useState } from "react";
import type { StaffUserListItem } from "@/services/user";
import { formatDateTime } from "@/lib/utils";
import { ALL_PERMISSIONS, ALL_ROLES, ROLE_PERMISSIONS_MATRIX, type RoleCode } from "@/types/auth";

interface RoleOption {
  id: number;
  code: string;
  name: string;
}

interface LibraryOption {
  id: number;
  code: string;
  name: string;
}

interface Props {
  initialUsers: StaffUserListItem[];
  roles: RoleOption[];
  libraries: LibraryOption[];
  csrfToken: string;
  currentUserId: number;
}

export function StaffUserManagementClient({
  initialUsers,
  roles,
  libraries,
  csrfToken,
  currentUserId,
}: Props) {
  const [users, setUsers] = useState<StaffUserListItem[]>(initialUsers);
  const [activeTab, setActiveTab] = useState<"users" | "matrix">("users");

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<StaffUserListItem | null>(null);
  const [passwordResetUser, setPasswordResetUser] = useState<StaffUserListItem | null>(null);

  // Form states
  const [createForm, setCreateForm] = useState({
    username: "",
    fullName: "",
    password: "",
    roleId: roles[0]?.id ?? 1,
    libraryId: libraries[0]?.id ?? 1,
  });
  const [newPassword, setNewPassword] = useState("");
  const [editForm, setEditForm] = useState({
    fullName: "",
    roleId: 1,
    libraryId: 1,
    isActive: true,
  });

  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const showNotification = (type: "success" | "error", message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 6000);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          ...createForm,
          csrfToken,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        showNotification("error", data.error || "Failed to create staff account");
      } else {
        setUsers((prev) => [...prev, data.user]);
        setIsCreateOpen(false);
        setCreateForm({
          username: "",
          fullName: "",
          password: "",
          roleId: roles[0]?.id ?? 1,
          libraryId: libraries[0]?.id ?? 1,
        });
        showNotification(
          "success",
          `Staff account '${data.user.username}' created successfully with Argon2id hash.`,
        );
      }
    } catch {
      showNotification("error", "Network error while creating staff account");
    } finally {
      setLoading(false);
    }
  };

  const openEdit = (user: StaffUserListItem) => {
    setEditingUser(user);
    setEditForm({
      fullName: user.fullName,
      roleId: user.roleId,
      libraryId: user.libraryId,
      isActive: user.isActive,
    });
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setLoading(true);

    try {
      const res = await fetch(`/api/admin/users/${editingUser.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          ...editForm,
          csrfToken,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        showNotification("error", data.error || "Failed to update staff account");
      } else {
        setUsers((prev) => prev.map((u) => (u.id === editingUser.id ? data.user : u)));
        setEditingUser(null);
        showNotification("success", `Account for '${data.user.username}' updated successfully.`);
      }
    } catch {
      showNotification("error", "Network error while updating staff account");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordResetUser) return;
    setLoading(true);

    try {
      const res = await fetch(`/api/admin/users/${passwordResetUser.id}/password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          newPassword,
          csrfToken,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        showNotification("error", data.error || "Failed to reset password");
      } else {
        setPasswordResetUser(null);
        setNewPassword("");
        showNotification(
          "success",
          `Password reset for '${passwordResetUser.username}'. All active sessions invalidated.`,
        );
      }
    } catch {
      showNotification("error", "Network error while resetting password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {notification && (
        <div
          className={`rounded-lg p-4 text-sm font-medium border flex items-center justify-between ${
            notification.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-red-50 text-red-800 border-red-200"
          }`}
        >
          <span>{notification.message}</span>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="text-xs font-semibold underline ml-4 hover:opacity-80"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 space-x-6">
        <button
          type="button"
          onClick={() => setActiveTab("users")}
          className={`pb-3 text-sm font-semibold border-b-2 transition ${
            activeTab === "users"
              ? "border-blue-900 text-blue-900"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Staff Accounts ({users.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("matrix")}
          className={`pb-3 text-sm font-semibold border-b-2 transition ${
            activeTab === "matrix"
              ? "border-blue-900 text-blue-900"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Role &amp; Permission Matrix (SRS §10.3)
        </button>
      </div>

      {activeTab === "users" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-500">
              <strong className="text-slate-700">Audit Rule (FR-AU-04):</strong> Staff accounts are
              never physically deleted. Deactivation preserves loan history and audit logs.
            </div>
            <button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              className="inline-flex items-center rounded-md bg-blue-900 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-800 transition"
            >
              + Add Staff Account
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-xs">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-600 tracking-wider">
                <tr>
                  <th className="px-4 py-3">Username</th>
                  <th className="px-4 py-3">Full Name</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Home Library</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Last Login</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-normal text-slate-700">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/50 transition">
                    <td className="px-4 py-3 font-mono font-medium text-slate-900">
                      {user.username}
                      {user.id === currentUserId && (
                        <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-800">
                          You
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">{user.fullName}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded px-2 py-0.5 text-xs font-semibold ${
                          user.roleCode === "SUPER_ADMIN"
                            ? "bg-purple-100 text-purple-800"
                            : user.roleCode === "LIBRARY_ADMIN"
                              ? "bg-indigo-100 text-indigo-800"
                              : user.roleCode === "LIBRARIAN"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-slate-100 text-slate-800"
                        }`}
                      >
                        {user.roleName}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{user.libraryName}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          user.isActive
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {user.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {user.lastLogin ? formatDateTime(user.lastLogin) : "Never"}
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => openEdit(user)}
                        className="rounded px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 transition"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setPasswordResetUser(user)}
                        className="rounded px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 transition"
                      >
                        Reset Password
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Role & Permissions Matrix Tab */}
      {activeTab === "matrix" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-600 shadow-xs">
            <h3 className="font-semibold text-slate-900 text-sm mb-1">
              Immutable Role-Based Access Control (RBAC) Architecture
            </h3>
            <p>
              In accordance with SRS Section 10.3, the system defines exactly 4 roles and 21
              permissions. Permission checks are executed server-side on every request.
            </p>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-xs">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-4 py-3 font-semibold uppercase">Permission Code</th>
                  {ALL_ROLES.map((role) => (
                    <th key={role} className="px-3 py-3 text-center font-semibold uppercase">
                      {role === "SUPER_ADMIN"
                        ? "Super Admin (21)"
                        : role === "LIBRARY_ADMIN"
                          ? "Library Admin (20)"
                          : role === "LIBRARIAN"
                            ? "Librarian (16)"
                            : "Asst Librarian (9)"}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ALL_PERMISSIONS.map((perm) => (
                  <tr key={perm} className="hover:bg-slate-50/50">
                    <td className="px-4 py-2 font-mono font-medium text-slate-900">{perm}</td>
                    {ALL_ROLES.map((role: RoleCode) => {
                      const allowed = ROLE_PERMISSIONS_MATRIX[role].includes(perm);
                      return (
                        <td key={role} className="px-3 py-2 text-center">
                          {allowed ? (
                            <span className="inline-flex items-center justify-center font-bold text-emerald-600">
                              ✓
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center font-bold text-slate-300">
                              —
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900">Add New Staff Member</h3>
            <p className="mt-1 text-xs text-slate-500">
              Credentials are securely hashed via Argon2id. Password must be at least 6 characters.
            </p>

            <form onSubmit={handleCreate} className="mt-4 space-y-4 text-xs">
              <div>
                <label htmlFor="create-username" className="block font-semibold text-slate-700">
                  Username
                </label>
                <input
                  id="create-username"
                  type="text"
                  required
                  value={createForm.username}
                  onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                  placeholder="e.g. jdoe"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-900 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="create-fullname" className="block font-semibold text-slate-700">
                  Full Name
                </label>
                <input
                  id="create-fullname"
                  type="text"
                  required
                  value={createForm.fullName}
                  onChange={(e) => setCreateForm({ ...createForm, fullName: e.target.value })}
                  placeholder="e.g. John Doe"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-900 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="create-password" className="block font-semibold text-slate-700">
                  Initial Password
                </label>
                <input
                  id="create-password"
                  type="password"
                  required
                  minLength={6}
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  placeholder="Minimum 6 characters"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-900 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="create-role" className="block font-semibold text-slate-700">
                  Assigned Role
                </label>
                <select
                  id="create-role"
                  value={createForm.roleId}
                  onChange={(e) => setCreateForm({ ...createForm, roleId: Number(e.target.value) })}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white focus:border-blue-900 focus:outline-none"
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="create-library" className="block font-semibold text-slate-700">
                  Home Library
                </label>
                <select
                  id="create-library"
                  value={createForm.libraryId}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, libraryId: Number(e.target.value) })
                  }
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white focus:border-blue-900 focus:outline-none"
                >
                  {libraries.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-6 flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="rounded-md border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-md bg-blue-900 px-4 py-2 font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                >
                  {loading ? "Creating..." : "Create Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900">
              Edit Staff Member: {editingUser.username}
            </h3>

            <form onSubmit={handleUpdate} className="mt-4 space-y-4 text-xs">
              <div>
                <label htmlFor="edit-fullname" className="block font-semibold text-slate-700">
                  Full Name
                </label>
                <input
                  id="edit-fullname"
                  type="text"
                  required
                  value={editForm.fullName}
                  onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-900 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="edit-role" className="block font-semibold text-slate-700">
                  Assigned Role
                </label>
                <select
                  id="edit-role"
                  value={editForm.roleId}
                  onChange={(e) => setEditForm({ ...editForm, roleId: Number(e.target.value) })}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white focus:border-blue-900 focus:outline-none"
                >
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="edit-library" className="block font-semibold text-slate-700">
                  Home Library
                </label>
                <select
                  id="edit-library"
                  value={editForm.libraryId}
                  onChange={(e) => setEditForm({ ...editForm, libraryId: Number(e.target.value) })}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white focus:border-blue-900 focus:outline-none"
                >
                  {libraries.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={editForm.isActive}
                  onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-blue-900 focus:ring-blue-900"
                />
                <label htmlFor="isActive" className="font-semibold text-slate-700">
                  Account is Active (Unchecking immediately revokes session access)
                </label>
              </div>

              <div className="mt-6 flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="rounded-md border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-md bg-blue-900 px-4 py-2 font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                >
                  {loading ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {passwordResetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900">
              Reset Password for {passwordResetUser.username}
            </h3>
            <p className="mt-1 text-xs text-amber-700 bg-amber-50 p-2.5 rounded border border-amber-200">
              Resetting this password will immediately invalidate all active sessions for this user
              and require them to log in with the new password.
            </p>

            <form onSubmit={handleResetPassword} className="mt-4 space-y-4 text-xs">
              <div>
                <label htmlFor="reset-password" className="block font-semibold text-slate-700">
                  New Password
                </label>
                <input
                  id="reset-password"
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-900 focus:outline-none"
                />
              </div>

              <div className="mt-6 flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setPasswordResetUser(null);
                    setNewPassword("");
                  }}
                  className="rounded-md border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-md bg-amber-600 px-4 py-2 font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {loading ? "Resetting..." : "Reset Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
