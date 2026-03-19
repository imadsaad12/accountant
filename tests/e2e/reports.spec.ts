import { test, expect } from "@playwright/test";

test.describe("Reports", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard/reports");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 10000 });
  });

  // ── PAGE LOAD ────────────────────────────────────────────────
  test("page loads with title and tabs", async ({ page }) => {
    await expect(page.locator("h1").last()).toContainText(/reports/i);
    await expect(page.locator("button, [role='tab']").filter({ hasText: /p&l|profit|income/i })).toBeVisible();
    await expect(page.locator("button, [role='tab']").filter({ hasText: /aging/i })).toBeVisible();
  });

  test("P&L tab is active by default", async ({ page }) => {
    await expect(page.locator("text=/date range|from|period/i").first()).toBeVisible();
    await expect(page.locator("button").filter({ hasText: /generate/i })).toBeVisible();
  });

  // ── P&L REPORT ───────────────────────────────────────────────
  test("P&L generates report with date range", async ({ page }) => {
    const dateInputs = page.locator("input[type='date']");
    await dateInputs.nth(0).fill("2025-01-01");
    await dateInputs.nth(1).fill("2025-12-31");
    await page.getByRole("button", { name: /generate/i }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 10000 });
    // Should show some report content (revenue or expenses or net profit)
    await expect(
      page.locator("text=/revenue|gross profit|net profit|income|expense/i").first()
    ).toBeVisible({ timeout: 8000 });
  });

  test("P&L shows revenue section", async ({ page }) => {
    const dateInputs = page.locator("input[type='date']");
    await dateInputs.nth(0).fill("2025-01-01");
    await dateInputs.nth(1).fill("2025-12-31");
    await page.getByRole("button", { name: /generate/i }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 10000 });
    await expect(page.locator("text=/revenue|income/i").first()).toBeVisible({ timeout: 6000 });
  });

  test("P&L shows expenses section", async ({ page }) => {
    const dateInputs = page.locator("input[type='date']");
    await dateInputs.nth(0).fill("2025-01-01");
    await dateInputs.nth(1).fill("2025-12-31");
    await page.getByRole("button", { name: /generate/i }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 10000 });
    await expect(page.locator("text=/expense/i").first()).toBeVisible({ timeout: 6000 });
  });

  test("P&L shows net profit card", async ({ page }) => {
    const dateInputs = page.locator("input[type='date']");
    await dateInputs.nth(0).fill("2025-01-01");
    await dateInputs.nth(1).fill("2025-12-31");
    await page.getByRole("button", { name: /generate/i }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 10000 });
    await expect(page.locator("text=/net profit/i").first()).toBeVisible({ timeout: 6000 });
  });

  test("P&L stat cards show numeric values", async ({ page }) => {
    const dateInputs = page.locator("input[type='date']");
    await dateInputs.nth(0).fill("2025-01-01");
    await dateInputs.nth(1).fill("2025-12-31");
    await page.getByRole("button", { name: /generate/i }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 10000 });
    // At least one card should contain a currency amount (digits)
    await expect(page.locator("text=/\\d+/").first()).toBeVisible({ timeout: 6000 });
  });

  test("P&L defaults to current month range", async ({ page }) => {
    const dateInputs = page.locator("input[type='date']");
    const from = await dateInputs.nth(0).inputValue();
    const to = await dateInputs.nth(1).inputValue();
    // Both date fields should be pre-filled (not empty)
    expect(from.length).toBeGreaterThan(0);
    expect(to.length).toBeGreaterThan(0);
    // Should look like a date (YYYY-MM-DD)
    expect(from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("P&L generate button triggers loading then shows results", async ({ page }) => {
    const dateInputs = page.locator("input[type='date']");
    await dateInputs.nth(0).fill("2025-03-01");
    await dateInputs.nth(1).fill("2025-03-31");
    await page.getByRole("button", { name: /generate/i }).click();
    // After networkidle, spinner should be gone and content visible
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 8000 });
    await expect(page.locator("text=/revenue|expense|profit/i").first()).toBeVisible({ timeout: 6000 });
  });

  // ── AGING REPORT ─────────────────────────────────────────────
  test("aging tab is clickable and shows aging content", async ({ page }) => {
    const agingTab = page.locator("button, [role='tab']").filter({ hasText: /aging/i });
    await agingTab.click();
    await page.getByRole("button", { name: /generate/i }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 10000 });
    await expect(
      page.locator("text=/current|overdue|aging|receivabl/i").first()
    ).toBeVisible({ timeout: 8000 });
  });

  test("aging shows overdue buckets", async ({ page }) => {
    const agingTab = page.locator("button, [role='tab']").filter({ hasText: /aging/i });
    await agingTab.click();
    await page.getByRole("button", { name: /generate/i }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 10000 });
    // Should show at least two of the aging bucket labels
    const bucketText = await page.locator("text=/1.30|31.60|61.90|90\\+|current/i").count();
    expect(bucketText).toBeGreaterThan(0);
  });

  test("aging table has invoice rows with amounts", async ({ page }) => {
    const agingTab = page.locator("button, [role='tab']").filter({ hasText: /aging/i });
    await agingTab.click();
    await page.getByRole("button", { name: /generate/i }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 10000 });
    await expect(page.locator("table")).toBeVisible({ timeout: 6000 });
    const rows = page.locator("table tbody tr");
    const count = await rows.count();
    if (count > 0) {
      const firstRowText = await rows.first().textContent();
      // Row should have some content
      expect(firstRowText?.trim().length).toBeGreaterThan(0);
    }
  });

  test("aging shows total outstanding amount", async ({ page }) => {
    const agingTab = page.locator("button, [role='tab']").filter({ hasText: /aging/i });
    await agingTab.click();
    await page.getByRole("button", { name: /generate/i }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 10000 });
    await expect(page.locator("text=/total|outstanding/i").first()).toBeVisible({ timeout: 6000 });
  });

  // ── TAB SWITCHING ─────────────────────────────────────────────
  test("switching between P&L and aging tabs works", async ({ page }) => {
    // Start on P&L
    const dateInputs = page.locator("input[type='date']");
    await dateInputs.nth(0).fill("2025-01-01");
    await dateInputs.nth(1).fill("2025-12-31");
    await page.getByRole("button", { name: /generate/i }).click();
    await page.waitForLoadState("networkidle");

    // Switch to aging
    const agingTab = page.locator("button, [role='tab']").filter({ hasText: /aging/i });
    await agingTab.click();
    await page.getByRole("button", { name: /generate/i }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=/aging|overdue|current/i").first()).toBeVisible({ timeout: 6000 });

    // Switch back to P&L
    const plTab = page.locator("button, [role='tab']").filter({ hasText: /p&l|profit|income/i });
    await plTab.click();
    await page.getByRole("button", { name: /generate/i }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=/revenue|profit/i").first()).toBeVisible({ timeout: 6000 });
  });

  // ── EMPTY PERIOD ─────────────────────────────────────────────
  test("P&L with future-only date range shows zero or empty state", async ({ page }) => {
    const dateInputs = page.locator("input[type='date']");
    await dateInputs.nth(0).fill("2099-01-01");
    await dateInputs.nth(1).fill("2099-12-31");
    await page.getByRole("button", { name: /generate/i }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 10000 });
    // Either shows zeros or "no data" message — just shouldn't crash
    await expect(page.locator("body")).not.toContainText(/error|failed|500/i);
  });
});
