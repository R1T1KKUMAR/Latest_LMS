/**
 * Bulk Import Format Configuration Types and Constants
 * Shared between Client Components, Server Components, and backend services.
 * Pure data structures and utilities - no database or server dependencies.
 */

export type ImportType = "STUDENT" | "FACULTY" | "CATALOGUE";

export interface ImportColumnDef {
  /** The column header expected in the CSV/Excel file (admin-editable) */
  csvHeader: string;
  /** Internal database attribute identifier (fixed, immutable) */
  dbField: string;
  /** Display label for UI and instructions */
  label: string;
  /** Whether the field is mandatory for system integrity (cannot be deleted) */
  required: boolean;
  /** Sample value for template generation and UI display */
  sampleValue: string;
  /** Optional format hint or guidance */
  description?: string;
}

export interface Actor {
  id: number;
  fullName: string;
  actorType?: "STAFF" | "PATRON" | "SYSTEM";
  ipAddress?: string;
}

export const IMPORT_SETTING_KEYS: Record<ImportType, string> = {
  STUDENT: "IMPORT_FORMAT_STUDENTS",
  FACULTY: "IMPORT_FORMAT_FACULTY",
  CATALOGUE: "IMPORT_FORMAT_CATALOGUE",
};

/**
 * Normalizes input type string to canonical ImportType ("STUDENT" | "FACULTY" | "CATALOGUE").
 */
export function normalizeImportType(rawType: string): ImportType {
  const norm = (rawType || "").trim().toUpperCase();
  if (norm === "STUDENTS" || norm === "STUDENT") return "STUDENT";
  if (norm === "FACULTY" || norm === "STAFF") return "FACULTY";
  if (norm === "CATALOG" || norm === "CATALOGUE" || norm === "BOOKS" || norm === "BOOK") {
    return "CATALOGUE";
  }
  return "STUDENT";
}

/**
 * Default Built-in Formats
 */
export const DEFAULT_FORMATS: Record<ImportType, ImportColumnDef[]> = {
  STUDENT: [
    {
      csvHeader: "name",
      dbField: "name",
      label: "Full Name",
      required: true,
      sampleValue: "Rohan Sharma",
      description: "Student full name (First Last or Single Name)",
    },
    {
      csvHeader: "card_no",
      dbField: "card_no",
      label: "Library Card No",
      required: false,
      sampleValue: "LIB000001",
      description: "Barcode / Card Number (auto-allocated if omitted)",
    },
    {
      csvHeader: "gender",
      dbField: "gender",
      label: "Gender",
      required: false,
      sampleValue: "M",
      description: "M / F / Other",
    },
    {
      csvHeader: "dob",
      dbField: "dob",
      label: "Date of Birth",
      required: false,
      sampleValue: "15-08-2004",
      description: "DD-MM-YYYY or YYYY-MM-DD",
    },
    {
      csvHeader: "institute",
      dbField: "institute",
      label: "College / Institute",
      required: false,
      sampleValue: "RBCET",
      description: "Campus code (e.g., RBCET, RBCP, RBCN, RBMI, RBTTI)",
    },
    {
      csvHeader: "course",
      dbField: "course",
      label: "Course / Program",
      required: false,
      sampleValue: "B.Tech",
      description: "Course name or code (e.g. B.Tech, MBA, BBA, BCA, BPharm)",
    },
    {
      csvHeader: "department",
      dbField: "department",
      label: "Department / Branch",
      required: false,
      sampleValue: "CSE",
      description: "Department code or branch (e.g. CSE, IT, ME, CE, ECE)",
    },
    {
      csvHeader: "year",
      dbField: "year",
      label: "Academic Year",
      required: false,
      sampleValue: "2",
      description: "Current year of study (1 to 5)",
    },
    {
      csvHeader: "semester",
      dbField: "semester",
      label: "Semester",
      required: false,
      sampleValue: "4",
      description: "Current semester (1 to 10)",
    },
    {
      csvHeader: "section",
      dbField: "section",
      label: "Section",
      required: false,
      sampleValue: "A",
      description: "Class section (e.g. A, B, C)",
    },
    {
      csvHeader: "mobile",
      dbField: "mobile",
      label: "Mobile No",
      required: false,
      sampleValue: "9876543210",
      description: "10-digit mobile number",
    },
    {
      csvHeader: "email",
      dbField: "email",
      label: "Email Address",
      required: false,
      sampleValue: "rohan@example.com",
      description: "Valid student email address",
    },
    {
      csvHeader: "father_name",
      dbField: "father_name",
      label: "Father's Name",
      required: false,
      sampleValue: "Suresh Sharma",
      description: "Parent / Guardian name",
    },
    {
      csvHeader: "admission_date",
      dbField: "admission_date",
      label: "Admission Date",
      required: false,
      sampleValue: "01-08-2023",
      description: "Date of admission (DD-MM-YYYY)",
    },
  ],
  FACULTY: [
    {
      csvHeader: "employee_id",
      dbField: "employee_id",
      label: "Employee ID",
      required: true,
      sampleValue: "EMP-101",
      description: "Unique employee / staff code (Mandatory)",
    },
    {
      csvHeader: "name",
      dbField: "name",
      label: "Full Name",
      required: true,
      sampleValue: "Dr. Priya Verma",
      description: "Faculty / Staff full name",
    },
    {
      csvHeader: "card_no",
      dbField: "card_no",
      label: "Library Card No",
      required: false,
      sampleValue: "EMP-101",
      description: "Card barcode (defaults to Employee ID if omitted)",
    },
    {
      csvHeader: "gender",
      dbField: "gender",
      label: "Gender",
      required: false,
      sampleValue: "F",
      description: "M / F / Other",
    },
    {
      csvHeader: "dob",
      dbField: "dob",
      label: "Date of Birth",
      required: false,
      sampleValue: "22-04-1985",
      description: "DD-MM-YYYY or YYYY-MM-DD",
    },
    {
      csvHeader: "institute",
      dbField: "institute",
      label: "College / Institute",
      required: false,
      sampleValue: "RBMI",
      description: "College code (e.g., RBCET, RBCP, RBCN, RBMI, RBTTI)",
    },
    {
      csvHeader: "department",
      dbField: "department",
      label: "Department",
      required: false,
      sampleValue: "CSE",
      description: "Academic or administrative department",
    },
    {
      csvHeader: "category",
      dbField: "category",
      label: "Patron Category",
      required: false,
      sampleValue: "FACULTY",
      description: "Category code (e.g., FACULTY or STAFF)",
    },
    {
      csvHeader: "mobile",
      dbField: "mobile",
      label: "Mobile No",
      required: false,
      sampleValue: "9812345678",
      description: "10-digit mobile contact number",
    },
    {
      csvHeader: "email",
      dbField: "email",
      label: "Email Address",
      required: false,
      sampleValue: "priya@rbmi.in",
      description: "Official / institutional email address",
    },
    {
      csvHeader: "joining_date",
      dbField: "joining_date",
      label: "Joining Date",
      required: false,
      sampleValue: "01-07-2020",
      description: "Date of appointment (DD-MM-YYYY)",
    },
  ],
  CATALOGUE: [
    {
      csvHeader: "title",
      dbField: "title",
      label: "Book Title",
      required: true,
      sampleValue: "Computer Networks",
      description: "Primary bibliographic title (Mandatory)",
    },
    {
      csvHeader: "authors",
      dbField: "authors",
      label: "Authors",
      required: true,
      sampleValue: "Andrew S. Tanenbaum",
      description: "Primary author(s), comma-separated (Mandatory)",
    },
    {
      csvHeader: "isbn",
      dbField: "isbn",
      label: "ISBN",
      required: false,
      sampleValue: "9780132126953",
      description: "ISBN-10 or ISBN-13 identifier",
    },
    {
      csvHeader: "publisher",
      dbField: "publisher",
      label: "Publisher",
      required: false,
      sampleValue: "Pearson",
      description: "Publishing house / press",
    },
    {
      csvHeader: "pub_year",
      dbField: "pub_year",
      label: "Publication Year",
      required: false,
      sampleValue: "2021",
      description: "Year of publication (1500 to present)",
    },
    {
      csvHeader: "item_type",
      dbField: "item_type",
      label: "Item Type",
      required: false,
      sampleValue: "BOOK",
      description: "Type code (e.g. BOOK, REF, JOURNAL, THESIS)",
    },
    {
      csvHeader: "library",
      dbField: "library",
      label: "Library Branch",
      required: false,
      sampleValue: "CL",
      description: "Target library branch code (e.g. CL, ENG)",
    },
    {
      csvHeader: "copies",
      dbField: "copies",
      label: "No. of Copies",
      required: false,
      sampleValue: "2",
      description: "Count of physical copies to accession",
    },
    {
      csvHeader: "accession_no",
      dbField: "accession_no",
      label: "Accession Numbers",
      required: false,
      sampleValue: "CL001|CL002",
      description: "Specific accession numbers (pipe-delimited for multiple)",
    },
    {
      csvHeader: "barcode",
      dbField: "barcode",
      label: "Barcodes",
      required: false,
      sampleValue: "CL001|CL002",
      description: "Specific barcodes (pipe-delimited for multiple)",
    },
    {
      csvHeader: "price",
      dbField: "price",
      label: "Price (₹)",
      required: false,
      sampleValue: "850.00",
      description: "Acquisition price per copy",
    },
    {
      csvHeader: "location",
      dbField: "location",
      label: "Shelf Location",
      required: false,
      sampleValue: "Shelf A-1",
      description: "Physical shelving location / stack identifier",
    },
    {
      csvHeader: "edition",
      dbField: "edition",
      label: "Edition",
      required: false,
      sampleValue: "5th",
      description: "Edition details (e.g., 5th, 2nd Revised)",
    },
    {
      csvHeader: "subject",
      dbField: "subject",
      label: "Subject",
      required: false,
      sampleValue: "Computer Science",
      description: "Subject classification / discipline",
    },
    {
      csvHeader: "ddc_number",
      dbField: "ddc_number",
      label: "DDC Number",
      required: false,
      sampleValue: "004.6",
      description: "Dewey Decimal Classification number",
    },
  ],
};

/**
 * Returns a cloned copy of the default format for an import type.
 */
export function getDefaultImportFormat(type: ImportType): ImportColumnDef[] {
  return JSON.parse(JSON.stringify(DEFAULT_FORMATS[type]));
}
