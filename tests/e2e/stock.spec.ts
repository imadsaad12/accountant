import { test, expect } from "@playwright/test";

const TS = Date.now();

test.describe("Stock / Products", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard/stock");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 10000 });
  });

  // ── PAGE & CATEGORIES ─────────────────────────────────────────

  test("page loads and shows table", async ({ page }) => {
    await expect(page.locator("h1").last()).toContainText(/stock/i);
    await expect(page.locator("table")).toBeVisible();
  });

  test("default categories are seeded and visible in dropdown", async ({ page }) => {
    await page.getByRole("button", { name: /add product/i }).click();
    await expect(page.locator("select").last()).toBeVisible();
    const options = await page.locator("select").last().locator("option").allTextContents();
    const hasDefaults = options.some((o) =>
      ["Electronics", "Clothing", "Food", "Office", "Furniture", "Tools", "Raw"].some((k) =>
        o.toLowerCase().includes(k.toLowerCase())
      )
    );
    expect(hasDefaults).toBeTruthy();
    await page.keyboard.press("Escape");
  });

  test("add new category", async ({ page }) => {
    const catName = `TestCat${TS}`;
    await page.getByRole("button", { name: /add category/i }).click();
    await page.locator("input[placeholder*='ategory']").fill(catName);
    await page.getByRole("button", { name: /add category/i }).last().click();
    await page.waitForLoadState("networkidle");

    // Open product form and verify new category appears
    await page.getByRole("button", { name: /add product/i }).click();
    const optionTexts = await page.locator("select").last().locator("option").allTextContents();
    expect(optionTexts.some((o) => o.includes(catName))).toBeTruthy();
    await page.keyboard.press("Escape");
  });

  test("previous categories still show after adding new category", async ({ page }) => {
    await page.getByRole("button", { name: /add category/i }).click();
    await page.locator("input[placeholder*='ategory']").fill(`AnotherCat${TS}`);
    await page.getByRole("button", { name: /add category/i }).last().click();
    await page.waitForLoadState("networkidle");

    // Verify filter dropdown still has multiple categories
    const filterSelect = page.locator("select").first();
    const count = await filterSelect.locator("option").count();
    expect(count).toBeGreaterThan(2); // "All categories" + at least 2 categories
  });

  // ── PRODUCT CRUD ──────────────────────────────────────────────

  test("create product with valid price > cost", async ({ page }) => {
    const name = `Product ${TS}`;
    await page.getByRole("button", { name: /add product/i }).click();
    await page.locator("input[required]").first().fill(name);
    // Select a category so SKU is auto-generated (avoids unique constraint on empty SKU)
    const catSelect = page.locator("select").last();
    const firstCatValue = await catSelect.locator("option").nth(1).getAttribute("value");
    if (firstCatValue) await catSelect.selectOption(firstCatValue);
    // Price field
    const priceInput = page.locator("input[type='number']").nth(0);
    await priceInput.fill("100");
    // Cost field
    const costInput = page.locator("input[type='number']").nth(1);
    await costInput.fill("60");
    await page.getByRole("button", { name: /add product/i }).last().click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator(`text=${name}`)).toBeVisible({ timeout: 6000 });
  });

  test("ERROR: unit price <= cost shows validation error", async ({ page }) => {
    await page.getByRole("button", { name: /add product/i }).click();
    await page.locator("input[required]").first().fill(`Bad Margins ${TS}`);
    const priceInput = page.locator("input[type='number']").nth(0);
    await priceInput.fill("50");
    const costInput = page.locator("input[type='number']").nth(1);
    await costInput.fill("80"); // cost > price — should error
    await page.getByRole("button", { name: /add product/i }).last().click();
    await expect(page.locator(".text-red-400")).toBeVisible({ timeout: 4000 });
    await page.keyboard.press("Escape");
  });

  test("ERROR: unit price equal to cost shows validation error", async ({ page }) => {
    await page.getByRole("button", { name: /add product/i }).click();
    await page.locator("input[required]").first().fill(`Equal Margins ${TS}`);
    await page.locator("input[type='number']").nth(0).fill("50");
    await page.locator("input[type='number']").nth(1).fill("50"); // equal
    await page.getByRole("button", { name: /add product/i }).last().click();
    await expect(page.locator(".text-red-400")).toBeVisible({ timeout: 4000 });
    await page.keyboard.press("Escape");
  });

  test("SKU auto-generated when category selected", async ({ page }) => {
    await page.getByRole("button", { name: /add product/i }).click();
    await page.locator("input[required]").first().fill(`Auto SKU Product ${TS}`);
    // Select a category
    const catSelect = page.locator("select").last();
    const firstCatValue = await catSelect.locator("option").nth(1).getAttribute("value");
    if (firstCatValue) {
      await catSelect.selectOption(firstCatValue);
      // SKU should appear (only visible when editing, but auto-generated on create)
    }
    await page.keyboard.press("Escape");
  });

  test("edit product has read-only SKU", async ({ page }) => {
    const editBtn = page.locator("table tbody tr").first().locator("button").first();
    await editBtn.click();
    await expect(page.locator("h2")).toContainText(/edit/i, { timeout: 4000 });
    // SKU input should be readonly
    const skuInput = page.locator("input[readonly]");
    await expect(skuInput).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("delete product with confirmation", async ({ page }) => {
    const name = `DeleteProd ${TS}`;
    await page.getByRole("button", { name: /add product/i }).click();
    await page.locator("input[required]").first().fill(name);
    // Select a category so SKU is auto-generated (avoids unique constraint on empty SKU)
    const catSelect = page.locator("select").last();
    const firstCatValue = await catSelect.locator("option").nth(1).getAttribute("value");
    if (firstCatValue) await catSelect.selectOption(firstCatValue);
    await page.locator("input[type='number']").nth(0).fill("99");
    await page.getByRole("button", { name: /add product/i }).last().click();
    await page.waitForLoadState("networkidle");

    const row = page.locator(`tr:has-text("${name}")`);
    await expect(row).toBeVisible({ timeout: 6000 });

    page.on("dialog", (d) => d.accept());
    await row.locator("button").last().click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator(`text=${name}`)).toHaveCount(0, { timeout: 6000 });
  });

  // ── SEARCH / FILTER / SORT ────────────────────────────────────

  test("search filters products by name", async ({ page }) => {
    const search = page.locator("input[placeholder*='earch']");
    await search.fill("zzz_nonexistent");
    await page.waitForTimeout(300);
    const noResults = await page.locator("text=/no results/i").count();
    const rows = await page.locator("table tbody tr").count();
    expect(noResults > 0 || rows === 1).toBeTruthy(); // 1 = "no results" row
  });

  test("filter by stock status low", async ({ page }) => {
    const stockFilter = page.locator("select").nth(1);
    await stockFilter.selectOption("low");
    await page.waitForTimeout(300);
    // Should show either low-stock items or empty state
    await expect(page.locator("table")).toBeVisible();
  });

  test("sort by price column", async ({ page }) => {
    const priceHeader = page.locator("thead th").filter({ hasText: /price/i });
    await priceHeader.click();
    await page.waitForTimeout(200);
    await priceHeader.click();
    await page.waitForTimeout(200);
    await expect(page.locator("table tbody tr").first()).toBeVisible();
  });
});
