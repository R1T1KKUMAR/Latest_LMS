import { expect, test } from "@playwright/test";

test.describe("Application Health & Status Endpoints", () => {
  test("GET /api/health returns HTTP 200 with JSON status ok", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);

    const json = await response.json();
    expect(json.status).toBe("ok");
    expect(json.application).toBe("rbmi-lms");
  });

  test("loads /health page and displays operational status", async ({ page }) => {
    await page.goto("/health");
    await expect(page.locator("h2")).toContainText("Application Health & Status");
    await expect(page.locator("body")).toContainText("Operational (Healthy)");
  });
});
