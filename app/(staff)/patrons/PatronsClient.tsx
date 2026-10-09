"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/Table";
import { generateCode128Svg } from "@/lib/barcode";
import {
  PATRON_STATUSES,
  PATRON_TYPES,
  type PatronStatus,
  type PatronType,
} from "@/lib/validations/patron";

export interface PatronListItem {
  id: number;
  cardNo: string;
  fullName: string;
  patronType: string;
  categoryName: string;
  departmentName: string | null;
  email: string | null;
  mobile: string | null;
  rollNo: string | null;
  employeeId: string | null;
  cardExpiry: string;
  status: string;
}

export interface MasterOption {
  id: number;
  name: string;
  code: string;
}

export interface CategoryOption extends MasterOption {
  patronType: string;
}

interface PatronsClientProps {
  initialPatrons: PatronListItem[];
  categories: CategoryOption[];
  departments: MasterOption[];
  courses: MasterOption[];
  csrfToken: string;
  canManage: boolean;
}

export function PatronsClient({
  initialPatrons,
  categories,
  departments,
  courses,
  csrfToken,
  canManage,
}: PatronsClientProps) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [actionAlert, setActionAlert] = useState<{
    variant: "info" | "success" | "warning" | "error";
    message: string;
  } | null>(null);

  // Register Patron Modal state
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newPatron, setNewPatron] = useState({
    patronType: "STUDENT" as PatronType,
    categoryId: categories[0]?.id ? String(categories[0].id) : "1",
    firstName: "",
    middleName: "",
    lastName: "",
    rollNo: "",
    employeeId: "",
    departmentId: "",
    courseId: "",
    mobile: "",
    email: "",
    gender: "MALE",
    address: "",
  });

  // Profile Inspector Modal state
  const [selectedPatronId, setSelectedPatronId] = useState<number | null>(null);
  const [profileDetail, setProfileDetail] = useState<{
    // biome-ignore lint/suspicious/noExplicitAny: detailed patron model
    patron: any;
    stats: { activeLoans: number; overdueLoans: number; outstandingFines: number };
  } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Barcode Preview Modal
  const [barcodePreview, setBarcodePreview] = useState<{
    cardNo: string;
    fullName: string;
  } | null>(null);

  const filtered = initialPatrons.filter((p) => {
    if (typeFilter && p.patronType !== typeFilter) return false;
    if (statusFilter && p.status !== statusFilter) return false;
    if (!searchTerm.trim()) return true;

    const q = searchTerm.toLowerCase();
    return (
      p.fullName.toLowerCase().includes(q) ||
      p.cardNo.toLowerCase().includes(q) ||
      (p.rollNo && p.rollNo.toLowerCase().includes(q)) ||
      (p.employeeId && p.employeeId.toLowerCase().includes(q)) ||
      (p.email && p.email.toLowerCase().includes(q)) ||
      (p.mobile && p.mobile.includes(q))
    );
  });

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setActionAlert(null);

    try {
      const res = await fetch("/api/patrons", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({
          patronType: newPatron.patronType,
          categoryId: Number(newPatron.categoryId),
          firstName: newPatron.firstName,
          middleName: newPatron.middleName || undefined,
          lastName: newPatron.lastName || undefined,
          rollNo: newPatron.rollNo || undefined,
          employeeId: newPatron.employeeId || undefined,
          departmentId: newPatron.departmentId ? Number(newPatron.departmentId) : undefined,
          courseId: newPatron.courseId ? Number(newPatron.courseId) : undefined,
          mobile: newPatron.mobile || undefined,
          email: newPatron.email || undefined,
          gender: newPatron.gender || undefined,
          address: newPatron.address || undefined,
          csrfToken,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setActionAlert({ variant: "error", message: data.error || "Failed to register patron" });
      } else {
        setActionAlert({
          variant: "success",
          message: `Patron "${data.patron.firstName} ${data.patron.lastName || ""}" registered successfully! Card No: ${data.patron.cardNo}.`,
        });
        setShowRegisterModal(false);
        setNewPatron({
          patronType: "STUDENT",
          categoryId: categories[0]?.id ? String(categories[0].id) : "1",
          firstName: "",
          middleName: "",
          lastName: "",
          rollNo: "",
          employeeId: "",
          departmentId: "",
          courseId: "",
          mobile: "",
          email: "",
          gender: "MALE",
          address: "",
        });
        router.refresh();
      }
    } catch {
      setActionAlert({ variant: "error", message: "Network error occurred registering patron" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleViewProfile = async (id: number) => {
    setSelectedPatronId(id);
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/patrons/${id}`);
      const data = await res.json();
      if (res.ok && data.patron) {
        setProfileDetail({
          patron: data.patron,
          stats: data.patron.stats || { activeLoans: 0, overdueLoans: 0, outstandingFines: 0 },
        });
      }
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleStatusChange = async (patronId: number, status: PatronStatus) => {
    try {
      const res = await fetch(`/api/patrons/${patronId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({ status, csrfToken }),
      });
      if (res.ok) {
        handleViewProfile(patronId);
        router.refresh();
      }
    } catch {
      alert("Error updating status");
    }
  };

  const handleResetPassword = async (patronId: number) => {
    if (!confirm("Reset OPAC password for this patron to their library card number?")) return;
    try {
      const res = await fetch(`/api/patrons/${patronId}/reset-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        body: JSON.stringify({ csrfToken }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(`Password reset successfully! Initial password equals card number: ${data.cardNo}`);
        handleViewProfile(patronId);
      } else {
        alert(data.error || "Failed to reset password");
      }
    } catch {
      alert("Error resetting password");
    }
  };

  return (
    <div className="space-y-6">
      {actionAlert && (
        <Alert variant={actionAlert.variant} onDismiss={() => setActionAlert(null)}>
          {actionAlert.message}
        </Alert>
      )}

      {/* Search and Filters Toolbar */}
      <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:flex-row sm:items-center">
        <div className="flex flex-1 flex-col sm:flex-row gap-3">
          <div className="w-full sm:w-80">
            <Input
              id="patron-search-filter"
              placeholder="Search name, card, roll no, mobile, email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-40">
            <Select
              id="patron-type-filter"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              options={[
                { value: "", label: "All Types" },
                ...PATRON_TYPES.map((t) => ({ value: t, label: t })),
              ]}
            />
          </div>
          <div className="w-full sm:w-40">
            <Select
              id="patron-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[
                { value: "", label: "All Statuses" },
                ...PATRON_STATUSES.map((s) => ({ value: s, label: s })),
              ]}
            />
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <span className="text-xs text-slate-500">
            {filtered.length} of {initialPatrons.length} patrons
          </span>
          {canManage && (
            <Button variant="primary" onClick={() => setShowRegisterModal(true)}>
              + Register Patron
            </Button>
          )}
        </div>
      </div>

      {/* Patron Roster Table */}
      {filtered.length === 0 ? (
        <EmptyState
          title="No Patrons Found"
          description={
            initialPatrons.length === 0
              ? "No student or faculty memberships registered yet. Click '+ Register Patron' or use Bulk Import."
              : "No patrons matched the search filter."
          }
          icon="👥"
        />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Card Number</TableHeaderCell>
                <TableHeaderCell>Full Name</TableHeaderCell>
                <TableHeaderCell>Type &amp; Category</TableHeaderCell>
                <TableHeaderCell>Roll / Employee ID</TableHeaderCell>
                <TableHeaderCell>Department</TableHeaderCell>
                <TableHeaderCell>Card Expiry</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Actions</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {filtered.map((patron) => {
                const isActive = patron.status === "ACTIVE";
                return (
                  <TableRow key={patron.id}>
                    <TableCell className="font-mono text-xs font-bold text-slate-900">
                      {patron.cardNo}
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => handleViewProfile(patron.id)}
                        className="font-bold text-slate-900 hover:text-blue-900 transition text-left"
                      >
                        {patron.fullName}
                      </button>
                      {patron.email && (
                        <div className="text-[11px] text-slate-500">{patron.email}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        <span className="inline-flex rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-700">
                          {patron.patronType}
                        </span>
                        <div className="text-[10px] text-slate-500">{patron.categoryName}</div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-700">
                      {patron.rollNo || patron.employeeId || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {patron.departmentName || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {new Date(patron.cardExpiry).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          isActive
                            ? "bg-emerald-100 text-emerald-800"
                            : patron.status === "BLOCKED"
                              ? "bg-red-100 text-red-800"
                              : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {patron.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleViewProfile(patron.id)}
                      >
                        Profile
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Register Patron Modal Form */}
      {showRegisterModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="register-patron-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs overflow-y-auto"
        >
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl border border-slate-200 my-8">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
              <h3 id="register-patron-modal-title" className="text-base font-bold text-slate-900">
                Register New Patron Membership (FR-PA-01)
              </h3>
              <button
                type="button"
                onClick={() => setShowRegisterModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRegisterSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Select
                    id="new-patron-type"
                    label="Patron Type"
                    value={newPatron.patronType}
                    onChange={(e) =>
                      setNewPatron({ ...newPatron, patronType: e.target.value as PatronType })
                    }
                    options={PATRON_TYPES.map((t) => ({ value: t, label: t }))}
                    required
                  />
                </div>
                <div>
                  <Select
                    id="new-patron-category"
                    label="Membership Category"
                    value={newPatron.categoryId}
                    onChange={(e) => setNewPatron({ ...newPatron, categoryId: e.target.value })}
                    options={categories.map((c) => ({
                      value: String(c.id),
                      label: `${c.name} (${c.patronType})`,
                    }))}
                    required
                  />
                </div>
                <div>
                  <Input
                    id="new-patron-first-name"
                    label="First Name"
                    value={newPatron.firstName}
                    onChange={(e) => setNewPatron({ ...newPatron, firstName: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Input
                    id="new-patron-last-name"
                    label="Last Name"
                    value={newPatron.lastName}
                    onChange={(e) => setNewPatron({ ...newPatron, lastName: e.target.value })}
                  />
                </div>
                <div>
                  <Input
                    id="new-patron-roll-no"
                    label={
                      newPatron.patronType === "STUDENT"
                        ? "Student Roll No *"
                        : "Roll No (if student)"
                    }
                    placeholder="e.g. 2301430100045"
                    value={newPatron.rollNo}
                    onChange={(e) => setNewPatron({ ...newPatron, rollNo: e.target.value })}
                    required={newPatron.patronType === "STUDENT"}
                  />
                </div>
                <div>
                  <Input
                    id="new-patron-employee-id"
                    label={
                      newPatron.patronType === "FACULTY" || newPatron.patronType === "STAFF"
                        ? "Employee ID *"
                        : "Employee ID (if faculty/staff)"
                    }
                    placeholder="e.g. EMP-101"
                    value={newPatron.employeeId}
                    onChange={(e) => setNewPatron({ ...newPatron, employeeId: e.target.value })}
                    required={
                      newPatron.patronType === "FACULTY" || newPatron.patronType === "STAFF"
                    }
                  />
                </div>
                <div>
                  <Select
                    id="new-patron-dept"
                    label="Department"
                    value={newPatron.departmentId}
                    onChange={(e) => setNewPatron({ ...newPatron, departmentId: e.target.value })}
                    options={[
                      { value: "", label: "Select Department" },
                      ...departments.map((d) => ({ value: String(d.id), label: d.name })),
                    ]}
                  />
                </div>
                <div>
                  <Select
                    id="new-patron-course"
                    label="Academic Program / Course"
                    value={newPatron.courseId}
                    onChange={(e) => setNewPatron({ ...newPatron, courseId: e.target.value })}
                    options={[
                      { value: "", label: "Select Course" },
                      ...courses.map((c) => ({ value: String(c.id), label: c.name })),
                    ]}
                  />
                </div>
                <div>
                  <Input
                    id="new-patron-mobile"
                    label="Mobile Number"
                    placeholder="e.g. 9876543210"
                    value={newPatron.mobile}
                    onChange={(e) => setNewPatron({ ...newPatron, mobile: e.target.value })}
                  />
                </div>
                <div>
                  <Input
                    id="new-patron-email"
                    label="Email Address"
                    type="email"
                    placeholder="e.g. student@rbmi.in"
                    value={newPatron.email}
                    onChange={(e) => setNewPatron({ ...newPatron, email: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Input
                    id="new-patron-address"
                    label="Contact Address"
                    value={newPatron.address}
                    onChange={(e) => setNewPatron({ ...newPatron, address: e.target.value })}
                  />
                </div>
              </div>

              <p className="text-xs text-slate-500 pt-2">
                * Note: Library card number defaults to Roll No / Employee ID per FR-PA-02. Initial
                OPAC login password equals the card number (must be changed upon first login).
              </p>

              <div className="flex justify-end space-x-3 border-t border-slate-100 pt-4 mt-6">
                <Button type="button" variant="outline" onClick={() => setShowRegisterModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" isLoading={isSubmitting}>
                  Register Patron Membership
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Patron Profile Inspector Modal */}
      {profileDetail && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="patron-profile-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs overflow-y-auto"
        >
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl border border-slate-200 my-8 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center space-x-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-900 text-base font-bold text-white">
                  {profileDetail.patron.firstName.charAt(0)}
                </div>
                <div>
                  <h3
                    id="patron-profile-modal-title"
                    className="text-base font-bold text-slate-900"
                  >
                    {profileDetail.patron.firstName} {profileDetail.patron.lastName || ""}
                  </h3>
                  <div className="flex items-center space-x-2 text-xs text-slate-500">
                    <span>
                      Card:{" "}
                      <strong className="font-mono text-slate-700">
                        {profileDetail.patron.cardNo}
                      </strong>
                    </span>
                    <span>&bull;</span>
                    <span>{profileDetail.patron.categoryName}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() =>
                    setBarcodePreview({
                      cardNo: profileDetail.patron.cardNo,
                      fullName: `${profileDetail.patron.firstName} ${profileDetail.patron.lastName || ""}`,
                    })
                  }
                  className="rounded border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  ID Barcode SVG
                </button>
                <button
                  type="button"
                  onClick={() => setProfileDetail(null)}
                  className="text-slate-400 hover:text-slate-600 font-bold"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Profile KPI Stats */}
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                <span className="text-slate-500">Active Book Loans</span>
                <div className="mt-1 text-lg font-bold text-slate-900">
                  {profileDetail.stats.activeLoans}
                </div>
              </div>
              <div
                className={`rounded-lg border p-3 ${profileDetail.stats.overdueLoans > 0 ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-slate-50/50"}`}
              >
                <span
                  className={
                    profileDetail.stats.overdueLoans > 0 ? "text-amber-800" : "text-slate-500"
                  }
                >
                  Overdue Items
                </span>
                <div
                  className={`mt-1 text-lg font-bold ${profileDetail.stats.overdueLoans > 0 ? "text-amber-900" : "text-slate-900"}`}
                >
                  {profileDetail.stats.overdueLoans}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                <span className="text-slate-500">Outstanding Fines</span>
                <div className="mt-1 text-lg font-bold text-slate-900">
                  ₹{profileDetail.stats.outstandingFines.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Profile Fields Details */}
            <div className="rounded-lg border border-slate-200 p-4 space-y-2 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-slate-500">Department:</span>{" "}
                  <strong className="text-slate-800">
                    {profileDetail.patron.departmentName || "N/A"}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">Program / Course:</span>{" "}
                  <strong className="text-slate-800">
                    {profileDetail.patron.courseName || "N/A"}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">Email:</span>{" "}
                  <span className="text-slate-800">{profileDetail.patron.email || "N/A"}</span>
                </div>
                <div>
                  <span className="text-slate-500">Mobile:</span>{" "}
                  <span className="text-slate-800">{profileDetail.patron.mobile || "N/A"}</span>
                </div>
                <div>
                  <span className="text-slate-500">Card Validity Expiry:</span>{" "}
                  <strong className="text-slate-800">
                    {new Date(profileDetail.patron.cardExpiry).toLocaleDateString()}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">Current Status:</span>{" "}
                  <span className="rounded bg-emerald-100 px-2 py-0.5 font-bold uppercase text-emerald-800">
                    {profileDetail.patron.status}
                  </span>
                </div>
              </div>
            </div>

            {/* Management Actions */}
            {canManage && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Account Governance (FR-PA-06)
                </h4>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-slate-600">Change Status:</span>
                    <select
                      aria-label="Change Patron Status"
                      value={profileDetail.patron.status}
                      onChange={(e) =>
                        handleStatusChange(profileDetail.patron.id, e.target.value as PatronStatus)
                      }
                      className="rounded border border-slate-300 text-xs p-1.5 bg-white"
                    >
                      {PATRON_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleResetPassword(profileDetail.patron.id)}
                  >
                    Reset OPAC Password
                  </Button>
                </div>
              </div>
            )}

            <div className="flex justify-end border-t border-slate-100 pt-3">
              <Button variant="outline" onClick={() => setProfileDetail(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Library Card Barcode SVG Modal */}
      {barcodePreview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="card-barcode-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl border border-slate-200 text-center space-y-4">
            <h3 id="card-barcode-modal-title" className="text-sm font-bold text-slate-900">
              Patron ID Card Barcode (FR-PA-07)
            </h3>
            <p className="text-xs text-slate-600 font-semibold">{barcodePreview.fullName}</p>

            <div
              className="flex justify-center p-4 bg-slate-50 rounded-lg border border-slate-200"
              // biome-ignore lint/security/noDangerouslySetInnerHtml: pure internal Code 128 SVG generator
              dangerouslySetInnerHTML={{
                __html: generateCode128Svg(barcodePreview.cardNo, {
                  height: 48,
                  barWidth: 2,
                }),
              }}
            />

            <Button variant="outline" onClick={() => setBarcodePreview(null)} className="w-full">
              Close Preview
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
