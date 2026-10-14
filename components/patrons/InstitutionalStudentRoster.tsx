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
  email?: string | null;
  mobile?: string | null;
  rollNo?: string | null;
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
    fullName: "RBMI College of Engineering & Technology",
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
    defaultCourses: ["B.Sc Nursing", "GNM"],
  },
  RBMI: {
    code: "RBMI",
    shortName: "RBMI (Mgmt)",
    fullName: "RBMI College of Management",
    badge: "bg-amber-100 text-amber-900 border-amber-200",
    border: "border-amber-400",
    bgLight: "bg-amber-50/60",
    icon: "📈",
    defaultCourses: ["MBA", "BBA"],
  },
  RBTTI: {
    code: "RBTTI",
    shortName: "RBTTI / Tech",
    fullName: "RBMI Institute of Technology & Management",
    badge: "bg-purple-100 text-purple-900 border-purple-200",
    border: "border-purple-400",
    bgLight: "bg-purple-50/60",
    icon: "💻",
    defaultCourses: ["BCA", "MCA", "B.Ed"],
  },
};

export function resolveCollege(patron: {
  institutionCode?: string | null;
  institutionName?: string | null;
  institutionId?: number | null;
}): CollegeInfo {
  const code = (patron.institutionCode || "").toUpperCase();
  const name = (patron.institutionName || "").toUpperCase();
  const id = patron.institutionId;

  if (code.includes("ENG") || code.includes("RBCET") || name.includes("ENGINEERING") || id === 1) {
    return COLLEGE_CONFIGS.RBCET;
  }
  if (code.includes("PHARM") || code.includes("RBCP") || name.includes("PHARMACY") || id === 3) {
    return COLLEGE_CONFIGS.RBCP;
  }
  if (code.includes("NURS") || code.includes("RBCN") || name.includes("NURSING") || id === 4) {
    return COLLEGE_CONFIGS.RBCN;
  }
  if (code.includes("MGMT") || code.includes("RBMI") || name.includes("MANAGEMENT") || id === 2) {
    return COLLEGE_CONFIGS.RBMI;
  }
  if (code.includes("TECH") || code.includes("RBTTI") || name.includes("TECHNOLOGY") || id === 5) {
    return COLLEGE_CONFIGS.RBTTI;
  }
  return {
    code: "OTHER",
    shortName: patron.institutionCode || "Campus",
    fullName: patron.institutionName || "Other Institutional Campus",
    badge: "bg-slate-100 text-slate-800 border-slate-200",
    border: "border-slate-300",
    bgLight: "bg-slate-50",
    icon: "🏛️",
    defaultCourses: [],
  };
}

export function resolveCourseCategory(patron: {
  courseCode?: string | null;
  courseName?: string | null;
}): string {
  const code = (patron.courseCode || "").toUpperCase();
  const name = (patron.courseName || "").toUpperCase();

  if (
    code.includes("DIPLOMA") ||
    code.includes("POLY") ||
    name.includes("DIPLOMA") ||
    name.includes("POLYTECHNIC")
  ) {
    return "Diploma / Polytechnic";
  }
  if (
    code.includes("BTECH") ||
    name.includes("B.TECH") ||
    name.includes("BACHELOR OF TECHNOLOGY")
  ) {
    return "B.Tech";
  }
  if (
    code.includes("DPHARM") ||
    name.includes("D.PHARM") ||
    name.includes("DIPLOMA IN PHARMACY")
  ) {
    return "D.Pharm";
  }
  if (
    code.includes("BPHARM") ||
    name.includes("B.PHARM") ||
    name.includes("BACHELOR OF PHARMACY")
  ) {
    return "B.Pharm";
  }
  if (code.includes("GNM") || name.includes("GNM") || name.includes("GENERAL NURSING")) {
    return "GNM";
  }
  if (code.includes("NURS") || name.includes("NURSING") || code.includes("BSC-NURS")) {
    return "B.Sc Nursing";
  }
  if (code.includes("MBA") || name.includes("MBA") || name.includes("MASTER OF BUSINESS")) {
    return "MBA";
  }
  if (code.includes("BBA") || name.includes("BBA") || name.includes("BACHELOR OF BUSINESS")) {
    return "BBA";
  }
  if (code.includes("MCA") || name.includes("MCA") || name.includes("MASTER OF COMPUTER")) {
    return "MCA";
  }
  if (code.includes("BCA") || name.includes("BCA") || name.includes("BACHELOR OF COMPUTER")) {
    return "BCA";
  }
  if (code.includes("BED") || name.includes("B.ED") || name.includes("EDUCATION")) {
    return "B.Ed";
  }
  return patron.courseName || "General Studies";
}

interface InstitutionalStudentRosterProps {
  students: StudentRosterItem[];
  title?: string;
  description?: string;
  showFilters?: boolean;
  compact?: boolean;
  onSelectStudent?: (studentId: number) => void;
}

export function InstitutionalStudentRoster({
  students,
  title = "Institutional Student Roster",
  description = "Categorical directory of students classified by College, Academic Program, and Department",
  showFilters = true,
  compact = false,
  onSelectStudent,
}: InstitutionalStudentRosterProps) {
  const [selectedCollege, setSelectedCollege] = useState<string>("ALL");
  const [selectedCourse, setSelectedCourse] = useState<string>("ALL");
  const [selectedYear, setSelectedYear] = useState<string>("ALL");
  const [selectedDept, setSelectedDept] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [viewMode, setViewMode] = useState<"grouped" | "table">("grouped");
  const [selectedProfile, setSelectedProfile] = useState<StudentRosterItem | null>(null);

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
    if (selectedCollege === "ALL") {
      const set = new Set<string>();
      for (const s of studentList) {
        set.add(resolveCourseCategory(s));
      }
      return Array.from(set);
    }
    const set = new Set<string>();
    // Pre-populate standard programs
    if (COLLEGE_CONFIGS[selectedCollege]) {
      for (const c of COLLEGE_CONFIGS[selectedCollege].defaultCourses) {
        set.add(c);
      }
    }
    for (const s of studentList) {
      if (resolveCollege(s).code === selectedCollege) {
        set.add(resolveCourseCategory(s));
      }
    }
    return Array.from(set);
  }, [studentList, selectedCollege]);

  // Available Departments
  const availableDepts = useMemo(() => {
    const set = new Set<string>();
    for (const s of studentList) {
      if (s.departmentName) set.add(s.departmentName);
    }
    return Array.from(set);
  }, [studentList]);

  // Filtered Students
  const filteredStudents = useMemo(() => {
    return studentList.filter((s) => {
      const college = resolveCollege(s);
      const course = resolveCourseCategory(s);

      if (selectedCollege !== "ALL" && college.code !== selectedCollege) return false;
      if (selectedCourse !== "ALL" && course !== selectedCourse) return false;
      if (selectedYear !== "ALL" && String(s.academicYear) !== selectedYear) return false;
      if (selectedDept !== "ALL" && s.departmentName !== selectedDept) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matches =
          s.fullName.toLowerCase().includes(q) ||
          (s.rollNo && s.rollNo.toLowerCase().includes(q)) ||
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
                const cMatch = selectedCollege === "ALL" || resolveCollege(s).code === selectedCollege;
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
              placeholder="Search student name, Roll No, Card No, Branch..."
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
                                <TableHeaderCell>Roll No</TableHeaderCell>
                                <TableHeaderCell>Student Name</TableHeaderCell>
                                <TableHeaderCell>Branch / Department</TableHeaderCell>
                                <TableHeaderCell>Year / Sem</TableHeaderCell>
                                <TableHeaderCell>Library Card</TableHeaderCell>
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
                                  <TableCell className="font-mono text-xs font-bold text-slate-900">
                                    {student.rollNo || "—"}
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
                                    {student.academicYear
                                      ? `Yr ${student.academicYear}`
                                      : "—"}
                                    {student.semester ? ` (Sem ${student.semester})` : ""}
                                  </TableCell>
                                  <TableCell className="font-mono text-xs text-slate-600">
                                    {student.cardNo}
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
                <TableHeaderCell>Roll No</TableHeaderCell>
                <TableHeaderCell>Student Name</TableHeaderCell>
                <TableHeaderCell>Year / Sem</TableHeaderCell>
                <TableHeaderCell>Library Card</TableHeaderCell>
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
                    <TableCell className="font-mono text-xs font-bold text-slate-900">
                      {student.rollNo || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="font-semibold text-slate-900">{student.fullName}</div>
                      {student.email && (
                        <div className="text-[10px] text-slate-400 font-mono">
                          {student.email}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {student.academicYear ? `Yr ${student.academicYear}` : "—"}
                      {student.semester ? ` (Sem ${student.semester})` : ""}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-slate-600">
                      {student.cardNo}
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
                    Roll: {selectedProfile.rollNo || "N/A"} &bull; Card: {selectedProfile.cardNo}
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
                    {selectedProfile.academicYear
                      ? `Year ${selectedProfile.academicYear}`
                      : "N/A"}
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
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => setSelectedProfile(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
