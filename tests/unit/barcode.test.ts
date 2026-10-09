import { describe, expect, it } from "vitest";
import { generateCode128Svg } from "@/lib/barcode";

describe("Unit: Code 128 Barcode Generator (FR-PR-01, FR-CA-07, FR-PA-07)", () => {
  it("generates valid SVG for standard accession number", () => {
    const svg = generateCode128Svg("CL000001");
    expect(svg).toContain("<svg");
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain("<rect");
    expect(svg).toContain("CL000001");
    expect(svg).toContain("</svg>");
  });

  it("encodes various characters and respects height and width options", () => {
    const svg = generateCode128Svg("LIB-2026-99", {
      height: 60,
      barWidth: 3,
      includeText: false,
    });
    expect(svg).toContain("<svg");
    expect(svg).toContain('height="60"');
    expect(svg).not.toContain("<text");
  });

  it("throws error for empty input string", () => {
    expect(() => generateCode128Svg("")).toThrow("Cannot generate barcode for empty text");
    expect(() => generateCode128Svg("   ")).toThrow("Cannot generate barcode for empty text");
  });

  it("escapes XML special characters in human-readable text", () => {
    const svg = generateCode128Svg("A&B");
    expect(svg).toContain("A&amp;B");
  });
});
