import { expect, test } from "@playwright/test";

test.describe("Patron Authentication & Account Portal (FR-AU-05, FR-OP-02, T-20)", () => {
  test("1. Student signs in to OPAC with roll number, sees default password notice, changes password (T-20)", async ({
    page,
  }) => {
    // Navigate to Login page
    await page.goto("/login");

    // Click Patron OPAC Sign In tab
    await page.click('button:has-text("Patron OPAC Sign In")');

    // Sign in using student Neha Gupta credentials (roll number as initial password)
    await page.fill("input#patron-identifier", "2201430100033");
    await page.fill("input#patron-password", "2201430100033");
    await page.click('button[type="submit"]');

    // Redirects to /account
    await expect(page).toHaveURL("/account");
    await expect(page.locator("h1")).toContainText("Neha Gupta");

    // Verify Default Password Notice is displayed per T-20
    await expect(
      page.locator("text=Security Action Required: Default Password Active"),
    ).toBeVisible();

    // Click "Change Password Now" button
    await page.click('button:has-text("Change Password Now")');

    // Fill password change form (minimum 6 characters per FR-OP-03)
    await page.fill("input#patron-current-password", "2201430100033");
    await page.fill("input#patron-new-password", "newNehaPass2026");
    await page.fill("input#patron-confirm-password", "newNehaPass2026");
    await page.click('button:has-text("Update Password")');

    // Verify success alert
    await expect(page.locator("text=Your password has been changed successfully")).toBeVisible();

    // Sign out
    await page.click('button:has-text("Sign Out")');
    await expect(page).toHaveURL("/login");

    // Subsequent login: old password refused (T-20)
    await page.click('button:has-text("Patron OPAC Sign In")');
    await page.fill("input#patron-identifier", "2201430100033");
    await page.fill("input#patron-password", "2201430100033");
    await page.click('button[type="submit"]');
    await expect(page.locator("text=Invalid")).toBeVisible();

    // Login with new password succeeds
    await page.fill("input#patron-password", "newNehaPass2026");
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL("/account");
  });

  test("2. Signed-in patron views borrowing history and loans with due dates (FR-OP-02)", async ({
    page,
  }) => {
    // Sign in as student Rahul
    await page.goto("/login");
    await page.click('button:has-text("Patron OPAC Sign In")');
    await page.fill("input#patron-identifier", "2301430100045");
    await page.fill("input#patron-password", "2301430100045");
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL("/account");

    // Current loans tab is active by default
    await expect(page.locator("h2:has-text('Currently Borrowed Volumes')")).toBeVisible();

    // Check Borrowing History tab
    const historyTab = page.locator('button:has-text("Borrowing History")');
    await expect(historyTab).toBeVisible();
    await historyTab.click();
    await expect(page.locator("h2:has-text('Borrowing History')")).toBeVisible();

    // Check Fines & Dues tab
    const finesTab = page.locator('button:has-text("Fines & Dues")');
    await expect(finesTab).toBeVisible();
    await finesTab.click();
    await expect(page.locator("text=Total Outstanding Balance")).toBeVisible();
  });
});
