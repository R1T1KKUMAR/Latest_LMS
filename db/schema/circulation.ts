import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgSequence,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { bibRecords, items } from "./catalogue";
import { itemTypes, libraries, patronCategories } from "./master";
import { patrons } from "./membership";
import { users } from "./security";

// Sequence 2: seq_receipt_no (Section 6.1, FR-FI-03)
export const seqReceiptNo = pgSequence("seq_receipt_no", {
  startWith: 1,
  increment: 1,
});

// 17. circulation_rules
export const circulationRules = pgTable(
  "circulation_rules",
  {
    id: serial("id").primaryKey(),
    libraryId: integer("library_id").references(() => libraries.id, {
      onDelete: "cascade",
    }),
    categoryId: integer("category_id").references(() => patronCategories.id, {
      onDelete: "cascade",
    }),
    itemTypeId: integer("item_type_id").references(() => itemTypes.id, {
      onDelete: "cascade",
    }),
    maxBooks: integer("max_books").notNull().default(3),
    loanDays: integer("loan_days").notNull().default(14),
    maxRenewals: integer("max_renewals").notNull().default(1),
    finePerDay: numeric("fine_per_day", { precision: 10, scale: 2 }).notNull().default("2.00"),
    graceDays: integer("grace_days").notNull().default(0),
    maxFine: numeric("max_fine", { precision: 10, scale: 2 }),
    holdsAllowed: boolean("holds_allowed").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("chk_rule_max_books", sql`${table.maxBooks} >= 0`),
    check("chk_rule_loan_days", sql`${table.loanDays} >= 0`),
    check("chk_rule_max_renewals", sql`${table.maxRenewals} >= 0`),
    check("chk_rule_fine_per_day", sql`${table.finePerDay} >= 0`),
    check("chk_rule_grace_days", sql`${table.graceDays} >= 0`),
    check("chk_rule_max_fine", sql`${table.maxFine} IS NULL OR ${table.maxFine} >= 0`),
    index("idx_circ_rules_lookup").on(table.libraryId, table.categoryId, table.itemTypeId),
  ],
);

// 18. loans
export const loans = pgTable(
  "loans",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),
    patronId: integer("patron_id")
      .notNull()
      .references(() => patrons.id, { onDelete: "restrict" }),
    libraryId: integer("library_id")
      .notNull()
      .references(() => libraries.id, { onDelete: "restrict" }),
    issueDate: date("issue_date").notNull().defaultNow(),
    dueDate: date("due_date").notNull(),
    returnDate: date("return_date"),
    renewalCount: integer("renewal_count").notNull().default(0),
    status: varchar("status", { length: 20 }).notNull().default("ISSUED"),
    issuedBy: integer("issued_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    returnedTo: integer("returned_to").references(() => users.id, {
      onDelete: "restrict",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("chk_renewal_count", sql`${table.renewalCount} >= 0`),
    check("chk_loan_status", sql`${table.status} IN ('ISSUED', 'RETURNED', 'LOST')`),
    index("idx_loans_item_id").on(table.itemId),
    index("idx_loans_patron_id").on(table.patronId),
    index("idx_loans_status_due_date").on(table.status, table.dueDate),
    index("idx_loans_issue_date").on(table.issueDate),
  ],
);

// 19. holds
export const holds = pgTable(
  "holds",
  {
    id: serial("id").primaryKey(),
    patronId: integer("patron_id")
      .notNull()
      .references(() => patrons.id, { onDelete: "restrict" }),
    bibId: integer("bib_id")
      .notNull()
      .references(() => bibRecords.id, { onDelete: "restrict" }),
    itemId: integer("item_id").references(() => items.id, {
      onDelete: "restrict",
    }),
    requestDate: timestamp("request_date", { withTimezone: true }).notNull().defaultNow(),
    status: varchar("status", { length: 30 }).notNull().default("WAITING"),
    availableDate: date("available_date"),
    expiryDate: date("expiry_date"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "chk_hold_status",
      sql`${table.status} IN ('WAITING', 'AVAILABLE_FOR_PICKUP', 'COMPLETED', 'EXPIRED', 'CANCELLED')`,
    ),
    // CRITICAL: Partial unique index enforcing only ONE active hold per patron and title (DR-01, Section 6.2)
    uniqueIndex("uq_active_hold_per_patron_title")
      .on(table.patronId, table.bibId)
      .where(sql`status IN ('WAITING', 'AVAILABLE_FOR_PICKUP')`),
    index("idx_holds_bib_status").on(table.bibId, table.status),
    index("idx_holds_patron_id").on(table.patronId),
  ],
);

// 20. fines
export const fines = pgTable(
  "fines",
  {
    id: serial("id").primaryKey(),
    patronId: integer("patron_id")
      .notNull()
      .references(() => patrons.id, { onDelete: "restrict" }),
    loanId: integer("loan_id").references(() => loans.id, {
      onDelete: "restrict",
    }),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    paidAmount: numeric("paid_amount", { precision: 10, scale: 2 }).notNull().default("0.00"),
    fineType: varchar("fine_type", { length: 20 }).notNull(),
    reason: varchar("reason", { length: 500 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("OUTSTANDING"),
    createdBy: integer("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("chk_fine_amount", sql`${table.amount} > 0`),
    check("chk_fine_paid_amount", sql`${table.paidAmount} >= 0`),
    check("chk_fine_type", sql`${table.fineType} IN ('OVERDUE', 'LOST', 'DAMAGE', 'MANUAL')`),
    check("chk_fine_status", sql`${table.status} IN ('OUTSTANDING', 'PAID', 'WAIVED')`),
    index("idx_fines_patron_status").on(table.patronId, table.status),
    index("idx_fines_loan_id").on(table.loanId),
    index("idx_fines_status").on(table.status),
    index("idx_fines_created_at").on(table.createdAt),
  ],
);

// 21. payments
export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    fineId: integer("fine_id")
      .notNull()
      .references(() => fines.id, { onDelete: "restrict" }),
    patronId: integer("patron_id")
      .notNull()
      .references(() => patrons.id, { onDelete: "restrict" }),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    paymentMethod: varchar("payment_method", { length: 20 }).notNull(),
    receiptNo: varchar("receipt_no", { length: 50 }).notNull().unique(),
    remarks: varchar("remarks", { length: 500 }),
    receivedBy: integer("received_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    paymentDate: timestamp("payment_date", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("chk_payment_amount", sql`${table.amount} > 0`),
    check(
      "chk_payment_method",
      sql`${table.paymentMethod} IN ('CASH', 'UPI', 'CARD', 'ONLINE', 'WAIVED')`,
    ),
    index("idx_payments_fine_id").on(table.fineId),
    index("idx_payments_patron_id").on(table.patronId),
    index("idx_payments_receipt_no").on(table.receiptNo),
  ],
);

// 22. import_batches
export const importBatches = pgTable(
  "import_batches",
  {
    id: serial("id").primaryKey(),
    importType: varchar("import_type", { length: 20 }).notNull(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    totalRows: integer("total_rows").notNull(),
    importedRows: integer("imported_rows").notNull(),
    skippedRows: integer("skipped_rows").notNull(),
    importedBy: integer("imported_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("chk_import_type", sql`${table.importType} IN ('STUDENT', 'FACULTY', 'CATALOGUE')`),
  ],
);
