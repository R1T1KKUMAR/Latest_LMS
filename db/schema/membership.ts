import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgSequence,
  pgTable,
  serial,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { courses, departments, institutions, patronCategories } from "./master";

// Sequence 1: seq_card_no (Section 6.1, FR-PA-02)
export const seqCardNo = pgSequence("seq_card_no", {
  startWith: 1,
  increment: 1,
});

// 14. patrons
export const patrons = pgTable(
  "patrons",
  {
    id: serial("id").primaryKey(),
    cardNo: varchar("card_no", { length: 50 }).notNull().unique(),
    patronType: varchar("patron_type", { length: 20 }).notNull(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => patronCategories.id, { onDelete: "restrict" }),
    institutionId: integer("institution_id").references(() => institutions.id, {
      onDelete: "restrict",
    }),
    departmentId: integer("department_id").references(() => departments.id, {
      onDelete: "restrict",
    }),
    courseId: integer("course_id").references(() => courses.id, {
      onDelete: "restrict",
    }),
    rollNo: varchar("roll_no", { length: 50 }).unique(),
    employeeId: varchar("employee_id", { length: 50 }).unique(),
    firstName: varchar("first_name", { length: 60 }).notNull(),
    middleName: varchar("middle_name", { length: 60 }),
    lastName: varchar("last_name", { length: 60 }),
    gender: varchar("gender", { length: 10 }),
    dob: date("dob"),
    fatherName: varchar("father_name", { length: 100 }),
    mobile: varchar("mobile", { length: 20 }),
    email: varchar("email", { length: 100 }),
    address: varchar("address", { length: 500 }),
    academicYear: integer("academic_year"),
    semester: integer("semester"),
    section: varchar("section", { length: 10 }),
    admissionDate: date("admission_date"),
    courseEndDate: date("course_end_date"),
    cardExpiry: date("card_expiry").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("ACTIVE"),
    username: varchar("username", { length: 50 }).notNull().unique(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    mustChangePassword: boolean("must_change_password").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "chk_patron_patron_type",
      sql`${table.patronType} IN ('STUDENT', 'FACULTY', 'STAFF', 'GUEST')`,
    ),
    check(
      "chk_patron_status",
      sql`${table.status} IN ('ACTIVE', 'BLOCKED', 'EXPIRED', 'GRADUATED', 'LEFT')`,
    ),
    index("idx_patrons_status").on(table.status),
    index("idx_patrons_card_no").on(table.cardNo),
    index("idx_patrons_roll_no").on(table.rollNo),
    index("idx_patrons_employee_id").on(table.employeeId),
  ],
);
