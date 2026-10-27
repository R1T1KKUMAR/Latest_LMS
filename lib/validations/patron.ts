import { z } from "zod";

export const PATRON_TYPES = ["STUDENT", "FACULTY", "STAFF", "GUEST"] as const;
export type PatronType = (typeof PATRON_TYPES)[number];

export const PATRON_STATUSES = ["ACTIVE", "BLOCKED", "EXPIRED", "GRADUATED", "LEFT"] as const;
export type PatronStatus = (typeof PATRON_STATUSES)[number];

export const registerPatronSchema = z
  .object({
    patronType: z.enum(PATRON_TYPES, {
      error: "Patron type must be STUDENT, FACULTY, STAFF, or GUEST",
    }),
    categoryId: z.number().int().positive("Category is required"),
    libraryId: z.number().int().positive().optional().nullable(),
    institutionId: z.number().int().positive().optional().nullable(),
    departmentId: z.number().int().positive().optional().nullable(),
    courseId: z.number().int().positive().optional().nullable(),
    employeeId: z.string().trim().max(50).optional().nullable(),
    firstName: z
      .string()
      .trim()
      .min(1, "First name is required")
      .max(60, "First name cannot exceed 60 characters"),
    middleName: z.string().trim().max(60).optional().nullable(),
    lastName: z.string().trim().max(60).optional().nullable(),
    gender: z.string().trim().max(10).optional().nullable(),
    dob: z.string().optional().nullable(),
    fatherName: z.string().trim().max(100).optional().nullable(),
    mobile: z.string().trim().max(20).optional().nullable(),
    email: z.string().trim().email("Invalid email address").max(100).optional().nullable(),
    address: z.string().trim().max(500).optional().nullable(),
    academicYear: z.number().int().optional().nullable(),
    semester: z.number().int().min(1).max(12).optional().nullable(),
    section: z.string().trim().max(10).optional().nullable(),
    admissionDate: z.string().optional().nullable(),
    courseEndDate: z.string().optional().nullable(),
    cardNo: z.string().trim().max(50).optional().nullable(),
    cardExpiry: z.string().optional().nullable(),
  });

export type RegisterPatronInput = z.infer<typeof registerPatronSchema>;

export const updatePatronSchema = z.object({
  categoryId: z.number().int().positive().optional(),
  libraryId: z.number().int().positive().optional().nullable(),
  departmentId: z.number().int().positive().optional().nullable(),
  courseId: z.number().int().positive().optional().nullable(),
  firstName: z.string().trim().min(1).max(60).optional(),
  middleName: z.string().trim().max(60).optional().nullable(),
  lastName: z.string().trim().max(60).optional().nullable(),
  gender: z.string().trim().max(10).optional().nullable(),
  dob: z.string().optional().nullable(),
  fatherName: z.string().trim().max(100).optional().nullable(),
  mobile: z.string().trim().max(20).optional().nullable(),
  email: z.string().trim().email().max(100).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  academicYear: z.number().int().optional().nullable(),
  semester: z.number().int().min(1).max(12).optional().nullable(),
  section: z.string().trim().max(10).optional().nullable(),
  cardExpiry: z.string().optional().nullable(),
  status: z.enum(PATRON_STATUSES).optional(),
});

export type UpdatePatronInput = z.infer<typeof updatePatronSchema>;

export const patronStatusTransitionSchema = z.object({
  status: z.enum(PATRON_STATUSES, {
    error: "Status must be ACTIVE, BLOCKED, EXPIRED, GRADUATED, or LEFT",
  }),
  reason: z.string().trim().max(500).optional(),
});

export type PatronStatusTransitionInput = z.infer<typeof patronStatusTransitionSchema>;
