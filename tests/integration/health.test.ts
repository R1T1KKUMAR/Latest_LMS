import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";

describe("Health API Integration Test", () => {
  it("returns HTTP 200 with status ok and valid uptime", async () => {
    const response = await GET();
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.status).toBe("ok");
    expect(data.application).toBe("rbmi-lms");
    expect(data.version).toBe("1.0.0");
    expect(data.checks.application).toBe("healthy");
    expect(typeof data.uptimeSeconds).toBe("number");
  });
});
