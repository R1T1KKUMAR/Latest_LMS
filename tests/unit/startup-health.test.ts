import { describe, expect, it } from "vitest";
import { getSanitizedDatabaseUrl, checkDatabaseConnection } from "@/db/client";

describe("TK-12 / FR-ST-01 & FR-ST-02: Startup & Database Diagnostics", () => {
  it("masks database password in getSanitizedDatabaseUrl (FR-ST-02)", () => {
    const url = getSanitizedDatabaseUrl();
    expect(url).toBeDefined();
    expect(typeof url).toBe("string");
    // Password must be masked or not present
    expect(url).not.toContain("password123");
    if (url.startsWith("postgres")) {
      expect(url).toMatch(/:\*{3,6}@/);
    }
  });

  it("checks database connection and returns diagnostic fields (FR-ST-01, FR-ST-02)", async () => {
    const status = await checkDatabaseConnection();
    expect(status).toHaveProperty("connected");
    expect(status).toHaveProperty("sanitizedUrl");
    expect(typeof status.sanitizedUrl).toBe("string");

    if (status.connected) {
      expect(status.version).toBeDefined();
      expect(typeof status.version).toBe("string");
    } else {
      expect(status.error).toBeDefined();
      expect(typeof status.error).toBe("string");
    }
  });
});
