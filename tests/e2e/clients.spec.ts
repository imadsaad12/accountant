import { test, expect } from "@playwright/test";

const TS = Date.now();

test.describe("Clients", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard/clients");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 8000 });
  });

  // ── HAPPY PATH ──────────────────────────────────────────────

  test("page loads and shows table", async ({ page }) => {
    await expect(page.locator("h1").last()).toContainText(/clients/i);
    await expect(page.locator("table")).toBeVisible();
  });

  test("no Tax ID field in create form", async ({ page }) => {
    await page.getByRole("button", { name: /add client/i }).click();
    await expect(page.locator("text=Tax ID")).toHaveCount(0);
    await page.keyboard.press("Escape");
  });

  test("create client with name only", async ({ page }) => {
    const name = `Test Client ${TS}`;
    await page.getByRole("button", { name: /add client/i }).click();
    await page.locator("input[required]").first().fill(name);
    await page.getByRole("button", { name: /add client/i }).last().click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator(`text=${name}`)).toBeVisible({ timeout: 6000 });
  });

  test("create client with all fields", async ({ page }) => {
    const name = `Full Client ${TS}`;
    await page.getByRole("button", { name: /add client/i }).click();

    // Name
    await page.locator("input[required]").first().fill(name);
    // Email
    const emailInput = page.locator("input[type='email']").first();
    await emailInput.fill(`full${TS}@test.com`);
    // City — find the input that follows the City label
    const cityLabel = page.locator("label").filter({ hasText: /^city$/i });
    await cityLabel.locator("+ input").fill("Beirut");
    await page.getByRole("button", { name: /add client/i }).last().click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator(`text=${name}`)).toBeVisible({ timeout: 6000 });
  });

  test("edit existing client", async ({ page }) => {
    // Find the first edit button and click it
    const editBtn = page.locator("button[title], button").filter({ has: page.locator("svg") }).first();
    const pencilBtns = page.locator("table tbody tr").first().locator("button").first();
    await pencilBtns.click();

    // Modal should open
    await expect(page.locator("h2")).toContainText(/edit/i, { timeout: 4000 });
    await page.keyboard.press("Escape");
  });

  test("delete client with confirmation", async ({ page }) => {
    const name = `Delete Me ${TS}`;
    // Create one first
    await page.getByRole("button", { name: /add client/i }).click();
    await page.locator("input[required]").first().fill(name);
    await page.getByRole("button", { name: /add client/i }).last().click();
    await page.waitForLoadState("networkidle");

    // Now delete it
    const row = page.locator(`tr:has-text("${name}")`);
    await expect(row).toBeVisible({ timeout: 6000 });

    // Set up dialog handler before clicking delete
    page.on("dialog", (dialog) => dialog.accept());
    const deleteBtn = row.locator("button").last();
    await deleteBtn.click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator(`text=${name}`)).toHaveCount(0, { timeout: 6000 });
  });

  // ── SEARCH / FILTER / SORT ──────────────────────────────────

  test("search bar filters by name", async ({ page }) => {
    const searchInput = page.locator("input[placeholder*='earch']");
    await searchInput.fill("Acme");
    await page.waitForTimeout(300);
    // All visible rows should contain "Acme" OR the table shows no results
    const rows = page.locator("table tbody tr");
    const count = await rows.count();
    if (count > 0) {
      const firstText = await rows.first().textContent();
      // If no match, shows "No results"
      const noResults = await page.locator("text=/no results/i").count();
      expect(firstText?.toLowerCase().includes("acme") || noResults > 0).toBeTruthy();
    }
  });

  test("search clears to show all clients again", async ({ page }) => {
    const searchInput = page.locator("input[placeholder*='earch']");
    const initialCount = await page.locator("table tbody tr").count();
    await searchInput.fill("zzzznotexistent");
    await page.waitForTimeout(300);
    await searchInput.fill("");
    await page.waitForTimeout(300);
    const finalCount = await page.locator("table tbody tr").count();
    expect(finalCount).toBe(initialCount);
  });

  test("sort by name ascending then descending", async ({ page }) => {
    const nameHeader = page.locator("thead th").filter({ hasText: /name/i }).first();
    await nameHeader.click();
    await page.waitForTimeout(200);
    await nameHeader.click();
    await page.waitForTimeout(200);
    // Just verify no crash — rows still present
    await expect(page.locator("table tbody tr").first()).toBeVisible();
  });

  // ── VALIDATION / ERROR CASES ─────────────────────────────────

  test("submit form with empty name shows HTML validation", async ({ page }) => {
    await page.getByRole("button", { name: /add client/i }).click();
    await page.getByRole("button", { name: /add client/i }).last().click();
    // Modal should still be open (validation blocked submit)
    await expect(page.locator("h2")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("duplicate email shows error message", async ({ page }) => {
    // Create first client with email
    const email = `dup${TS}@test.com`;
    await page.getByRole("button", { name: /add client/i }).first().click();
    await page.locator("input[required]").first().fill(`Client A ${TS}`);
    await page.locator("input[type='email']").fill(email);
    await page.getByRole("button", { name: /add client/i }).last().click();
    await page.waitForLoadState("networkidle");
    // Wait for modal to close
    await expect(page.locator("h2")).toBeHidden({ timeout: 4000 });

    // Try to create second with same email
    await page.getByRole("button", { name: /add client/i }).first().click();
    await page.locator("input[required]").first().fill(`Client B ${TS}`);
    await page.locator("input[type='email']").fill(email);
    await page.getByRole("button", { name: /add client/i }).last().click();

    // Should show an error
    await expect(page.locator(".text-red-400")).toBeVisible({ timeout: 5000 });
    await page.keyboard.press("Escape");
  });

  test("cancel button closes modal without saving", async ({ page }) => {
    await page.getByRole("button", { name: /add client/i }).click();
    await page.locator("input[required]").first().fill("Should Not Be Saved");
    await page.getByRole("button", { name: /cancel/i }).click();
    await expect(page.locator("text=Should Not Be Saved")).toHaveCount(0);
  });
});
