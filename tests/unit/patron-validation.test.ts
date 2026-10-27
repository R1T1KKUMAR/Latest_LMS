import { describe, expect, it } from "vitest";
import { calculateCardExpiry, formatCardNumber } from "@/lib/numbering";
import { registerPatronSchema } from "@/lib/validations/patron";

describe("Unit: Patron Validation & Numbering (FR-PA-01, FR-PA-02, FR-PA-03)", () => {
  it("formats library card number with sequence zero-padding", () => {
    expect(formatCardNumber("LIB", 1)).toBe("LIB000001");
    expect(formatCardNumber("LIB", 42)).toBe("LIB000042");
    expect(formatCardNumber("CARD", 999999)).toBe("CARD999999");
  });

  it("calculates card expiry date from category validity years (FR-PA-03)", () => {
    const today = new Date("2026-01-01");
    const expiry = calculateCardExpiry({
      admissionDate: today,
      cardValidityYears: 4,
    });
    expect(expiry.getFullYear()).toBe(2030);
  });

  it("prioritizes course end date when provided for card expiry (FR-PA-03)", () => {
    const courseEnd = new Date("2028-06-30");
    const expiry = calculateCardExpiry({
      courseEndDate: courseEnd,
      admissionDate: new Date("2026-01-01"),
      cardValidityYears: 4,
    });
    expect(expiry.toISOString().split("T")[0]).toBe("2028-06-30");
  });

  it("validates student registration without requiring roll number", () => {
    const validStudent = {
      patronType: "STUDENT",
      categoryId: 1,
      firstName: "Rahul",
      lastName: "Sharma",
      email: "rahul@example.com",
    };
    const parsed = registerPatronSchema.parse(validStudent);
    expect(parsed.firstName).toBe("Rahul");
    expect(parsed.patronType).toBe("STUDENT");
  });

  it("validates faculty registration without requiring roll number", () => {
    const faculty = {
      patronType: "FACULTY",
      categoryId: 2,
      firstName: "Dr. Sunita",
      lastName: "Rao",
      employeeId: "EMP-202",
      email: "sunita@example.com",
    };
    const parsed = registerPatronSchema.parse(faculty);
    expect(parsed.firstName).toBe("Dr. Sunita");
    expect(parsed.employeeId).toBe("EMP-202");
  });
});
