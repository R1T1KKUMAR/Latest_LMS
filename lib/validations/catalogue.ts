import { z } from "zod";

export const ITEM_STATUSES = [
  "AVAILABLE",
  "ISSUED",
  "RESERVED",
  "REFERENCE_ONLY",
  "LOST",
  "DAMAGED",
  "REPAIR",
  "WITHDRAWN",
  "PROCESSING",
] as const;

export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const createBibRecordSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(500, "Title cannot exceed 500 characters"),
  subtitle: z
    .string()
    .trim()
    .max(500, "Subtitle cannot exceed 500 characters")
    .optional()
    .nullable(),
  authors: z
    .string()
    .trim()
    .min(1, "At least one author is required")
    .max(500, "Authors cannot exceed 500 characters"),
  editors: z.string().trim().max(500, "Editors cannot exceed 500 characters").optional().nullable(),
  isbn: z.string().trim().max(20, "ISBN cannot exceed 20 characters").optional().nullable(),
  edition: z.string().trim().max(50, "Edition cannot exceed 50 characters").optional().nullable(),
  publisher: z
    .string()
    .trim()
    .max(200, "Publisher cannot exceed 200 characters")
    .optional()
    .nullable(),
  placeOfPublication: z
    .string()
    .trim()
    .max(100, "Place of publication cannot exceed 100 characters")
    .optional()
    .nullable(),
  pubYear: z
    .number()
    .int("Publication year must be an integer")
    .min(1500, "Publication year must be >= 1500")
    .max(2100, "Publication year must be <= 2100")
    .optional()
    .nullable(),
  pages: z.string().trim().max(50, "Pages cannot exceed 50 characters").optional().nullable(),
  language: z.string().trim().max(50, "Language cannot exceed 50 characters").default("English"),
  subject: z.string().trim().max(500, "Subject cannot exceed 500 characters").optional().nullable(),
  keywords: z
    .string()
    .trim()
    .max(500, "Keywords cannot exceed 500 characters")
    .optional()
    .nullable(),
  ddcNumber: z
    .string()
    .trim()
    .max(50, "DDC number cannot exceed 50 characters")
    .optional()
    .nullable(),
  callNumber: z
    .string()
    .trim()
    .max(100, "Call number cannot exceed 100 characters")
    .optional()
    .nullable(),
  itemTypeId: z.number().int().positive("Valid item type is required"),
  departmentId: z.number().int().positive("Valid department is required").optional().nullable(),
  summary: z.string().trim().optional().nullable(),
  price: z
    .union([z.number(), z.string()])
    .optional()
    .nullable()
    .transform((val) => {
      if (val === undefined || val === null || val === "") return "0.00";
      const num = typeof val === "number" ? val : Number.parseFloat(val);
      if (Number.isNaN(num) || num < 0) return "0.00";
      return num.toFixed(2);
    }),
});

export type CreateBibRecordInput = z.input<typeof createBibRecordSchema>;

export const updateBibRecordSchema = createBibRecordSchema.partial();
export type UpdateBibRecordInput = z.input<typeof updateBibRecordSchema>;

export const addCopiesSchema = z.object({
  bibId: z.number().int().positive("Bibliographic record ID is required"),
  libraryId: z.number().int().positive("Library branch is required"),
  count: z
    .number()
    .int()
    .min(1, "Must add at least 1 copy")
    .max(200, "Cannot add more than 200 copies in one action (FR-CA-02)"),
  location: z
    .string()
    .trim()
    .max(100, "Location cannot exceed 100 characters")
    .optional()
    .nullable(),
  price: z
    .union([z.number(), z.string()])
    .optional()
    .nullable()
    .transform((val) => {
      if (val === undefined || val === null || val === "") return undefined;
      const num = typeof val === "number" ? val : Number.parseFloat(val);
      if (Number.isNaN(num) || num < 0) return "0.00";
      return num.toFixed(2);
    }),
  vendorId: z.number().int().positive().optional().nullable(),
  invoiceNo: z.string().trim().max(100).optional().nullable(),
  acquisitionDate: z.string().optional().nullable(),
  conditionNote: z.string().trim().max(500).optional().nullable(),
  callNumber: z.string().trim().max(100).optional().nullable(),
  customAccessionNumbers: z.array(z.string().trim().min(1)).optional(),
});

export type AddCopiesInput = z.input<typeof addCopiesSchema>;

export const updateItemCopySchema = z.object({
  status: z.enum(ITEM_STATUSES).optional(),
  location: z.string().trim().max(100).optional().nullable(),
  callNumber: z.string().trim().max(100).optional().nullable(),
  conditionNote: z.string().trim().max(500).optional().nullable(),
  price: z
    .union([z.number(), z.string()])
    .optional()
    .nullable()
    .transform((val) => {
      if (val === undefined || val === null || val === "") return undefined;
      const num = typeof val === "number" ? val : Number.parseFloat(val);
      if (Number.isNaN(num) || num < 0) return undefined;
      return num.toFixed(2);
    }),
});

export type UpdateItemCopyInput = z.input<typeof updateItemCopySchema>;
