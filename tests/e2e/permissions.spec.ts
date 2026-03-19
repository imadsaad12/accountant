/**
 * Permissions Enforcement Tests
 *
 * Uses a pre-created restricted user (e2e_restricted, clients view-only)
 * that is created once in global.setup.ts before all tests.
 *
 * Verifies:
 *   - Admin can see the user in Team page
 *   - Admin can edit permissions via Team UI (adds invoices view)
 *   - Restricted user can log in and reach /dashboard
 *   - Restricted user can VIEW clients, but has no add/edit/delete buttons
 *   - Restricted user is redirected away from employees, stock
 *   - After permission edit, restricted user can VIEW invoices
 */
import { test, expect } from "@playwright/test";
import {
  E2E_RESTRICTED_USERNAME,
  E2E_RESTRICTED_PASSWORD,
} from "./test-constants";

// Log in via the login form (replaces the current browser session)
async function loginAs(page: any, username: string, password: string) {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await page.locator("#email").fill(username);
  await page.locator("#password").fill(password);
  await page.locator("button[type='submit']").click();
  await page.waitForURL(/\/dashboard/, { timeout: 15000 });
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe("Permissions — enforcement", () => {

  // ── TEAM UI ────────────────────────────────────────────────────────────────

  test("team UI shows restricted user", async ({ page }) => {
    await page.goto("/dashboard/team");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 10000 });

    // The row should show @e2e_restricted in the username cell
    const row = page.locator(`tr:has-text("${E2E_RESTRICTED_USERNAME}")`);
    await expect(row).toBeVisible({ timeout: 6000 });

    // The permission summary column should show "view" (clients view-only + dashboard view = 2 view)
    await expect(row).toContainText(/view/i);
  });

  test("admin can edit restricted user permissions via Team UI (add invoices view)", async ({ page }) => {
    await page.goto("/dashboard/team");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 10000 });

    // Click edit button on the restricted user's row
    const row = page.locator(`tr:has-text("${E2E_RESTRICTED_USERNAME}")`);
    await row.locator("button").first().click(); // first button = edit (pencil)
    await expect(page.locator("h2")).toContainText(/edit/i, { timeout: 4000 });

    // Expand permissions section
    await page.getByRole("button", { name: /permissions/i }).click();
    await expect(page.locator("table").last()).toBeVisible({ timeout: 3000 });

    // Enable invoices VIEW (row index 4: dashboard=0, clients=1, products=2, employees=3, invoices=4)
    const permTable = page.locator("table").last();
    const invoicesRow = permTable.locator("tbody tr").nth(4);
    await expect(invoicesRow).toContainText(/invoices/i);
    const viewBtn = invoicesRow.locator("td").nth(1).locator("button");
    await viewBtn.click();
    await expect(viewBtn).toHaveClass(/bg-green-500/, { timeout: 2000 });

    // Save
    await page.getByRole("button", { name: /save/i }).last().click();
    await page.waitForLoadState("networkidle");

    // Row should still be visible after save
    await expect(row).toBeVisible({ timeout: 6000 });
  });

  // ── PERMISSION ENFORCEMENT ─────────────────────────────────────────────────

  test("restricted user can log in and reach dashboard", async ({ page }) => {
    await loginAs(page, E2E_RESTRICTED_USERNAME, E2E_RESTRICTED_PASSWORD);
    await expect(page).toHaveURL(/\/dashboard/);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText(/gross|net|revenue|dashboard/i, { timeout: 8000 });
  });

  test("restricted user can VIEW clients page (has view permission)", async ({ page }) => {
    await loginAs(page, E2E_RESTRICTED_USERNAME, E2E_RESTRICTED_PASSWORD);
    await page.goto("/dashboard/clients");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 10000 });

    // Stays on clients — not redirected
    await expect(page).toHaveURL(/clients/);
    await expect(page.locator("table")).toBeVisible({ timeout: 6000 });
  });

  test("restricted user has NO 'Add Client' button (no edit permission)", async ({ page }) => {
    await loginAs(page, E2E_RESTRICTED_USERNAME, E2E_RESTRICTED_PASSWORD);
    await page.goto("/dashboard/clients");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 10000 });

    await expect(page.getByRole("button", { name: /add client/i })).toHaveCount(0);
  });

  test("restricted user has NO edit/delete buttons on client rows", async ({ page }) => {
    await loginAs(page, E2E_RESTRICTED_USERNAME, E2E_RESTRICTED_PASSWORD);
    await page.goto("/dashboard/clients");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 10000 });

    const rows = page.locator("table tbody tr");
    const rowCount = await rows.count();
    if (rowCount > 0) {
      const firstRowBtns = await rows.first().locator("button").count();
      expect(firstRowBtns).toBe(0);
    }
  });

  test("restricted user is redirected away from employees page (no permission)", async ({ page }) => {
    await loginAs(page, E2E_RESTRICTED_USERNAME, E2E_RESTRICTED_PASSWORD);
    await page.goto("/dashboard/employees");
    // PermissionGuard redirects to /dashboard when no view permission
    await expect(page).not.toHaveURL(/employees/, { timeout: 8000 });
  });

  test("restricted user is redirected away from stock page (no permission)", async ({ page }) => {
    await loginAs(page, E2E_RESTRICTED_USERNAME, E2E_RESTRICTED_PASSWORD);
    await page.goto("/dashboard/stock");
    await expect(page).not.toHaveURL(/\/stock/, { timeout: 8000 });
  });

  test("restricted user is redirected away from expenses page (no permission)", async ({ page }) => {
    await loginAs(page, E2E_RESTRICTED_USERNAME, E2E_RESTRICTED_PASSWORD);
    await page.goto("/dashboard/expenses");
    await expect(page).not.toHaveURL(/expenses/, { timeout: 8000 });
  });

  test("restricted user is redirected away from reports page (no permission)", async ({ page }) => {
    await loginAs(page, E2E_RESTRICTED_USERNAME, E2E_RESTRICTED_PASSWORD);
    await page.goto("/dashboard/reports");
    await expect(page).not.toHaveURL(/reports/, { timeout: 8000 });
  });

  test("restricted user can now VIEW invoices (permission was added via UI)", async ({ page }) => {
    await loginAs(page, E2E_RESTRICTED_USERNAME, E2E_RESTRICTED_PASSWORD);
    await page.goto("/dashboard/invoices");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 10000 });

    // Should stay on invoices — permission was added in the edit test
    await expect(page).toHaveURL(/invoices/);
  });

  // ── CLEANUP ───────────────────────────────────────────────────────────────

  test("cleanup: admin deletes the restricted user via team UI", async ({ page }) => {
    await page.goto("/dashboard/team");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 10000 });

    const row = page.locator(`tr:has-text("${E2E_RESTRICTED_USERNAME}")`);
    await expect(row).toBeVisible({ timeout: 6000 });

    // Click the delete button (last button in the row)
    await row.locator("button").last().click();

    // Custom confirm modal — button says "Remove User"
    await expect(page.getByRole("button", { name: /remove user/i })).toBeVisible({ timeout: 3000 });
    await page.getByRole("button", { name: /remove user/i }).click();
    await page.waitForLoadState("networkidle");

    await expect(page.locator(`text=${E2E_RESTRICTED_USERNAME}`)).toHaveCount(0, { timeout: 6000 });
  });
});
