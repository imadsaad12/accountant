import { test, expect } from "@playwright/test";

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
  });

  test("loads without errors", async ({ page }) => {
    await expect(page).toHaveURL(/dashboard/);
    await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 10000 });
  });

  test("shows stat cards (gross, net, pending, clients)", async ({ page }) => {
    const body = page.locator("body");
    // At least one of the key metrics should be visible
    await expect(body).toContainText(/gross|net|pending|revenue/i);
  });

  test("shows sidebar navigation links", async ({ page }) => {
    await expect(page.getByRole("link", { name: /clients/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /invoices/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /stock/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /employees/i })).toBeVisible();
  });

  test("shows revenue chart", async ({ page }) => {
    // Recharts renders SVG elements
    await expect(page.locator("svg").first()).toBeVisible({ timeout: 8000 });
  });

  test("shows recent invoices table or empty state", async ({ page }) => {
    const tableOrEmpty = page.locator("table, [class*='empty']");
    await expect(tableOrEmpty.first()).toBeVisible({ timeout: 8000 });
  });

  test("dashboard navigation → clients page works", async ({ page }) => {
    await page.getByRole("link", { name: /clients/i }).first().click();
    await expect(page).toHaveURL(/clients/);
  });

  test("dashboard navigation → invoices page works", async ({ page }) => {
    await page.getByRole("link", { name: /invoices/i }).first().click();
    await expect(page).toHaveURL(/invoices/);
  });

  test("dashboard navigation → stock page works", async ({ page }) => {
    await page.getByRole("link", { name: /stock/i }).first().click();
    await expect(page).toHaveURL(/stock/);
  });

  test("dashboard navigation → employees page works", async ({ page }) => {
    await page.getByRole("link", { name: /employees/i }).first().click();
    await expect(page).toHaveURL(/employees/);
  });

  test("dashboard navigation → settings page works", async ({ page }) => {
    await page.getByRole("link", { name: /settings/i }).first().click();
    await expect(page).toHaveURL(/settings/);
  });
});
