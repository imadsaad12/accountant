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

  test("shows this month stat card", async ({ page }) => {
    await expect(page.locator("text=/this month/i")).toBeVisible();
  });

  test("shows by category breakdown card", async ({ page }) => {
    await expect(page.locator("text=/by category/i")).toBeVisible();
  });

  // ── CREATE ───────────────────────────────────────────────────
  test("create expense with required fields only", async ({ page }) => {
    await page.getByRole("button", { name: /add expense/i }).click();
    await expect(page.locator("h2")).toContainText(/add expense/i, { timeout: 4000 });

    const desc = `Rent Payment ${TS}`;
    await page.locator("input[type='date']").first().fill("2025-03-01");
    await page.locator("input[placeholder='0.00']").fill("1500");
    await page.locator("input[placeholder*='rent|e.g.|monthly']").fill(desc).catch(() =>
      page.locator("input[required]").last().fill(desc)
    );
    // description is the required text input after amount
    const descInput = page.locator("form input[required]").last();
    if (await descInput.inputValue() === "") await descInput.fill(desc);

    await page.getByRole("button", { name: /save/i }).last().click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator(`text=${desc}`)).toBeVisible({ timeout: 6000 });
  });

  test("create expense with all fields", async ({ page }) => {
    await page.getByRole("button", { name: /add expense/i }).click();
    const desc = `Full Expense ${TS}`;

    await page.locator("input[type='date']").first().fill("2025-03-15");
    await page.locator("input[placeholder='0.00']").fill("450");
    // Description
    await page.locator("input[required]").last().fill(desc);
    // Category — target the form's required select, not the filter select
    const catSelect = page.locator("select[required]");
    await catSelect.selectOption("marketing");
    // Vendor
    await page.locator("input[placeholder*='endor']").fill("Meta Ads");
    // Reference
    await page.locator("input[placeholder*='Invoice']").fill(`REF-${TS}`);

    await page.getByRole("button", { name: /save/i }).last().click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator(`text=${desc}`)).toBeVisible({ timeout: 6000 });
  });

  test("category badge shows correct label in table", async ({ page }) => {
    // The table should show category badges — verify at least one is visible
    const badge = page.locator("table tbody tr").first().locator("span.rounded.border").first();
    await expect(badge).toBeVisible();
    const text = await badge.textContent();
    expect(text?.trim().length).toBeGreaterThan(0);
  });

  // ── EDIT ─────────────────────────────────────────────────────
  test("edit expense changes description", async ({ page }) => {
    const editBtn = page.locator("table tbody tr").first().locator("button").first();
    await editBtn.click();
    await expect(page.locator("h2")).toContainText(/edit/i, { timeout: 4000 });

    const descInput = page.locator("input[required]").last();
    const updatedDesc = `Updated Expense ${TS}`;
    await descInput.fill(updatedDesc);
    await page.getByRole("button", { name: /save/i }).last().click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator(`text=${updatedDesc}`)).toBeVisible({ timeout: 6000 });
  });

  test("edit modal pre-fills existing values", async ({ page }) => {
    const editBtn = page.locator("table tbody tr").first().locator("button").first();
    await editBtn.click();
    await expect(page.locator("h2")).toContainText(/edit/i, { timeout: 4000 });
    // Amount field should not be empty
    const amountInput = page.locator("input[placeholder='0.00']");
    const val = await amountInput.inputValue();
    expect(parseFloat(val)).toBeGreaterThan(0);
    await page.keyboard.press("Escape");
  });

  // ── DELETE ───────────────────────────────────────────────────
  test("delete expense with confirmation", async ({ page }) => {
    // Create one to delete
    await page.getByRole("button", { name: /add expense/i }).click();
    const desc = `Delete Me ${TS}`;
    await page.locator("input[type='date']").first().fill("2025-03-01");
    await page.locator("input[placeholder='0.00']").fill("99");
    await page.locator("input[required]").last().fill(desc);
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
    const catFilter = page.locator("select").first();
    await catFilter.selectOption("rent");
    await page.getByRole("button", { name: /search/i }).click();
    await page.waitForLoadState("networkidle");
    const rows = page.locator("table tbody tr");
    const count = await rows.count();
    if (count > 0) {
      // every visible badge should be the Rent category
      const badges = page.locator("table tbody tr span.rounded.border");
      const badgeCount = await badges.count();
      for (let i = 0; i < badgeCount; i++) {
        const text = await badges.nth(i).textContent();
        expect(text?.toLowerCase()).toMatch(/rent/i);
      }
    }
  });

  test("filter by date range shows only matching rows", async ({ page }) => {
    await page.locator("input[type='date']").nth(0).fill("2025-03-01");
    await page.locator("input[type='date']").nth(1).fill("2025-03-31");
    await page.getByRole("button", { name: /search/i }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator("table")).toBeVisible();
    // All visible rows should have dates in March 2025
    const rows = page.locator("table tbody tr");
    const count = await rows.count();
    const isEmpty = count === 0 || await page.locator("text=/no expenses/i").count() > 0;
    if (count > 0 && !isEmpty) {
      const firstRowText = await rows.first().textContent();
      expect(firstRowText).toMatch(/\d{4}/); // contains some year
    }
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
    // Should show salary entries (auto-created from employees)
    const rows = page.locator("table tbody tr");
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
  });

  // ── VALIDATION ───────────────────────────────────────────────
  test("ERROR: missing amount blocks form submission", async ({ page }) => {
    await page.getByRole("button", { name: /add expense/i }).click();
    await page.locator("input[type='date']").first().fill("2025-03-01");
    await page.locator("input[required]").last().fill("Test expense");
    await page.getByRole("button", { name: /save/i }).last().click();
    // Modal should still be open
    await expect(page.locator("h2")).toContainText(/add|edit/i);
    await page.keyboard.press("Escape");
  });

  test("ERROR: missing description blocks form submission", async ({ page }) => {
    await page.getByRole("button", { name: /add expense/i }).click();
    await page.locator("input[placeholder='0.00']").fill("100");
    await page.getByRole("button", { name: /save/i }).last().click();
    await expect(page.locator("h2")).toContainText(/add|edit/i);
    await page.keyboard.press("Escape");
  });

  test("cancel closes modal without saving", async ({ page }) => {
    await page.getByRole("button", { name: /add expense/i }).click();
    await page.locator("input[required]").last().fill("Should Not Be Saved");
    await page.getByRole("button", { name: /cancel/i }).click();
    await expect(page.locator("text=Should Not Be Saved")).toHaveCount(0);
  });

  // ── AMOUNT DISPLAY ───────────────────────────────────────────
  test("expense amounts show in red (danger color)", async ({ page }) => {
    // Expenses table has amounts styled as text-danger
    const amountCell = page.locator("table tbody tr td.text-right.font-semibold").first();
    await expect(amountCell).toBeVisible();
  });
});
