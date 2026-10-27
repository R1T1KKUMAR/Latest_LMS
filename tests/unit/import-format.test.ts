import { describe, expect, it } from "vitest";
import {
  DEFAULT_FORMATS,
  getDefaultImportFormat,
  normalizeImportType,
  updateImportFormat,
} from "@/services/import-format";

describe("Import Format Service Unit Tests", () => {
  describe("normalizeImportType", () => {
    it("correctly normalizes all alias variations for student imports", () => {
      expect(normalizeImportType("students")).toBe("STUDENT");
      expect(normalizeImportType("STUDENT")).toBe("STUDENT");
      expect(normalizeImportType("student")).toBe("STUDENT");
    });

    it("correctly normalizes faculty and staff aliases", () => {
      expect(normalizeImportType("faculty")).toBe("FACULTY");
      expect(normalizeImportType("FACULTY")).toBe("FACULTY");
      expect(normalizeImportType("staff")).toBe("FACULTY");
    });

    it("correctly normalizes catalogue and books aliases", () => {
      expect(normalizeImportType("catalog")).toBe("CATALOGUE");
      expect(normalizeImportType("catalogue")).toBe("CATALOGUE");
      expect(normalizeImportType("books")).toBe("CATALOGUE");
      expect(normalizeImportType("book")).toBe("CATALOGUE");
    });

    it("falls back to STUDENT for empty or unknown inputs", () => {
      expect(normalizeImportType("")).toBe("STUDENT");
      expect(normalizeImportType("unknown")).toBe("STUDENT");
    });
  });

  describe("getDefaultImportFormat", () => {
    it("returns all default columns with mandatory flags for students", () => {
      const studentFormat = getDefaultImportFormat("STUDENT");
      expect(studentFormat.length).toBeGreaterThan(10);

      const rollCol = studentFormat.find((c) => c.dbField === "roll_no");
      expect(rollCol).toBeUndefined();

      const nameCol = studentFormat.find((c) => c.dbField === "name");
      expect(nameCol).toBeDefined();
      expect(nameCol?.required).toBe(true);

      const semCol = studentFormat.find((c) => c.dbField === "semester");
      expect(semCol).toBeDefined();
      expect(semCol?.required).toBe(false);
    });

    it("returns mandatory flags for faculty and catalogue formats", () => {
      const facultyFormat = getDefaultImportFormat("FACULTY");
      const empCol = facultyFormat.find((c) => c.dbField === "employee_id");
      expect(empCol?.required).toBe(true);

      const catFormat = getDefaultImportFormat("CATALOGUE");
      const titleCol = catFormat.find((c) => c.dbField === "title");
      expect(titleCol?.required).toBe(true);
      const authorCol = catFormat.find((c) => c.dbField === "authors");
      expect(authorCol?.required).toBe(true);
    });

    it("returns isolated clones so modifying returned format does not mutate constants", () => {
      const fmt1 = getDefaultImportFormat("STUDENT");
      fmt1[0].csvHeader = "modified_header";

      const fmt2 = getDefaultImportFormat("STUDENT");
      expect(fmt2[0].csvHeader).not.toBe("modified_header");
      expect(DEFAULT_FORMATS.STUDENT[0].csvHeader).not.toBe("modified_header");
    });
  });

  describe("updateImportFormat Validation", () => {
    const mockActor = { id: 1, fullName: "Admin User", actorType: "STAFF" as const };

    it("throws error if a mandatory column is removed", async () => {
      const invalidColumns = getDefaultImportFormat("STUDENT").filter(
        (c) => c.dbField !== "name",
      );

      await expect(
        updateImportFormat("STUDENT", invalidColumns, mockActor, {} as any),
      ).rejects.toThrow(/Mandatory column.*cannot be removed/i);
    });

    it("throws error if duplicate header names are supplied", async () => {
      const studentFormat = getDefaultImportFormat("STUDENT");
      studentFormat[0].csvHeader = "duplicate_name";
      studentFormat[1].csvHeader = "duplicate_name";

      await expect(
        updateImportFormat("STUDENT", studentFormat, mockActor, {} as any),
      ).rejects.toThrow(/Duplicate column header/i);
    });

    it("throws error if a header contains invalid symbols or is empty", async () => {
      const studentFormat = getDefaultImportFormat("STUDENT");
      studentFormat[0].csvHeader = "invalid header with spaces and special!";

      await expect(
        updateImportFormat("STUDENT", studentFormat, mockActor, {} as any),
      ).rejects.toThrow(/Invalid header name/i);
    });
  });
});
