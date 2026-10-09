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

  test("scanner autofocusses patron card input in issue tab and moves to copy field", async ({
    page,
  }) => {
    await page.goto("/circulation/issue");
    await expect(page.locator("h1")).toContainText("Book Checkout");

    const patronInput = page.locator("input#circ-patron-card");
    await expect(patronInput).toBeFocused();

    // Fill patron and simulate Enter key
    await patronInput.fill("2301430100062");
    await patronInput.press("Enter");

    // Verify patron profile banner renders
    await expect(page.locator("text=Priya Sharma")).toBeVisible();
    await expect(page.locator("text=Active Loans")).toBeVisible();

    // Verify focus automatically shifted to copy barcode input
    const copyInput = page.locator("input#circ-accession-no");
    await expect(copyInput).toBeFocused();
  });

  test("loads dedicated return terminal with focused barcode input", async ({ page }) => {
    await page.goto("/circulation/return");
    await expect(page.locator("h1")).toContainText("Book Return (Check-In) Terminal");

    const returnInput = page.locator("input#circ-return-barcode");
    await expect(returnInput).toBeFocused();
  });

  test("loads dedicated renewal terminal and declare lost terminal", async ({ page }) => {
    await page.goto("/circulation/renew");
    await expect(page.locator("h1")).toContainText("Loan Renewal Terminal");

    await page.goto("/circulation/lost");
    await expect(page.locator("h1")).toContainText("Declare Material Lost Terminal");
  });
});
