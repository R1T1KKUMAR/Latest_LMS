import { expect, test } from "@playwright/test";

test.describe("Public OPAC Catalogue & Discovery (FR-OP-01, FR-OP-04, NFR-U-06)", () => {
  test("1. Public search works on LAN without authentication", async ({ page }) => {
    await page.goto("/opac");
    await expect(page.locator("h1")).toContainText("Search RBMI Central Library");

    // Check search input is available
    const searchInput = page.locator("input#opac-search-input");
    await expect(searchInput).toBeVisible();

    // Type search query
    await searchInput.fill("Algorithm");
    await expect(page.locator("table")).toBeVisible();
    await expect(page.locator("table")).toContainText("Algorithms");
  });

  test("2. Browse New Arrivals, Most Borrowed, and Departments tabs", async ({ page }) => {
    await page.goto("/opac");

    // 1. New Arrivals Tab
    const newArrivalsTab = page.locator('button:has-text("New Arrivals")');
    await expect(newArrivalsTab).toBeVisible();
    await newArrivalsTab.click();
    await expect(page.locator("text=Recently Acquired Titles")).toBeVisible();

    // 2. Most Borrowed Tab
    const popularTab = page.locator('button:has-text("Most Borrowed")');
    await expect(popularTab).toBeVisible();
    await popularTab.click();
    await expect(page.locator("text=Most Circulated Library Materials")).toBeVisible();

    // 3. Departments Tab
    const deptsTab = page.locator('button:has-text("Browse by Department")');
    await expect(deptsTab).toBeVisible();
    await deptsTab.click();
    await expect(page.locator("text=Academic Department Collections")).toBeVisible();
  });

  test("3. Title page displays complete bibliographic details and physical copies with shelf locations (FR-OP-01)", async ({
    page,
  }) => {
    await page.goto("/opac/title/1");

    // Title header
    await expect(page.locator("h1")).toBeVisible();

    // Physical copies table with shelf locations
    await expect(page.locator("h2:has-text('Physical Copies & Shelf Locations')")).toBeVisible();
    await expect(page.locator("th:has-text('Shelf Location')")).toBeVisible();
    await expect(page.locator("table")).toBeVisible();
  });

  test("4. Public OPAC layout never exposes staff navigation or admin controls (FR-OP-04)", async ({
    page,
  }) => {
    await page.goto("/opac");

    // Staff navigation elements should not be present
    await expect(page.locator('a[href="/dashboard"]')).not.toBeVisible();
    await expect(page.locator('a[href="/admin"]')).not.toBeVisible();
    await expect(page.locator('a[href="/circulation"]')).not.toBeVisible();
    await expect(page.locator('a[href="/no-dues"]')).not.toBeVisible();
  });
});
