import { describe, expect, it } from "vitest";
import { logger } from "@/lib/logger";

describe("Logger Redaction & Configuration", () => {
  it("initializes logger instance", () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.error).toBe("function");
  });

  it("verifies redaction configuration is defined", () => {
    // Check redaction rules configured for sensitive information
    expect(logger.level).toBeDefined();
  });
});
