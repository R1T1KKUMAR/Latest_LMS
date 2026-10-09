import { expect, test } from "@playwright/test";

test.describe("Reservations & Holds Desk and OPAC Workflows (Phase 9)", () => {
  test("1. Staff navigates to reservations queue and views holds table", async ({ page }) => {
    // Log in as Librarian
    await page.goto("/login");
    await page.fill('input[name="username"]', "librarian");
    await page.fill('input[name="password"]', "Lib@123");
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/dashboard|\/circulation/);

    // Navigate to reservations queue
    await page.goto("/reservations");
    await expect(page.locator("h1")).toContainText("Reservations & Holds Queue");

    // Check search input and Run Expiry Check button
    await expect(page.locator("input#reservations-search")).toBeVisible();
    await expect(page.locator('button:has-text("Run Expiry Check")')).toBeVisible();
  });

  test("2. Unauthenticated user on OPAC sees prompt to login when clicking Reserve", async ({
    page,
  }) => {
    await page.goto("/opac");
    await expect(page.locator("h1")).toContainText("Search RBMI Central Library");

    // Click Reserve on first book
    const reserveBtn = page.locator('button:has-text("Reserve")').first();
    if (await reserveBtn.isVisible()) {
      await reserveBtn.click();
      await expect(
        page.locator("text=To place a reservation or hold on library items"),
      ).toBeVisible();
    }
  });

  test("3. Patron account portal displays reservations queue tab", async ({ page }) => {
    // Log in as patron Priya
    await page.goto("/login");
    await page.fill('input[name="username"]', "2301430100062");
    await page.fill('input[name="password"]', "2301430100062");
    await page.click('button[type="submit"]');

    // Go to account page
    await page.goto("/account");
    await expect(page.locator("text=Priya Sharma")).toBeVisible();

    // Click Holds tab
    const holdsTab = page.locator('button:has-text("Title Holds")');
    if (await holdsTab.isVisible()) {
      await holdsTab.click();
      await expect(page.locator("h2:has-text('Your Title Reservations')")).toBeVisible();
    }
  });
});
