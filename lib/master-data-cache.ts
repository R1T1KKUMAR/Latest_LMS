import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import type { StudentRosterItem } from "@/components/patrons/InstitutionalStudentRoster";

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes RAM cache
const cacheStore = new Map<string, CacheEntry<unknown>>();

async function getOrSetCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = DEFAULT_CACHE_TTL_MS,
): Promise<T> {
  const existing = cacheStore.get(key);
  const now = Date.now();
  if (existing && now - existing.timestamp < existing.ttl) {
    return existing.data as T;
  }
  const fresh = await fetcher();
  cacheStore.set(key, { data: fresh, timestamp: now, ttl: ttlMs });
  return fresh;
}

export function invalidateCacheKey(key: string) {
  cacheStore.delete(key);
}

export async function getCachedInstitutions() {
  return getOrSetCache("institutions", async () => {
    return db
      .select({
        id: schema.institutions.id,
        name: schema.institutions.name,
        code: schema.institutions.code,
      })
      .from(schema.institutions)
      .where(eq(schema.institutions.isActive, true))
      .orderBy(schema.institutions.name);
  });
}

export async function getCachedItemTypes() {
  return getOrSetCache("item_types", async () => {
    return db
      .select({
        id: schema.itemTypes.id,
        name: schema.itemTypes.name,
        code: schema.itemTypes.code,
      })
      .from(schema.itemTypes)
      .where(eq(schema.itemTypes.isActive, true));
  });
}

export async function getCachedDepartments() {
  return getOrSetCache("departments", async () => {
    return db
      .select({
        id: schema.departments.id,
        institutionId: schema.departments.institutionId,
        name: schema.departments.name,
        code: schema.departments.code,
      })
      .from(schema.departments)
      .where(eq(schema.departments.isActive, true))
      .orderBy(schema.departments.name);
  });
}

export async function getCachedLibraries() {
  return getOrSetCache("libraries", async () => {
    return db
      .select({
        id: schema.libraries.id,
        name: schema.libraries.name,
        code: schema.libraries.code,
        isLibrarianAvailable: schema.libraries.isLibrarianAvailable,
      })
      .from(schema.libraries)
      .where(eq(schema.libraries.isActive, true))
      .orderBy(schema.libraries.id);
  });
}

export async function getCachedCourses() {
  return getOrSetCache("courses", async () => {
    return db
      .select({
        id: schema.courses.id,
        name: schema.courses.name,
        code: schema.courses.code,
        institutionId: schema.courses.institutionId,
      })
      .from(schema.courses)
      .where(eq(schema.courses.isActive, true))
      .orderBy(schema.courses.name);
  });
}

export async function getCachedPatronCategories() {
  return getOrSetCache("patron_categories", async () => {
    return db
      .select({
        id: schema.patronCategories.id,
        name: schema.patronCategories.name,
        code: schema.patronCategories.code,
        patronType: schema.patronCategories.patronType,
      })
      .from(schema.patronCategories)
      .where(eq(schema.patronCategories.isActive, true))
      .orderBy(schema.patronCategories.name);
  });
}

/**
 * Cached Institutional Student Roster (used across Dashboard and Admin Portal)
 * Eliminates repeated 1.5s heavy 4-way join across all students.
 */
export async function getCachedStudentRoster(libraryId?: number): Promise<StudentRosterItem[]> {
  const cacheKey = libraryId ? `student_roster_${libraryId}` : "student_roster";
  return getOrSetCache(
    cacheKey,
    async () => {
      const baseConditions = [eq(schema.patrons.patronType, "STUDENT")];
      if (libraryId) {
        baseConditions.push(eq(schema.patrons.libraryId, libraryId));
      }

      const rawStudents = await db
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
        })
        .from(schema.patrons)
        .innerJoin(
          schema.patronCategories,
          eq(schema.patrons.categoryId, schema.patronCategories.id),
        )
        .leftJoin(schema.institutions, eq(schema.patrons.institutionId, schema.institutions.id))
        .leftJoin(schema.courses, eq(schema.patrons.courseId, schema.courses.id))
        .leftJoin(schema.departments, eq(schema.patrons.departmentId, schema.departments.id))
        .leftJoin(schema.libraries, eq(schema.patrons.libraryId, schema.libraries.id))
        .where(baseConditions.length > 1 ? and(...baseConditions) : baseConditions[0])
        .orderBy(schema.patrons.cardNo);

      return rawStudents.map((s) => ({
        id: s.id,
        cardNo: s.cardNo,
        fullName: [s.firstName, s.lastName].filter(Boolean).join(" "),
        patronType: s.patronType,
        categoryId: s.categoryId,
        categoryName: s.categoryName,
        libraryId: s.libraryId,
        libraryCode: s.libraryCode,
        libraryName: s.libraryName,
        institutionId: s.institutionId,
        institutionCode: s.institutionCode,
        institutionName: s.institutionName,
        courseId: s.courseId,
        courseCode: s.courseCode,
        courseName: s.courseName,
        departmentId: s.departmentId,
        departmentName: s.departmentName,
        academicYear: s.academicYear,
        semester: s.semester,
        section: s.section,
        email: s.email,
        mobile: s.mobile,
        employeeId: s.employeeId,
        cardExpiry: String(s.cardExpiry),
        status: s.status,
      }));
    },
    60 * 1000, // 60s RAM cache
  );
}

export function invalidateStudentRosterCache() {
  for (const k of cacheStore.keys()) {
    if (k.startsWith("student_roster") || k.startsWith("patron_list")) {
      cacheStore.delete(k);
    }
  }
}

/**
 * Cached Full Patron Directory (used on /patrons page)
 */
export async function getCachedPatronList(libraryId?: number) {
  const cacheKey = libraryId ? `patron_list_${libraryId}` : "patron_list";
  return getOrSetCache(
    cacheKey,
    async () => {
      const query = db
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
          departmentCode: schema.departments.code,
          departmentName: schema.departments.name,
          academicYear: schema.patrons.academicYear,
          semester: schema.patrons.semester,
          section: schema.patrons.section,
          email: schema.patrons.email,
          mobile: schema.patrons.mobile,
          employeeId: schema.patrons.employeeId,
          cardExpiry: schema.patrons.cardExpiry,
          status: schema.patrons.status,
        })
        .from(schema.patrons)
        .innerJoin(
          schema.patronCategories,
          eq(schema.patrons.categoryId, schema.patronCategories.id),
        )
        .leftJoin(schema.institutions, eq(schema.patrons.institutionId, schema.institutions.id))
        .leftJoin(schema.courses, eq(schema.patrons.courseId, schema.courses.id))
        .leftJoin(schema.departments, eq(schema.patrons.departmentId, schema.departments.id))
        .leftJoin(schema.libraries, eq(schema.patrons.libraryId, schema.libraries.id))
        .orderBy(desc(schema.patrons.createdAt));

      const rawPatrons = libraryId
        ? await query.where(eq(schema.patrons.libraryId, libraryId))
        : await query;

      return rawPatrons.map((p) => ({
        id: p.id,
        cardNo: p.cardNo,
        fullName: [p.firstName, p.lastName].filter(Boolean).join(" "),
        patronType: p.patronType,
        categoryId: p.categoryId,
        categoryName: p.categoryName,
        libraryId: p.libraryId,
        libraryCode: p.libraryCode,
        libraryName: p.libraryName,
        institutionId: p.institutionId,
        institutionCode: p.institutionCode,
        institutionName: p.institutionName,
        courseId: p.courseId,
        courseCode: p.courseCode,
        courseName: p.courseName,
        departmentId: p.departmentId,
        departmentCode: p.departmentCode,
        departmentName: p.departmentName,
        academicYear: p.academicYear,
        semester: p.semester,
        section: p.section,
        email: p.email,
        mobile: p.mobile,
        employeeId: p.employeeId,
        cardExpiry: String(p.cardExpiry),
        status: p.status,
      }));
    },
    60 * 1000, // 60s RAM cache
  );
}

/**
 * Cached Recent Loans (used across circulation tabs & dashboard)
 */
export async function getCachedRecentLoans(limit = 50, libraryId?: number) {
  const cacheKey = libraryId ? `recent_loans_${limit}_${libraryId}` : `recent_loans_${limit}`;
  return getOrSetCache(
    cacheKey,
    async () => {
      const conditions = [eq(schema.loans.status, "ISSUED")];
      if (libraryId) {
        conditions.push(eq(schema.loans.libraryId, libraryId));
      }

      const rows = await db
        .select({
          id: schema.loans.id,
          issueDate: schema.loans.issueDate,
          dueDate: schema.loans.dueDate,
          status: schema.loans.status,
          libraryId: schema.loans.libraryId,
          libraryName: schema.libraries.name,
          firstName: schema.patrons.firstName,
          lastName: schema.patrons.lastName,
          patronCard: schema.patrons.cardNo,
          title: schema.bibRecords.title,
          accessionNo: schema.items.accessionNo,
        })
        .from(schema.loans)
        .innerJoin(schema.patrons, eq(schema.loans.patronId, schema.patrons.id))
        .innerJoin(schema.items, eq(schema.loans.itemId, schema.items.id))
        .innerJoin(schema.bibRecords, eq(schema.items.bibId, schema.bibRecords.id))
        .leftJoin(schema.libraries, eq(schema.loans.libraryId, schema.libraries.id))
        .where(conditions.length > 1 ? and(...conditions) : conditions[0])
        .orderBy(desc(schema.loans.issueDate))
        .limit(limit);

      return rows.map((l) => ({
        id: l.id,
        issueDate: String(l.issueDate),
        dueDate: String(l.dueDate),
        status: l.status,
        libraryId: l.libraryId,
        libraryName: l.libraryName,
        firstName: l.firstName,
        lastName: l.lastName,
        patronName: [l.firstName, l.lastName].filter(Boolean).join(" "),
        patronCard: l.patronCard,
        title: l.title,
        accessionNo: l.accessionNo,
      }));
    },
    15 * 1000, // 15s RAM cache
  );
}

export function invalidateRecentLoansCache() {
  for (const k of cacheStore.keys()) {
    if (k.startsWith("recent_loans")) {
      cacheStore.delete(k);
    }
  }
}

/**
 * Consolidated Admin Statistics (single query, cached 30s)
 */
export async function getCachedAdminStats() {
  return getOrSetCache(
    "admin_stats",
    async () => {
      const rows = await db.execute<{
        userCount: number;
        auditCount: number;
        libraryCount: number;
        bookCount: number;
        titleCount: number;
      }>(sql`
        SELECT
          (SELECT count(*)::int FROM users) AS "userCount",
          (SELECT count(*)::int FROM audit_logs) AS "auditCount",
          (SELECT count(*)::int FROM libraries) AS "libraryCount",
          (SELECT count(*)::int FROM items) AS "bookCount",
          (SELECT count(*)::int FROM bib_records) AS "titleCount"
      `);
      const rowList = (rows as unknown as {
        userCount: number;
        auditCount: number;
        libraryCount: number;
        bookCount: number;
        titleCount: number;
      }[]);
      return (
        rowList[0] ?? {
          userCount: 0,
          auditCount: 0,
          libraryCount: 0,
          bookCount: 0,
          titleCount: 0,
        }
      );
    },
    30 * 1000, // 30s RAM cache
  );
}

/**
 * Cached Circulation Rules
 */
export async function getCachedCirculationRules() {
  return getOrSetCache(
    "circulation_rules_all",
    async () => {
      return db.select().from(schema.circulationRules);
    },
    60 * 1000, // 60s RAM cache
  );
}

/**
 * Cached Audit Logs (used on /admin/audit)
 */
export async function getCachedAuditLogs(limit = 100) {
  return getOrSetCache(
    `audit_logs_${limit}`,
    async () => {
      return db
        .select()
        .from(schema.auditLogs)
        .orderBy(desc(schema.auditLogs.id))
        .limit(limit);
    },
    15 * 1000, // 15s RAM cache
  );
}

export function invalidateCirculationRulesCache() {
  cacheStore.delete("circulation_rules_all");
}

export function invalidateMasterDataCache() {
  cacheStore.clear();
}
