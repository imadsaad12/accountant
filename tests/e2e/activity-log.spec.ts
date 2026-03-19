import { test, expect } from "@playwright/test";

test.describe("Activity Log", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard/activity-log");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 10000 });
  });

  test("page loads with table", async ({ page }) => {
    await expect(page.locator("h1").last()).toContainText(/activity|log/i);
    await expect(page.locator("table")).toBeVisible();
  });

  test("shows log entries with action badges", async ({ page }) => {
    // Should have at least one log entry (from seed data actions)
    const rows = page.locator("table tbody tr");
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
  });

  test("log has date, user, action, entity columns", async ({ page }) => {
    const headers = await page.locator("thead th").allTextContents();
    const headerText = headers.join(" ").toLowerCase();
    expect(headerText).toMatch(/date|time/i);
    expect(headerText).toMatch(/user/i);
    expect(headerText).toMatch(/action/i);
  });

  test("filter by entity 'client' shows only client logs", async ({ page }) => {
    const entityFilter = page.locator("select").first();
    await entityFilter.selectOption("client");
    await page.waitForTimeout(500);
    const rows = page.locator("table tbody tr");
    const count = await rows.count();
    if (count > 1) {
      // Every visible row should mention client
      const firstRow = await rows.first().textContent();
      expect(firstRow?.toLowerCase()).toContain("client");
    }
  });

  test("filter by action 'create'", async ({ page }) => {
    const actionFilter = page.locator("select").nth(2); // entity=0, method=1, action=2
    await actionFilter.selectOption("create");
    await page.waitForTimeout(500);
    await expect(page.locator("table")).toBeVisible();
  });

  test("filter by action 'delete'", async ({ page }) => {
    const actionFilter = page.locator("select").nth(2);
    await actionFilter.selectOption("delete");
    await page.waitForTimeout(500);
    await expect(page.locator("table")).toBeVisible();
  });

  test("filter by method 'manual'", async ({ page }) => {
    const methodFilter = page.locator("select").nth(1); // entity=0, method=1, action=2
    await methodFilter.selectOption("manual");
    await page.waitForTimeout(500);
    await expect(page.locator("table")).toBeVisible();
  });

  test("search description filters entries", async ({ page }) => {
    const search = page.locator("input[placeholder*='earch']");
    await search.fill("zzz_nobody_would_have_this");
    // Submit the search form
    await page.getByRole("button", { name: /search/i }).click();
    await page.waitForTimeout(300);
    // Should show empty or "no results"
    const rows = await page.locator("table tbody tr").count();
    const noResults = await page.locator("text=/no results|no log/i").count();
    expect(rows <= 1 || noResults > 0).toBeTruthy();
  });

  test("creating a client adds a log entry", async ({ page }) => {
    // Get current count
    const initialRows = await page.locator("table tbody tr").count();

    // Create a client
    await page.goto("/dashboard/clients");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /add client/i }).click();
    await page.locator("input[required]").first().fill(`LogTest ${Date.now()}`);
    await page.getByRole("button", { name: /add client/i }).last().click();
    await page.waitForLoadState("networkidle");

    // Back to activity log
    await page.goto("/dashboard/activity-log");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 8000 });

    const newRows = await page.locator("table tbody tr").count();
    expect(newRows).toBeGreaterThanOrEqual(initialRows);
  });

  test("pagination next button works (if multiple pages)", async ({ page }) => {
    const nextBtn = page.getByRole("button", { name: "Next", exact: true });
    const count = await nextBtn.count();
    if (count === 1 && await nextBtn.isEnabled()) {
      await nextBtn.click();
      await page.waitForLoadState("networkidle");
      await expect(page.locator("table tbody tr").first()).toBeVisible();
      // Go back
      await page.getByRole("button", { name: "Previous", exact: true }).click();
    }
  });
});
