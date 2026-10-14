"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  COLLEGE_CONFIGS,
  type CollegeInfo,
  resolveCollege,
  resolveCourseCategory,
} from "@/components/patrons/InstitutionalStudentRoster";
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
import { formatDate } from "@/lib/utils";
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
  categoryId: number;
  categoryName: string;
  institutionId?: number | null;
  institutionCode?: string | null;
  institutionName?: string | null;
  courseId?: number | null;
  courseCode?: string | null;
  courseName?: string | null;
  departmentId?: number | null;
  departmentName?: string | null;
  academicYear?: number | null;
  semester?: number | null;
  section?: string | null;
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
  institutionId?: number;
}

export interface CategoryOption extends MasterOption {
  patronType: string;
}

interface PatronsClientProps {
  initialPatrons: PatronListItem[];
  categories: CategoryOption[];
  institutions: MasterOption[];
  departments: MasterOption[];
  courses: MasterOption[];
  csrfToken: string;
  canManage: boolean;
}

export function PatronsClient({
  initialPatrons,
  categories,
  institutions,
  departments,
  courses,
  csrfToken,
  canManage,
}: PatronsClientProps) {
  const router = useRouter();

  // Categorical Navigation States
  const [selectedCollege, setSelectedCollege] = useState<string>("ALL");
  const [selectedCourse, setSelectedCourse] = useState<string>("ALL");
  const [selectedDept, setSelectedDept] = useState<string>("ALL");
  const [selectedYear, setSelectedYear] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [viewMode, setViewMode] = useState<"grouped" | "table">("grouped");

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
    institutionId: institutions[0]?.id ? String(institutions[0].id) : "1",
    firstName: "",
    middleName: "",
    lastName: "",
    rollNo: "",
    employeeId: "",
    departmentId: "",
    courseId: "",
    academicYear: "1",
    semester: "1",
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

  // Student count by College
  const collegeCounts = useMemo(() => {
    const counts: Record<string, number> = {
      ALL: initialPatrons.length,
      RBCET: 0,
      RBCP: 0,
      RBCN: 0,
      RBMI: 0,
      RBTTI: 0,
    };
    for (const p of initialPatrons) {
      const c = resolveCollege(p);
      if (counts[c.code] !== undefined) {
        counts[c.code]++;
      }
    }
    return counts;
  }, [initialPatrons]);

  // Available courses based on selected college
  const availableCourses = useMemo(() => {
    const set = new Set<string>();
    if (selectedCollege !== "ALL" && COLLEGE_CONFIGS[selectedCollege]) {
      for (const c of COLLEGE_CONFIGS[selectedCollege].defaultCourses) {
        set.add(c);
      }
    }
    for (const p of initialPatrons) {
      const col = resolveCollege(p);
      if (selectedCollege === "ALL" || col.code === selectedCollege) {
        set.add(resolveCourseCategory(p));
      }
    }
    return Array.from(set);
  }, [initialPatrons, selectedCollege]);

  // Available departments
  const availableDepts = useMemo(() => {
    const set = new Set<string>();
    for (const p of initialPatrons) {
      if (p.departmentName) set.add(p.departmentName);
    }
    return Array.from(set);
  }, [initialPatrons]);

  // Filtered patrons
  const filtered = useMemo(() => {
    return initialPatrons.filter((p) => {
      const col = resolveCollege(p);
      const crs = resolveCourseCategory(p);

      if (selectedCollege !== "ALL" && col.code !== selectedCollege) return false;
      if (selectedCourse !== "ALL" && crs !== selectedCourse) return false;
      if (selectedDept !== "ALL" && p.departmentName !== selectedDept) return false;
      if (selectedYear !== "ALL" && String(p.academicYear) !== selectedYear) return false;
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
        (p.mobile && p.mobile.includes(q)) ||
        (p.departmentName && p.departmentName.toLowerCase().includes(q)) ||
        col.code.toLowerCase().includes(q) ||
        crs.toLowerCase().includes(q)
      );
    });
  }, [
    initialPatrons,
    selectedCollege,
    selectedCourse,
    selectedDept,
    selectedYear,
    typeFilter,
    statusFilter,
    searchTerm,
  ]);

  // Grouped structure: College -> Program/Course -> Patrons
  const groupedData = useMemo(() => {
    const groups: Record<
      string,
      {
        college: CollegeInfo;
        courseGroups: Record<string, PatronListItem[]>;
        total: number;
      }
    > = {};

    const collegeOrder = ["RBCET", "RBCP", "RBCN", "RBMI", "RBTTI"];
    for (const cCode of collegeOrder) {
      if (selectedCollege === "ALL" || selectedCollege === cCode) {
        groups[cCode] = {
          college: COLLEGE_CONFIGS[cCode],
          courseGroups: {},
          total: 0,
        };
      }
    }

    for (const p of filtered) {
      const col = resolveCollege(p);
      const crs = resolveCourseCategory(p);

      if (!groups[col.code]) {
        groups[col.code] = {
          college: col,
          courseGroups: {},
          total: 0,
        };
      }

      if (!groups[col.code].courseGroups[crs]) {
        groups[col.code].courseGroups[crs] = [];
      }

      groups[col.code].courseGroups[crs].push(p);
      groups[col.code].total++;
    }

    return groups;
  }, [filtered, selectedCollege]);

  // Filter courses for registration modal based on selected institution
  const registerModalCourses = useMemo(() => {
    const instId = Number(newPatron.institutionId);
    return courses.filter((c) => !c.institutionId || c.institutionId === instId);
  }, [courses, newPatron.institutionId]);

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
          institutionId: Number(newPatron.institutionId),
          firstName: newPatron.firstName,
          middleName: newPatron.middleName || undefined,
          lastName: newPatron.lastName || undefined,
          rollNo: newPatron.rollNo || undefined,
          employeeId: newPatron.employeeId || undefined,
          departmentId: newPatron.departmentId ? Number(newPatron.departmentId) : undefined,
          courseId: newPatron.courseId ? Number(newPatron.courseId) : undefined,
          academicYear: newPatron.academicYear ? Number(newPatron.academicYear) : undefined,
          semester: newPatron.semester ? Number(newPatron.semester) : undefined,
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
          institutionId: institutions[0]?.id ? String(institutions[0].id) : "1",
          firstName: "",
          middleName: "",
          lastName: "",
          rollNo: "",
          employeeId: "",
          departmentId: "",
          courseId: "",
          academicYear: "1",
          semester: "1",
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

      {/* Institutional KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 text-xs">
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Total Members
          </span>
          <div className="mt-1 text-xl font-bold text-slate-900">{initialPatrons.length}</div>
          <div className="text-[10px] text-slate-400">All Campuses</div>
        </div>

        {Object.values(COLLEGE_CONFIGS).map((cfg) => {
          const count = collegeCounts[cfg.code] || 0;
          return (
            <div
              key={cfg.code}
              className={`rounded-xl border p-3.5 shadow-xs cursor-pointer transition ${
                selectedCollege === cfg.code
                  ? "border-blue-500 bg-blue-50/50 shadow-sm"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
              onClick={() => {
                setSelectedCollege(selectedCollege === cfg.code ? "ALL" : cfg.code);
                setSelectedCourse("ALL");
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  {cfg.code}
                </span>
                <span className="text-sm">{cfg.icon}</span>
              </div>
              <div className="mt-1 text-xl font-bold text-slate-900">{count}</div>
              <div className="text-[10px] text-slate-500 truncate">{cfg.defaultCourses.join(", ")}</div>
            </div>
          );
        })}
      </div>

      {/* College & Course Categorical Tabs Toolbar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3">
        {/* College Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <span className="font-bold text-slate-500 text-[11px] uppercase mr-1">College:</span>
          <button
            type="button"
            onClick={() => {
              setSelectedCollege("ALL");
              setSelectedCourse("ALL");
            }}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-semibold transition border ${
              selectedCollege === "ALL"
                ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            }`}
          >
            <span>🏛️</span>
            <span>All Colleges</span>
            <span
              className={`ml-1 rounded-full px-1.5 py-0.2 text-[10px] ${
                selectedCollege === "ALL" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-700"
              }`}
            >
              {collegeCounts.ALL}
            </span>
          </button>

          {Object.values(COLLEGE_CONFIGS).map((cfg) => {
            const isSelected = selectedCollege === cfg.code;
            const count = collegeCounts[cfg.code] || 0;
            return (
              <button
                key={cfg.code}
                type="button"
                onClick={() => {
                  setSelectedCollege(cfg.code);
                  setSelectedCourse("ALL");
                }}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-semibold transition border ${
                  isSelected
                    ? "bg-blue-900 text-white border-blue-900 shadow-xs"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                <span>{cfg.icon}</span>
                <span>{cfg.code}</span>
                <span
                  className={`ml-1 rounded-full px-1.5 py-0.2 text-[10px] ${
                    isSelected ? "bg-blue-800 text-white" : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Program / Course Sub-Pills */}
        {availableCourses.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-200">
            <span className="font-bold text-slate-500 text-[11px] uppercase mr-1">
              {selectedCollege === "ALL" ? "Program:" : `${selectedCollege} Programs:`}
            </span>
            <button
              type="button"
              onClick={() => setSelectedCourse("ALL")}
              className={`rounded-lg px-3 py-1 font-medium transition ${
                selectedCourse === "ALL"
                  ? "bg-white text-blue-900 border border-slate-300 shadow-xs font-bold"
                  : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
              }`}
            >
              All Programs
            </button>
            {availableCourses.map((crs) => {
              const isSelected = selectedCourse === crs;
              const count = initialPatrons.filter((p) => {
                const cMatch =
                  selectedCollege === "ALL" || resolveCollege(p).code === selectedCollege;
                return cMatch && resolveCourseCategory(p) === crs;
              }).length;

              return (
                <button
                  key={crs}
                  type="button"
                  onClick={() => setSelectedCourse(crs)}
                  className={`flex items-center gap-1 rounded-lg px-3 py-1 font-medium transition ${
                    isSelected
                      ? "bg-white text-blue-900 border border-slate-300 shadow-xs font-bold"
                      : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
                  }`}
                >
                  <span>{crs}</span>
                  <span className="text-[10px] text-slate-400 font-mono">({count})</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Search, Filter Dropdowns, and Action Bar */}
        <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between border-t border-slate-100 text-xs">
          <div className="flex flex-1 flex-wrap gap-2.5 items-center">
            <div className="w-full sm:w-64">
              <Input
                id="patron-search-filter"
                placeholder="Search name, roll no, card, branch..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="w-full sm:w-44">
              <Select
                id="patron-dept-filter"
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                options={[
                  { value: "ALL", label: "All Branches" },
                  ...availableDepts.map((d) => ({ value: d, label: d })),
                ]}
              />
            </div>
            <div className="w-full sm:w-36">
              <Select
                id="patron-year-filter"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                options={[
                  { value: "ALL", label: "All Years" },
                  { value: "1", label: "1st Year" },
                  { value: "2", label: "2nd Year" },
                  { value: "3", label: "3rd Year" },
                  { value: "4", label: "4th Year" },
                ]}
              />
            </div>
            <div className="w-full sm:w-32">
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
            <div className="w-full sm:w-32">
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

          <div className="flex items-center gap-2.5">
            {/* View Mode Toggle */}
            <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-medium">
              <button
                type="button"
                onClick={() => setViewMode("grouped")}
                className={`rounded-md px-2.5 py-1 transition ${
                  viewMode === "grouped"
                    ? "bg-white text-blue-900 shadow-xs font-semibold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Categorized
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`rounded-md px-2.5 py-1 transition ${
                  viewMode === "table"
                    ? "bg-white text-blue-900 shadow-xs font-semibold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Table View
              </button>
            </div>

            <span className="text-xs text-slate-500 whitespace-nowrap">
              {filtered.length} of {initialPatrons.length}
            </span>

            {canManage && (
              <Button variant="primary" size="sm" onClick={() => setShowRegisterModal(true)}>
                + Register Patron
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main Patron Roster Display */}
      {filtered.length === 0 ? (
        <EmptyState
          title="No Patrons Found"
          description={
            initialPatrons.length === 0
              ? "No student or faculty memberships registered yet. Click '+ Register Patron' or use Bulk Import."
              : "No patrons match the selected College, Program, Branch, or search filter."
          }
          icon="👥"
        />
      ) : viewMode === "grouped" ? (
        /* Categorized Grouped Tree View */
        <div className="space-y-5">
          {Object.entries(groupedData).map(([cCode, group]) => {
            if (group.total === 0 && selectedCollege === "ALL") return null;
            const college = group.college;
            const courseEntries = Object.entries(group.courseGroups);

            return (
              <div
                key={cCode}
                className={`rounded-xl border ${college.border} bg-white shadow-xs overflow-hidden`}
              >
                {/* College Banner Header */}
                <div
                  className={`flex flex-col sm:flex-row sm:items-center sm:justify-between px-5 py-3.5 ${college.bgLight} border-b border-slate-200`}
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white shadow-xs text-lg border border-slate-200">
                      {college.icon}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-900">
                          {college.code}
                        </span>
                        <h3 className="text-sm font-bold text-slate-900">{college.fullName}</h3>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Campus Library &bull; {courseEntries.length} program categories
                      </p>
                    </div>
                  </div>

                  <div className="mt-2 sm:mt-0 flex items-center gap-2">
                    <span className="inline-flex rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-slate-700 border border-slate-200 shadow-2xs">
                      {group.total} Registered Members
                    </span>
                  </div>
                </div>

                {/* Programs under this College */}
                {courseEntries.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    No active registrations in this college category.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {courseEntries.map(([courseName, patronsInCourse]) => (
                      <div key={courseName} className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-blue-900 font-bold text-xs">📘 {courseName}</span>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 font-mono">
                              {patronsInCourse.length} students
                            </span>
                          </div>
                        </div>

                        {/* Student Sub-Table */}
                        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                          <Table>
                            <TableHead>
                              <tr>
                                <TableHeaderCell>Card Number</TableHeaderCell>
                                <TableHeaderCell>Full Name</TableHeaderCell>
                                <TableHeaderCell>Type &amp; Category</TableHeaderCell>
                                <TableHeaderCell>Roll / Employee ID</TableHeaderCell>
                                <TableHeaderCell>Branch / Dept</TableHeaderCell>
                                <TableHeaderCell>Year / Sem</TableHeaderCell>
                                <TableHeaderCell>Status</TableHeaderCell>
                                <TableHeaderCell>Actions</TableHeaderCell>
                              </tr>
                            </TableHead>
                            <TableBody>
                              {patronsInCourse.map((patron) => {
                                const isActive = patron.status === "ACTIVE";
                                return (
                                  <TableRow key={patron.id} className="hover:bg-slate-50/80">
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
                                        <div className="text-[10px] text-slate-400 font-mono">
                                          {patron.email}
                                        </div>
                                      )}
                                    </TableCell>
                                    <TableCell>
                                      <div className="space-y-0.5">
                                        <span className="inline-flex rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-700">
                                          {patron.patronType}
                                        </span>
                                        <div className="text-[10px] text-slate-500">
                                          {patron.categoryName}
                                        </div>
                                      </div>
                                    </TableCell>
                                    <TableCell className="font-mono text-xs text-slate-700">
                                      {patron.rollNo || patron.employeeId || "—"}
                                    </TableCell>
                                    <TableCell className="text-xs text-slate-600">
                                      {patron.departmentName || "—"}
                                    </TableCell>
                                    <TableCell className="text-xs text-slate-600">
                                      {patron.academicYear
                                        ? `Yr ${patron.academicYear}`
                                        : "—"}
                                      {patron.semester ? ` (Sem ${patron.semester})` : ""}
                                    </TableCell>
                                    <TableCell>
                                      <span
                                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                                          isActive
                                            ? "bg-emerald-100 text-emerald-800"
                                            : "bg-red-100 text-red-800"
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
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* Unified Roster Table View */
        <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Card Number</TableHeaderCell>
                <TableHeaderCell>Full Name</TableHeaderCell>
                <TableHeaderCell>College</TableHeaderCell>
                <TableHeaderCell>Program &amp; Branch</TableHeaderCell>
                <TableHeaderCell>Roll / ID</TableHeaderCell>
                <TableHeaderCell>Year / Sem</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Actions</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {filtered.map((patron) => {
                const isActive = patron.status === "ACTIVE";
                const college = resolveCollege(patron);
                const course = resolveCourseCategory(patron);

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
                      <span
                        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold border ${college.badge}`}
                      >
                        <span>{college.icon}</span>
                        <span>{college.code}</span>
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="font-semibold text-slate-900 text-xs">{course}</div>
                      <div className="text-[10px] text-slate-500">
                        {patron.departmentName || "General"}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-700">
                      {patron.rollNo || patron.employeeId || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {patron.academicYear ? `Yr ${patron.academicYear}` : "—"}
                      {patron.semester ? ` (Sem ${patron.semester})` : ""}
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
                  <Select
                    id="new-patron-institution"
                    label="College / Institution"
                    value={newPatron.institutionId}
                    onChange={(e) => setNewPatron({ ...newPatron, institutionId: e.target.value })}
                    options={institutions.map((i) => ({
                      value: String(i.id),
                      label: `${i.name} (${i.code})`,
                    }))}
                    required
                  />
                </div>
                <div>
                  <Select
                    id="new-patron-course"
                    label="Academic Program / Course"
                    value={newPatron.courseId}
                    onChange={(e) => setNewPatron({ ...newPatron, courseId: e.target.value })}
                    options={[
                      { value: "", label: "Select Program / Course" },
                      ...registerModalCourses.map((c) => ({ value: String(c.id), label: c.name })),
                    ]}
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
                    label="Department / Branch"
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
                    id="new-patron-year"
                    label="Academic Year"
                    value={newPatron.academicYear}
                    onChange={(e) => setNewPatron({ ...newPatron, academicYear: e.target.value })}
                    options={[
                      { value: "1", label: "1st Year" },
                      { value: "2", label: "2nd Year" },
                      { value: "3", label: "3rd Year" },
                      { value: "4", label: "4th Year" },
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
                className={`rounded-lg border p-3 ${
                  profileDetail.stats.overdueLoans > 0
                    ? "border-amber-300 bg-amber-50"
                    : "border-slate-200 bg-slate-50/50"
                }`}
              >
                <span
                  className={
                    profileDetail.stats.overdueLoans > 0 ? "text-amber-800" : "text-slate-500"
                  }
                >
                  Overdue Items
                </span>
                <div
                  className={`mt-1 text-lg font-bold ${
                    profileDetail.stats.overdueLoans > 0 ? "text-amber-900" : "text-slate-900"
                  }`}
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
                  <span className="text-slate-500">Institution / College:</span>{" "}
                  <strong className="text-slate-800">
                    {resolveCollege(profileDetail.patron).fullName} (
                    {resolveCollege(profileDetail.patron).code})
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">Program / Course:</span>{" "}
                  <strong className="text-slate-800">
                    {resolveCourseCategory(profileDetail.patron)}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">Department / Branch:</span>{" "}
                  <strong className="text-slate-800">
                    {profileDetail.patron.departmentName || "N/A"}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">Academic Year:</span>{" "}
                  <strong className="text-slate-800">
                    {profileDetail.patron.academicYear
                      ? `Year ${profileDetail.patron.academicYear}`
                      : "N/A"}
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
                    {formatDate(profileDetail.patron.cardExpiry)}
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
