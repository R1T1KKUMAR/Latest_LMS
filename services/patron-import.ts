import { eq, sql } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import * as schema from "@/db/schema";
import {
  cleanPhoneNumber,
  decodeCsvBuffer,
  getFieldValue,
  parseCsvDate,
  parseCsvText,
  splitFullName,
} from "@/imports/csv-parser";
import { DB_TEXT_LIMITS, truncate, truncateWithDefault } from "@/imports/truncate";
import { hashPassword } from "@/lib/crypto";
import { calculateCardExpiry } from "@/lib/numbering";
import { recordAuditLog } from "./audit";

// biome-ignore lint/suspicious/noExplicitAny: Generic DB instance support
type DbInstance = any;

export interface Actor {
  id: number;
  fullName: string;
  ipAddress?: string;
}

export type PatronImportType = "STUDENT" | "FACULTY";

export interface PatronImportOptions {
  defaultCategoryId?: number;
  defaultInstitutionId?: number;
  encoding?: string;
  fileName?: string;
}

export interface ValidatedPatronData {
  rowNumber: number;
  cardNo: string;
  patronType: "STUDENT" | "FACULTY" | "STAFF";
  categoryId: number;
  categoryCode: string;
  institutionId?: number | null;
  institutionCode?: string | null;
  institutionName?: string | null;
  departmentId?: number | null;
  departmentCode?: string | null;
  courseId?: number | null;
  courseCode?: string | null;
  courseName?: string | null;
  rollNo?: string | null;
  employeeId?: string | null;
  firstName: string;
  middleName?: string | null;
  lastName?: string | null;
  gender?: string | null;
  dob?: string | null;
  fatherName?: string | null;
  mobile?: string | null;
  email?: string | null;
  address?: string | null;
  academicYear?: number | null;
  semester?: number | null;
  section?: string | null;
  admissionDate?: string | null;
  courseEndDate?: string | null;
  cardExpiry: string;
  plainPassword: string;
}

export interface PatronRowPreview {
  rowNumber: number;
  status: "OK" | "WARN" | "ERROR";
  messages: string[];
  data?: ValidatedPatronData;
  raw: Record<string, string>;
}

export interface PatronImportPreview {
  importType: PatronImportType;
  fileName: string;
  summary: {
    totalRows: number;
    okCount: number;
    warnCount: number;
    errorCount: number;
    validCount: number;
  };
  rows: PatronRowPreview[];
}

export interface PatronImportResult {
  batchId: number;
  importType: PatronImportType;
  fileName: string;
  totalRows: number;
  importedCount: number;
  skippedCount: number;
  importedPatrons: Array<{
    id: number;
    cardNo: string;
    fullName: string;
    rollNo?: string | null;
    employeeId?: string | null;
  }>;
  skippedRows: Array<{
    rowNumber: number;
    reason: string;
  }>;
  cardNumbers: string[];
  printCardsUrl: string;
}

/**
 * Strips non-alphanumeric characters and converts to uppercase for flexible alias matching.
 * E.g., "B.Tech" -> "BTECH", "B. Tech" -> "BTECH", "B-Tech" -> "BTECH", "RBCeT" -> "RBCET"
 */
export function cleanAlphaNum(str: string): string {
  if (!str) return "";
  return str.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

/**
 * Checks if a string represents B.Tech (e.g. "B.Tech", "BTech", "B. Tech", "btech", "Bachelor of Technology")
 */
export function isBTechCourse(raw: string): boolean {
  if (!raw) return false;
  const clean = cleanAlphaNum(raw);
  return (
    clean === "BTECH" ||
    clean.startsWith("BTECH") ||
    clean === "BACHELOROFTECHNOLOGY" ||
    clean.startsWith("BACHELOROFTECHNOLOGY") ||
    /\bb[\.\s\-]?tech\b/i.test(raw)
  );
}

/**
 * Validates a patron CSV stream without performing ANY database writes (FR-PI-02).
 */
export async function validatePatronCsv(
  buffer: Buffer | Uint8Array,
  importType: PatronImportType,
  options: PatronImportOptions = {},
  db: DbInstance = defaultDb,
): Promise<PatronImportPreview> {
  const fileName = options.fileName ?? "patrons.csv";
  const decodedText = decodeCsvBuffer(buffer, options.encoding);
  const parsedRows = parseCsvText(decodedText);

  // 1. Fetch Reference / Lookup Data
  const categories = await db.select().from(schema.patronCategories);
  const institutions = await db.select().from(schema.institutions);
  const departments = await db.select().from(schema.departments);
  const courses = await db.select().from(schema.courses);

  // Maps for fast case-insensitive lookup
  const categoryByCode = new Map<string, typeof schema.patronCategories.$inferSelect>();
  for (const c of categories) {
    categoryByCode.set(c.code.toUpperCase(), c);
  }

  const institutionByCode = new Map<string, typeof schema.institutions.$inferSelect>();
  for (const inst of institutions) {
    institutionByCode.set(inst.code.toUpperCase(), inst);
  }

  const departmentByCode = new Map<string, typeof schema.departments.$inferSelect>();
  for (const d of departments) {
    departmentByCode.set(d.code.toUpperCase(), d);
  }

  const courseByCode = new Map<string, typeof schema.courses.$inferSelect>();
  for (const crs of courses) {
    courseByCode.set(crs.code.toUpperCase(), crs);
  }

  // Identify the RBCeT institution (RBMI College of Engineering and Technology / RBMI-ENG)
  const rbcetInstitution =
    institutions.find(
      (inst: { code: string; name: string }) =>
        inst.code.toUpperCase() === "RBMI-ENG" ||
        cleanAlphaNum(inst.code) === "RBCET" ||
        inst.name.toUpperCase().includes("ENGINEERING") ||
        cleanAlphaNum(inst.name).includes("RBCET"),
    ) ?? institutions[0];

  const resolveInstitution = (raw: string): typeof schema.institutions.$inferSelect | undefined => {
    if (!raw) return undefined;
    const norm = raw.trim().toUpperCase();
    const clean = cleanAlphaNum(raw);

    // RBCET / Engineering aliases
    if (
      clean === "RBCET" ||
      clean === "RBCETBAREILLY" ||
      clean === "RBMIENG" ||
      clean === "RBMICET" ||
      clean === "CET" ||
      norm.includes("ENGINEERING")
    ) {
      return rbcetInstitution;
    }

    // Direct code lookup
    const direct = institutionByCode.get(norm);
    if (direct) return direct;

    // Cleaned code lookup
    for (const inst of institutions) {
      if (cleanAlphaNum(inst.code) === clean) return inst;
    }

    // Name substring lookup
    for (const inst of institutions) {
      if (inst.name.toUpperCase().includes(norm) || cleanAlphaNum(inst.name).includes(clean)) {
        return inst;
      }
    }

    // Common abbreviations
    if (clean === "RBMIMGMT" || clean === "MGMT" || clean === "RBCM" || norm.includes("MANAGEMENT")) {
      return institutions.find((i: { code: string }) => i.code.toUpperCase() === "RBMI-MGMT");
    }
    if (clean === "RBMIPHARM" || clean === "PHARM" || clean === "PHARMACY" || clean === "RBCP") {
      return institutions.find((i: { code: string }) => i.code.toUpperCase() === "RBMI-PHARM");
    }
    if (clean === "RBMINURS" || clean === "NURS" || clean === "NURSING" || clean === "RBCN") {
      return institutions.find((i: { code: string }) => i.code.toUpperCase() === "RBMI-NURS");
    }
    if (clean === "RBMITECH" || clean === "ITM" || clean === "RBMITM" || clean === "TECH") {
      return institutions.find((i: { code: string }) => i.code.toUpperCase() === "RBMI-TECH");
    }

    return undefined;
  };

  const resolveCourse = (
    raw: string,
    rawDept?: string | null,
  ): typeof schema.courses.$inferSelect | undefined => {
    if (!raw) return undefined;
    const norm = raw.trim().toUpperCase();
    const clean = cleanAlphaNum(raw);

    // 1. If it's B.Tech:
    if (isBTechCourse(raw)) {
      const deptUpper = (rawDept || "").toUpperCase();
      // If branch is specified, try branch-specific B.Tech course
      if (deptUpper.includes("CS") || deptUpper.includes("COMP") || deptUpper.includes("IT")) {
        const cs = courseByCode.get("BTECH-CS");
        if (cs) return cs;
      } else if (deptUpper.includes("MECH") || deptUpper === "ME") {
        const me = courseByCode.get("BTECH-ME");
        if (me) return me;
      } else if (deptUpper.includes("CIVIL") || deptUpper === "CE") {
        const ce = courseByCode.get("BTECH-CE");
        if (ce) return ce;
      } else if (deptUpper.includes("ELECTR") || deptUpper === "EE") {
        const ee = courseByCode.get("BTECH-EE");
        if (ee) return ee;
      } else if (deptUpper.includes("COMM") || deptUpper === "ECE" || deptUpper === "EC") {
        const ec = courseByCode.get("BTECH-EC");
        if (ec) return ec;
      }

      // If no branch match or generic B.Tech:
      const genericBtech = courseByCode.get("BTECH");
      if (genericBtech) return genericBtech;

      const csFallback = courseByCode.get("BTECH-CS");
      if (csFallback) return csFallback;

      const anyBtech = courses.find(
        (c: { code: string; name: string }) => isBTechCourse(c.code) || isBTechCourse(c.name),
      );
      if (anyBtech) return anyBtech;
    }

    // 2. Direct code match
    const byCode = courseByCode.get(norm);
    if (byCode) return byCode;

    // 3. Cleaned code match
    for (const c of courses) {
      if (cleanAlphaNum(c.code) === clean) return c;
    }

    // 4. Common degree abbreviations
    if (clean === "MBA" || clean === "MASTEROFBUSINESSADMINISTRATION") {
      const mba = courseByCode.get("MBA");
      if (mba) return mba;
    }
    if (clean === "BBA" || clean === "BACHELOROFBUSINESSADMINISTRATION") {
      const bba = courseByCode.get("BBA");
      if (bba) return bba;
    }
    if (clean === "MCA" || clean === "MASTEROFCOMPUTERAPPLICATIONS") {
      const mca = courseByCode.get("MCA");
      if (mca) return mca;
    }
    if (clean === "BCA" || clean === "BACHELOROFCOMPUTERAPPLICATIONS") {
      const bca = courseByCode.get("BCA");
      if (bca) return bca;
    }
    if (clean === "BPHARM" || clean === "BPHARMACY" || clean === "BACHELOROFPHARMACY") {
      const bpharm = courseByCode.get("BPHARM");
      if (bpharm) return bpharm;
    }
    if (clean === "BSCNURS" || clean === "BSCNURSING" || clean === "BSCN") {
      const bscnurs = courseByCode.get("BSC-NURS");
      if (bscnurs) return bscnurs;
    }

    // 5. Name substring or cleaned name match
    for (const c of courses) {
      if (c.name.toUpperCase().includes(norm) || cleanAlphaNum(c.name).includes(clean)) {
        return c;
      }
    }

    return undefined;
  };

  const resolveDepartment = (raw: string): typeof schema.departments.$inferSelect | undefined => {
    if (!raw) return undefined;
    const norm = raw.trim().toUpperCase();
    const clean = cleanAlphaNum(raw);

    const byCode = departmentByCode.get(norm);
    if (byCode) return byCode;

    for (const d of departments) {
      if (cleanAlphaNum(d.code) === clean) return d;
    }

    if (
      [
        "CS",
        "CSE",
        "COMPUTERSCIENCE",
        "COMPUTERSCIENCEANDENGINEERING",
        "COMPUTERSCIENCEENGINEERING",
      ].includes(clean)
    ) {
      return departmentByCode.get("CSE");
    }
    if (["IT", "INFORMATIONTECHNOLOGY"].includes(clean)) {
      return departmentByCode.get("IT");
    }
    if (["ME", "MECH", "MECHANICAL", "MECHANICALENGINEERING"].includes(clean)) {
      return departmentByCode.get("ME");
    }
    if (["CE", "CIVIL", "CIVILENGINEERING"].includes(clean)) {
      return departmentByCode.get("CE");
    }
    if (["EE", "ELECTRICAL", "ELECTRICALENGINEERING"].includes(clean)) {
      return departmentByCode.get("EE");
    }
    if (
      [
        "ECE",
        "EC",
        "ELECTRONICS",
        "ELECTRONICSANDCOMMUNICATION",
        "ELECTRONICSCOMMUNICATION",
      ].includes(clean)
    ) {
      return departmentByCode.get("ECE");
    }
    if (["MBA", "MANAGEMENT", "MANAGEMENTSTUDIES"].includes(clean)) {
      return departmentByCode.get("MBA");
    }
    if (["BBA", "BUSINESSADMINISTRATION"].includes(clean)) {
      return departmentByCode.get("BBA");
    }
    if (["MCA", "COMPUTERAPPLICATIONS"].includes(clean)) {
      return departmentByCode.get("MCA");
    }
    if (["BCA"].includes(clean)) {
      return departmentByCode.get("BCA");
    }
    if (["PHARM", "PHARMACY", "PHARMACEUTICAL", "PHARMACEUTICALSCIENCES"].includes(clean)) {
      return departmentByCode.get("PHARM");
    }
    if (["NURS", "NURSING", "NURSINGSCIENCES"].includes(clean)) {
      return departmentByCode.get("NURS");
    }

    for (const d of departments) {
      if (d.name.toUpperCase().includes(norm) || cleanAlphaNum(d.name).includes(clean)) {
        return d;
      }
    }

    return undefined;
  };

  const resolveCategory = (raw: string): typeof schema.patronCategories.$inferSelect | undefined => {
    if (!raw) return undefined;
    const norm = raw.trim().toUpperCase();
    const clean = cleanAlphaNum(raw);

    const byCode = categoryByCode.get(norm);
    if (byCode) return byCode;

    for (const c of categories) {
      if (cleanAlphaNum(c.code) === clean) return c;
    }

    if (isBTechCourse(raw) || clean === "BTECHSTUDENT") {
      return categoryByCode.get("BTECH");
    }

    for (const c of categories) {
      if (c.name.toUpperCase().includes(norm) || cleanAlphaNum(c.name).includes(clean)) {
        return c;
      }
    }

    return undefined;
  };

  // Default category resolution
  let defaultCategory = categories.find((c: { id: number }) => c.id === options.defaultCategoryId);
  if (!defaultCategory) {
    if (importType === "STUDENT") {
      defaultCategory =
        categoryByCode.get("BTECH") ??
        categories.find((c: { patronType: string }) => c.patronType === "STUDENT");
    } else {
      defaultCategory =
        categoryByCode.get("FACULTY") ??
        categories.find((c: { patronType: string }) => c.patronType === "FACULTY");
    }
  }

  // 2. Fetch existing identifiers in DB to detect duplicates
  const existingPatrons = await db
    .select({
      cardNo: schema.patrons.cardNo,
      rollNo: schema.patrons.rollNo,
      employeeId: schema.patrons.employeeId,
    })
    .from(schema.patrons);

  const existingRollNos = new Set<string>();
  const existingEmployeeIds = new Set<string>();
  const existingCardNos = new Set<string>();

  for (const p of existingPatrons) {
    if (p.rollNo) existingRollNos.add(p.rollNo.toUpperCase());
    if (p.employeeId) existingEmployeeIds.add(p.employeeId.toUpperCase());
    if (p.cardNo) existingCardNos.add(p.cardNo.toUpperCase());
  }

  // File-internal deduplication trackers
  const fileRollNos = new Set<string>();
  const fileEmployeeIds = new Set<string>();
  const fileCardNos = new Set<string>();

  const rows: PatronRowPreview[] = [];
  let okCount = 0;
  let warnCount = 0;
  let errorCount = 0;

  for (const parsedRow of parsedRows) {
    const raw = parsedRow.raw;
    const rowNumber = parsedRow.rowNumber;
    const messages: string[] = [];
    let isError = false;

    // --- Student Roll No / Faculty Employee ID ---
    let rollNo: string | null = null;
    let employeeId: string | null = null;

    if (importType === "STUDENT") {
      const rawRoll = getFieldValue(raw, "roll_no", [
        "roll_number",
        "roll",
        "university_roll_no",
        "student_id",
      ]);
      if (!rawRoll) {
        messages.push("Missing required field: roll_no");
        isError = true;
      } else {
        const normRoll = rawRoll.toUpperCase();
        if (existingRollNos.has(normRoll)) {
          messages.push(`Duplicate roll_no: "${rawRoll}" is already registered in database`);
          isError = true;
        } else if (fileRollNos.has(normRoll)) {
          messages.push(`Duplicate roll_no: "${rawRoll}" appears multiple times in file`);
          isError = true;
        } else {
          fileRollNos.add(normRoll);
          rollNo = truncate(rawRoll, DB_TEXT_LIMITS.ROLL_NO);
        }
      }
    } else {
      // Faculty / Staff
      const rawEmp = getFieldValue(raw, "employee_id", [
        "emp_id",
        "employee_code",
        "staff_id",
        "emp_no",
      ]);
      if (!rawEmp) {
        messages.push("Missing required field: employee_id");
        isError = true;
      } else {
        const normEmp = rawEmp.toUpperCase();
        if (existingEmployeeIds.has(normEmp)) {
          messages.push(`Duplicate employee_id: "${rawEmp}" is already registered in database`);
          isError = true;
        } else if (fileEmployeeIds.has(normEmp)) {
          messages.push(`Duplicate employee_id: "${rawEmp}" appears multiple times in file`);
          isError = true;
        } else {
          fileEmployeeIds.add(normEmp);
          employeeId = truncate(rawEmp, DB_TEXT_LIMITS.EMPLOYEE_ID);
        }
      }
    }

    // --- Name parsing ---
    let firstName: string | null = null;
    let middleName: string | null = null;
    let lastName: string | null = null;

    const rawFirstName = getFieldValue(raw, "first_name", ["fname"]);
    if (rawFirstName) {
      firstName = truncate(rawFirstName, DB_TEXT_LIMITS.NAME);
      const rawMiddle = getFieldValue(raw, "middle_name", ["mname"]);
      if (rawMiddle) middleName = truncate(rawMiddle, DB_TEXT_LIMITS.NAME);
      const rawLast = getFieldValue(raw, "last_name", ["lname", "surname"]);
      if (rawLast) lastName = truncate(rawLast, DB_TEXT_LIMITS.NAME);
    } else {
      const rawFullName = getFieldValue(raw, "name", ["full_name", "patron_name", "student_name"]);
      if (rawFullName) {
        const split = splitFullName(rawFullName);
        firstName = truncate(split.firstName, DB_TEXT_LIMITS.NAME);
        if (split.middleName) middleName = truncate(split.middleName, DB_TEXT_LIMITS.NAME);
        if (split.lastName) lastName = truncate(split.lastName, DB_TEXT_LIMITS.NAME);
      } else {
        messages.push("Missing required field: first_name (or name)");
        isError = true;
      }
    }

    // --- Card Number ---
    let cardNo: string | null = null;
    const rawCard = getFieldValue(raw, "card_no", ["card_number", "library_card_no", "barcode"]);
    if (rawCard) {
      cardNo = truncate(rawCard.toUpperCase(), DB_TEXT_LIMITS.CARD_NO);
    } else if (importType === "STUDENT" && rollNo) {
      cardNo = rollNo;
    } else if (importType === "FACULTY" && employeeId) {
      cardNo = employeeId;
    }

    if (cardNo) {
      const normCard = cardNo.toUpperCase();
      if (existingCardNos.has(normCard)) {
        messages.push(`Duplicate card_no: "${cardNo}" is already assigned in database`);
        isError = true;
      } else if (fileCardNos.has(normCard)) {
        messages.push(`Duplicate card_no: "${cardNo}" appears multiple times in file`);
        isError = true;
      } else {
        fileCardNos.add(normCard);
      }
    }

    // --- Extract raw course, department, institute fields ---
    const rawCourse = getFieldValue(raw, "course", [
      "program",
      "degree",
      "course_name",
      "programme",
    ]);
    const rawDept = getFieldValue(raw, "department", [
      "branch",
      "dept",
      "department_name",
      "specialization",
      "stream",
    ]);
    const rawInst = getFieldValue(raw, "institute", [
      "institution",
      "college",
      "college_name",
      "institute_name",
      "institution_name",
      "campus",
    ]);

    const isBTech = rawCourse ? isBTechCourse(rawCourse) : false;

    // --- Patron Category ---
    let category = defaultCategory;
    const rawCat = getFieldValue(raw, "category", [
      "patron_category",
      "cat",
      "category_name",
      "type",
    ]);
    if (rawCat) {
      const found = resolveCategory(rawCat);
      if (found) {
        if (importType === "FACULTY" && !["FACULTY", "STAFF"].includes(found.patronType)) {
          messages.push(`Category "${rawCat}" is not a Faculty/Staff category`);
          isError = true;
        } else {
          category = found;
        }
      } else {
        messages.push(`Unknown category code "${rawCat}"`);
        isError = true;
      }
    } else if (importType === "STUDENT" && isBTech) {
      // Auto-assign BTECH student category if course is B.Tech
      const btechCat =
        categoryByCode.get("BTECH") ??
        categories.find((c: { code: string }) => c.code.toUpperCase() === "BTECH");
      if (btechCat) {
        category = btechCat;
      }
    }

    if (!category) {
      messages.push("Could not resolve patron category");
      isError = true;
    }

    // --- Institute, Course, Department lookups ---
    let institutionId = options.defaultInstitutionId ?? null;

    if (isBTech) {
      // Requirement: "If the course is BTech, the college name will automatically be RBCeT, doesn't matter if it is mentioned or not."
      if (rbcetInstitution) {
        institutionId = rbcetInstitution.id;
      }
    } else if (rawInst) {
      const found = resolveInstitution(rawInst);
      if (found) {
        institutionId = found.id;
      } else {
        messages.push(`Unknown institution "${rawInst}"; field set to null`);
      }
    }

    let departmentId: number | null = null;
    if (rawDept) {
      const found = resolveDepartment(rawDept);
      if (found) {
        departmentId = found.id;
      } else {
        messages.push(`Unknown department "${rawDept}"; field set to null`);
      }
    }

    let courseId: number | null = null;
    if (rawCourse) {
      const found = resolveCourse(rawCourse, rawDept);
      if (found) {
        courseId = found.id;
      } else {
        messages.push(`Unknown course "${rawCourse}"; field set to null`);
      }
    }

    // --- Academic year, semester, section ---
    let academicYear: number | null = null;
    const rawYear = getFieldValue(raw, "year", ["academic_year"]);
    if (rawYear) {
      const parsed = parseInt(rawYear, 10);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 5) {
        academicYear = parsed;
      }
    }

    let semester: number | null = null;
    const rawSem = getFieldValue(raw, "semester", ["sem"]);
    if (rawSem) {
      const parsed = parseInt(rawSem, 10);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 10) {
        semester = parsed;
      }
    }

    const section = truncate(getFieldValue(raw, "section"), DB_TEXT_LIMITS.SECTION);

    // --- Gender ---
    let gender: string | null = null;
    const rawGender = getFieldValue(raw, "gender", ["sex"]);
    if (rawGender) {
      const g = rawGender.trim().toUpperCase();
      if (g.startsWith("M")) gender = "M";
      else if (g.startsWith("F")) gender = "F";
      else gender = "O";
    }

    // --- Dates ---
    const dob = parseCsvDate(getFieldValue(raw, "dob", ["date_of_birth"]));
    const admissionDate =
      parseCsvDate(
        getFieldValue(raw, "admission_date", ["joining_date", "date_of_joining", "doj"]),
      ) || new Date().toISOString().split("T")[0];
    const courseEndDate = parseCsvDate(getFieldValue(raw, "course_end_date", ["end_date"]));

    // Card expiry calculation
    const validityYears = category?.cardValidityYears ?? (importType === "FACULTY" ? 5 : 4);
    const calculatedExpiry = calculateCardExpiry({
      courseEndDate: courseEndDate || undefined,
      admissionDate,
      cardValidityYears: validityYears,
    });
    const cardExpiry = calculatedExpiry.toISOString().split("T")[0];

    // --- Contact Information ---
    let mobile: string | null = null;
    const rawMobile = getFieldValue(raw, "mobile", ["phone", "mobile_no", "contact"]);
    if (rawMobile) {
      const cleaned = cleanPhoneNumber(rawMobile);
      mobile = truncate(cleaned.number, DB_TEXT_LIMITS.MOBILE);
      if (!cleaned.isValid10Digit) {
        messages.push(`Phone "${rawMobile}" is not a standard 10-digit number; retained`);
      }
    }

    let email: string | null = null;
    const rawEmail = getFieldValue(raw, "email", ["email_id"]);
    if (rawEmail) {
      email = truncate(rawEmail.toLowerCase(), DB_TEXT_LIMITS.EMAIL);
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(rawEmail)) {
        messages.push(`Email "${rawEmail}" is not in valid format; retained`);
      }
    }

    const address = truncate(getFieldValue(raw, "address"), DB_TEXT_LIMITS.ADDRESS);
    const fatherName = truncate(
      getFieldValue(raw, "father_name", ["fathers_name"]),
      DB_TEXT_LIMITS.FATHER_NAME,
    );

    // --- Password ---
    const plainPassword =
      getFieldValue(raw, "password", ["initial_password"]) || (cardNo ?? "defaultPass123");

    // Status classification
    let status: "OK" | "WARN" | "ERROR";
    if (isError || !cardNo || !firstName || !category) {
      status = "ERROR";
      errorCount++;
    } else if (messages.length > 0) {
      status = "WARN";
      warnCount++;
    } else {
      status = "OK";
      okCount++;
    }

    let data: ValidatedPatronData | undefined;
    if (status !== "ERROR" && cardNo && firstName && category) {
      const resolvedInst = institutions.find((i: { id: number }) => i.id === institutionId);
      const resolvedDept = departments.find((d: { id: number }) => d.id === departmentId);
      const resolvedCrs = courses.find((c: { id: number }) => c.id === courseId);

      data = {
        rowNumber,
        cardNo,
        patronType: (category.patronType as "STUDENT" | "FACULTY" | "STAFF") ?? "STUDENT",
        categoryId: category.id,
        categoryCode: category.code,
        institutionId,
        institutionCode: resolvedInst
          ? resolvedInst.code === "RBMI-ENG"
            ? "RBCeT"
            : resolvedInst.code
          : null,
        institutionName: resolvedInst?.name ?? null,
        departmentId,
        departmentCode: resolvedDept?.code ?? null,
        courseId,
        courseCode: resolvedCrs?.code ?? (isBTech ? "BTECH" : null),
        courseName: resolvedCrs?.name ?? (isBTech ? "Bachelor of Technology (B.Tech)" : null),
        rollNo,
        employeeId,
        firstName,
        middleName,
        lastName,
        gender,
        dob,
        fatherName,
        mobile,
        email,
        address,
        academicYear,
        semester,
        section,
        admissionDate,
        courseEndDate,
        cardExpiry,
        plainPassword,
      };
    }

    rows.push({
      rowNumber,
      status,
      messages,
      data,
      raw,
    });
  }

  return {
    importType,
    fileName,
    summary: {
      totalRows: parsedRows.length,
      okCount,
      warnCount,
      errorCount,
      validCount: okCount + warnCount,
    },
    rows,
  };
}

/**
 * Commits pre-validated patron rows in independent row-level transactions (FR-PI-04, NFR-R-02).
 * Writes batch record to import_batches and logs append-only audit entry.
 */
export async function commitPatronImport(
  preview: PatronImportPreview,
  actor: Actor,
  db: DbInstance = defaultDb,
): Promise<PatronImportResult> {
  const importedPatrons: PatronImportResult["importedPatrons"] = [];
  const skippedRows: PatronImportResult["skippedRows"] = [];
  const cardNumbers: string[] = [];

  for (const row of preview.rows) {
    if (row.status === "ERROR" || !row.data) {
      skippedRows.push({
        rowNumber: row.rowNumber,
        reason: row.messages.join("; ") || "Fatal validation errors",
      });
      continue;
    }

    const patronData = row.data;

    try {
      // Row-level transaction isolation (NFR-R-02)
      const inserted = await db.transaction(async (tx: DbInstance) => {
        const passwordHash = hashPassword(patronData.plainPassword);

        const [created] = await tx
          .insert(schema.patrons)
          .values({
            cardNo: patronData.cardNo,
            patronType: patronData.patronType,
            categoryId: patronData.categoryId,
            institutionId: patronData.institutionId,
            departmentId: patronData.departmentId,
            courseId: patronData.courseId,
            rollNo: patronData.rollNo,
            employeeId: patronData.employeeId,
            firstName: patronData.firstName,
            middleName: patronData.middleName,
            lastName: patronData.lastName,
            gender: patronData.gender,
            dob: patronData.dob ? sql`${patronData.dob}::date` : null,
            fatherName: patronData.fatherName,
            mobile: patronData.mobile,
            email: patronData.email,
            address: patronData.address,
            academicYear: patronData.academicYear,
            semester: patronData.semester,
            section: patronData.section,
            admissionDate: patronData.admissionDate ? sql`${patronData.admissionDate}::date` : null,
            courseEndDate: patronData.courseEndDate ? sql`${patronData.courseEndDate}::date` : null,
            cardExpiry: sql`${patronData.cardExpiry}::date`,
            status: "ACTIVE",
            username: patronData.cardNo,
            passwordHash,
            mustChangePassword: true,
          })
          .returning();

        return created;
      });

      importedPatrons.push({
        id: inserted.id,
        cardNo: inserted.cardNo,
        fullName: `${inserted.firstName} ${inserted.lastName || ""}`.trim(),
        rollNo: inserted.rollNo,
        employeeId: inserted.employeeId,
      });
      cardNumbers.push(inserted.cardNo);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      skippedRows.push({
        rowNumber: row.rowNumber,
        reason: `Transaction insertion failure: ${errorMsg}`,
      });
    }
  }

  // Record batch metadata in import_batches
  const [batch] = await db
    .insert(schema.importBatches)
    .values({
      importType: preview.importType,
      fileName: preview.fileName,
      totalRows: preview.summary.totalRows,
      importedRows: importedPatrons.length,
      skippedRows: skippedRows.length,
      importedBy: actor.id,
    })
    .returning();

  // Audit entry
  await recordAuditLog(
    {
      actorType: "STAFF",
      actorId: actor.id,
      actorName: actor.fullName,
      action: "IMPORT",
      entity: "patrons",
      entityId: String(batch?.id ?? 0),
      details: `Imported ${importedPatrons.length} ${preview.importType.toLowerCase()} patrons from "${preview.fileName}" (${skippedRows.length} skipped)`,
      ipAddress: actor.ipAddress,
    },
    db,
  );

  const printCardsUrl = `/patrons?cards=${encodeURIComponent(cardNumbers.slice(0, 50).join(","))}`;

  return {
    batchId: batch?.id ?? 0,
    importType: preview.importType,
    fileName: preview.fileName,
    totalRows: preview.summary.totalRows,
    importedCount: importedPatrons.length,
    skippedCount: skippedRows.length,
    importedPatrons,
    skippedRows,
    cardNumbers,
    printCardsUrl,
  };
}
