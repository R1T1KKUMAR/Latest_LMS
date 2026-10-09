import { expect, test } from "@playwright/test";

test.describe("Fines & Fee Management E2E Workflows (Phase 10)", () => {
  test("1. Staff navigates to fines desk and views outstanding fines summary", async ({ page }) => {
    // 1. Log in as Librarian
    await page.goto("/login");
    await page.fill('input[name="username"]', "librarian");
    await page.fill('input[name="password"]', "Lib@123");
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/dashboard|\/circulation/);

    // 2. Navigate to /fines
    await page.goto("/fines");
    await expect(page.locator("h1")).toContainText("Fines & Fee Management");

    // 3. Verify summary metric cards
    await expect(page.locator("text=Total Outstanding")).toBeVisible();
    await expect(page.locator("text=Total Collected")).toBeVisible();
    await expect(page.locator("text=Total Waived")).toBeVisible();

    // 4. Verify search and filter controls
    await expect(page.locator('input[placeholder*="Search by patron"]')).toBeVisible();
    await expect(page.locator("select")).toBeVisible();
  });

  test("2. Staff can open payment and waiver modals for outstanding fines", async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[name="username"]', "librarian");
    await page.fill('input[name="password"]', "Lib@123");
    await page.click('button[type="submit"]');

    await page.goto("/fines");

    // Look for Pay button on table
    const payButton = page.locator('button:has-text("Collect Payment")').first();
    if (await payButton.isVisible()) {
      await payButton.click();
      await expect(page.locator("h3:has-text('Receive Fine Payment')")).toBeVisible();
      await expect(page.locator("select#payment-method")).toBeVisible();

      // Close modal
      const cancelBtn = page.locator('button:has-text("Cancel")');
      await cancelBtn.click();
      await expect(page.locator("h3:has-text('Receive Fine Payment')")).not.toBeVisible();
    }

    // Look for Waive button on table
    const waiveButton = page.locator('button:has-text("Waive Fine")').first();
    if (await waiveButton.isVisible()) {
      await waiveButton.click();
      await expect(page.locator("h3:has-text('Waive Outstanding Fine')")).toBeVisible();
      await expect(page.locator("textarea#waiver-remarks")).toBeVisible();

      // Close modal
      const cancelBtn = page.locator('button:has-text("Cancel")');
      await cancelBtn.click();
      await expect(page.locator("h3:has-text('Waive Outstanding Fine')")).not.toBeVisible();
    }
  });

  test("3. Patron account portal displays fines and fee status tab", async ({ page }) => {
    // Log in as patron Rahul
    await page.goto("/login");
    await page.fill('input[name="username"]', "2301430100045");
    await page.fill('input[name="password"]', "2301430100045");
    await page.click('button[type="submit"]');

    // Go to account page
    await page.goto("/account");
    await expect(page.locator("text=Rahul Kumar")).toBeVisible();

    // Check fines or fee summary
    await expect(
      page.locator("text=Outstanding Fines").or(page.locator("text=Fines")),
    ).toBeVisible();
  });
});
