"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
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

export interface StudentRosterItem {
  id: number;
  cardNo: string;
  fullName: string;
  patronType: string;
  categoryId?: number;
  categoryName?: string;
  libraryId?: number | null;
  libraryCode?: string | null;
  libraryName?: string | null;
  institutionId?: number | null;
  institutionCode?: string | null;
  institutionName?: string | null;
  courseId?: number | null;
  courseCode?: string | null;
  courseName?: string | null;
  departmentId?: number | null;
  departmentCode?: string | null;
  departmentName?: string | null;
  academicYear?: number | null;
  semester?: number | null;
  section?: string | null;
  email?: string | null;
  mobile?: string | null;
  employeeId?: string | null;
  cardExpiry?: string;
  status: string;
}

export interface CollegeInfo {
  code: string;
  shortName: string;
  fullName: string;
  badge: string;
  border: string;
  bgLight: string;
  icon: string;
  defaultCourses: string[];
}

export const COLLEGE_CONFIGS: Record<string, CollegeInfo> = {
  RBCET: {
    code: "RBCET",
    shortName: "RBCET",
    fullName: "RBMI College of Engineering and Technology",
    badge: "bg-blue-100 text-blue-900 border-blue-200",
    border: "border-blue-400",
    bgLight: "bg-blue-50/60",
    icon: "⚙️",
    defaultCourses: ["B.Tech", "Diploma / Polytechnic"],
  },
  RBCP: {
    code: "RBCP",
    shortName: "RBCP",
    fullName: "RBMI College of Pharmacy",
    badge: "bg-emerald-100 text-emerald-900 border-emerald-200",
    border: "border-emerald-400",
    bgLight: "bg-emerald-50/60",
    icon: "💊",
    defaultCourses: ["B.Pharm", "D.Pharm"],
  },
  RBCN: {
    code: "RBCN",
    shortName: "RBCN",
    fullName: "RBMI College of Nursing",
    badge: "bg-rose-100 text-rose-900 border-rose-200",
    border: "border-rose-400",
    bgLight: "bg-rose-50/60",
    icon: "🏥",
    defaultCourses: ["B.Sc Nursing"],
  },
  RBMI: {
    code: "RBMI",
    shortName: "RBMI",
    fullName: "RBMI Business School",
    badge: "bg-amber-100 text-amber-900 border-amber-200",
    border: "border-amber-400",
    bgLight: "bg-amber-50/60",
    icon: "📈",
    defaultCourses: ["MBA", "BBA", "MCA", "BCA", "B.Sc", "B.Com"],
  },
  RBTTI: {
    code: "RBTTI",
    shortName: "RBTTI",
    fullName: "Rakshpal Bahadur Teachers Training Institute",
    badge: "bg-purple-100 text-purple-900 border-purple-200",
    border: "border-purple-400",
    bgLight: "bg-purple-50/60",
    icon: "🎓",
    defaultCourses: ["B.Ed"],
  },
};

export function resolveCollege(patron: {
  institutionCode?: string | null;
  institutionName?: string | null;
  institutionId?: number | null;
  courseCode?: string | null;
  courseName?: string | null;
  departmentCode?: string | null;
  departmentName?: string | null;
}): CollegeInfo {
  const code = (patron.institutionCode || "").toUpperCase().trim();
  const name = (patron.institutionName || "").toUpperCase().trim();

  // 1. Direct configuration match by institution code
  if (code && COLLEGE_CONFIGS[code]) {
    return COLLEGE_CONFIGS[code];
  }

  // 2. Name-based match for RBMI Group colleges
  if (code.includes("RBCET") || name.includes("ENGINEERING")) {
    return COLLEGE_CONFIGS.RBCET;
  }
  if (code.includes("RBCP") || name.includes("PHARMACY")) {
    return COLLEGE_CONFIGS.RBCP;
  }
  if (code.includes("RBCN") || name.includes("NURSING")) {
    return COLLEGE_CONFIGS.RBCN;
  }
  if (code.includes("RBTTI") || name.includes("TEACHER")) {
    return COLLEGE_CONFIGS.RBTTI;
  }
  if (code.includes("RBMI") || name.includes("BUSINESS") || name.includes("MANAGEMENT")) {
    return COLLEGE_CONFIGS.RBMI;
  }

  // 3. Fallback inference based on course and department
  const crsCode = (patron.courseCode || "").toUpperCase();
  const crsName = (patron.courseName || "").toUpperCase();
  const deptCode = (patron.departmentCode || "").toUpperCase();
  const deptName = (patron.departmentName || "").toUpperCase();
  const combined = `${crsCode} ${crsName} ${deptCode} ${deptName}`;

  if (combined.includes("BED") || combined.includes("EDUCATION")) {
    return COLLEGE_CONFIGS.RBTTI;
  }
  if (
    combined.includes("MBA") ||
    combined.includes("BBA") ||
    combined.includes("MCA") ||
    combined.includes("BCA") ||
    combined.includes("BCOM") ||
    combined.includes("B.COM") ||
    (combined.includes("BSC") && !combined.includes("NURS")) ||
    (combined.includes("B.SC") && !combined.includes("NURS"))
  ) {
    return COLLEGE_CONFIGS.RBMI;
  }
  if (combined.includes("PHARM") || combined.includes("BPHARM") || combined.includes("DPHARM")) {
    return COLLEGE_CONFIGS.RBCP;
  }
  if (combined.includes("NURS")) {
    return COLLEGE_CONFIGS.RBCN;
  }
  if (
    combined.includes("BTECH") ||
    combined.includes("DIPLOMA") ||
    combined.includes("POLYTECHNIC") ||
    combined.includes("CSE") ||
    combined.includes("MECH") ||
    combined.includes("CIVIL")
  ) {
    return COLLEGE_CONFIGS.RBCET;
  }

  // 4. Dynamic fallback from database fields
  return {
    code: patron.institutionCode || "CAMPUS",
    shortName: patron.institutionCode || patron.institutionName || "Campus",
    fullName: patron.institutionName || patron.institutionCode || "Institutional Campus",
    badge: "bg-indigo-100 text-indigo-900 border-indigo-200",
    border: "border-indigo-400",
    bgLight: "bg-indigo-50/60",
    icon: "🏛️",
    defaultCourses: patron.courseName ? [patron.courseName] : [],
  };
}

export function resolveCourseCategory(patron: {
  courseCode?: string | null;
  courseName?: string | null;
  departmentCode?: string | null;
  departmentName?: string | null;
}): string {
  const code = (patron.courseCode || "").toUpperCase();
  const name = (patron.courseName || "").toUpperCase();
  const deptCode = (patron.departmentCode || "").toUpperCase();
  const deptName = (patron.departmentName || "").toUpperCase();
  const combined = `${code} ${name} ${deptCode} ${deptName}`.toUpperCase();

  // D.Pharm (Diploma in Pharmacy - RBCP)
  if (
    code.includes("DPHARM") ||
    name.includes("D.PHARM") ||
    name.includes("DIPLOMA IN PHARMACY") ||
    deptCode.includes("DPHARM") ||
    deptName.includes("D.PHARM")
  ) {
    return "D.Pharm";
  }

  // B.Pharm (Bachelor of Pharmacy - RBCP)
  if (
    code.includes("BPHARM") ||
    name.includes("B.PHARM") ||
    name.includes("BACHELOR OF PHARMACY") ||
    deptCode.includes("BPHARM") ||
    deptName.includes("B.PHARM")
  ) {
    return "B.Pharm";
  }

  // Diploma / Polytechnic (Engineering - RBCET)
  if (
    code.includes("DIPLOMA") ||
    code.includes("POLY") ||
    name.includes("DIPLOMA") ||
    name.includes("POLY") ||
    deptCode.includes("DIPLOMA") ||
    deptCode.includes("POLY") ||
    deptName.includes("DIPLOMA") ||
    deptName.includes("POLY")
  ) {
    return "Diploma / Polytechnic";
  }

  // B.Tech
  if (
    code.includes("BTECH") ||
    name.includes("B.TECH") ||
    name.includes("BACHELOR OF TECHNOLOGY") ||
    deptCode.includes("BTECH") ||
    deptName.includes("B.TECH")
  ) {
    return "B.Tech";
  }

  // GNM
  if (code.includes("GNM") || name.includes("GNM") || name.includes("GENERAL NURSING")) {
    return "GNM";
  }

  // B.Sc Nursing
  if (
    combined.includes("BSC NURS") ||
    combined.includes("B.SC NURS") ||
    combined.includes("BSC-NURS") ||
    combined.includes("BSCNURS") ||
    combined.includes("NURSING")
  ) {
    return "B.Sc Nursing";
  }

  // B.Ed
  if (
    code.includes("BED") ||
    name.includes("B.ED") ||
    name.includes("BACHELOR OF EDUCATION") ||
    name.includes("EDUCATION") ||
    deptCode.includes("BED") ||
    deptName.includes("B.ED")
  ) {
    return "B.Ed";
  }

  // MCA
  if (
    code.includes("MCA") ||
    name.includes("MCA") ||
    name.includes("MASTER OF COMPUTER") ||
    deptCode.includes("MCA")
  ) {
    return "MCA";
  }

  // BCA
  if (
    code.includes("BCA") ||
    name.includes("BCA") ||
    name.includes("BACHELOR OF COMPUTER") ||
    deptCode.includes("BCA")
  ) {
    return "BCA";
  }

  // MBA
  if (
    code.includes("MBA") ||
    name.includes("MBA") ||
    name.includes("MASTER OF BUSINESS") ||
    deptCode.includes("MBA")
  ) {
    return "MBA";
  }

  // BBA
  if (
    code.includes("BBA") ||
    name.includes("BBA") ||
    name.includes("BACHELOR OF BUSINESS") ||
    deptCode.includes("BBA")
  ) {
    return "BBA";
  }

  // B.Sc (General Science)
  if (
    code === "BSC" ||
    code.startsWith("BSC-") ||
    name.includes("B.SC") ||
    name.includes("BACHELOR OF SCIENCE") ||
    name === "BSC" ||
    deptCode === "BSC"
  ) {
    return "B.Sc";
  }

  // B.Com
  if (
    code.includes("BCOM") ||
    code.includes("B.COM") ||
    name.includes("B.COM") ||
    name.includes("BACHELOR OF COMMERCE") ||
    name === "BCOM" ||
    deptCode.includes("BCOM")
  ) {
    return "B.Com";
  }

  return patron.courseName || patron.departmentName || "General Studies";
}

interface InstitutionalStudentRosterProps {
  students: StudentRosterItem[];
  title?: string;
  description?: string;
  showFilters?: boolean;
  compact?: boolean;
  onSelectStudent?: (studentId: number) => void;
  canDelete?: boolean;
  csrfToken?: string;
  onStudentDeleted?: () => void;
}

export function InstitutionalStudentRoster({
  students,
  title = "Institutional Student Roster",
  description = "Categorical directory of students classified by College, Academic Program, and Department",
  showFilters = true,
  compact = false,
  onSelectStudent,
  canDelete = false,
  csrfToken,
  onStudentDeleted,
}: InstitutionalStudentRosterProps) {
  const [selectedCollege, setSelectedCollege] = useState<string>("ALL");
  const [selectedCourse, setSelectedCourse] = useState<string>("ALL");
  const [selectedYear, setSelectedYear] = useState<string>("ALL");
  const [selectedDept, setSelectedDept] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [viewMode, setViewMode] = useState<"grouped" | "table">("grouped");
  const [selectedProfile, setSelectedProfile] = useState<StudentRosterItem | null>(null);

  // Delete modal state
  const [deleteStudentModal, setDeleteStudentModal] = useState<{
    open: boolean;
    student: StudentRosterItem;
    force: boolean;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleConfirmDeleteStudent = async () => {
    if (!deleteStudentModal || !csrfToken) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const url = `/api/patrons/${deleteStudentModal.student.id}${deleteStudentModal.force ? "?force=true" : ""}`;
      const res = await fetch(url, {
        method: "DELETE",
        headers: {
          "x-csrf-token": csrfToken,
        },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to delete student");
      }
      setDeleteStudentModal(null);
      setSelectedProfile(null);
      if (onStudentDeleted) {
        onStudentDeleted();
      } else {
        window.location.reload();
      }
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete student");
    } finally {
      setIsDeleting(false);
    }
  };

  // Filter only students (if roster contains faculty as well, keep students primary)
  const studentList = useMemo(() => {
    return students.filter((s) => s.patronType === "STUDENT" || !s.patronType);
  }, [students]);

  // College Counts
  const collegeCounts = useMemo(() => {
    const counts: Record<string, number> = {
      ALL: studentList.length,
      RBCET: 0,
      RBCP: 0,
      RBCN: 0,
      RBMI: 0,
      RBTTI: 0,
    };
    for (const s of studentList) {
      const c = resolveCollege(s);
      if (counts[c.code] !== undefined) {
        counts[c.code]++;
      }
    }
    return counts;
  }, [studentList]);

  // Available Courses for currently selected college
  const availableCourses = useMemo(() => {
    const set = new Set<string>();
    if (selectedCollege === "ALL") {
      for (const cfg of Object.values(COLLEGE_CONFIGS)) {
        for (const c of cfg.defaultCourses) {
          set.add(c);
        }
      }
    } else if (COLLEGE_CONFIGS[selectedCollege]) {
      for (const c of COLLEGE_CONFIGS[selectedCollege].defaultCourses) {
        set.add(c);
      }
    }
    for (const s of studentList) {
      if (selectedCollege === "ALL" || resolveCollege(s).code === selectedCollege) {
        set.add(resolveCourseCategory(s));
      }
    }
    return Array.from(set);
  }, [studentList, selectedCollege]);

  // Available Departments dynamically filtered by selected college
  const availableDepts = useMemo(() => {
    const set = new Set<string>();
    if (selectedCollege === "ALL") {
      for (const cfg of Object.values(COLLEGE_CONFIGS)) {
        for (const c of cfg.defaultCourses) {
          set.add(c);
        }
      }
      for (const s of studentList) {
        if (s.departmentName) set.add(s.departmentName);
        if (s.courseName) set.add(s.courseName);
      }
    } else {
      if (COLLEGE_CONFIGS[selectedCollege]) {
        for (const c of COLLEGE_CONFIGS[selectedCollege].defaultCourses) {
          set.add(c);
        }
      }
      for (const s of studentList) {
        if (resolveCollege(s).code === selectedCollege) {
          if (s.departmentName) set.add(s.departmentName);
          if (s.courseName) set.add(s.courseName);
        }
      }
    }
    return Array.from(set);
  }, [studentList, selectedCollege]);

  // Filtered Students
  const filteredStudents = useMemo(() => {
    return studentList.filter((s) => {
      const college = resolveCollege(s);
      const course = resolveCourseCategory(s);

      if (selectedCollege !== "ALL" && college.code !== selectedCollege) return false;
      if (selectedCourse !== "ALL" && course !== selectedCourse) return false;
      if (selectedYear !== "ALL" && String(s.academicYear) !== selectedYear) return false;
      if (selectedDept !== "ALL") {
        const matchesDept =
          s.departmentName === selectedDept ||
          s.departmentCode === selectedDept ||
          course === selectedDept ||
          s.courseName === selectedDept ||
          s.courseCode === selectedDept;
        if (!matchesDept) return false;
      }

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matches =
          s.fullName.toLowerCase().includes(q) ||
          s.cardNo.toLowerCase().includes(q) ||
          (s.departmentName && s.departmentName.toLowerCase().includes(q)) ||
          (s.email && s.email.toLowerCase().includes(q)) ||
          course.toLowerCase().includes(q) ||
          college.code.toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [studentList, selectedCollege, selectedCourse, selectedYear, selectedDept, searchTerm]);

  // Grouped structure: College -> Course -> Students
  const groupedData = useMemo(() => {
    const groups: Record<
      string,
      {
        college: CollegeInfo;
        courseGroups: Record<string, StudentRosterItem[]>;
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

    for (const s of filteredStudents) {
      const col = resolveCollege(s);
      const crs = resolveCourseCategory(s);

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

      groups[col.code].courseGroups[crs].push(s);
      groups[col.code].total++;
    }

    return groups;
  }, [filteredStudents, selectedCollege]);

  const handleRowClick = (student: StudentRosterItem) => {
    if (onSelectStudent) {
      onSelectStudent(student.id);
    } else {
      setSelectedProfile(student);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header and KPI Badges */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <span>🎓</span> {title}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 border border-blue-200">
            {filteredStudents.length} of {studentList.length} Students Active
          </span>
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
              Categorized Tree
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
              Roster Table
            </button>
          </div>
        </div>
      </div>

      {/* College Selection Pills */}
      <div className="space-y-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <span className="font-semibold text-slate-500 text-[11px] uppercase mr-1">College:</span>
          <button
            type="button"
            onClick={() => {
              setSelectedCollege("ALL");
              setSelectedCourse("ALL");
              setSelectedDept("ALL");
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
                selectedCollege === "ALL"
                  ? "bg-slate-800 text-white"
                  : "bg-slate-100 text-slate-700"
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
                  setSelectedDept("ALL");
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

        {/* Course / Program Sub-Pills */}
        {availableCourses.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-200">
            <span className="font-semibold text-slate-500 text-[11px] uppercase mr-1">
              {selectedCollege === "ALL" ? "Course:" : `${selectedCollege} Programs:`}
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
              const count = studentList.filter((s) => {
                const cMatch =
                  selectedCollege === "ALL" || resolveCollege(s).code === selectedCollege;
                return cMatch && resolveCourseCategory(s) === crs;
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
      </div>

      {/* Search and Secondary Filter Controls */}
      {showFilters && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4 bg-white p-3.5 rounded-xl border border-slate-200 text-xs">
          <div className="sm:col-span-2">
            <Input
              id="student-roster-search"
              placeholder="Search student name, Card No, Branch..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div>
            <Select
              id="student-dept-filter"
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              options={[
                { value: "ALL", label: "All Branches / Depts" },
                ...availableDepts.map((d) => ({ value: d, label: d })),
              ]}
            />
          </div>
          <div>
            <Select
              id="student-year-filter"
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              options={[
                { value: "ALL", label: "All Academic Years" },
                { value: "1", label: "1st Year (Sem 1-2)" },
                { value: "2", label: "2nd Year (Sem 3-4)" },
                { value: "3", label: "3rd Year (Sem 5-6)" },
                { value: "4", label: "4th Year (Sem 7-8)" },
              ]}
            />
          </div>
        </div>
      )}

      {/* Main Student Views */}
      {filteredStudents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-10 text-center">
          <div className="text-3xl mb-2">🔍</div>
          <h3 className="text-sm font-bold text-slate-800">No Students Found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            No student records match the selected college, course, branch, or search criteria.
          </p>
        </div>
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
                      {group.total} Registered Students
                    </span>
                  </div>
                </div>

                {/* Programs under this College */}
                {courseEntries.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    No active student registrations in this college category.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {courseEntries.map(([courseName, studentListInCourse]) => (
                      <div key={courseName} className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-blue-900 font-bold text-xs">📘 {courseName}</span>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 font-mono">
                              {studentListInCourse.length} students
                            </span>
                          </div>
                        </div>

                        {/* Student Sub-Table */}
                        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                          <Table>
                            <TableHead>
                              <tr>
                                <TableHeaderCell>Library Card</TableHeaderCell>
                                <TableHeaderCell>Student Name</TableHeaderCell>
                                <TableHeaderCell>Branch / Department</TableHeaderCell>
                                <TableHeaderCell>Year / Sem</TableHeaderCell>
                                <TableHeaderCell>Status</TableHeaderCell>
                                <TableHeaderCell>Action</TableHeaderCell>
                              </tr>
                            </TableHead>
                            <TableBody>
                              {studentListInCourse.map((student) => (
                                <TableRow
                                  key={student.id}
                                  className="hover:bg-slate-50/80 cursor-pointer transition"
                                  onClick={() => handleRowClick(student)}
                                >
                                  <TableCell className="font-mono text-xs font-bold text-blue-900">
                                    {student.cardNo}
                                  </TableCell>
                                  <TableCell>
                                    <div className="font-semibold text-slate-900">
                                      {student.fullName}
                                    </div>
                                    {student.email && (
                                      <div className="text-[10px] text-slate-400 font-mono">
                                        {student.email}
                                      </div>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-xs text-slate-700">
                                    {student.departmentName || "—"}
                                  </TableCell>
                                  <TableCell className="text-xs text-slate-600">
                                    {student.academicYear ? `Yr ${student.academicYear}` : "—"}
                                    {student.semester ? ` (Sem ${student.semester})` : ""}
                                  </TableCell>
                                  <TableCell>
                                    <span
                                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                                        student.status === "ACTIVE"
                                          ? "bg-emerald-100 text-emerald-800"
                                          : "bg-red-100 text-red-800"
                                      }`}
                                    >
                                      {student.status}
                                    </span>
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-1.5">
                                      <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleRowClick(student);
                                        }}
                                      >
                                        Profile
                                      </Button>
                                      {canDelete && csrfToken && (
                                        <Button
                                          variant="danger"
                                          size="sm"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setDeleteStudentModal({ open: true, student, force: false });
                                          }}
                                          title="Delete this student record"
                                        >
                                          Delete
                                        </Button>
                                      )}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
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
                <TableHeaderCell>College</TableHeaderCell>
                <TableHeaderCell>Program &amp; Branch</TableHeaderCell>
                <TableHeaderCell>Library Card</TableHeaderCell>
                <TableHeaderCell>Student Name</TableHeaderCell>
                <TableHeaderCell>Year / Sem</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Action</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {filteredStudents.map((student) => {
                const college = resolveCollege(student);
                const course = resolveCourseCategory(student);

                return (
                  <TableRow
                    key={student.id}
                    className="hover:bg-slate-50/80 cursor-pointer transition"
                    onClick={() => handleRowClick(student)}
                  >
                    <TableCell>
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold border ${college.badge}`}
                      >
                        <span>{college.icon}</span>
                        <span>{college.code}</span>
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="font-semibold text-slate-900 text-xs">{course}</div>
                      <div className="text-[10px] text-slate-500">
                        {student.departmentName || "General"}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs font-bold text-blue-900">
                      {student.cardNo}
                    </TableCell>
                    <TableCell>
                      <div className="font-semibold text-slate-900">{student.fullName}</div>
                      {student.email && (
                        <div className="text-[10px] text-slate-400 font-mono">{student.email}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {student.academicYear ? `Yr ${student.academicYear}` : "—"}
                      {student.semester ? ` (Sem ${student.semester})` : ""}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          student.status === "ACTIVE"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {student.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRowClick(student);
                          }}
                        >
                          Profile
                        </Button>
                        {canDelete && csrfToken && (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteStudentModal({ open: true, student, force: false });
                            }}
                            title="Delete this student record"
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Student Profile Quick View Modal */}
      {selectedProfile && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-900 text-white font-bold text-base">
                  {selectedProfile.fullName.charAt(0)}
                </span>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">{selectedProfile.fullName}</h3>
                  <div className="text-xs text-slate-500 font-mono">
                    Card: {selectedProfile.cardNo}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProfile(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 space-y-2 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-slate-500">Institution / College:</span>
                  <div className="font-bold text-slate-800 mt-0.5">
                    {resolveCollege(selectedProfile).fullName} (
                    {resolveCollege(selectedProfile).code})
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Academic Program:</span>
                  <div className="font-bold text-slate-800 mt-0.5">
                    {resolveCourseCategory(selectedProfile)}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Branch / Department:</span>
                  <div className="font-bold text-slate-800 mt-0.5">
                    {selectedProfile.departmentName || "N/A"}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Year / Semester:</span>
                  <div className="font-bold text-slate-800 mt-0.5">
                    {selectedProfile.academicYear ? `Year ${selectedProfile.academicYear}` : "N/A"}
                    {selectedProfile.semester ? ` (Sem ${selectedProfile.semester})` : ""}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Email:</span>
                  <div className="text-slate-800 mt-0.5">{selectedProfile.email || "N/A"}</div>
                </div>
                <div>
                  <span className="text-slate-500">Mobile:</span>
                  <div className="text-slate-800 mt-0.5">{selectedProfile.mobile || "N/A"}</div>
                </div>
                <div>
                  <span className="text-slate-500">Assigned Library:</span>
                  <div className="font-bold text-blue-900 mt-0.5">
                    {selectedProfile.libraryName || "Central Library"}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <div>
                {canDelete && csrfToken && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      const target = selectedProfile;
                      setSelectedProfile(null);
                      setDeleteStudentModal({ open: true, student: target, force: false });
                    }}
                  >
                    Delete Student Record
                  </Button>
                )}
              </div>
              <Button variant="outline" onClick={() => setSelectedProfile(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Student Confirmation Modal */}
      {deleteStudentModal && deleteStudentModal.open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-student-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 text-lg font-bold">
                ⚠️
              </span>
              <div>
                <h3 id="delete-student-modal-title" className="text-base font-bold text-slate-900">
                  Delete Student Record
                </h3>
                <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                  Are you sure you want to permanently delete student{" "}
                  <strong className="text-slate-900">{deleteStudentModal.student.fullName}</strong>{" "}
                  (Card:{" "}
                  <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">{deleteStudentModal.student.cardNo}</code>)?
                </p>
              </div>
            </div>

            {deleteError && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-2.5 text-xs text-red-700">
                {deleteError}
              </div>
            )}

            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 space-y-1.5">
              <p className="font-semibold text-amber-900">Irreversible Action</p>
              <p>This removes the student profile and credentials from the library database.</p>
              <label className="flex items-center gap-2 pt-1 font-medium text-amber-950 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteStudentModal.force}
                  onChange={(e) =>
                    setDeleteStudentModal({
                      ...deleteStudentModal,
                      force: e.target.checked,
                    })
                  }
                  className="rounded border-amber-400 text-red-600 focus:ring-red-500"
                />
                Force delete if test data (releases any borrowed items back to library)
              </label>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <Button
                variant="outline"
                onClick={() => setDeleteStudentModal(null)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleConfirmDeleteStudent}
                isLoading={isDeleting}
              >
                Yes, Delete Student
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
