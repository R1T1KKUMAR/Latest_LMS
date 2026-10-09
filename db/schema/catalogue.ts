import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { departments, itemTypes, libraries, vendors } from "./master";

// 15. bib_records
export const bibRecords = pgTable(
  "bib_records",
  {
    id: serial("id").primaryKey(),
    isbn: varchar("isbn", { length: 20 }),
    title: varchar("title", { length: 500 }).notNull(),
    subtitle: varchar("subtitle", { length: 500 }),
    authors: varchar("authors", { length: 500 }).notNull(),
    editors: varchar("editors", { length: 500 }),
    edition: varchar("edition", { length: 50 }),
    publisher: varchar("publisher", { length: 200 }),
    placeOfPublication: varchar("place_of_publication", { length: 100 }),
    pubYear: integer("pub_year"),
    pages: varchar("pages", { length: 50 }),
    language: varchar("language", { length: 50 }).default("English"),
    subject: varchar("subject", { length: 500 }),
    keywords: varchar("keywords", { length: 500 }),
    ddcNumber: varchar("ddc_number", { length: 50 }),
    callNumber: varchar("call_number", { length: 100 }),
    itemTypeId: integer("item_type_id")
      .notNull()
      .references(() => itemTypes.id, { onDelete: "restrict" }),
    departmentId: integer("department_id").references(() => departments.id, {
      onDelete: "restrict",
    }),
    summary: text("summary"),
    price: numeric("price", { precision: 10, scale: 2 }).default("0.00"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "chk_pub_year",
      sql`${table.pubYear} IS NULL OR (${table.pubYear} >= 1500 AND ${table.pubYear} <= 2100)`,
    ),
    check("chk_bib_price", sql`${table.price} >= 0`),
    index("idx_bib_records_isbn").on(table.isbn),
    index("idx_bib_records_title").on(table.title),
    index("idx_bib_records_authors").on(table.authors),
    index("idx_bib_records_subject").on(table.subject),
  ],
);

// 16. items
export const items = pgTable(
  "items",
  {
    id: serial("id").primaryKey(),
    bibId: integer("bib_id")
      .notNull()
      .references(() => bibRecords.id, { onDelete: "restrict" }),
    libraryId: integer("library_id")
      .notNull()
      .references(() => libraries.id, { onDelete: "restrict" }),
    accessionNo: varchar("accession_no", { length: 30 }).notNull().unique(),
    barcode: varchar("barcode", { length: 40 }).notNull().unique(),
    callNumber: varchar("call_number", { length: 100 }),
    location: varchar("location", { length: 100 }),
    price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0.00"),
    vendorId: integer("vendor_id").references(() => vendors.id, {
      onDelete: "restrict",
    }),
    invoiceNo: varchar("invoice_no", { length: 100 }),
    acquisitionDate: date("acquisition_date").defaultNow(),
    status: varchar("status", { length: 20 }).notNull().default("AVAILABLE"),
    conditionNote: varchar("condition_note", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("chk_item_price", sql`${table.price} >= 0`),
    check(
      "chk_item_status",
      sql`${table.status} IN ('AVAILABLE', 'ISSUED', 'RESERVED', 'REFERENCE_ONLY', 'LOST', 'DAMAGED', 'REPAIR', 'WITHDRAWN', 'PROCESSING')`,
    ),
    index("idx_items_bib_id").on(table.bibId),
    index("idx_items_library_id").on(table.libraryId),
    index("idx_items_status").on(table.status),
    index("idx_items_accession_no").on(table.accessionNo),
    index("idx_items_barcode").on(table.barcode),
  ],
);
