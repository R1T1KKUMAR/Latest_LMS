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
  departmentId?: number | null;
  courseId?: number | null;
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

    // --- Patron Category ---
    let category = defaultCategory;
    const rawCat = getFieldValue(raw, "category", ["patron_category", "cat"]);
    if (rawCat) {
      const found = categoryByCode.get(rawCat.toUpperCase());
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
    }

    if (!category) {
      messages.push("Could not resolve patron category");
      isError = true;
    }

    // --- Institute, Course, Department lookups ---
    let institutionId = options.defaultInstitutionId ?? null;
    const rawInst = getFieldValue(raw, "institute", ["institution", "college"]);
    if (rawInst) {
      const found = institutionByCode.get(rawInst.toUpperCase());
      if (found) {
        institutionId = found.id;
      } else {
        messages.push(`Unknown institution "${rawInst}"; field set to null`);
      }
    }

    let departmentId: number | null = null;
    const rawDept = getFieldValue(raw, "department", ["branch", "dept"]);
    if (rawDept) {
      const found = departmentByCode.get(rawDept.toUpperCase());
      if (found) {
        departmentId = found.id;
      } else {
        messages.push(`Unknown department "${rawDept}"; field set to null`);
      }
    }

    let courseId: number | null = null;
    const rawCourse = getFieldValue(raw, "course", ["program", "degree"]);
    if (rawCourse) {
      const found = courseByCode.get(rawCourse.toUpperCase());
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
      data = {
        rowNumber,
        cardNo,
        patronType: (category.patronType as "STUDENT" | "FACULTY" | "STAFF") ?? "STUDENT",
        categoryId: category.id,
        categoryCode: category.code,
        institutionId,
        departmentId,
        courseId,
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
