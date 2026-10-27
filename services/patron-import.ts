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
import { calculateCardExpiry, formatCardNumber } from "@/lib/numbering";
import { recordAuditLog } from "./audit";
import { DEFAULT_FORMATS, type ImportColumnDef } from "./import-format";

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
  defaultLibraryId?: number;
  encoding?: string;
  fileName?: string;
  formatColumns?: ImportColumnDef[];
}

export interface ValidatedPatronData {
  rowNumber: number;
  cardNo: string;
  name?: string | null;
  patronType: "STUDENT" | "FACULTY" | "STAFF";
  categoryId: number;
  categoryCode: string;
  libraryId?: number | null;
  institutionId?: number | null;
  institutionCode?: string | null;
  institutionName?: string | null;
  departmentId?: number | null;
  departmentCode?: string | null;
  courseId?: number | null;
  courseCode?: string | null;
  courseName?: string | null;
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
 * Checks if a string represents Diploma / Polytechnic
 */
export function isDiplomaCourse(raw: string): boolean {
  if (!raw) return false;
  const clean = cleanAlphaNum(raw);
  if (clean.includes("PHARM") || clean === "DPHARM") return false;
  return (
    clean === "DIPLOMA" ||
    clean.startsWith("DIPLOMA") ||
    clean === "POLYTECHNIC" ||
    clean.startsWith("POLYTECHNIC") ||
    clean === "POLY" ||
    /\bdiploma\b/i.test(raw) ||
    /\bpolytechnic\b/i.test(raw)
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

  // Standard 5 Institutional Entities
  const rbcetInstitution =
    institutions.find(
      (inst: { code: string; name: string }) =>
        cleanAlphaNum(inst.code) === "RBCET" ||
        inst.code.toUpperCase() === "RBMI-ENG" ||
        cleanAlphaNum(inst.name).includes("RBCET") ||
        inst.name.toUpperCase().includes("ENGINEERING"),
    ) ?? institutions[0];

  const rbcpInstitution = institutions.find(
    (inst: { code: string; name: string }) =>
      cleanAlphaNum(inst.code) === "RBCP" ||
      inst.code.toUpperCase() === "RBMI-PHARM" ||
      cleanAlphaNum(inst.name).includes("RBCP") ||
      inst.name.toUpperCase().includes("PHARMACY"),
  );

  const rbcnInstitution = institutions.find(
    (inst: { code: string; name: string }) =>
      cleanAlphaNum(inst.code) === "RBCN" ||
      inst.code.toUpperCase() === "RBMI-NURS" ||
      cleanAlphaNum(inst.name).includes("RBCN") ||
      inst.name.toUpperCase().includes("NURSING"),
  );

  const rbmiInstitution = institutions.find(
    (inst: { code: string; name: string }) =>
      cleanAlphaNum(inst.code) === "RBMI" ||
      inst.code.toUpperCase() === "RBMI-MGMT" ||
      cleanAlphaNum(inst.name).includes("RBMI") ||
      inst.name.toUpperCase().includes("BUSINESS") ||
      inst.name.toUpperCase().includes("MANAGEMENT"),
  );

  const rbttiInstitution = institutions.find(
    (inst: { code: string; name: string }) =>
      cleanAlphaNum(inst.code) === "RBTTI" ||
      inst.code.toUpperCase() === "RBMI-TECH" ||
      cleanAlphaNum(inst.name).includes("RBTTI") ||
      inst.name.toUpperCase().includes("TEACHER") ||
      inst.name.toUpperCase().includes("TEACHERS"),
  );

  const resolveInstitution = (raw: string): typeof schema.institutions.$inferSelect | undefined => {
    if (!raw) return undefined;
    const norm = raw.trim().toUpperCase();
    const clean = cleanAlphaNum(raw);

    // 1. Direct code lookup from database
    const direct = institutionByCode.get(norm);
    if (direct) return direct;

    // 2. Cleaned code lookup from database
    for (const inst of institutions) {
      if (cleanAlphaNum(inst.code) === clean) return inst;
    }

    // 3. Name substring lookup from database
    for (const inst of institutions) {
      if (inst.name.toUpperCase().includes(norm) || cleanAlphaNum(inst.name).includes(clean)) {
        return inst;
      }
    }

    // 4. Aliases for institutional campuses
    if (
      clean === "RBCET" ||
      clean === "RBCETBAREILLY" ||
      clean === "RBMIENG" ||
      clean === "RBMICET" ||
      clean === "CET" ||
      clean === "ENGINEERING" ||
      norm.includes("ENGINEERING")
    ) {
      return rbcetInstitution;
    }

    if (
      clean === "RBCP" ||
      clean === "RBCPBAREILLY" ||
      clean === "RBMIPHARM" ||
      clean === "PHARM" ||
      clean === "PHARMACY" ||
      norm.includes("PHARMACY")
    ) {
      return rbcpInstitution;
    }

    if (
      clean === "RBCN" ||
      clean === "RBCNBAREILLY" ||
      clean === "RBMINURS" ||
      clean === "NURS" ||
      clean === "NURSING" ||
      norm.includes("NURSING")
    ) {
      return rbcnInstitution;
    }

    if (
      clean === "RBTTI" ||
      clean === "RBTTIBAREILLY" ||
      clean === "TTI" ||
      clean === "BED" ||
      norm.includes("TEACHER") ||
      norm.includes("TEACHERS")
    ) {
      return rbttiInstitution;
    }

    if (
      clean === "RBMI" ||
      clean === "RBMIMGMT" ||
      clean === "MGMT" ||
      clean === "RBCM" ||
      clean === "RBMITECH" ||
      norm.includes("MANAGEMENT") ||
      norm.includes("BUSINESS")
    ) {
      return rbmiInstitution;
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
      if (
        deptUpper.includes("CS") ||
        deptUpper.includes("COMP") ||
        deptUpper.includes("IT") ||
        deptUpper.includes("AI") ||
        deptUpper.includes("AIDS")
      ) {
        const cs = courseByCode.get("BTECH-CS");
        if (cs) return cs;
      } else if (deptUpper.includes("MECH") || deptUpper === "ME") {
        const me = courseByCode.get("BTECH-ME");
        if (me) return me;
      } else if (deptUpper.includes("CIVIL") || deptUpper === "CE") {
        const ce = courseByCode.get("BTECH-CE");
        if (ce) return ce;
      } else if (deptUpper.includes("ELECTR") || deptUpper === "EE" || deptUpper === "EN") {
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
    if (isDiplomaCourse(raw)) {
      const dip = courseByCode.get("DIPLOMA");
      if (dip) return dip;
    }
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
    if (clean === "DPHARM" || clean === "DPHARMACY" || clean === "DIPLOMAINPHARMACY") {
      const dpharm = courseByCode.get("DPHARM");
      if (dpharm) return dpharm;
    }
    if (
      clean === "BSCNURS" ||
      clean === "BSCNURSING" ||
      clean === "BSCN" ||
      clean.includes("NURSING")
    ) {
      const bscnurs = courseByCode.get("BSCNURS") ?? courseByCode.get("BSC-NURS");
      if (bscnurs) return bscnurs;
    }
    if (clean === "BSC" || clean === "BACHELOROFSCIENCE" || clean === "BSCSCIENCE") {
      const bsc = courseByCode.get("BSC");
      if (bsc) return bsc;
    }
    if (clean === "BCOM" || clean === "BACHELOROFCOMMERCE" || clean === "BCOMMERCE") {
      const bcom = courseByCode.get("BCOM");
      if (bcom) return bcom;
    }
    if (clean === "BED" || clean === "BACHELOROFEDUCATION" || clean === "EDUCATION") {
      const bed = courseByCode.get("BED");
      if (bed) return bed;
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
      return departmentByCode.get("CSE") ?? departmentByCode.get("BTECH");
    }
    if (
      [
        "AIDS",
        "AI",
        "ARTIFICIALINTELLIGENCE",
        "ARTIFICIALINTELLIGENCEANDDATASCIENCE",
      ].includes(clean)
    ) {
      return (
        departmentByCode.get("AI&DS") ??
        departmentByCode.get("AIDS") ??
        departmentByCode.get("CSE") ??
        departmentByCode.get("BTECH")
      );
    }
    if (["IT", "INFORMATIONTECHNOLOGY"].includes(clean)) {
      return departmentByCode.get("IT") ?? departmentByCode.get("BTECH");
    }
    if (["ME", "MECH", "MECHANICAL", "MECHANICALENGINEERING"].includes(clean)) {
      return departmentByCode.get("ME") ?? departmentByCode.get("BTECH");
    }
    if (["CE", "CIVIL", "CIVILENGINEERING"].includes(clean)) {
      return departmentByCode.get("CE") ?? departmentByCode.get("BTECH");
    }
    if (
      [
        "EN",
        "EE",
        "ELECTRICAL",
        "ELECTRICALENGINEERING",
        "ELECTRICALANDELECTRONICS",
        "ELECTRICALELECTRONICS",
      ].includes(clean)
    ) {
      return departmentByCode.get("EE") ?? departmentByCode.get("BTECH");
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
      return departmentByCode.get("ECE") ?? departmentByCode.get("BTECH");
    }
    if (isBTechCourse(raw) || clean === "BTECH") {
      return departmentByCode.get("BTECH");
    }
    if (isDiplomaCourse(raw) || clean === "DIPLOMA") {
      return departmentByCode.get("DIPLOMA");
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
    if (["BPHARM", "BPHARMACY", "BACHELOROFPHARMACY"].includes(clean)) {
      return departmentByCode.get("BPHARM") ?? departmentByCode.get("PHARM");
    }
    if (["DPHARM", "DPHARMACY", "DIPLOMAINPHARMACY"].includes(clean)) {
      return departmentByCode.get("DPHARM") ?? departmentByCode.get("PHARM");
    }
    if (["PHARM", "PHARMACY", "PHARMACEUTICAL", "PHARMACEUTICALSCIENCES"].includes(clean)) {
      return departmentByCode.get("BPHARM") ?? departmentByCode.get("PHARM");
    }
    if (["BSCNURS", "BSCNURSING", "NURS", "NURSING", "NURSINGSCIENCES"].includes(clean)) {
      return departmentByCode.get("BSCNURS") ?? departmentByCode.get("NURS");
    }
    if (["BSC", "BACHELOROFSCIENCE", "BSCSCIENCE"].includes(clean)) {
      return departmentByCode.get("BSC");
    }
    if (["BCOM", "BACHELOROFCOMMERCE", "BCOMMERCE"].includes(clean)) {
      return departmentByCode.get("BCOM");
    }
    if (["BED", "BACHELOROFEDUCATION", "EDUCATION", "TEACHERSTRAINING"].includes(clean)) {
      return departmentByCode.get("BED");
    }

    for (const d of departments) {
      if (d.name.toUpperCase().includes(norm) || cleanAlphaNum(d.name).includes(clean)) {
        return d;
      }
    }

    return undefined;
  };

  const resolveCategory = (
    raw: string,
  ): typeof schema.patronCategories.$inferSelect | undefined => {
    if (!raw) return undefined;
    const norm = raw.trim().toUpperCase();
    const clean = cleanAlphaNum(raw);

    const byCode = categoryByCode.get(norm);
    if (byCode) return byCode;

    for (const c of categories) {
      if (cleanAlphaNum(c.code) === clean) return c;
    }

    if (isBTechCourse(raw) || clean === "BTECHSTUDENT" || clean === "BTECH") {
      return categoryByCode.get("BTECH");
    }
    if (isDiplomaCourse(raw) || clean === "DIPLOMA" || clean === "DIPLOMASTUDENT") {
      return categoryByCode.get("DIPLOMA");
    }
    if (clean === "MBA" || clean === "MBASTUDENT") {
      return categoryByCode.get("MBA");
    }
    if (clean === "MCA" || clean === "MCASTUDENT") {
      return categoryByCode.get("MCA");
    }
    if (clean === "BBA" || clean === "BBASTUDENT") {
      return categoryByCode.get("BBA");
    }
    if (clean === "BCA" || clean === "BCASTUDENT") {
      return categoryByCode.get("BCA");
    }
    if (clean === "BPHARM" || clean === "BPHARMSTUDENT") {
      return categoryByCode.get("BPHARM");
    }
    if (clean === "DPHARM" || clean === "DPHARMSTUDENT") {
      return categoryByCode.get("DPHARM");
    }
    if (clean === "NURSING" || clean === "BSCNURS" || clean === "BSCNURSING") {
      return categoryByCode.get("NURSING");
    }
    if (clean === "BSC" || clean === "BSCSTUDENT") {
      return categoryByCode.get("BSC");
    }
    if (clean === "BCOM" || clean === "BCOMSTUDENT") {
      return categoryByCode.get("BCOM");
    }
    if (clean === "BED" || clean === "BEDSTUDENT") {
      return categoryByCode.get("BED");
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
      employeeId: schema.patrons.employeeId,
    })
    .from(schema.patrons);

  const existingEmployeeIds = new Set<string>();
  const existingCardNos = new Set<string>();

  for (const p of existingPatrons) {
    if (p.employeeId) existingEmployeeIds.add(p.employeeId.toUpperCase());
    if (p.cardNo) existingCardNos.add(p.cardNo.toUpperCase());
  }

  // File-internal deduplication trackers
  const fileEmployeeIds = new Set<string>();
  const fileCardNos = new Set<string>();

  const rows: PatronRowPreview[] = [];
  let okCount = 0;
  let warnCount = 0;
  let errorCount = 0;

  const formatMap = options.formatColumns
    ? new Map(options.formatColumns.map((c) => [c.dbField, c]))
    : null;

  for (const parsedRow of parsedRows) {
    const raw = parsedRow.raw;
    const rowNumber = parsedRow.rowNumber;
    const messages: string[] = [];
    let isError = false;

    const resolveField = (dbField: string, defaultAliases: string[] = []): string | undefined => {
      if (formatMap) {
        const knownDefaults =
          importType === "STUDENT" ? DEFAULT_FORMATS.STUDENT : DEFAULT_FORMATS.FACULTY;
        const isKnownField = knownDefaults.some((d) => d.dbField === dbField);
        if (isKnownField && !formatMap.has(dbField)) {
          return undefined;
        }
      }
      const configured = formatMap?.get(dbField);
      const aliases = [dbField, ...defaultAliases];
      if (configured?.csvHeader && configured.csvHeader !== dbField) {
        aliases.unshift(configured.csvHeader);
      }
      return getFieldValue(raw, configured?.csvHeader || dbField, aliases);
    };

    // --- Faculty / Staff Employee ID ---
    let employeeId: string | null = null;

    if (importType === "FACULTY") {
      const rawEmp = resolveField("employee_id", ["emp_id", "employee_code", "staff_id", "emp_no"]);
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

    const rawFullName = resolveField("name", [
      "full_name",
      "patron_name",
      "student_name",
      "faculty_name",
      "studentname",
    ]);

    if (rawFullName) {
      const split = splitFullName(rawFullName);
      firstName = truncate(split.firstName, DB_TEXT_LIMITS.NAME);
      if (split.middleName) middleName = truncate(split.middleName, DB_TEXT_LIMITS.NAME);
      if (split.lastName) lastName = truncate(split.lastName, DB_TEXT_LIMITS.NAME);
    } else {
      const rawFirstName = resolveField("first_name", ["fname"]);
      if (rawFirstName) {
        firstName = truncate(rawFirstName, DB_TEXT_LIMITS.NAME);
        const rawMiddle = resolveField("middle_name", ["mname"]);
        if (rawMiddle) middleName = truncate(rawMiddle, DB_TEXT_LIMITS.NAME);
        const rawLast = resolveField("last_name", ["lname", "surname"]);
        if (rawLast) lastName = truncate(rawLast, DB_TEXT_LIMITS.NAME);
      } else {
        messages.push("Missing required field: name");
        isError = true;
      }
    }

    // --- Card Number ---
    let cardNo: string | null = null;
    const rawCard = resolveField("card_no", ["card_number", "library_card_no", "barcode"]);
    if (rawCard) {
      cardNo = truncate(rawCard.toUpperCase(), DB_TEXT_LIMITS.CARD_NO);
    } else if (importType === "STUDENT") {
      cardNo = "[Auto-Allocated]";
    } else if (importType === "FACULTY" && employeeId) {
      cardNo = employeeId;
    }

    if (cardNo && cardNo !== "[Auto-Allocated]") {
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
    const rawCourse = resolveField("course", ["program", "degree", "course_name", "programme"]);
    const rawDept = resolveField("department", [
      "branch",
      "dept",
      "department_name",
      "specialization",
      "stream",
    ]);
    const rawInst = resolveField("institute", [
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
    const rawCat = resolveField("category", ["patron_category", "cat", "category_name", "type"]);
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
    } else if (importType === "STUDENT") {
      if (isBTech) {
        // Auto-assign BTECH student category if course is B.Tech
        const btechCat =
          categoryByCode.get("BTECH") ??
          categories.find((c: { code: string }) => c.code.toUpperCase() === "BTECH");
        if (btechCat) {
          category = btechCat;
        }
      } else if (rawCourse) {
        const foundCat = resolveCategory(rawCourse);
        if (foundCat) {
          category = foundCat;
        }
      }
    }

    if (!category) {
      messages.push("Could not resolve patron category");
      isError = true;
    }

    // --- Institute, Course, Department lookups ---
    let institutionId = options.defaultInstitutionId ?? null;

    if (rawInst) {
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

    // Auto-infer institution from course / department if not explicitly set:
    if (!institutionId) {
      if (isBTech || (rawCourse && isDiplomaCourse(rawCourse))) {
        institutionId = rbcetInstitution?.id ?? null;
      } else if (
        rawCourse &&
        (cleanAlphaNum(rawCourse).includes("BED") || cleanAlphaNum(rawCourse).includes("EDUCATION"))
      ) {
        institutionId = rbttiInstitution?.id ?? null;
      } else if (
        rawCourse &&
        (cleanAlphaNum(rawCourse).includes("PHARM") ||
          cleanAlphaNum(rawCourse) === "BPHARM" ||
          cleanAlphaNum(rawCourse) === "DPHARM")
      ) {
        institutionId = rbcpInstitution?.id ?? null;
      } else if (
        rawCourse &&
        (cleanAlphaNum(rawCourse).includes("NURS") || cleanAlphaNum(rawCourse).includes("GNM"))
      ) {
        institutionId = rbcnInstitution?.id ?? null;
      } else if (
        rawCourse &&
        ["MBA", "BBA", "MCA", "BCA", "BSC", "BCOM"].some((p) =>
          cleanAlphaNum(rawCourse).startsWith(p),
        )
      ) {
        institutionId = rbmiInstitution?.id ?? null;
      } else if (courseId) {
        const crs = courses.find((c: { id: number }) => c.id === courseId);
        if (crs?.institutionId) {
          institutionId = crs.institutionId;
        }
      } else if (departmentId) {
        const dept = departments.find((d: { id: number }) => d.id === departmentId);
        if (dept?.institutionId) {
          institutionId = dept.institutionId;
        }
      }
    }

    // Auto-infer department from course if department not provided:
    if (!departmentId && courseId) {
      const crs = courses.find((c: { id: number }) => c.id === courseId);
      if (crs) {
        const matchDept = departments.find(
          (d: { code: string; institutionId: number }) =>
            d.code.toUpperCase() === crs.code.toUpperCase() ||
            (isBTech && d.code.toUpperCase() === "BTECH"),
        );
        if (matchDept) {
          departmentId = matchDept.id;
        }
      }
    }

    // --- Academic year, semester, section ---
    let academicYear: number | null = null;
    const rawYear = resolveField("year", ["academic_year"]);
    if (rawYear) {
      const parsed = parseInt(rawYear, 10);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 5) {
        academicYear = parsed;
      }
    }

    let semester: number | null = null;
    const rawSem = resolveField("semester", ["sem"]);
    if (rawSem) {
      const parsed = parseInt(rawSem, 10);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 10) {
        semester = parsed;
      }
    }

    const section = truncate(resolveField("section"), DB_TEXT_LIMITS.SECTION);

    // --- Gender ---
    let gender: string | null = null;
    const rawGender = resolveField("gender", ["sex"]);
    if (rawGender) {
      const g = rawGender.trim().toUpperCase();
      if (g.startsWith("M")) gender = "M";
      else if (g.startsWith("F")) gender = "F";
      else gender = "O";
    }

    // --- Dates ---
    const dob = parseCsvDate(resolveField("dob", ["date_of_birth"]));
    const admissionDate =
      parseCsvDate(resolveField("admission_date", ["joining_date", "date_of_joining", "doj"])) ||
      new Date().toISOString().split("T")[0];
    const courseEndDate = parseCsvDate(resolveField("course_end_date", ["end_date"]));

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
    const rawMobile = resolveField("mobile", ["phone", "mobile_no", "contact"]);
    if (rawMobile) {
      const cleaned = cleanPhoneNumber(rawMobile);
      mobile = truncate(cleaned.number, DB_TEXT_LIMITS.MOBILE);
      if (!cleaned.isValid10Digit) {
        messages.push(`Phone "${rawMobile}" is not a standard 10-digit number; retained`);
      }
    }

    let email: string | null = null;
    const rawEmail = resolveField("email", ["email_id"]);
    if (rawEmail) {
      email = truncate(rawEmail.toLowerCase(), DB_TEXT_LIMITS.EMAIL);
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(rawEmail)) {
        messages.push(`Email "${rawEmail}" is not in valid format; retained`);
      }
    }

    const address = truncate(resolveField("address"), DB_TEXT_LIMITS.ADDRESS);
    const fatherName = truncate(
      resolveField("father_name", ["fathers_name"]),
      DB_TEXT_LIMITS.FATHER_NAME,
    );

    // --- Password ---
    const plainPassword =
      resolveField("password", ["initial_password"]) || (cardNo ?? "defaultPass123");

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
        libraryId: options.defaultLibraryId ?? null,
        institutionId,
        institutionCode: resolvedInst ? resolvedInst.code : null,
        institutionName: resolvedInst?.name ?? null,
        departmentId,
        departmentCode: resolvedDept?.code ?? rawDept ?? null,
        courseId,
        courseCode:
          resolvedCrs?.code ?? (isBTech ? "BTECH" : rawCourse ? cleanAlphaNum(rawCourse) : null),
        courseName:
          resolvedCrs?.name ?? (isBTech ? "Bachelor of Technology (B.Tech)" : (rawCourse ?? null)),
        employeeId,
        name: [firstName, middleName, lastName].filter(Boolean).join(" "),
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

  // Create batch record initially to link all imported patrons
  const [batch] = await db
    .insert(schema.importBatches)
    .values({
      importType: preview.importType,
      fileName: preview.fileName,
      totalRows: preview.summary.totalRows,
      importedRows: 0,
      skippedRows: 0,
      importedBy: actor.id,
    })
    .returning();

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
        let cardNo = patronData.cardNo;
        if (!cardNo || cardNo === "[Auto-Allocated]") {
          const seqRes: any = await tx.execute(sql`SELECT nextval('seq_card_no') as next_val`);
          const seqRows = Array.isArray(seqRes) ? seqRes : (seqRes?.rows ?? []);
          const nextVal = Number(seqRows[0]?.next_val ?? 1);
          cardNo = formatCardNumber("LIB", nextVal);
        }

        const rawPassword =
          patronData.plainPassword === "[Auto-Allocated]" || !patronData.plainPassword
            ? cardNo
            : patronData.plainPassword;
        const passwordHash = hashPassword(rawPassword);

        const [created] = await tx
          .insert(schema.patrons)
          .values({
            cardNo,
            libraryId: patronData.libraryId ?? null,
            patronType: patronData.patronType,
            categoryId: patronData.categoryId,
            institutionId: patronData.institutionId,
            departmentId: patronData.departmentId,
            courseId: patronData.courseId,
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
            username: cardNo,
            passwordHash,
            mustChangePassword: true,
            importBatchId: batch.id,
          })
          .returning();

        return created;
      });

      importedPatrons.push({
        id: inserted.id,
        cardNo: inserted.cardNo,
        fullName: `${inserted.firstName} ${inserted.lastName || ""}`.trim(),
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

  // Update batch metadata with final counts
  await db
    .update(schema.importBatches)
    .set({
      importedRows: importedPatrons.length,
      skippedRows: skippedRows.length,
    })
    .where(eq(schema.importBatches.id, batch.id));

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
