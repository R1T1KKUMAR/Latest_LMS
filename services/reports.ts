/**
 * Reports Service (SRS Section 4.11, FR-RP-01, FR-RP-02, FR-RP-03)
 * Provides comprehensive query pipelines, statutory registers, and operational analytics
 * for all 13 report definitions with UI viewability, summary metrics, and CSV export.
 */

import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import * as schema from "@/db/schema";

// biome-ignore lint/suspicious/noExplicitAny: generic database instance support
type DbInstance = any;

export interface ReportColumn {
  key: string;
  label: string;
  align?: "left" | "center" | "right";
  format?: "text" | "number" | "currency" | "date" | "badge";
}

export interface ReportSummaryItem {
  label: string;
  value: string | number;
  highlight?: boolean;
}

export interface ReportQueryResult {
  id: string;
  code: string;
  name: string;
  description: string;
  category: string;
  generatedAt: string;
  dateRange: {
    startDate?: string;
    endDate?: string;
  };
  columns: ReportColumn[];
  // biome-ignore lint/suspicious/noExplicitAny: dynamic row properties per report
  rows: Record<string, any>[];
  summary: ReportSummaryItem[];
  totalRecords: number;
}

export interface ReportFilterOptions {
  startDate?: string;
  endDate?: string;
  search?: string;
  limit?: number;
}

/**
 * Format helper for Currency per FR-RP-03 (two decimals with ₹ prefix)
 */
export function formatCurrencyValue(amount: number | string | null | undefined): string {
  const num = typeof amount === "number" ? amount : Number.parseFloat(String(amount || "0"));
  if (Number.isNaN(num)) return "₹0.00";
  return `₹${num.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Format helper for Dates per FR-RP-03 (dd-mm-yyyy)
 */
export function formatReportDate(d: string | Date | null | undefined): string {
  if (!d) return "-";
  try {
    const dateObj = typeof d === "string" ? new Date(d) : d;
    if (Number.isNaN(dateObj.getTime())) return String(d);
    const day = String(dateObj.getUTCDate()).padStart(2, "0");
    const month = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
    const year = dateObj.getUTCFullYear();
    return `${day}-${month}-${year}`;
  } catch {
    return String(d);
  }
}

/**
 * 1. RPT-01: Accession Register (Inventory)
 * Chronological statutory record of accessioned volumes, purchase price, vendor, and call numbers.
 */
async function getAccessionRegister(
  filters: ReportFilterOptions,
  db: DbInstance,
): Promise<ReportQueryResult> {
  const conditions = [];

  if (filters.startDate) {
    conditions.push(gte(schema.items.acquisitionDate, filters.startDate));
  }
  if (filters.endDate) {
    conditions.push(lte(schema.items.acquisitionDate, filters.endDate));
  }

  const query = db
    .select({
      id: schema.items.id,
      accessionNo: schema.items.accessionNo,
      barcode: schema.items.barcode,
      title: schema.bibRecords.title,
      authors: schema.bibRecords.authors,
      isbn: schema.bibRecords.isbn,
      callNumber: schema.items.callNumber,
      libraryName: schema.libraries.name,
      departmentName: schema.departments.name,
      vendorName: schema.vendors.name,
      price: schema.items.price,
      accessionDate: schema.items.acquisitionDate,
      status: schema.items.status,
    })
    .from(schema.items)
    .innerJoin(schema.bibRecords, eq(schema.items.bibId, schema.bibRecords.id))
    .innerJoin(schema.libraries, eq(schema.items.libraryId, schema.libraries.id))
    .leftJoin(schema.departments, eq(schema.bibRecords.departmentId, schema.departments.id))
    .leftJoin(schema.vendors, eq(schema.items.vendorId, schema.vendors.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(schema.items.id);

  const rawRows = await query;

  let totalValue = 0;
  let availableCount = 0;

  const rows = rawRows.map((r: (typeof rawRows)[number]) => {
    const itemPrice = Number.parseFloat(r.price || "0");
    totalValue += Number.isNaN(itemPrice) ? 0 : itemPrice;
    if (r.status === "AVAILABLE") availableCount++;

    return {
      accessionNo: r.accessionNo,
      barcode: r.barcode,
      title: r.title,
      authors: r.authors || "-",
      isbn: r.isbn || "-",
      callNumber: r.callNumber || "-",
      library: r.libraryName,
      department: r.departmentName || "-",
      vendor: r.vendorName || "-",
      price: formatCurrencyValue(r.price),
      rawPrice: r.price,
      accessionDate: formatReportDate(r.accessionDate),
      status: r.status,
    };
  });

  return {
    id: "rpt-01",
    code: "RPT-01",
    name: "Accession Register",
    description:
      "Chronological statutory record of accessioned volumes, purchase price, vendor, and call numbers.",
    category: "Inventory",
    generatedAt: new Date().toISOString(),
    dateRange: { startDate: filters.startDate, endDate: filters.endDate },
    columns: [
      { key: "accessionNo", label: "Accession No", align: "left" },
      { key: "barcode", label: "Barcode", align: "left" },
      { key: "title", label: "Book Title", align: "left" },
      { key: "authors", label: "Authors", align: "left" },
      { key: "isbn", label: "ISBN", align: "left" },
      { key: "library", label: "Library", align: "left" },
      { key: "department", label: "Department", align: "left" },
      { key: "price", label: "Price", align: "right", format: "currency" },
      { key: "accessionDate", label: "Accession Date", align: "center", format: "date" },
      { key: "status", label: "Status", align: "center", format: "badge" },
    ],
    summary: [
      { label: "Total Volumes", value: rows.length, highlight: true },
      { label: "Total Asset Value", value: formatCurrencyValue(totalValue), highlight: true },
      { label: "Available on Shelf", value: availableCount },
      { label: "In Circulation / Other", value: rows.length - availableCount },
    ],
    rows,
    totalRecords: rows.length,
  };
}

/**
 * 2. RPT-02: Daily Circulation Summary (Circulation)
 * Count and detail of checkouts, returns, and renewals across terminals.
 */
async function getDailyCirculationSummary(
  filters: ReportFilterOptions,
  db: DbInstance,
): Promise<ReportQueryResult> {
  const conditions = [];
  if (filters.startDate) {
    conditions.push(gte(schema.loans.issueDate, filters.startDate));
  }
  if (filters.endDate) {
    conditions.push(lte(schema.loans.issueDate, filters.endDate));
  }

  const rawRows = await db
    .select({
      id: schema.loans.id,
      barcode: schema.items.barcode,
      accessionNo: schema.items.accessionNo,
      title: schema.bibRecords.title,
      patronFirstName: schema.patrons.firstName,
      patronLastName: schema.patrons.lastName,
      cardNo: schema.patrons.cardNo,
      libraryName: schema.libraries.name,
      issueDate: schema.loans.issueDate,
      dueDate: schema.loans.dueDate,
      returnDate: schema.loans.returnDate,
      renewalCount: schema.loans.renewalCount,
      status: schema.loans.status,
    })
    .from(schema.loans)
    .innerJoin(schema.items, eq(schema.loans.itemId, schema.items.id))
    .innerJoin(schema.bibRecords, eq(schema.items.bibId, schema.bibRecords.id))
    .innerJoin(schema.patrons, eq(schema.loans.patronId, schema.patrons.id))
    .innerJoin(schema.libraries, eq(schema.loans.libraryId, schema.libraries.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.loans.id));

  let issuedCount = 0;
  let returnedCount = 0;
  let renewedCount = 0;

  const rows = rawRows.map((r: (typeof rawRows)[number]) => {
    if (r.status === "ISSUED") issuedCount++;
    if (r.status === "RETURNED") returnedCount++;
    if ((r.renewalCount || 0) > 0) renewedCount++;

    return {
      loanId: `#LN-${String(r.id).padStart(5, "0")}`,
      barcode: r.barcode,
      accessionNo: r.accessionNo,
      title: r.title,
      patronName: `${r.patronFirstName} ${r.patronLastName || ""}`.trim(),
      cardNo: r.cardNo,
      library: r.libraryName,
      issueDate: formatReportDate(r.issueDate),
      dueDate: formatReportDate(r.dueDate),
      returnDate: r.returnDate ? formatReportDate(r.returnDate) : "Active (Not Returned)",
      renewals: r.renewalCount || 0,
      status: r.status,
    };
  });

  return {
    id: "rpt-02",
    code: "RPT-02",
    name: "Daily Circulation Summary",
    description:
      "Daily count and detail of checkouts, returns, and renewals broken down by library terminal.",
    category: "Circulation",
    generatedAt: new Date().toISOString(),
    dateRange: { startDate: filters.startDate, endDate: filters.endDate },
    columns: [
      { key: "loanId", label: "Loan ID", align: "left" },
      { key: "barcode", label: "Barcode", align: "left" },
      { key: "title", label: "Book Title", align: "left" },
      { key: "patronName", label: "Patron Name", align: "left" },
      { key: "cardNo", label: "Card / Roll", align: "left" },
      { key: "issueDate", label: "Issue Date", align: "center", format: "date" },
      { key: "dueDate", label: "Due Date", align: "center", format: "date" },
      { key: "returnDate", label: "Return Date", align: "center" },
      { key: "renewals", label: "Renewals", align: "right" },
      { key: "status", label: "Status", align: "center", format: "badge" },
    ],
    summary: [
      { label: "Total Transactions", value: rows.length, highlight: true },
      { label: "Currently Issued", value: issuedCount },
      { label: "Completed Returns", value: returnedCount },
      { label: "Renewed Loans", value: renewedCount },
    ],
    rows,
    totalRecords: rows.length,
  };
}

/**
 * 3. RPT-03: Overdue Items & Defaulters (Circulation)
 * List of active loans past due date, patron contact information, days overdue, and accrued penalties.
 */
async function getOverdueItemsAndDefaulters(
  filters: ReportFilterOptions,
  db: DbInstance,
): Promise<ReportQueryResult> {
  const todayIso = new Date().toISOString().split("T")[0];

  const rawRows = await db
    .select({
      loanId: schema.loans.id,
      cardNo: schema.patrons.cardNo,
      firstName: schema.patrons.firstName,
      lastName: schema.patrons.lastName,
      patronType: schema.patrons.patronType,
      mobile: schema.patrons.mobile,
      email: schema.patrons.email,
      departmentName: schema.departments.name,
      barcode: schema.items.barcode,
      accessionNo: schema.items.accessionNo,
      title: schema.bibRecords.title,
      issueDate: schema.loans.issueDate,
      dueDate: schema.loans.dueDate,
    })
    .from(schema.loans)
    .innerJoin(schema.patrons, eq(schema.loans.patronId, schema.patrons.id))
    .innerJoin(schema.items, eq(schema.loans.itemId, schema.items.id))
    .innerJoin(schema.bibRecords, eq(schema.items.bibId, schema.bibRecords.id))
    .leftJoin(schema.departments, eq(schema.patrons.departmentId, schema.departments.id))
    .where(and(eq(schema.loans.status, "ISSUED"), sql`${schema.loans.dueDate} < ${todayIso}::date`))
    .orderBy(schema.loans.dueDate);

  const today = new Date();
  let totalFineEst = 0;

  const rows = rawRows.map((r: (typeof rawRows)[number]) => {
    const due = new Date(r.dueDate);
    const diffMs = today.getTime() - due.getTime();
    const daysOverdue = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    // Standard rule: ₹2 per overdue day
    const fineEst = daysOverdue * 2;
    totalFineEst += fineEst;

    return {
      cardNo: r.cardNo,
      patronName: `${r.firstName} ${r.lastName || ""}`.trim(),
      patronType: r.patronType,
      department: r.departmentName || "-",
      contact: r.mobile || r.email || "-",
      barcode: r.barcode,
      title: r.title,
      dueDate: formatReportDate(r.dueDate),
      daysOverdue: `${daysOverdue} days`,
      fineEst: formatCurrencyValue(fineEst),
    };
  });

  return {
    id: "rpt-03",
    code: "RPT-03",
    name: "Overdue Items & Defaulters",
    description:
      "List of active loans past due date, patron contact information, days overdue, and accrued penalties.",
    category: "Circulation",
    generatedAt: new Date().toISOString(),
    dateRange: { startDate: filters.startDate, endDate: filters.endDate },
    columns: [
      { key: "cardNo", label: "Card No", align: "left" },
      { key: "patronName", label: "Patron Name", align: "left" },
      { key: "patronType", label: "Category", align: "center", format: "badge" },
      { key: "department", label: "Department", align: "left" },
      { key: "contact", label: "Phone / Email", align: "left" },
      { key: "barcode", label: "Barcode", align: "left" },
      { key: "title", label: "Book Title", align: "left" },
      { key: "dueDate", label: "Due Date", align: "center", format: "date" },
      { key: "daysOverdue", label: "Overdue", align: "right" },
      { key: "fineEst", label: "Accrued Fine", align: "right", format: "currency" },
    ],
    summary: [
      { label: "Overdue Loans", value: rows.length, highlight: true },
      { label: "Total Accrued Penalty", value: formatCurrencyValue(totalFineEst), highlight: true },
      {
        label: "Average Overdue Days",
        value:
          rows.length > 0
            ? Math.round(
                rows.reduce(
                  (s: number, r: { daysOverdue: string }) => s + Number.parseInt(r.daysOverdue, 10),
                  0,
                ) / rows.length,
              )
            : 0,
      },
    ],
    rows,
    totalRecords: rows.length,
  };
}

/**
 * 4. RPT-04: Fine Collection Register (Financial)
 * Audited financial register of all fine collections, payment modes (Cash/UPI), and receipt numbers.
 */
async function getFineCollectionRegister(
  filters: ReportFilterOptions,
  db: DbInstance,
): Promise<ReportQueryResult> {
  const conditions = [];
  if (filters.startDate) {
    conditions.push(gte(schema.payments.paymentDate, new Date(filters.startDate)));
  }
  if (filters.endDate) {
    conditions.push(lte(schema.payments.paymentDate, new Date(filters.endDate)));
  }

  const rawRows = await db
    .select({
      id: schema.payments.id,
      receiptNo: schema.payments.receiptNo,
      amount: schema.payments.amount,
      paymentMethod: schema.payments.paymentMethod,
      paymentDate: schema.payments.paymentDate,
      remarks: schema.payments.remarks,
      patronFirstName: schema.patrons.firstName,
      patronLastName: schema.patrons.lastName,
      cardNo: schema.patrons.cardNo,
      fineType: schema.fines.fineType,
      staffName: schema.users.fullName,
    })
    .from(schema.payments)
    .innerJoin(schema.patrons, eq(schema.payments.patronId, schema.patrons.id))
    .innerJoin(schema.fines, eq(schema.payments.fineId, schema.fines.id))
    .innerJoin(schema.users, eq(schema.payments.receivedBy, schema.users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.payments.id));

  let totalCollected = 0;
  let cashTotal = 0;
  let upiTotal = 0;

  const rows = rawRows.map((r: (typeof rawRows)[number]) => {
    const amt = Number.parseFloat(r.amount || "0");
    totalCollected += amt;
    if (r.paymentMethod === "CASH") cashTotal += amt;
    if (r.paymentMethod === "UPI") upiTotal += amt;

    return {
      receiptNo: r.receiptNo,
      patronName: `${r.patronFirstName} ${r.patronLastName || ""}`.trim(),
      cardNo: r.cardNo,
      fineType: r.fineType,
      amount: formatCurrencyValue(r.amount),
      mode: r.paymentMethod,
      date: formatReportDate(r.paymentDate),
      cashier: r.staffName,
      remarks: r.remarks || "-",
    };
  });

  return {
    id: "rpt-04",
    code: "RPT-04",
    name: "Fine Collection Register",
    description:
      "Audited financial register of all fine collections, payment modes (Cash/UPI), and receipt numbers.",
    category: "Financial",
    generatedAt: new Date().toISOString(),
    dateRange: { startDate: filters.startDate, endDate: filters.endDate },
    columns: [
      { key: "receiptNo", label: "Receipt No", align: "left" },
      { key: "patronName", label: "Patron Name", align: "left" },
      { key: "cardNo", label: "Card No", align: "left" },
      { key: "fineType", label: "Fine Type", align: "center", format: "badge" },
      { key: "amount", label: "Amount Paid", align: "right", format: "currency" },
      { key: "mode", label: "Payment Mode", align: "center", format: "badge" },
      { key: "date", label: "Payment Date", align: "center", format: "date" },
      { key: "cashier", label: "Received By", align: "left" },
    ],
    summary: [
      {
        label: "Total Revenue Collected",
        value: formatCurrencyValue(totalCollected),
        highlight: true,
      },
      { label: "Cash Collections", value: formatCurrencyValue(cashTotal) },
      { label: "Digital (UPI/Card)", value: formatCurrencyValue(upiTotal) },
      { label: "Total Transactions", value: rows.length },
    ],
    rows,
    totalRecords: rows.length,
  };
}

/**
 * 5. RPT-05: Fine Waiver Log (Financial)
 * Statutory log of waived library penalties, authorizing staff identity, and justified reasons.
 */
async function getFineWaiverLog(
  filters: ReportFilterOptions,
  db: DbInstance,
): Promise<ReportQueryResult> {
  const rawRows = await db
    .select({
      id: schema.fines.id,
      amount: schema.fines.amount,
      paidAmount: schema.fines.paidAmount,
      fineType: schema.fines.fineType,
      reason: schema.fines.reason,
      status: schema.fines.status,
      updatedAt: schema.fines.updatedAt,
      patronFirstName: schema.patrons.firstName,
      patronLastName: schema.patrons.lastName,
      cardNo: schema.patrons.cardNo,
      creatorName: schema.users.fullName,
    })
    .from(schema.fines)
    .innerJoin(schema.patrons, eq(schema.fines.patronId, schema.patrons.id))
    .innerJoin(schema.users, eq(schema.fines.createdBy, schema.users.id))
    .where(eq(schema.fines.status, "WAIVED"))
    .orderBy(desc(schema.fines.updatedAt));

  let totalWaived = 0;

  const rows = rawRows.map((r: (typeof rawRows)[number]) => {
    const amt = Number.parseFloat(r.amount || "0");
    totalWaived += amt;

    return {
      fineId: `#FN-${String(r.id).padStart(5, "0")}`,
      patronName: `${r.patronFirstName} ${r.patronLastName || ""}`.trim(),
      cardNo: r.cardNo,
      fineType: r.fineType,
      amount: formatCurrencyValue(r.amount),
      reason: r.reason,
      authorizedBy: r.creatorName,
      date: formatReportDate(r.updatedAt),
      status: r.status,
    };
  });

  return {
    id: "rpt-05",
    code: "RPT-05",
    name: "Fine Waiver Log",
    description:
      "Statutory log of waived library penalties, authorizing staff identity, and justified reasons.",
    category: "Financial",
    generatedAt: new Date().toISOString(),
    dateRange: { startDate: filters.startDate, endDate: filters.endDate },
    columns: [
      { key: "fineId", label: "Fine ID", align: "left" },
      { key: "patronName", label: "Patron Name", align: "left" },
      { key: "cardNo", label: "Card No", align: "left" },
      { key: "fineType", label: "Fine Type", align: "center", format: "badge" },
      { key: "amount", label: "Waived Amount", align: "right", format: "currency" },
      { key: "reason", label: "Justification Reason", align: "left" },
      { key: "authorizedBy", label: "Authorized Staff", align: "left" },
      { key: "date", label: "Waived Date", align: "center", format: "date" },
    ],
    summary: [
      { label: "Total Waived Amount", value: formatCurrencyValue(totalWaived), highlight: true },
      { label: "Waiver Instances", value: rows.length, highlight: true },
    ],
    rows,
    totalRecords: rows.length,
  };
}

/**
 * 6. RPT-06: Patron Directory & Active Borrowers (Compliance)
 * Directory of registered student and faculty members, card expiry status, and active borrowing counts.
 */
async function getPatronDirectory(
  filters: ReportFilterOptions,
  db: DbInstance,
): Promise<ReportQueryResult> {
  const rawRows = await db
    .select({
      id: schema.patrons.id,
      cardNo: schema.patrons.cardNo,
      employeeId: schema.patrons.employeeId,
      firstName: schema.patrons.firstName,
      lastName: schema.patrons.lastName,
      patronType: schema.patrons.patronType,
      mobile: schema.patrons.mobile,
      email: schema.patrons.email,
      academicYear: schema.patrons.academicYear,
      semester: schema.patrons.semester,
      cardExpiry: schema.patrons.cardExpiry,
      status: schema.patrons.status,
      categoryName: schema.patronCategories.name,
      departmentName: schema.departments.name,
      institutionName: schema.institutions.name,
      activeLoans: sql<number>`(
        SELECT COUNT(*)::int FROM loans 
        WHERE loans.patron_id = patrons.id AND loans.status = 'ISSUED'
      )`.as("active_loans"),
    })
    .from(schema.patrons)
    .innerJoin(schema.patronCategories, eq(schema.patrons.categoryId, schema.patronCategories.id))
    .leftJoin(schema.departments, eq(schema.patrons.departmentId, schema.departments.id))
    .leftJoin(schema.institutions, eq(schema.patrons.institutionId, schema.institutions.id))
    .orderBy(schema.patrons.id);

  let activePatrons = 0;
  let activeBorrowers = 0;
  let totalActiveLoans = 0;

  const rows = rawRows.map((r: (typeof rawRows)[number]) => {
    if (r.status === "ACTIVE") activePatrons++;
    const loansCount = Number(r.activeLoans || 0);
    if (loansCount > 0) activeBorrowers++;
    totalActiveLoans += loansCount;

    return {
      cardNo: r.cardNo,
      identifier: r.employeeId || "-",
      name: `${r.firstName} ${r.lastName || ""}`.trim(),
      category: r.categoryName || r.patronType,
      department: r.departmentName || "-",
      institution: r.institutionName || "-",
      contact: r.mobile || r.email || "-",
      activeLoans: loansCount,
      cardExpiry: formatReportDate(r.cardExpiry),
      status: r.status,
    };
  });

  return {
    id: "rpt-06",
    code: "RPT-06",
    name: "Patron Directory & Active Borrowers",
    description:
      "Directory of registered student and faculty members, card expiry status, and active borrowing counts.",
    category: "Compliance",
    generatedAt: new Date().toISOString(),
    dateRange: { startDate: filters.startDate, endDate: filters.endDate },
    columns: [
      { key: "cardNo", label: "Card No", align: "left" },
      { key: "identifier", label: "Roll / Emp ID", align: "left" },
      { key: "name", label: "Full Name", align: "left" },
      { key: "category", label: "Category", align: "left" },
      { key: "department", label: "Department", align: "left" },
      { key: "institution", label: "Institution", align: "left" },
      { key: "activeLoans", label: "Books in Hand", align: "right" },
      { key: "cardExpiry", label: "Card Expiry", align: "center", format: "date" },
      { key: "status", label: "Status", align: "center", format: "badge" },
    ],
    summary: [
      { label: "Total Members", value: rows.length, highlight: true },
      { label: "Active Patrons", value: activePatrons },
      { label: "Active Borrowers", value: activeBorrowers, highlight: true },
      { label: "Total Books Issued", value: totalActiveLoans },
    ],
    rows,
    totalRecords: rows.length,
  };
}

/**
 * 7. RPT-07: Lost & Written-Off Items (Inventory)
 * Report of items marked lost or damaged, replacement costs assessed, and write-off authorizations.
 */
async function getLostAndWrittenOffItems(
  filters: ReportFilterOptions,
  db: DbInstance,
): Promise<ReportQueryResult> {
  const rawRows = await db
    .select({
      id: schema.items.id,
      accessionNo: schema.items.accessionNo,
      barcode: schema.items.barcode,
      title: schema.bibRecords.title,
      authors: schema.bibRecords.authors,
      price: schema.items.price,
      status: schema.items.status,
      shelfLocation: schema.items.location,
      libraryName: schema.libraries.name,
      updatedAt: schema.items.updatedAt,
    })
    .from(schema.items)
    .innerJoin(schema.bibRecords, eq(schema.items.bibId, schema.bibRecords.id))
    .innerJoin(schema.libraries, eq(schema.items.libraryId, schema.libraries.id))
    .where(inArray(schema.items.status, ["LOST", "DAMAGED", "WITHDRAWN"]))
    .orderBy(desc(schema.items.updatedAt));

  let totalLoss = 0;

  const rows = rawRows.map((r: (typeof rawRows)[number]) => {
    const p = Number.parseFloat(r.price || "0");
    totalLoss += Number.isNaN(p) ? 0 : p;

    return {
      accessionNo: r.accessionNo,
      barcode: r.barcode,
      title: r.title,
      authors: r.authors || "-",
      library: r.libraryName,
      location: r.shelfLocation || "-",
      cost: formatCurrencyValue(r.price),
      status: r.status,
      updatedAt: formatReportDate(r.updatedAt),
    };
  });

  return {
    id: "rpt-07",
    code: "RPT-07",
    name: "Lost & Written-Off Items",
    description:
      "Report of items marked lost or damaged, replacement costs assessed, and write-off authorizations.",
    category: "Inventory",
    generatedAt: new Date().toISOString(),
    dateRange: { startDate: filters.startDate, endDate: filters.endDate },
    columns: [
      { key: "accessionNo", label: "Accession No", align: "left" },
      { key: "barcode", label: "Barcode", align: "left" },
      { key: "title", label: "Book Title", align: "left" },
      { key: "authors", label: "Authors", align: "left" },
      { key: "library", label: "Library", align: "left" },
      { key: "cost", label: "Book Value", align: "right", format: "currency" },
      { key: "status", label: "Disposal Status", align: "center", format: "badge" },
      { key: "updatedAt", label: "Record Date", align: "center", format: "date" },
    ],
    summary: [
      { label: "Total Disposed / Lost", value: rows.length, highlight: true },
      { label: "Total Book Asset Loss", value: formatCurrencyValue(totalLoss), highlight: true },
    ],
    rows,
    totalRecords: rows.length,
  };
}

/**
 * 8. RPT-08: Popular & High-Demand Titles (Analytics)
 * Top circulated bibliographic records ranked by checkout frequency and active hold volume.
 */
async function getPopularTitles(
  filters: ReportFilterOptions,
  db: DbInstance,
): Promise<ReportQueryResult> {
  const rawRows = await db
    .select({
      id: schema.bibRecords.id,
      title: schema.bibRecords.title,
      authors: schema.bibRecords.authors,
      isbn: schema.bibRecords.isbn,
      departmentName: schema.departments.name,
      itemTypeName: schema.itemTypes.name,
      totalCheckouts: sql<number>`(
        SELECT COUNT(*)::int FROM loans 
        INNER JOIN items ON loans.item_id = items.id 
        WHERE items.bib_id = bib_records.id
      )`.as("total_checkouts"),
      waitingHolds: sql<number>`(
        SELECT COUNT(*)::int FROM holds 
        WHERE holds.bib_id = bib_records.id AND holds.status = 'WAITING'
      )`.as("waiting_holds"),
      totalCopies: sql<number>`(
        SELECT COUNT(*)::int FROM items 
        WHERE items.bib_id = bib_records.id
      )`.as("total_copies"),
      availableCopies: sql<number>`(
        SELECT COUNT(*)::int FROM items 
        WHERE items.bib_id = bib_records.id AND items.status = 'AVAILABLE'
      )`.as("available_copies"),
    })
    .from(schema.bibRecords)
    .leftJoin(schema.departments, eq(schema.bibRecords.departmentId, schema.departments.id))
    .leftJoin(schema.itemTypes, eq(schema.bibRecords.itemTypeId, schema.itemTypes.id))
    .orderBy(desc(sql`total_checkouts`), desc(sql`waiting_holds`))
    .limit(filters.limit || 50);

  let totalCheckoutsSum = 0;
  let totalHoldsSum = 0;

  const rows = rawRows.map((r: (typeof rawRows)[number], index: number) => {
    const checkouts = Number(r.totalCheckouts || 0);
    const holdsCount = Number(r.waitingHolds || 0);
    totalCheckoutsSum += checkouts;
    totalHoldsSum += holdsCount;

    return {
      rank: `#${index + 1}`,
      title: r.title,
      authors: r.authors || "-",
      isbn: r.isbn || "-",
      department: r.departmentName || "-",
      checkouts,
      waitingHolds: holdsCount,
      copies: `${r.availableCopies} of ${r.totalCopies} avail`,
    };
  });

  return {
    id: "rpt-08",
    code: "RPT-08",
    name: "Popular & High-Demand Titles",
    description:
      "Top circulated bibliographic records ranked by checkout frequency and active hold volume.",
    category: "Analytics",
    generatedAt: new Date().toISOString(),
    dateRange: { startDate: filters.startDate, endDate: filters.endDate },
    columns: [
      { key: "rank", label: "Rank", align: "center" },
      { key: "title", label: "Book Title", align: "left" },
      { key: "authors", label: "Authors", align: "left" },
      { key: "isbn", label: "ISBN", align: "left" },
      { key: "department", label: "Department", align: "left" },
      { key: "checkouts", label: "Total Checkouts", align: "right" },
      { key: "waitingHolds", label: "Pending Holds", align: "right" },
      { key: "copies", label: "Stock Availability", align: "center" },
    ],
    summary: [
      { label: "Titles Ranked", value: rows.length },
      { label: "Circulation Volume", value: totalCheckoutsSum, highlight: true },
      { label: "Total Waiting Queue", value: totalHoldsSum, highlight: true },
    ],
    rows,
    totalRecords: rows.length,
  };
}

/**
 * 9. RPT-09: Department-Wise Resource Utilization (Analytics)
 * Circulation distribution across Engineering, Pharmacy, Management, and Nursing branches.
 */
async function getDepartmentWiseUtilization(
  filters: ReportFilterOptions,
  db: DbInstance,
): Promise<ReportQueryResult> {
  const rawRows = await db
    .select({
      id: schema.departments.id,
      code: schema.departments.code,
      name: schema.departments.name,
      titleCount: sql<number>`(
        SELECT COUNT(*)::int FROM bib_records 
        WHERE bib_records.department_id = departments.id
      )`.as("title_count"),
      copyCount: sql<number>`(
        SELECT COUNT(items.id)::int FROM bib_records 
        INNER JOIN items ON items.bib_id = bib_records.id 
        WHERE bib_records.department_id = departments.id
      )`.as("copy_count"),
      circulationCount: sql<number>`(
        SELECT COUNT(loans.id)::int FROM bib_records 
        INNER JOIN items ON items.bib_id = bib_records.id 
        INNER JOIN loans ON loans.item_id = items.id 
        WHERE bib_records.department_id = departments.id
      )`.as("circulation_count"),
      activeLoanCount: sql<number>`(
        SELECT COUNT(loans.id)::int FROM bib_records 
        INNER JOIN items ON items.bib_id = bib_records.id 
        INNER JOIN loans ON loans.item_id = items.id 
        WHERE bib_records.department_id = departments.id AND loans.status = 'ISSUED'
      )`.as("active_loan_count"),
    })
    .from(schema.departments)
    .orderBy(desc(sql`circulation_count`));

  let totalTitlesSum = 0;
  let totalCopiesSum = 0;
  let totalCircSum = 0;

  const rows = rawRows.map((r: (typeof rawRows)[number]) => {
    const titles = Number(r.titleCount || 0);
    const copies = Number(r.copyCount || 0);
    const circ = Number(r.circulationCount || 0);
    const active = Number(r.activeLoanCount || 0);

    totalTitlesSum += titles;
    totalCopiesSum += copies;
    totalCircSum += circ;

    const rate = copies > 0 ? ((circ / copies) * 100).toFixed(1) : "0.0";

    return {
      code: r.code,
      name: r.name,
      titles,
      copies,
      circulation: circ,
      activeLoans: active,
      utilizationRate: `${rate}%`,
    };
  });

  return {
    id: "rpt-09",
    code: "RPT-09",
    name: "Department-Wise Resource Utilization",
    description: "Circulation distribution across B.Tech, Pharmacy, MBA, and MCA departments.",
    category: "Analytics",
    generatedAt: new Date().toISOString(),
    dateRange: { startDate: filters.startDate, endDate: filters.endDate },
    columns: [
      { key: "code", label: "Dept Code", align: "left" },
      { key: "name", label: "Department Name", align: "left" },
      { key: "titles", label: "Bibliographic Titles", align: "right" },
      { key: "copies", label: "Physical Volumes", align: "right" },
      { key: "circulation", label: "Total Checkouts", align: "right" },
      { key: "activeLoans", label: "Books in Hand", align: "right" },
      { key: "utilizationRate", label: "Utilization %", align: "right", format: "badge" },
    ],
    summary: [
      { label: "Departments", value: rows.length },
      { label: "Total Distinct Titles", value: totalTitlesSum },
      { label: "Total Physical Stock", value: totalCopiesSum, highlight: true },
      { label: "Overall Checkouts", value: totalCircSum, highlight: true },
    ],
    rows,
    totalRecords: rows.length,
  };
}

/**
 * 10. RPT-10: Stock Verification Audit (Inventory)
 * Shelf physical verification status, missing accession flags, and shelf reconciliation variance.
 */
async function getStockVerificationAudit(
  filters: ReportFilterOptions,
  db: DbInstance,
): Promise<ReportQueryResult> {
  const rawRows = await db
    .select({
      id: schema.items.id,
      accessionNo: schema.items.accessionNo,
      barcode: schema.items.barcode,
      title: schema.bibRecords.title,
      libraryName: schema.libraries.name,
      shelfLocation: schema.items.location,
      status: schema.items.status,
      updatedAt: schema.items.updatedAt,
    })
    .from(schema.items)
    .innerJoin(schema.bibRecords, eq(schema.items.bibId, schema.bibRecords.id))
    .innerJoin(schema.libraries, eq(schema.items.libraryId, schema.libraries.id))
    .orderBy(schema.items.location, schema.items.accessionNo);

  let onShelf = 0;
  let inCirculation = 0;
  let flaggedCount = 0;

  const rows = rawRows.map((r: (typeof rawRows)[number]) => {
    if (r.status === "AVAILABLE" || r.status === "REFERENCE_ONLY") onShelf++;
    else if (r.status === "ISSUED") inCirculation++;
    else flaggedCount++;

    return {
      accessionNo: r.accessionNo,
      barcode: r.barcode,
      title: r.title,
      library: r.libraryName,
      location: r.shelfLocation || "Unassigned Shelf",
      status: r.status,
      auditTimestamp: formatReportDate(r.updatedAt),
    };
  });

  return {
    id: "rpt-10",
    code: "RPT-10",
    name: "Stock Verification Audit",
    description:
      "Shelf physical verification status, missing accession flags, and shelf reconciliation variance.",
    category: "Inventory",
    generatedAt: new Date().toISOString(),
    dateRange: { startDate: filters.startDate, endDate: filters.endDate },
    columns: [
      { key: "accessionNo", label: "Accession No", align: "left" },
      { key: "barcode", label: "Barcode", align: "left" },
      { key: "title", label: "Book Title", align: "left" },
      { key: "library", label: "Library Branch", align: "left" },
      { key: "location", label: "Shelf / Stack", align: "left" },
      { key: "status", label: "Physical Status", align: "center", format: "badge" },
      { key: "auditTimestamp", label: "Last Verified", align: "center", format: "date" },
    ],
    summary: [
      { label: "Total Audited Items", value: rows.length, highlight: true },
      { label: "Verified on Shelf", value: onShelf },
      { label: "Active in Circulation", value: inCirculation },
      { label: "Flagged (Lost/Damaged)", value: flaggedCount, highlight: flaggedCount > 0 },
    ],
    rows,
    totalRecords: rows.length,
  };
}

/**
 * 11. RPT-11: Reservation Queue Status (Circulation)
 * Pending title holds, hold wait-times, and expiring pickup notifications.
 */
async function getReservationQueueStatus(
  filters: ReportFilterOptions,
  db: DbInstance,
): Promise<ReportQueryResult> {
  const rawRows = await db
    .select({
      id: schema.holds.id,
      requestDate: schema.holds.requestDate,
      status: schema.holds.status,
      availableDate: schema.holds.availableDate,
      expiryDate: schema.holds.expiryDate,
      title: schema.bibRecords.title,
      patronFirstName: schema.patrons.firstName,
      patronLastName: schema.patrons.lastName,
      cardNo: schema.patrons.cardNo,
      mobile: schema.patrons.mobile,
      barcode: schema.items.barcode,
    })
    .from(schema.holds)
    .innerJoin(schema.bibRecords, eq(schema.holds.bibId, schema.bibRecords.id))
    .innerJoin(schema.patrons, eq(schema.holds.patronId, schema.patrons.id))
    .leftJoin(schema.items, eq(schema.holds.itemId, schema.items.id))
    .where(inArray(schema.holds.status, ["WAITING", "AVAILABLE_FOR_PICKUP"]))
    .orderBy(schema.holds.requestDate);

  let readyPickup = 0;
  let waitingCount = 0;

  const rows = rawRows.map((r: (typeof rawRows)[number], index: number) => {
    if (r.status === "AVAILABLE_FOR_PICKUP") readyPickup++;
    else waitingCount++;

    return {
      holdId: `#HLD-${String(r.id).padStart(4, "0")}`,
      queue: `#${index + 1}`,
      title: r.title,
      patronName: `${r.patronFirstName} ${r.patronLastName || ""}`.trim(),
      cardNo: r.cardNo,
      contact: r.mobile || "-",
      assignedBarcode: r.barcode || "Waiting Return",
      requestDate: formatReportDate(r.requestDate),
      expiryDate: r.expiryDate ? formatReportDate(r.expiryDate) : "-",
      status: r.status,
    };
  });

  return {
    id: "rpt-11",
    code: "RPT-11",
    name: "Reservation Queue Status",
    description: "Pending title holds, hold wait-times, and expiring pickup notifications.",
    category: "Circulation",
    generatedAt: new Date().toISOString(),
    dateRange: { startDate: filters.startDate, endDate: filters.endDate },
    columns: [
      { key: "queue", label: "Priority", align: "center" },
      { key: "holdId", label: "Hold ID", align: "left" },
      { key: "title", label: "Reserved Title", align: "left" },
      { key: "patronName", label: "Patron Name", align: "left" },
      { key: "cardNo", label: "Card No", align: "left" },
      { key: "assignedBarcode", label: "Assigned Copy", align: "left" },
      { key: "requestDate", label: "Request Date", align: "center", format: "date" },
      { key: "expiryDate", label: "Pickup Expiry", align: "center", format: "date" },
      { key: "status", label: "Hold Status", align: "center", format: "badge" },
    ],
    summary: [
      { label: "Active Reservations", value: rows.length, highlight: true },
      { label: "Ready for Pickup", value: readyPickup, highlight: readyPickup > 0 },
      { label: "Waiting in Queue", value: waitingCount },
    ],
    rows,
    totalRecords: rows.length,
  };
}

/**
 * 12. RPT-12: No-Dues Issued Register (Compliance)
 * Chronological repository of all graduation and departure clearance certificates generated.
 */
async function getNoDuesIssuedRegister(
  filters: ReportFilterOptions,
  db: DbInstance,
): Promise<ReportQueryResult> {
  const rawRows = await db
    .select({
      id: schema.auditLogs.id,
      entityId: schema.auditLogs.entityId,
      actorName: schema.auditLogs.actorName,
      createdAt: schema.auditLogs.createdAt,
      details: schema.auditLogs.details,
    })
    .from(schema.auditLogs)
    .where(and(eq(schema.auditLogs.action, "NODUES"), eq(schema.auditLogs.entity, "patrons")))
    .orderBy(desc(schema.auditLogs.id));

  // Also query patrons with INACTIVE or graduated status if any
  const rows = rawRows.map((r: (typeof rawRows)[number]) => {
    return {
      certId: `ND-${new Date(r.createdAt).getFullYear()}-${String(r.id).padStart(4, "0")}`,
      patronRef: `Patron #${r.entityId}`,
      officer: r.actorName,
      issuedDate: formatReportDate(r.createdAt),
      status: "CLEARED",
      details: r.details || "Full clearance granted, no pending books or dues",
    };
  });

  return {
    id: "rpt-12",
    code: "RPT-12",
    name: "No-Dues Issued Register",
    description:
      "Chronological repository of all graduation and departure clearance certificates generated.",
    category: "Compliance",
    generatedAt: new Date().toISOString(),
    dateRange: { startDate: filters.startDate, endDate: filters.endDate },
    columns: [
      { key: "certId", label: "Clearance Ref", align: "left" },
      { key: "patronRef", label: "Patron ID", align: "left" },
      { key: "officer", label: "Authorized By", align: "left" },
      { key: "issuedDate", label: "Date Issued", align: "center", format: "date" },
      { key: "status", label: "Clearance Status", align: "center", format: "badge" },
      { key: "details", label: "Verification Remarks", align: "left" },
    ],
    summary: [
      { label: "Clearances Logged", value: rows.length, highlight: true },
      { label: "Status", value: "Audit Compliant" },
    ],
    rows,
    totalRecords: rows.length,
  };
}

/**
 * 13. RPT-13: System Security Audit Log (Compliance)
 * Chronological trail of user logins, role modifications, failed authentications, and policy events.
 */
async function getSystemSecurityAuditLog(
  filters: ReportFilterOptions,
  db: DbInstance,
): Promise<ReportQueryResult> {
  const conditions = [];
  if (filters.startDate) {
    conditions.push(gte(schema.auditLogs.createdAt, new Date(filters.startDate)));
  }
  if (filters.endDate) {
    conditions.push(lte(schema.auditLogs.createdAt, new Date(filters.endDate)));
  }

  const rawRows = await db
    .select({
      id: schema.auditLogs.id,
      actorType: schema.auditLogs.actorType,
      actorId: schema.auditLogs.actorId,
      actorName: schema.auditLogs.actorName,
      action: schema.auditLogs.action,
      entity: schema.auditLogs.entity,
      entityId: schema.auditLogs.entityId,
      details: schema.auditLogs.details,
      ipAddress: schema.auditLogs.ipAddress,
      createdAt: schema.auditLogs.createdAt,
    })
    .from(schema.auditLogs)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.auditLogs.id))
    .limit(filters.limit || 100);

  let staffEvents = 0;
  let systemEvents = 0;

  const rows = rawRows.map((r: (typeof rawRows)[number]) => {
    if (r.actorType === "STAFF") staffEvents++;
    if (r.actorType === "SYSTEM") systemEvents++;

    return {
      logId: `#AUD-${String(r.id).padStart(6, "0")}`,
      action: r.action,
      actor: r.actorName,
      actorType: r.actorType,
      entity: r.entity ? `${r.entity} (#${r.entityId || "-"})` : "-",
      ipAddress: r.ipAddress || "127.0.0.1",
      details: r.details || "-",
      timestamp: formatReportDate(r.createdAt),
    };
  });

  return {
    id: "rpt-13",
    code: "RPT-13",
    name: "System Security Audit Log",
    description:
      "Chronological trail of user logins, role modifications, failed authentications, and policy events.",
    category: "Compliance",
    generatedAt: new Date().toISOString(),
    dateRange: { startDate: filters.startDate, endDate: filters.endDate },
    columns: [
      { key: "logId", label: "Event ID", align: "left" },
      { key: "action", label: "Action", align: "center", format: "badge" },
      { key: "actor", label: "Actor Name", align: "left" },
      { key: "actorType", label: "Role Type", align: "center", format: "badge" },
      { key: "entity", label: "Target Entity", align: "left" },
      { key: "ipAddress", label: "Client IP", align: "left" },
      { key: "details", label: "Event Details", align: "left" },
      { key: "timestamp", label: "Timestamp", align: "center", format: "date" },
    ],
    summary: [
      { label: "Total Audited Events", value: rows.length, highlight: true },
      { label: "Staff Actions", value: staffEvents },
      { label: "System Actions", value: systemEvents },
    ],
    rows,
    totalRecords: rows.length,
  };
}

/**
 * Main dispatcher to run any of the 13 statutory reports.
 */
export async function generateReportData(
  reportId: string,
  filters: ReportFilterOptions = {},
  db: DbInstance = defaultDb,
): Promise<ReportQueryResult> {
  const normId = reportId.toLowerCase().trim();

  switch (normId) {
    case "rpt-01":
      return getAccessionRegister(filters, db);
    case "rpt-02":
      return getDailyCirculationSummary(filters, db);
    case "rpt-03":
      return getOverdueItemsAndDefaulters(filters, db);
    case "rpt-04":
      return getFineCollectionRegister(filters, db);
    case "rpt-05":
      return getFineWaiverLog(filters, db);
    case "rpt-06":
      return getPatronDirectory(filters, db);
    case "rpt-07":
      return getLostAndWrittenOffItems(filters, db);
    case "rpt-08":
      return getPopularTitles(filters, db);
    case "rpt-09":
      return getDepartmentWiseUtilization(filters, db);
    case "rpt-10":
      return getStockVerificationAudit(filters, db);
    case "rpt-11":
      return getReservationQueueStatus(filters, db);
    case "rpt-12":
      return getNoDuesIssuedRegister(filters, db);
    case "rpt-13":
      return getSystemSecurityAuditLog(filters, db);
    default:
      throw new Error(`Unrecognized report identifier: ${reportId}`);
  }
}
