import { describe, expect, it } from "vitest";
import { formatAccessionNumber, normalizeIsbn } from "@/lib/numbering";
import { addCopiesSchema, createBibRecordSchema } from "@/lib/validations/catalogue";

describe("Unit: Catalogue Validation & Numbering (FR-CA-01, FR-CA-02)", () => {
  it("normalizes ISBN-10 and ISBN-13 with hyphens and spaces", () => {
    expect(normalizeIsbn("978-0-13-110362-7")).toBe("9780131103627");
    expect(normalizeIsbn("0-13-110362-8")).toBe("0131103628");
    expect(normalizeIsbn("  978 0131103627  ")).toBe("9780131103627");
    expect(normalizeIsbn(null)).toBeNull();
    expect(normalizeIsbn(undefined)).toBeNull();
  });

  it("formats accession number with 6-digit zero-padding", () => {
    expect(formatAccessionNumber("CL", 1)).toBe("CL000001");
    expect(formatAccessionNumber("ML", 42)).toBe("ML000042");
    expect(formatAccessionNumber("cl", 999999)).toBe("CL999999");
  });

  it("validates valid bibliographic title input", () => {
    const valid = {
      title: "Clean Architecture",
      authors: "Robert C. Martin",
      isbn: "978-0134494166",
      pubYear: 2017,
      itemTypeId: 1,
      price: 750.5,
    };
    const parsed = createBibRecordSchema.parse(valid);
    expect(parsed.title).toBe("Clean Architecture");
    expect(parsed.price).toBe("750.50");
  });

  it("rejects title input missing required title or authors", () => {
    expect(() =>
      createBibRecordSchema.parse({
        title: "",
        authors: "Author",
        itemTypeId: 1,
      }),
    ).toThrow();

    expect(() =>
      createBibRecordSchema.parse({
        title: "Title",
        authors: "",
        itemTypeId: 1,
      }),
    ).toThrow();
  });

  it("rejects publication year outside 1500 to 2100", () => {
    expect(() =>
      createBibRecordSchema.parse({
        title: "Ancient Manuscript",
        authors: "Scribe",
        itemTypeId: 1,
        pubYear: 1200,
      }),
    ).toThrow();

    expect(() =>
      createBibRecordSchema.parse({
        title: "Future Tech",
        authors: "AI",
        itemTypeId: 1,
        pubYear: 2500,
      }),
    ).toThrow();
  });

  it("enforces copy count between 1 and 200 (FR-CA-02)", () => {
    expect(() =>
      addCopiesSchema.parse({
        bibId: 1,
        libraryId: 1,
        count: 0,
      }),
    ).toThrow();

    expect(() =>
      addCopiesSchema.parse({
        bibId: 1,
        libraryId: 1,
        count: 201,
      }),
    ).toThrow();

    const valid = addCopiesSchema.parse({
      bibId: 1,
      libraryId: 1,
      count: 200,
    });
    expect(valid.count).toBe(200);
  });
});
