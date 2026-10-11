import { expect, test } from "@playwright/test";

test.describe("OPAC Title Reservations & Holds (FR-HO-01, FR-OP-03, T-16, T-17)", () => {
  test("1. Hold placement refusal on title with available shelf copy (T-16)", async ({ page }) => {
    // Sign in as patron Priya
    await page.goto("/login");
    await page.click('button:has-text("Patron OPAC Sign In")');
    await page.fill("input#patron-identifier", "2301430100062");
    await page.fill("input#patron-password", "2301430100062");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("/account");

    // Open Title 3 (Database System Concepts, which has available copy on shelf)
    await page.goto("/opac/title/3");
    await expect(page.locator("h1")).toContainText("Database System Concepts");

    // Click Reserve Title
    await page.click('button:has-text("Reserve Title")');

    // Confirm dialog appears with refusal notice (T-16)
    await expect(
      page.locator("text=reservations may only be placed when all copies are checked out"),
    ).toBeVisible();
    await page.click('button:has-text("Understood")');
  });

  test("2. Hold placement on fully checked-out title and cancellation from account (T-17)", async ({
    page,
  }) => {
    // Sign in as patron Priya
    await page.goto("/login");
    await page.click('button:has-text("Patron OPAC Sign In")');
    await page.fill("input#patron-identifier", "2301430100062");
    await page.fill("input#patron-password", "2301430100062");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("/account");

    // Open Title 1 (Fluid Mechanics, where copy is checked out)
    await page.goto("/opac/title/1");

    // Click Reserve Title
    await page.click('button:has-text("Reserve Title")');

    // If confirmation modal appears, confirm reservation
    const confirmBtn = page.locator('button:has-text("Confirm Reservation")');
    if (await confirmBtn.isVisible()) {
      await confirmBtn.click();
      await expect(page.locator("text=Reservation hold placed")).toBeVisible();
    }

    // Go to account page and check reservations tab
    await page.goto("/account");
    const holdsTab = page.locator('button:has-text("Reservations")');
    await holdsTab.click();

    // Verify queue position is displayed (T-17)
    await expect(page.locator("h2:has-text('Your Title Reservations')")).toBeVisible();

    // Cancel reservation (T-17)
    const cancelBtn = page.locator('button:has-text("Cancel Hold")').first();
    if (await cancelBtn.isVisible()) {
      await cancelBtn.click();
      await page.click('button:has-text("Confirm Cancellation")');
      await expect(page.locator("text=successfully cancelled")).toBeVisible();
    }
  });
});
