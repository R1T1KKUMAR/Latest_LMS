import iconv from "iconv-lite";
import { describe, expect, it } from "vitest";
import {
  cleanPhoneNumber,
  decodeCsvBuffer,
  getFieldValue,
  normalizeHeader,
  parseCsvDate,
  parseCsvText,
  splitFullName,
} from "@/imports/csv-parser";

describe("CSV Parser & Utility Functions Unit Suite", () => {
  describe("normalizeHeader", () => {
    it("normalizes headers with mixed casing, spaces, and punctuation", () => {
      expect(normalizeHeader("Roll Number")).toBe("roll_number");
      expect(normalizeHeader("E-mail ID")).toBe("e_mail_id");
      expect(normalizeHeader("Pub. Year")).toBe("pub_year");
      expect(normalizeHeader("  Title (Main)  ")).toBe("title_main");
      expect(normalizeHeader("CARD_NO")).toBe("card_no");
    });
  });

  describe("decodeCsvBuffer", () => {
    it("decodes standard UTF-8 buffer", () => {
      const buf = Buffer.from("roll_no,name\n101,Aarav", "utf8");
      const decoded = decodeCsvBuffer(buf);
      expect(decoded).toContain("roll_no,name");
      expect(decoded).toContain("Aarav");
    });

    it("strips UTF-8 BOM (0xEF, 0xBB, 0xBF)", () => {
      const bom = Buffer.from([0xef, 0xbb, 0xbf]);
      const content = Buffer.from("roll_no,name\n102,Diya", "utf8");
      const bufWithBom = Buffer.concat([bom, content]);

      const decoded = decodeCsvBuffer(bufWithBom);
      expect(decoded.charCodeAt(0)).not.toBe(0xfeff);
      expect(decoded.startsWith("roll_no,name")).toBe(true);
    });

    it("decodes Windows-1252 encoded buffer with special characters", () => {
      // "Café résumé — £50" encoded in Windows-1252
      const win1252Buf = iconv.encode("title,author\nCafé,René", "win1252");
      const decoded = decodeCsvBuffer(win1252Buf, "windows-1252");
      expect(decoded).toContain("Café");
      expect(decoded).toContain("René");
    });
  });

  describe("parseCsvDate", () => {
    it("parses dd-mm-yyyy format", () => {
      expect(parseCsvDate("15-08-2026")).toBe("2026-08-15");
      expect(parseCsvDate("01-01-2025")).toBe("2025-01-01");
    });

    it("parses dd/mm/yyyy format", () => {
      expect(parseCsvDate("26/01/2026")).toBe("2026-01-26");
    });

    it("parses yyyy-mm-dd format", () => {
      expect(parseCsvDate("2026-10-15")).toBe("2026-10-15");
    });

    it("returns null for invalid date strings", () => {
      expect(parseCsvDate("invalid-date")).toBeNull();
      expect(parseCsvDate("")).toBeNull();
      expect(parseCsvDate(null)).toBeNull();
    });
  });

  describe("splitFullName", () => {
    it("handles single-word names", () => {
      expect(splitFullName("Kanishka")).toEqual({ firstName: "Kanishka" });
    });

    it("handles two-word names", () => {
      expect(splitFullName("Rahul Kumar")).toEqual({
        firstName: "Rahul",
        lastName: "Kumar",
      });
    });

    it("handles three-or-more-word names", () => {
      expect(splitFullName("Dr. Priya K. Sharma")).toEqual({
        firstName: "Dr.",
        middleName: "Priya K.",
        lastName: "Sharma",
      });
    });
  });

  describe("cleanPhoneNumber", () => {
    it("strips +91 country prefix and formatting characters", () => {
      const res = cleanPhoneNumber("+91 98765-43210");
      expect(res.number).toBe("9876543210");
      expect(res.isValid10Digit).toBe(true);
    });

    it("strips leading 0", () => {
      const res = cleanPhoneNumber("09876543210");
      expect(res.number).toBe("9876543210");
      expect(res.isValid10Digit).toBe(true);
    });

    it("identifies numbers shorter or longer than 10 digits as invalid", () => {
      const res = cleanPhoneNumber("12345");
      expect(res.number).toBe("12345");
      expect(res.isValid10Digit).toBe(false);
    });
  });

  describe("parseCsvText & getFieldValue", () => {
    it("parses RFC 4180 CSV with quotes, commas, and aliases", () => {
      const csv = `Roll Number,Full Name,"Book, Title"\n101,"Rohan Sharma","Algorithms, 4th Ed"`;
      const rows = parseCsvText(csv);
      expect(rows).toHaveLength(1);
      expect(rows[0].rowNumber).toBe(2);

      const rollVal = getFieldValue(rows[0].raw, "roll_no", ["roll_number", "roll"]);
      expect(rollVal).toBe("101");

      const nameVal = getFieldValue(rows[0].raw, "name", ["full_name"]);
      expect(nameVal).toBe("Rohan Sharma");
    });
  });
});
