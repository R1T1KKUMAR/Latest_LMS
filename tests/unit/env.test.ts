import { describe, expect, it } from "vitest";
import { env } from "@/config/env";

describe("Environment Configuration Validation", () => {
  it("loads default environment values correctly", () => {
    expect(env.NODE_ENV).toBeDefined();
    expect(["development", "production", "test"]).toContain(env.NODE_ENV);
    expect(env.PORT).toBeGreaterThan(0);
  });

  it("ensures session secret has sufficient entropy", () => {
    expect(env.SESSION_SECRET.length).toBeGreaterThanOrEqual(16);
  });

  it("validates database URL format", () => {
    expect(["postgres", "pglite"].some((prefix) => env.DATABASE_URL.includes(prefix))).toBe(true);
  });
});
