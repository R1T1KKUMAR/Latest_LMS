import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import * as schema from "@/db/schema";
import { hashPassword } from "@/lib/crypto";
import { calculateCardExpiry, formatCardNumber } from "@/lib/numbering";
import {
  type PatronStatus,
  type RegisterPatronInput,
  registerPatronSchema,
  type UpdatePatronInput,
  updatePatronSchema,
} from "@/lib/validations/patron";
import { recordAuditLog } from "./audit";
import { invalidateAllUserSessions } from "./session";

// biome-ignore lint/suspicious/noExplicitAny: generic DB instance support
type DbInstance = any;

interface Actor {
  id: number;
  fullName: string;
  ipAddress?: string;
}

/**
 * Registers a new patron (FR-PA-01, FR-PA-02, FR-PA-03).
 * Auto-allocates card number, calculates card expiry, and seeds default Argon2id password hash.
 */
export async function registerPatron(
  input: RegisterPatronInput,
  actor: Actor,
  db: DbInstance = defaultDb,
) {
  const parsed = registerPatronSchema.parse(input);

  // 1. Fetch category to determine validity years and patron type
  const [category] = await db
    .select()
    .from(schema.patronCategories)
    .where(eq(schema.patronCategories.id, parsed.categoryId))
    .limit(1);

  if (!category || !category.isActive) {
    throw new Error(`Patron category #${parsed.categoryId} is invalid or inactive`);
  }

  // 2. Check duplicate employee_id (for faculty/staff)
  if (parsed.employeeId) {
    const [existing] = await db
      .select({ id: schema.patrons.id })
      .from(schema.patrons)
      .where(eq(schema.patrons.employeeId, parsed.employeeId))
      .limit(1);
    if (existing) {
      throw new Error(`A patron with employee ID "${parsed.employeeId}" is already registered`);
    }
  }

  // 3. Resolve Card Number (FR-PA-02):
  // Defaults to cardNo or employee employee_id; else CARD_PREFIX + 6 digits from sequence
  let cardNo: string;
  if (parsed.cardNo?.trim()) {
    cardNo = parsed.cardNo.trim().toUpperCase();
  } else if (
    (parsed.patronType === "FACULTY" || parsed.patronType === "STAFF") &&
    parsed.employeeId?.trim()
  ) {
    cardNo = parsed.employeeId.trim().toUpperCase();
  } else {
    // Generate from seq_card_no sequence
    // biome-ignore lint/suspicious/noExplicitAny: supports both postgres.js array and pglite { rows }
    const seqRes: any = await db.execute(sql`SELECT nextval('seq_card_no') as next_val`);
    const rows = Array.isArray(seqRes) ? seqRes : (seqRes?.rows ?? []);
    const nextVal = Number(rows[0]?.next_val ?? 1);
    cardNo = formatCardNumber("LIB", nextVal);
  }

  // Check cardNo uniqueness
  const [existingCard] = await db
    .select({ id: schema.patrons.id })
    .from(schema.patrons)
    .where(eq(schema.patrons.cardNo, cardNo))
    .limit(1);

  if (existingCard) {
    throw new Error(`Library card number "${cardNo}" is already assigned to another patron`);
  }

  // 4. Calculate card expiry date (FR-PA-03)
  let cardExpiry: Date;
  if (parsed.cardExpiry) {
    cardExpiry = new Date(parsed.cardExpiry);
  } else {
    cardExpiry = calculateCardExpiry({
      courseEndDate: parsed.courseEndDate,
      admissionDate: parsed.admissionDate,
      cardValidityYears: category.cardValidityYears,
    });
  }

  // 5. Initial password equals card number, hashed with Argon2id (FR-AU-05, FR-PA-05)
  const initialPassword = cardNo;
  const passwordHash = hashPassword(initialPassword);

  const [created] = await db
    .insert(schema.patrons)
    .values({
      cardNo,
      libraryId: parsed.libraryId ?? null,
      patronType: parsed.patronType,
      categoryId: parsed.categoryId,
      institutionId: parsed.institutionId,
      departmentId: parsed.departmentId,
      courseId: parsed.courseId,
      employeeId: parsed.employeeId,
      firstName: parsed.firstName,
      middleName: parsed.middleName,
      lastName: parsed.lastName,
      gender: parsed.gender,
      dob: parsed.dob ? sql`${parsed.dob}::date` : null,
      fatherName: parsed.fatherName,
      mobile: parsed.mobile,
      email: parsed.email,
      address: parsed.address,
      academicYear: parsed.academicYear,
      semester: parsed.semester,
      section: parsed.section,
      admissionDate: parsed.admissionDate ? sql`${parsed.admissionDate}::date` : null,
      courseEndDate: parsed.courseEndDate ? sql`${parsed.courseEndDate}::date` : null,
      cardExpiry: sql`${cardExpiry.toISOString().split("T")[0]}::date`,
      status: "ACTIVE",
      username: cardNo,
      passwordHash,
      mustChangePassword: true,
    })
    .returning();

  await recordAuditLog(
    {
      actorType: "STAFF",
      actorId: actor.id,
      actorName: actor.fullName,
      action: "PATRON_CREATE",
      entity: "patrons",
      entityId: String(created.id),
      details: `Registered patron ${created.firstName} ${created.lastName || ""} (Card: ${created.cardNo}, Type: ${created.patronType})`,
      ipAddress: actor.ipAddress,
    },
    db,
  );

  return created;
}

/**
 * Updates an existing patron profile (FR-PA-06).
 */
export async function updatePatron(
  id: number,
  input: UpdatePatronInput,
  actor: Actor,
  db: DbInstance = defaultDb,
) {
  const parsed = updatePatronSchema.parse(input);

  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (parsed.categoryId !== undefined) updateData.categoryId = parsed.categoryId;
  if (parsed.libraryId !== undefined) updateData.libraryId = parsed.libraryId;
  if (parsed.departmentId !== undefined) updateData.departmentId = parsed.departmentId;
  if (parsed.courseId !== undefined) updateData.courseId = parsed.courseId;
  if (parsed.firstName !== undefined) updateData.firstName = parsed.firstName;
  if (parsed.middleName !== undefined) updateData.middleName = parsed.middleName;
  if (parsed.lastName !== undefined) updateData.lastName = parsed.lastName;
  if (parsed.gender !== undefined) updateData.gender = parsed.gender;
  if (parsed.dob !== undefined) updateData.dob = parsed.dob ? sql`${parsed.dob}::date` : null;
  if (parsed.fatherName !== undefined) updateData.fatherName = parsed.fatherName;
  if (parsed.mobile !== undefined) updateData.mobile = parsed.mobile;
  if (parsed.email !== undefined) updateData.email = parsed.email;
  if (parsed.address !== undefined) updateData.address = parsed.address;
  if (parsed.academicYear !== undefined) updateData.academicYear = parsed.academicYear;
  if (parsed.semester !== undefined) updateData.semester = parsed.semester;
  if (parsed.section !== undefined) updateData.section = parsed.section;
  if (parsed.cardExpiry !== undefined) {
    updateData.cardExpiry = parsed.cardExpiry ? sql`${parsed.cardExpiry}::date` : undefined;
  }
  if (parsed.status !== undefined) updateData.status = parsed.status;

  const [updated] = await db
    .update(schema.patrons)
    .set(updateData)
    .where(eq(schema.patrons.id, id))
    .returning();

  if (!updated) {
    throw new Error(`Patron #${id} not found`);
  }

  await recordAuditLog(
    {
      actorType: "STAFF",
      actorId: actor.id,
      actorName: actor.fullName,
      action: "PATRON_UPDATE",
      entity: "patrons",
      entityId: String(id),
      details: `Updated profile for patron ${updated.firstName} ${updated.lastName || ""} (${updated.cardNo})`,
      ipAddress: actor.ipAddress,
    },
    db,
  );

  return updated;
}

/**
 * Changes patron account status (FR-PA-06).
 * States: ACTIVE, BLOCKED, EXPIRED, GRADUATED, LEFT.
 * Note: Patrons are never deleted per FR-PA-08.
 */
export async function changePatronStatus(
  id: number,
  newStatus: PatronStatus,
  reason: string | undefined,
  actor: Actor,
  db: DbInstance = defaultDb,
) {
  const [updated] = await db
    .update(schema.patrons)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(eq(schema.patrons.id, id))
    .returning();

  if (!updated) {
    throw new Error(`Patron #${id} not found`);
  }

  // If patron is blocked, graduated, or left, terminate active sessions
  if (newStatus !== "ACTIVE") {
    await invalidateAllUserSessions("PATRON", id, db);
  }

  await recordAuditLog(
    {
      actorType: "STAFF",
      actorId: actor.id,
      actorName: actor.fullName,
      action: "PATRON_STATUS_CHANGE",
      entity: "patrons",
      entityId: String(id),
      details: `Changed status to ${newStatus} for patron ${updated.cardNo}${reason ? `. Reason: ${reason}` : ""}`,
      ipAddress: actor.ipAddress,
    },
    db,
  );

  return updated;
}

/**
 * Resets patron password to their default card number and forces password change on next login (FR-PA-06).
 */
export async function resetPatronPassword(id: number, actor: Actor, db: DbInstance = defaultDb) {
  const [patron] = await db
    .select({ id: schema.patrons.id, cardNo: schema.patrons.cardNo })
    .from(schema.patrons)
    .where(eq(schema.patrons.id, id))
    .limit(1);

  if (!patron) {
    throw new Error(`Patron #${id} not found`);
  }

  const defaultPassword = patron.cardNo;
  const newHash = hashPassword(defaultPassword);

  await db
    .update(schema.patrons)
    .set({
      passwordHash: newHash,
      mustChangePassword: true,
      updatedAt: new Date(),
    })
    .where(eq(schema.patrons.id, id));

  // Invalidate any active sessions
  await invalidateAllUserSessions("PATRON", id, db);

  await recordAuditLog(
    {
      actorType: "STAFF",
      actorId: actor.id,
      actorName: actor.fullName,
      action: "PATRON_PASSWORD_RESET",
      entity: "patrons",
      entityId: String(id),
      details: `Reset password for patron ${patron.cardNo} to default card number`,
      ipAddress: actor.ipAddress,
    },
    db,
  );

  return { success: true, cardNo: patron.cardNo };
}

/**
 * Retrieves full patron profile with loan and fine statistics (FR-PA-05).
 */
export async function getPatronById(id: number, db: DbInstance = defaultDb) {
  const [patron] = await db
    .select({
      id: schema.patrons.id,
      cardNo: schema.patrons.cardNo,
      patronType: schema.patrons.patronType,
      categoryId: schema.patrons.categoryId,
      categoryName: schema.patronCategories.name,
      institutionId: schema.patrons.institutionId,
      institutionName: schema.institutions.name,
      departmentId: schema.patrons.departmentId,
      departmentName: schema.departments.name,
      courseId: schema.patrons.courseId,
      courseName: schema.courses.name,
      libraryId: schema.patrons.libraryId,
      libraryCode: schema.libraries.code,
      libraryName: schema.libraries.name,
      employeeId: schema.patrons.employeeId,
      firstName: schema.patrons.firstName,
      middleName: schema.patrons.middleName,
      lastName: schema.patrons.lastName,
      gender: schema.patrons.gender,
      dob: schema.patrons.dob,
      fatherName: schema.patrons.fatherName,
      mobile: schema.patrons.mobile,
      email: schema.patrons.email,
      address: schema.patrons.address,
      academicYear: schema.patrons.academicYear,
      semester: schema.patrons.semester,
      section: schema.patrons.section,
      admissionDate: schema.patrons.admissionDate,
      courseEndDate: schema.patrons.courseEndDate,
      cardExpiry: schema.patrons.cardExpiry,
      status: schema.patrons.status,
      username: schema.patrons.username,
      mustChangePassword: schema.patrons.mustChangePassword,
      createdAt: schema.patrons.createdAt,
    })
    .from(schema.patrons)
    .innerJoin(schema.patronCategories, eq(schema.patrons.categoryId, schema.patronCategories.id))
    .leftJoin(schema.institutions, eq(schema.patrons.institutionId, schema.institutions.id))
    .leftJoin(schema.departments, eq(schema.patrons.departmentId, schema.departments.id))
    .leftJoin(schema.courses, eq(schema.patrons.courseId, schema.courses.id))
    .leftJoin(schema.libraries, eq(schema.patrons.libraryId, schema.libraries.id))
    .where(eq(schema.patrons.id, id))
    .limit(1);

  if (!patron) return null;

  // Active loans count and overdues
  const [loansRes] = await db
    .select({
      activeLoans: sql<number>`count(case when ${schema.loans.status} = 'ISSUED' then 1 end)::int`,
      overdueLoans: sql<number>`count(case when ${schema.loans.status} = 'ISSUED' and ${schema.loans.dueDate} < CURRENT_DATE then 1 end)::int`,
    })
    .from(schema.loans)
    .where(eq(schema.loans.patronId, id));

  // Outstanding fines
  const [finesRes] = await db
    .select({
      outstandingFines: sql<string>`COALESCE(SUM(amount - paid_amount), 0)`,
    })
    .from(schema.fines)
    .where(and(eq(schema.fines.patronId, id), eq(schema.fines.status, "OUTSTANDING")));

  return {
    ...patron,
    stats: {
      activeLoans: loansRes?.activeLoans ?? 0,
      overdueLoans: loansRes?.overdueLoans ?? 0,
      outstandingFines: Number(finesRes?.outstandingFines ?? 0),
    },
  };
}

/**
 * Searches and paginates patrons (FR-PA-04, UI-4).
 */
export async function listPatrons(
  options: {
    search?: string;
    categoryId?: number;
    libraryId?: number;
    patronType?: string;
    status?: string;
    departmentId?: number;
    institutionId?: number;
    courseId?: number;
    academicYear?: number;
    semester?: number;
    page?: number;
    limit?: number;
  } = {},
  db: DbInstance = defaultDb,
) {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 25));
  const offset = (page - 1) * limit;

  const conditions = [];

  if (options.search?.trim()) {
    const term = `%${options.search.trim()}%`;
    conditions.push(
      or(
        ilike(schema.patrons.cardNo, term),
        ilike(schema.patrons.firstName, term),
        ilike(schema.patrons.lastName, term),
        ilike(schema.patrons.employeeId, term),
        ilike(schema.patrons.email, term),
        ilike(schema.patrons.mobile, term),
      ),
    );
  }

  if (options.categoryId) {
    conditions.push(eq(schema.patrons.categoryId, options.categoryId));
  }

  if (options.libraryId) {
    conditions.push(eq(schema.patrons.libraryId, options.libraryId));
  }

  if (options.patronType) {
    conditions.push(eq(schema.patrons.patronType, options.patronType));
  }

  if (options.status) {
    conditions.push(eq(schema.patrons.status, options.status));
  }

  if (options.departmentId) {
    conditions.push(eq(schema.patrons.departmentId, options.departmentId));
  }

  if (options.institutionId) {
    conditions.push(eq(schema.departments.institutionId, options.institutionId));
  }

  if (options.courseId) {
    conditions.push(eq(schema.patrons.courseId, options.courseId));
  }

  if (options.academicYear) {
    conditions.push(eq(schema.patrons.academicYear, options.academicYear));
  }

  if (options.semester) {
    conditions.push(eq(schema.patrons.semester, options.semester));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [countRes] = await db
    .select({ total: sql<number>`count(${schema.patrons.id})::int` })
    .from(schema.patrons)
    .where(whereClause);

  const totalCount = countRes?.total ?? 0;
  const totalPages = Math.ceil(totalCount / limit);

  const records = await db
    .select({
      id: schema.patrons.id,
      cardNo: schema.patrons.cardNo,
      firstName: schema.patrons.firstName,
      lastName: schema.patrons.lastName,
      patronType: schema.patrons.patronType,
      categoryId: schema.patrons.categoryId,
      categoryName: schema.patronCategories.name,
      libraryId: schema.patrons.libraryId,
      libraryCode: schema.libraries.code,
      libraryName: schema.libraries.name,
      institutionId: schema.patrons.institutionId,
      institutionCode: schema.institutions.code,
      institutionName: schema.institutions.name,
      courseId: schema.patrons.courseId,
      courseCode: schema.courses.code,
      courseName: schema.courses.name,
      departmentId: schema.patrons.departmentId,
      departmentName: schema.departments.name,
      academicYear: schema.patrons.academicYear,
      semester: schema.patrons.semester,
      section: schema.patrons.section,
      email: schema.patrons.email,
      mobile: schema.patrons.mobile,
      employeeId: schema.patrons.employeeId,
      cardExpiry: schema.patrons.cardExpiry,
      status: schema.patrons.status,
      createdAt: schema.patrons.createdAt,
    })
    .from(schema.patrons)
    .innerJoin(schema.patronCategories, eq(schema.patrons.categoryId, schema.patronCategories.id))
    .leftJoin(schema.institutions, eq(schema.patrons.institutionId, schema.institutions.id))
    .leftJoin(schema.courses, eq(schema.patrons.courseId, schema.courses.id))
    .leftJoin(schema.departments, eq(schema.patrons.departmentId, schema.departments.id))
    .leftJoin(schema.libraries, eq(schema.patrons.libraryId, schema.libraries.id))
    .where(whereClause)
    .orderBy(desc(schema.patrons.createdAt))
    .limit(limit)
    .offset(offset);

  return {
    records,
    pagination: {
      page,
      limit,
      totalCount,
      totalPages,
    },
  };
}

/**
 * Permanently removes/deletes a patron record (Student or Faculty/Staff).
 * Allows admin/librarian to purge test data or wrong entries safely.
 */
export async function deletePatron(
  id: number,
  actor: Actor,
  options: { force?: boolean } = {},
  db: DbInstance = defaultDb,
) {
  // 1. Fetch patron
  const [patron] = await db
    .select({
      id: schema.patrons.id,
      cardNo: schema.patrons.cardNo,
      firstName: schema.patrons.firstName,
      lastName: schema.patrons.lastName,
      patronType: schema.patrons.patronType,
      employeeId: schema.patrons.employeeId,
    })
    .from(schema.patrons)
    .where(eq(schema.patrons.id, id))
    .limit(1);

  if (!patron) {
    throw new Error(`Patron #${id} not found`);
  }

  const patronName = `${patron.firstName} ${patron.lastName || ""}`.trim();

  // 2. Check for active unreturned loans
  const activeLoans = await db
    .select({
      id: schema.loans.id,
      itemId: schema.loans.itemId,
      barcode: schema.items.barcode,
      title: schema.bibRecords.title,
    })
    .from(schema.loans)
    .innerJoin(schema.items, eq(schema.loans.itemId, schema.items.id))
    .innerJoin(schema.bibRecords, eq(schema.items.bibId, schema.bibRecords.id))
    .where(and(eq(schema.loans.patronId, id), eq(schema.loans.status, "ISSUED")));

  if (activeLoans.length > 0) {
    if (!options.force) {
      const titles = activeLoans.map((l: { title: string; barcode: string }) => `"${l.title}" (${l.barcode})`).join(", ");
      throw new Error(
        `Cannot delete patron "${patronName}" (${patron.cardNo}) because they currently have ${activeLoans.length} book(s) issued: ${titles}. Please return books first, or use force deletion.`,
      );
    }
    // If force is enabled (e.g. purging test data), reset the item statuses back to AVAILABLE
    for (const loan of activeLoans) {
      await db
        .update(schema.items)
        .set({ status: "AVAILABLE", updatedAt: new Date() })
        .where(eq(schema.items.id, loan.itemId));
    }
  }

  // 3. Check for outstanding unpaid fines
  const outstandingFines = await db
    .select({ id: schema.fines.id, amount: schema.fines.amount })
    .from(schema.fines)
    .where(and(eq(schema.fines.patronId, id), eq(schema.fines.status, "OUTSTANDING")));

  if (outstandingFines.length > 0 && !options.force) {
    throw new Error(
      `Cannot delete patron "${patronName}" (${patron.cardNo}) because they have ${outstandingFines.length} outstanding unpaid fine(s). Please clear or waive fines first, or use force deletion.`,
    );
  }

  // 4. In a transaction, cleanly remove all related child records and the patron
  await db.transaction(async (tx: DbInstance) => {
    // Delete active sessions
    await tx
      .delete(schema.sessions)
      .where(and(eq(schema.sessions.userType, "PATRON"), eq(schema.sessions.userId, id)));

    // Delete holds
    await tx.delete(schema.holds).where(eq(schema.holds.patronId, id));

    // Delete payments
    await tx.delete(schema.payments).where(eq(schema.payments.patronId, id));

    // Delete fines
    await tx.delete(schema.fines).where(eq(schema.fines.patronId, id));

    // Delete loans
    await tx.delete(schema.loans).where(eq(schema.loans.patronId, id));

    // Delete patron record
    await tx.delete(schema.patrons).where(eq(schema.patrons.id, id));
  });

  // 5. Record audit log
  await recordAuditLog(
    {
      actorType: "STAFF",
      actorId: actor.id,
      actorName: actor.fullName,
      action: "PATRON_DELETE",
      entity: "patrons",
      entityId: String(id),
      details: `Permanently deleted patron ${patronName} (Card: ${patron.cardNo}, Type: ${patron.patronType}${patron.employeeId ? `, Emp: ${patron.employeeId}` : ""})`,
      ipAddress: actor.ipAddress,
    },
    db,
  );

  return {
    success: true,
    deletedId: id,
    cardNo: patron.cardNo,
    fullName: patronName,
    message: `Patron "${patronName}" (${patron.cardNo}) deleted successfully.`,
  };
}
