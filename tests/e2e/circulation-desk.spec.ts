import { expect, test } from "@playwright/test";

test.describe("Circulation Desk E2E Workflows (Phase 8)", () => {
  test.beforeEach(async ({ page }) => {
    // 1. Log in as Librarian
    await page.goto("/login");
    await page.fill('input[name="username"]', "librarian");
    await page.fill('input[name="password"]', "Lib@123");
    await page.click('button[type="submit"]');

    // Wait for redirect to dashboard
    await expect(page).toHaveURL(/\/dashboard|\/circulation/);
  });

  test("loads unified circulation desk and navigates tabs", async ({ page }) => {
    await page.goto("/circulation");
    await expect(page.locator("h1")).toContainText("Circulation Desk");

    // Check tabs exist
    const issueTab = page.locator('button:has-text("Check Out (Issue)")');
    const returnTab = page.locator('button:has-text("Check In (Return)")');
    const renewTab = page.locator('button:has-text("Renew Loan")');
    const lostTab = page.locator('button:has-text("Declare Lost")');

    await expect(issueTab).toBeVisible();
    await expect(returnTab).toBeVisible();
    await expect(renewTab).toBeVisible();
    await expect(lostTab).toBeVisible();

    // Verify Active Loans table is present
    await expect(page.locator("h2:has-text('Active Circulation Records')")).toBeVisible();
  });

  test("loads dedicated book checkout terminal with category selection", async ({
    page,
  }) => {
    await page.goto("/circulation/issue");
    await expect(page.locator("h1")).toContainText("Book Checkout");

    // Verify cascading selection card is present
    await expect(page.locator("text=Category-Wise Dynamic Selection")).toBeVisible();
    await expect(page.locator("select#issue-patron-type-select")).toBeVisible();
    await expect(page.locator("button:has-text('Check Out Item')")).toBeVisible();
  });

  test("loads dedicated return terminal with category selection", async ({ page }) => {
    await page.goto("/circulation/return");
    await expect(page.locator("h1")).toContainText("Book Return (Check-In) Terminal");

    // Verify cascading return selection card is present
    await expect(page.locator("text=Category-Wise Dynamic Return Selection")).toBeVisible();
    await expect(page.locator("select#return-patron-type-select")).toBeVisible();
    await expect(page.locator("button:has-text('Process Return')")).toBeVisible();
  });

  test("loads dedicated renewal terminal and declare lost terminal", async ({ page }) => {
    await page.goto("/circulation/renew");
    await expect(page.locator("h1")).toContainText("Loan Renewal Terminal");

    await page.goto("/circulation/lost");
    await expect(page.locator("h1")).toContainText("Declare Material Lost Terminal");
  });
});
