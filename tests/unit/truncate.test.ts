import { describe, expect, it } from "vitest";
import { DB_TEXT_LIMITS, truncate, truncateWithDefault } from "@/imports/truncate";

describe("DR-05 Text Limits & Truncation Utility", () => {
  it("leaves text within limit untouched", () => {
    expect(truncate("Clean Title", DB_TEXT_LIMITS.TITLE)).toBe("Clean Title");
    expect(truncate("Short Name", DB_TEXT_LIMITS.NAME)).toBe("Short Name");
  });

  it("truncates text exceeding limit to exact max length", () => {
    const longTitle = "A".repeat(600);
    const truncatedTitle = truncate(longTitle, DB_TEXT_LIMITS.TITLE);
    expect(truncatedTitle).toHaveLength(500);
    expect(truncatedTitle).toBe("A".repeat(500));

    const longName = "B".repeat(100);
    const truncatedName = truncate(longName, DB_TEXT_LIMITS.NAME);
    expect(truncatedName).toHaveLength(60);
    expect(truncatedName).toBe("B".repeat(60));
  });

  it("returns null for null, undefined, or whitespace-only input", () => {
    expect(truncate(null, 50)).toBeNull();
    expect(truncate(undefined, 50)).toBeNull();
    expect(truncate("   ", 50)).toBeNull();
  });

  it("uses default fallback when empty or null", () => {
    expect(truncateWithDefault(null, 50, "Default")).toBe("Default");
    expect(truncateWithDefault("   ", 50, "Unknown")).toBe("Unknown");
    expect(truncateWithDefault("Valid", 50, "Unknown")).toBe("Valid");
  });
});
