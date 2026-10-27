import { describe, expect, it } from "vitest";
import {
  generateDepartmentBarcode,
  getDepartmentBarcodePrefix,
  parseBarcodeParts,
} from "@/lib/department-barcodes";

describe("Department Barcode Utilities", () => {
  it("resolves correct prefixes for each department code", () => {
    expect(getDepartmentBarcodePrefix("BTECH")).toBe("DENGGD-");
    expect(getDepartmentBarcodePrefix("DIPLOMA")).toBe("DENGGDDP-");
    expect(getDepartmentBarcodePrefix("BCA")).toBe("C-");
    expect(getDepartmentBarcodePrefix("MBA")).toBe("M-");
    expect(getDepartmentBarcodePrefix("BBA")).toBe("AM-");
    expect(getDepartmentBarcodePrefix("BED")).toBe("BEDE-");
  });

  it("parses barcode parts accurately", () => {
    const p1 = parseBarcodeParts("DENGGD-0145");
    expect(p1.prefix).toBe("DENGGD-");
    expect(p1.num).toBe(145);
    expect(p1.padLength).toBe(4);

    const p2 = parseBarcodeParts("C-01");
    expect(p2.prefix).toBe("C-");
    expect(p2.num).toBe(1);
    expect(p2.padLength).toBe(2);
  });

  it("generates transferred barcode preserving sequence when no collision", () => {
    const existing = new Set(["C-01", "C-02"]);
    const newBar = generateDepartmentBarcode("DENGGD-0145", "BCA", existing);
    expect(newBar).toBe("C-0145");
  });

  it("allocates next available barcode when collision occurs in target department", () => {
    const existing = new Set(["C-01", "C-02", "C-03"]);
    const newBar = generateDepartmentBarcode("DENGGD-02", "BCA", existing);
    expect(newBar).toBe("C-04");
  });
});
