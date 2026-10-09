import { sql } from "drizzle-orm";
import { date, integer, numeric, pgView, text, timestamp, varchar } from "drizzle-orm/pg-core";

// View 1: v_bib_availability
export const vBibAvailability = pgView("v_bib_availability", {
  bibId: integer("bib_id"),
  isbn: varchar("isbn", { length: 20 }),
  title: varchar("title", { length: 500 }),
  authors: varchar("authors", { length: 500 }),
  publisher: varchar("publisher", { length: 200 }),
  pubYear: integer("pub_year"),
  itemTypeId: integer("item_type_id"),
  itemTypeName: varchar("item_type_name", { length: 100 }),
  departmentId: integer("department_id"),
  departmentName: varchar("department_name", { length: 200 }),
  totalCopies: integer("total_copies"),
  availableCopies: integer("available_copies"),
  issuedCopies: integer("issued_copies"),
  reservedCopies: integer("reserved_copies"),
  referenceCopies: integer("reference_copies"),
  otherCopies: integer("other_copies"),
  waitingHolds: integer("waiting_holds"),
}).as(sql`
  SELECT 
    b.id AS bib_id,
    b.isbn,
    b.title,
    b.authors,
    b.publisher,
    b.pub_year,
    b.item_type_id,
    it.name AS item_type_name,
    b.department_id,
    d.name AS department_name,
    COUNT(i.id)::int AS total_copies,
    COUNT(CASE WHEN i.status = 'AVAILABLE' THEN 1 END)::int AS available_copies,
    COUNT(CASE WHEN i.status = 'ISSUED' THEN 1 END)::int AS issued_copies,
    COUNT(CASE WHEN i.status = 'RESERVED' THEN 1 END)::int AS reserved_copies,
    COUNT(CASE WHEN i.status = 'REFERENCE_ONLY' THEN 1 END)::int AS reference_copies,
    COUNT(CASE WHEN i.status NOT IN ('AVAILABLE', 'ISSUED', 'RESERVED', 'REFERENCE_ONLY') THEN 1 END)::int AS other_copies,
    COALESCE(h.waiting_holds, 0)::int AS waiting_holds
  FROM bib_records b
  LEFT JOIN item_types it ON b.item_type_id = it.id
  LEFT JOIN departments d ON b.department_id = d.id
  LEFT JOIN items i ON b.id = i.bib_id
  LEFT JOIN (
    SELECT bib_id, COUNT(*)::int AS waiting_holds
    FROM holds
    WHERE status = 'WAITING'
    GROUP BY bib_id
  ) h ON b.id = h.bib_id
  GROUP BY b.id, it.name, d.name, h.waiting_holds
`);

// View 2: v_active_loans
export const vActiveLoans = pgView("v_active_loans", {
  loanId: integer("loan_id"),
  itemId: integer("item_id"),
  accessionNo: varchar("accession_no", { length: 30 }),
  barcode: varchar("barcode", { length: 40 }),
  title: varchar("title", { length: 500 }),
  authors: varchar("authors", { length: 500 }),
  patronId: integer("patron_id"),
  cardNo: varchar("card_no", { length: 50 }),
  patronName: text("patron_name"),
  patronType: varchar("patron_type", { length: 20 }),
  patronMobile: varchar("patron_mobile", { length: 20 }),
  libraryId: integer("library_id"),
  libraryName: varchar("library_name", { length: 200 }),
  issueDate: date("issue_date"),
  dueDate: date("due_date"),
  renewalCount: integer("renewal_count"),
  issuedBy: integer("issued_by"),
  issuedByName: varchar("issued_by_name", { length: 100 }),
  daysOverdue: integer("days_overdue"),
}).as(sql`
  SELECT 
    l.id AS loan_id,
    l.item_id,
    i.accession_no,
    i.barcode,
    b.title,
    b.authors,
    l.patron_id,
    p.card_no,
    p.first_name || ' ' || COALESCE(p.last_name, '') AS patron_name,
    p.patron_type,
    p.mobile AS patron_mobile,
    l.library_id,
    lib.name AS library_name,
    l.issue_date,
    l.due_date,
    l.renewal_count,
    l.issued_by,
    u.full_name AS issued_by_name,
    CASE 
      WHEN CURRENT_DATE > l.due_date THEN (CURRENT_DATE - l.due_date)::int 
      ELSE 0 
    END AS days_overdue
  FROM loans l
  JOIN items i ON l.item_id = i.id
  JOIN bib_records b ON i.bib_id = b.id
  JOIN patrons p ON l.patron_id = p.id
  JOIN libraries lib ON l.library_id = lib.id
  JOIN users u ON l.issued_by = u.id
  WHERE l.status = 'ISSUED'
`);

// View 3: v_overdue_loans
export const vOverdueLoans = pgView("v_overdue_loans", {
  loanId: integer("loan_id"),
  itemId: integer("item_id"),
  accessionNo: varchar("accession_no", { length: 30 }),
  barcode: varchar("barcode", { length: 40 }),
  title: varchar("title", { length: 500 }),
  authors: varchar("authors", { length: 500 }),
  patronId: integer("patron_id"),
  cardNo: varchar("card_no", { length: 50 }),
  patronName: text("patron_name"),
  patronType: varchar("patron_type", { length: 20 }),
  patronMobile: varchar("patron_mobile", { length: 20 }),
  libraryId: integer("library_id"),
  libraryName: varchar("library_name", { length: 200 }),
  issueDate: date("issue_date"),
  dueDate: date("due_date"),
  daysOverdue: integer("days_overdue"),
}).as(sql`
  SELECT 
    l.id AS loan_id,
    l.item_id,
    i.accession_no,
    i.barcode,
    b.title,
    b.authors,
    l.patron_id,
    p.card_no,
    p.first_name || ' ' || COALESCE(p.last_name, '') AS patron_name,
    p.patron_type,
    p.mobile AS patron_mobile,
    l.library_id,
    lib.name AS library_name,
    l.issue_date,
    l.due_date,
    (CURRENT_DATE - l.due_date)::int AS days_overdue
  FROM loans l
  JOIN items i ON l.item_id = i.id
  JOIN bib_records b ON i.bib_id = b.id
  JOIN patrons p ON l.patron_id = p.id
  JOIN libraries lib ON l.library_id = lib.id
  WHERE l.status = 'ISSUED' AND CURRENT_DATE > l.due_date
`);

// View 4: v_outstanding_fines
export const vOutstandingFines = pgView("v_outstanding_fines", {
  fineId: integer("fine_id"),
  patronId: integer("patron_id"),
  cardNo: varchar("card_no", { length: 50 }),
  patronName: text("patron_name"),
  patronMobile: varchar("patron_mobile", { length: 20 }),
  loanId: integer("loan_id"),
  fineType: varchar("fine_type", { length: 20 }),
  reason: varchar("reason", { length: 500 }),
  amount: numeric("amount", { precision: 10, scale: 2 }),
  paidAmount: numeric("paid_amount", { precision: 10, scale: 2 }),
  balanceAmount: numeric("balance_amount", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }),
  createdByName: varchar("created_by_name", { length: 100 }),
}).as(sql`
  SELECT 
    f.id AS fine_id,
    f.patron_id,
    p.card_no,
    p.first_name || ' ' || COALESCE(p.last_name, '') AS patron_name,
    p.mobile AS patron_mobile,
    f.loan_id,
    f.fine_type,
    f.reason,
    f.amount,
    f.paid_amount,
    (f.amount - f.paid_amount)::numeric(10, 2) AS balance_amount,
    f.created_at,
    u.full_name AS created_by_name
  FROM fines f
  JOIN patrons p ON f.patron_id = p.id
  JOIN users u ON f.created_by = u.id
  WHERE f.status = 'OUTSTANDING'
`);

// View 5: v_accession_register
export const vAccessionRegister = pgView("v_accession_register", {
  itemId: integer("item_id"),
  accessionNo: varchar("accession_no", { length: 30 }),
  barcode: varchar("barcode", { length: 40 }),
  title: varchar("title", { length: 500 }),
  authors: varchar("authors", { length: 500 }),
  edition: varchar("edition", { length: 50 }),
  publisher: varchar("publisher", { length: 200 }),
  pubYear: integer("pub_year"),
  itemType: varchar("item_type", { length: 100 }),
  department: varchar("department", { length: 200 }),
  libraryName: varchar("library_name", { length: 200 }),
  location: varchar("location", { length: 100 }),
  price: numeric("price", { precision: 10, scale: 2 }),
  vendorName: varchar("vendor_name", { length: 200 }),
  invoiceNo: varchar("invoice_no", { length: 100 }),
  acquisitionDate: date("acquisition_date"),
  copyStatus: varchar("copy_status", { length: 20 }),
  conditionNote: varchar("condition_note", { length: 500 }),
}).as(sql`
  SELECT 
    i.id AS item_id,
    i.accession_no,
    i.barcode,
    b.title,
    b.authors,
    b.edition,
    b.publisher,
    b.pub_year,
    it.name AS item_type,
    d.name AS department,
    lib.name AS library_name,
    i.location,
    i.price,
    v.name AS vendor_name,
    i.invoice_no,
    i.acquisition_date,
    i.status AS copy_status,
    i.condition_note
  FROM items i
  JOIN bib_records b ON i.bib_id = b.id
  JOIN item_types it ON b.item_type_id = it.id
  LEFT JOIN departments d ON b.department_id = d.id
  JOIN libraries lib ON i.library_id = lib.id
  LEFT JOIN vendors v ON i.vendor_id = v.id
`);

// View 6: v_patron_summary
export const vPatronSummary = pgView("v_patron_summary", {
  patronId: integer("patron_id"),
  cardNo: varchar("card_no", { length: 50 }),
  rollNo: varchar("roll_no", { length: 50 }),
  employeeId: varchar("employee_id", { length: 50 }),
  fullName: text("full_name"),
  patronType: varchar("patron_type", { length: 20 }),
  categoryName: varchar("category_name", { length: 100 }),
  status: varchar("status", { length: 20 }),
  cardExpiry: date("card_expiry"),
  activeLoansCount: integer("active_loans_count"),
  overdueLoansCount: integer("overdue_loans_count"),
  totalFinesBalance: numeric("total_fines_balance", { precision: 10, scale: 2 }),
}).as(sql`
  SELECT 
    p.id AS patron_id,
    p.card_no,
    p.roll_no,
    p.employee_id,
    p.first_name || ' ' || COALESCE(p.last_name, '') AS full_name,
    p.patron_type,
    cat.name AS category_name,
    p.status,
    p.card_expiry,
    COALESCE(l.active_loans_count, 0)::int AS active_loans_count,
    COALESCE(l.overdue_loans_count, 0)::int AS overdue_loans_count,
    COALESCE(f.total_fines_balance, 0.00)::numeric(10, 2) AS total_fines_balance
  FROM patrons p
  JOIN patron_categories cat ON p.category_id = cat.id
  LEFT JOIN (
    SELECT 
      patron_id,
      COUNT(*)::int AS active_loans_count,
      COUNT(CASE WHEN CURRENT_DATE > due_date THEN 1 END)::int AS overdue_loans_count
    FROM loans
    WHERE status = 'ISSUED'
    GROUP BY patron_id
  ) l ON p.id = l.patron_id
  LEFT JOIN (
    SELECT 
      patron_id,
      SUM(amount - paid_amount)::numeric(10, 2) AS total_fines_balance
    FROM fines
    WHERE status = 'OUTSTANDING'
    GROUP BY patron_id
  ) f ON p.id = f.patron_id
`);
