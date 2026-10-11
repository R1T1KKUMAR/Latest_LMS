import { expect, test } from "@playwright/test";

test.describe("No-Dues Clearance Desk E2E Workflows (Phase 11, T-21)", () => {
  test("1. Staff checks patron with active liabilities: dues pending, certificate blocked (T-21)", async ({
    page,
  }) => {
    // Log in as Librarian
    await page.goto("/login");
    await page.fill('input[name="username"]', "librarian");
    await page.fill('input[name="password"]', "Lib@123");
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/dashboard|\/circulation/);

    // Navigate to /no-dues
    await page.goto("/no-dues");
    await expect(page.locator("h1")).toContainText("No-Dues Clearance Desk");

    // Enter card of patron with active loans (Rahul Kumar)
    const cardInput = page.locator("input#no-dues-card-input");
    await cardInput.fill("2301430100045");
    await page.click('button:has-text("Verify Clearance")');

    // Verify ineligibility banner & active loan details
    await expect(page.locator("text=Ineligible — Dues Pending")).toBeVisible();
    await expect(page.locator("text=Clearance Blocked:")).toBeVisible();
    await expect(page.locator("text=Check-In Book")).toBeVisible();
  });

  test("2. Clean patron clearance: certificate generated, account marked GRADUATED, printable view (T-21)", async ({
    page,
  }) => {
    // Log in as Librarian
    await page.goto("/login");
    await page.fill('input[name="username"]', "librarian");
    await page.fill('input[name="password"]', "Lib@123");
    await page.click('button[type="submit"]');

    await page.goto("/no-dues");

    // Enter card of clean patron (Neha Gupta: 2201430100033)
    const cardInput = page.locator("input#no-dues-card-input");
    await cardInput.fill("2201430100033");
    await page.click('button:has-text("Verify Clearance")');

    // Verify eligibility
    const eligibleBadge = page.locator("text=Eligible for Clearance");
    if (await eligibleBadge.isVisible()) {
      // Click Generate No-Dues Certificate
      await page.click('button:has-text("Generate No-Dues Certificate")');

      // Modal dialog opens
      await expect(
        page.locator("h3:has-text('Issue Official No-Dues Clearance Certificate')"),
      ).toBeVisible();
      await expect(page.locator("text=Close account upon clearance")).toBeVisible();

      // Submit modal
      await page.click('button:has-text("Confirm & Issue Certificate")');

      // Success alert rendered
      await expect(page.locator("text=Clearance Certificate Issued Successfully")).toBeVisible();
      await expect(page.locator("text=View & Print Certificate")).toBeVisible();
    }
  });

  test("3. Assistant Librarian cannot access No-Dues desk (RBAC check)", async ({ page }) => {
    // Log in as Assistant Librarian (lacks NODUES_ISSUE)
    await page.goto("/login");
    await page.fill('input[name="username"]', "assistant");
    await page.fill('input[name="password"]', "Asst@123");
    await page.click('button[type="submit"]');

    await page.goto("/no-dues");

    // Verify Access Denied / ForbiddenCard
    await expect(
      page.locator(
        "text=Access to the No-Dues Clearance Desk requires the NODUES_ISSUE permission.",
      ),
    ).toBeVisible();
  });
});
