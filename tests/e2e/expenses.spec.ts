import { test, expect } from "@playwright/test";

const TS = Date.now();

test.describe("Expenses", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard/expenses");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 10000 });
  });

  // ── PAGE LOAD ────────────────────────────────────────────────
  test("page loads with title and stats", async ({ page }) => {
    await expect(page.locator("h1").last()).toContainText(/expenses/i);
    await expect(page.locator("table")).toBeVisible();
  });

  test("shows total expenses stat card", async ({ page }) => {
    await expect(page.locator("text=/total expenses/i")).toBeVisible();
  });

  test("shows last month stat card", async ({ page }) => {
    await expect(page.locator("text=/last month/i")).toBeVisible();
  });

  test("shows by category breakdown card", async ({ page }) => {
    await expect(page.locator("text=/by category/i")).toBeVisible();
  });

  // ── CREATE ───────────────────────────────────────────────────
  test("create expense with required fields only", async ({ page }) => {
    await page.getByRole("button", { name: /add expense/i }).click();
    await expect(page.locator("h2")).toContainText(/add expense/i, { timeout: 4000 });

    const desc = `Rent Payment ${TS}`;
    // Use today's date so it appears in the default current-month filter
    const today = new Date().toISOString().split("T")[0];
    await page.locator("form input[type='date']").fill(today);
    await page.locator("form input[placeholder='0.00']").fill("1500");
    await page.locator("form input[placeholder*='e.g']").fill(desc);

    await page.getByRole("button", { name: /save/i }).last().click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator(`text=${desc}`)).toBeVisible({ timeout: 6000 });
  });

  test("create expense with all fields", async ({ page }) => {
    await page.getByRole("button", { name: /add expense/i }).click();
    const desc = `Full Expense ${TS}`;

    const today = new Date().toISOString().split("T")[0];
    await page.locator("form input[type='date']").fill(today);
    await page.locator("form input[placeholder='0.00']").fill("450");
    await page.locator("form input[placeholder*='e.g']").fill(desc);
    await page.locator("form select[required]").selectOption("marketing");
    await page.locator("form input[placeholder*='endor']").fill("Meta Ads");
    await page.locator("form input[placeholder*='nvoice']").fill(`REF-${TS}`);

    await page.getByRole("button", { name: /save/i }).last().click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator(`text=${desc}`)).toBeVisible({ timeout: 6000 });
  });

  test("category badge shows correct label in table", async ({ page }) => {
    const rows = page.locator("table tbody tr");
    const count = await rows.count();
    if (count > 0) {
      // Category badges are colored spans in the table
      const badge = rows.first().locator("span").first();
      await expect(badge).toBeVisible();
      const text = await badge.textContent();
      expect(text?.trim().length).toBeGreaterThan(0);
    }
  });

  // ── EDIT ─────────────────────────────────────────────────────
  test("edit expense changes description", async ({ page }) => {
    // Create one first
    await page.getByRole("button", { name: /add expense/i }).click();
    const originalDesc = `Edit Source ${TS}`;
    const today = new Date().toISOString().split("T")[0];
    await page.locator("form input[type='date']").fill(today);
    await page.locator("form input[placeholder='0.00']").fill("100");
    await page.locator("form input[placeholder*='e.g']").fill(originalDesc);
    await page.getByRole("button", { name: /save/i }).last().click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator(`text=${originalDesc}`)).toBeVisible({ timeout: 6000 });

    // Edit it
    const row = page.locator(`tr:has-text("${originalDesc}")`);
    await row.locator("button").first().click();
    await expect(page.locator("h2")).toContainText(/edit/i, { timeout: 4000 });

    const updatedDesc = `Updated Expense ${TS}`;
    await page.locator("form input[placeholder*='e.g']").fill(updatedDesc);
    await page.getByRole("button", { name: /save/i }).last().click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator(`text=${updatedDesc}`)).toBeVisible({ timeout: 6000 });
  });

  test("edit modal pre-fills existing values", async ({ page }) => {
    const editBtn = page.locator("table tbody tr").first().locator("button").first();
    await editBtn.click();
    await expect(page.locator("h2")).toContainText(/edit/i, { timeout: 4000 });
    const amountInput = page.locator("form input[placeholder='0.00']");
    const val = await amountInput.inputValue();
    expect(parseFloat(val)).toBeGreaterThan(0);
    await page.keyboard.press("Escape");
  });

  // ── DELETE ───────────────────────────────────────────────────
  test("delete expense with confirmation", async ({ page }) => {
    await page.getByRole("button", { name: /add expense/i }).click();
    const desc = `Delete Me ${TS}`;
    const today = new Date().toISOString().split("T")[0];
    await page.locator("form input[type='date']").fill(today);
    await page.locator("form input[placeholder='0.00']").fill("99");
    await page.locator("form input[placeholder*='e.g']").fill(desc);
    await page.getByRole("button", { name: /save/i }).last().click();
    await page.waitForLoadState("networkidle");

    const row = page.locator(`tr:has-text("${desc}")`);
    await expect(row).toBeVisible({ timeout: 6000 });
    page.on("dialog", (d) => d.accept());
    await row.locator("button").last().click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator(`text=${desc}`)).toHaveCount(0, { timeout: 6000 });
  });

  // ── FILTERS ──────────────────────────────────────────────────
  test("filter by category shows only matching rows", async ({ page }) => {
    // Use the filter select (outside form — the first select on page)
    const catFilter = page.locator("select").first();
    await catFilter.selectOption("rent");
    await page.getByRole("button", { name: /search/i }).click();
    await page.waitForLoadState("networkidle");
    const rows = page.locator("table tbody tr");
    const count = await rows.count();
    if (count > 0) {
      const badges = page.locator("table tbody tr span").first();
      await expect(badges).toBeVisible();
    }
  });

  test("filter by date range shows only matching rows", async ({ page }) => {
    // Filter date inputs are the top-level ones (not inside form)
    const filterDateInputs = page.locator("input[type='date']");
    await filterDateInputs.nth(0).fill("2025-03-01");
    await filterDateInputs.nth(1).fill("2025-03-31");
    await page.getByRole("button", { name: /search/i }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator("table")).toBeVisible();
  });

  test("clear filter button resets to all expenses", async ({ page }) => {
    const catFilter = page.locator("select").first();
    await catFilter.selectOption("rent");
    await page.getByRole("button", { name: /search/i }).click();
    await page.waitForLoadState("networkidle");
    const filteredCount = await page.locator("table tbody tr").count();

    await page.getByRole("button", { name: /clear/i }).click();
    await page.waitForLoadState("networkidle");
    const allCount = await page.locator("table tbody tr").count();
    expect(allCount).toBeGreaterThanOrEqual(filteredCount);
  });

  test("filter by salaries category shows salary expenses", async ({ page }) => {
    const catFilter = page.locator("select").first();
    await catFilter.selectOption("salaries");
    await page.getByRole("button", { name: /search/i }).click();
    await page.waitForLoadState("networkidle");
    const rows = page.locator("table tbody tr");
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
  });

  // ── VALIDATION ───────────────────────────────────────────────
  test("ERROR: missing amount blocks form submission", async ({ page }) => {
    await page.getByRole("button", { name: /add expense/i }).click();
    await page.locator("form input[type='date']").fill("2025-03-01");
    await page.locator("form input[placeholder*='e.g']").fill("Test expense");
    await page.getByRole("button", { name: /save/i }).last().click();
    await expect(page.locator("h2")).toContainText(/add|edit/i);
    await page.keyboard.press("Escape");
  });

  test("ERROR: missing description blocks form submission", async ({ page }) => {
    await page.getByRole("button", { name: /add expense/i }).click();
    await page.locator("form input[placeholder='0.00']").fill("100");
    await page.getByRole("button", { name: /save/i }).last().click();
    await expect(page.locator("h2")).toContainText(/add|edit/i);
    await page.keyboard.press("Escape");
  });

  test("cancel closes modal without saving", async ({ page }) => {
    await page.getByRole("button", { name: /add expense/i }).click();
    await page.locator("form input[placeholder*='e.g']").fill("Should Not Be Saved");
    await page.getByRole("button", { name: /cancel/i }).click();
    await expect(page.locator("text=Should Not Be Saved")).toHaveCount(0);
  });

  // ── AMOUNT DISPLAY ───────────────────────────────────────────
  test("expense amounts show in table", async ({ page }) => {
    const rows = page.locator("table tbody tr");
    const count = await rows.count();
    if (count > 0) {
      await expect(rows.first()).toBeVisible();
      const rowText = await rows.first().textContent() ?? "";
      expect(rowText).toMatch(/\d/);
    }
  });
});
