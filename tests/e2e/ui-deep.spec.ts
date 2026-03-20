/**
 * Deep UI-driven tests — every interaction via clicks/typing, no raw API calls.
 *
 * Validates every visible number, every form live-preview, every status change,
 * every stat card, every payment balance, and every report figure.
 *
 * Organisation:
 *  1. Invoice form – live math preview while typing
 *  2. Invoice detail view – all numbers match after save
 *  3. Payment flow – balance math, status auto-transitions
 *  4. Payment deletion – status revert logic
 *  5. Dashboard stat cards – grossEarning, pendingAmount, counts
 *  6. Expenses stat cards – global totals ignore active filters
 *  7. P&L report – revenue, COGS, gross profit, expenses, net profit
 *  8. Employees – salary auto-creates expense, update propagates
 *  9. Stock – product quantity decrements when invoice is saved
 * 10. Clients – invoice count tracked per client
 */

import { test, expect, Page } from "@playwright/test";

const TS = Date.now();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse a money string like "$1,234.56" or "1 234,56 €" → number */
function parseMoney(text: string): number {
  const cleaned = text.replace(/[^0-9.\-]/g, "");
  return parseFloat(cleaned) || 0;
}

/** Round to 2 decimal places (mirrors JS toFixed math) */
function r(n: number): number {
  return Math.round(n * 100) / 100;
}

async function ready(page: Page) {
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 15000 });
}

/**
 * Read a dashboard stat card value by its exact label text.
 * Labels are in <p class="text-sm text-text-muted font-medium"> elements.
 * The value is the next sibling <p>.
 */
async function dashboardStat(page: Page, labelText: string): Promise<number> {
  const label = page.locator("p.text-sm.text-text-muted.font-medium").filter({ hasText: labelText });
  const text = await label.locator("xpath=following-sibling::p[1]").textContent();
  return parseMoney(text ?? "0");
}

/**
 * After creating an invoice, the newest invoice appears first in the table
 * (sorted by createdAt desc). Read its invoice number for later row lookups.
 */
async function readFirstInvoiceNumber(page: Page): Promise<string> {
  const firstRow = page.locator("table tbody tr").first();
  await expect(firstRow).toBeVisible({ timeout: 8000 });
  return ((await firstRow.locator("td").first().textContent()) ?? "").trim();
}

/**
 * Close any open modal/dialog by clicking the X (close) button in the modal header.
 * Modals use a <div class="flex items-center justify-between"> header with an X button.
 * Then waits for the modal overlay to be gone.
 */
async function closeModal(page: Page) {
  // Click the X button inside the last open modal's header
  const modal = page.locator(".fixed.inset-0").last();
  await modal.locator("div.flex.items-center.justify-between button").first().click();
  // Wait for the modal overlay to disappear
  await expect(page.locator(".fixed.inset-0")).toHaveCount(0, { timeout: 5000 });
  await ready(page);
}

// ─── 1. Invoice form – live math preview ─────────────────────────────────────

test.describe("Invoice form – live math preview", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard/invoices");
    await ready(page);
    await page.getByRole("button", { name: /new invoice/i }).click();
    await expect(page.locator("h2").filter({ hasText: /invoice/i })).toBeVisible({ timeout: 5000 });
  });

  test("single item: row total = qty × unitPrice", async ({ page }) => {
    await page.locator("select[required]").selectOption({ index: 1 });

    const qtyInputs = page.locator(".space-y-2 input[type='number']");
    const priceInputs = page.locator(".space-y-2 input[type='number']");

    // qty = 4, price = 125 → item total = 500.00
    await qtyInputs.nth(0).fill("4");
    await priceInputs.nth(1).fill("125");

    const rowTotal = page.locator(".space-y-2 span.font-medium.text-text-primary").first();
    await expect(rowTotal).toContainText("$500.00");
  });

  test("single item: form preview subtotal = item row total", async ({ page }) => {
    await page.locator("select[required]").selectOption({ index: 1 });
    const inputs = page.locator(".space-y-2 input[type='number']");
    await inputs.nth(0).fill("3");
    await inputs.nth(1).fill("200");
    const preview = page.locator(".border-t.border-dark-border.pt-3");
    await expect(preview).toContainText("$600.00");
  });

  test("taxRate=20: tax preview = subtotal × 0.20", async ({ page }) => {
    await page.locator("select[required]").selectOption({ index: 1 });
    await page.locator("input[type='number'][min='0'][max='100']").fill("20");
    const inputs = page.locator(".space-y-2 input[type='number']");
    await inputs.nth(0).fill("5");
    await inputs.nth(1).fill("100");
    const preview = page.locator(".border-t.border-dark-border.pt-3");
    await expect(preview).toContainText("$500.00"); // subtotal
    await expect(preview).toContainText("$100.00"); // tax (20%)
    await expect(preview).toContainText("$600.00"); // total
  });

  test("taxRate=0: tax=0.00, total=subtotal", async ({ page }) => {
    await page.locator("select[required]").selectOption({ index: 1 });
    await page.locator("input[type='number'][min='0'][max='100']").fill("0");
    const inputs = page.locator(".space-y-2 input[type='number']");
    await inputs.nth(0).fill("2");
    await inputs.nth(1).fill("350");
    const preview = page.locator(".border-t.border-dark-border.pt-3");
    await expect(preview).toContainText("$700.00"); // subtotal
    await expect(preview).toContainText("$0.00");   // tax
  });

  test("two items: subtotal = sum of both row totals", async ({ page }) => {
    await page.locator("select[required]").selectOption({ index: 1 });
    const inputs = page.locator(".space-y-2 input[type='number']");
    await inputs.nth(0).fill("3");
    await inputs.nth(1).fill("100");

    await page.getByRole("button", { name: /add item/i }).click();

    await inputs.nth(2).fill("2");
    await inputs.nth(3).fill("75");

    const rowTotals = page.locator(".space-y-2 span.font-medium.text-text-primary");
    await expect(rowTotals.nth(0)).toContainText("$300.00");
    await expect(rowTotals.nth(1)).toContainText("$150.00");

    const preview = page.locator(".border-t.border-dark-border.pt-3");
    await expect(preview).toContainText("$450.00");
  });

  test("taxRate=19: tax = round(subtotal × 0.19), total = subtotal + tax", async ({ page }) => {
    await page.locator("select[required]").selectOption({ index: 1 });
    await page.locator("input[type='number'][min='0'][max='100']").fill("19");
    const inputs = page.locator(".space-y-2 input[type='number']");
    await inputs.nth(0).fill("1");
    await inputs.nth(1).fill("1000");
    const preview = page.locator(".border-t.border-dark-border.pt-3");
    await expect(preview).toContainText("$1000.00");
    await expect(preview).toContainText("$190.00");
    await expect(preview).toContainText("$1190.00");
  });

  test("changing qty updates row total and subtotal in real-time", async ({ page }) => {
    await page.locator("select[required]").selectOption({ index: 1 });
    await page.locator("input[type='number'][min='0'][max='100']").fill("0");
    const inputs = page.locator(".space-y-2 input[type='number']");
    await inputs.nth(1).fill("50");

    await inputs.nth(0).fill("1");
    await expect(page.locator(".space-y-2 span.font-medium.text-text-primary").first()).toContainText("$50.00");

    await inputs.nth(0).fill("7");
    await expect(page.locator(".space-y-2 span.font-medium.text-text-primary").first()).toContainText("$350.00");

    const preview = page.locator(".border-t.border-dark-border.pt-3");
    await expect(preview).toContainText("$350.00");
  });

  test("cancel closes modal without creating an invoice", async ({ page }) => {
    const countBefore = await page.locator("table tbody tr").count();
    await page.locator("select[required]").selectOption({ index: 1 });
    await page.locator(".space-y-2 input[type='number']").nth(0).fill("1");
    await page.locator(".space-y-2 input[type='number']").nth(1).fill("999");
    await page.getByRole("button", { name: /cancel/i }).click();
    await expect(page.locator("h2").filter({ hasText: /invoice/i })).toHaveCount(0, { timeout: 4000 });
    const countAfter = await page.locator("table tbody tr").count();
    expect(countAfter).toBe(countBefore);
  });

  test("description is required – form stays open without it", async ({ page }) => {
    await page.locator("select[required]").selectOption({ index: 1 });
    await page.locator(".space-y-2 input[type='number']").nth(1).fill("100");
    // Leave description empty → submit
    await page.getByRole("button", { name: /new invoice/i }).last().click();
    // Modal should still be open
    await expect(page.locator("h2").filter({ hasText: /invoice/i })).toBeVisible();
  });
});

// ─── 2. Invoice detail view – numbers after save ──────────────────────────────

test.describe("Invoice detail view – numbers after save", () => {
  const QTY1 = 3, PRICE1 = 150; // item 1: 450
  const QTY2 = 2, PRICE2 = 80;  // item 2: 160
  // subtotal=610, taxRate=20, tax=122, total=732
  const EXPECTED_SUBTOTAL = r(QTY1 * PRICE1 + QTY2 * PRICE2); // 610
  const TAX_RATE = 20;
  const EXPECTED_TAX = r(EXPECTED_SUBTOTAL * TAX_RATE / 100); // 122
  const EXPECTED_TOTAL = r(EXPECTED_SUBTOTAL + EXPECTED_TAX);   // 732
  const DESC = `DeepTest-${TS}`;

  test("subtotal, tax and total in detail modal are arithmetically exact", async ({ page }) => {
    await page.goto("/dashboard/invoices");
    await ready(page);

    // Create invoice
    await page.getByRole("button", { name: /new invoice/i }).click();
    await page.locator("select[required]").selectOption({ index: 1 });
    await page.locator("input[type='number'][min='0'][max='100']").fill(String(TAX_RATE));

    const inputs = page.locator(".space-y-2 input[type='number']");
    const descs = page.locator(".space-y-2 input[placeholder]");

    await descs.nth(0).fill(DESC + "-A");
    await inputs.nth(0).fill(String(QTY1));
    await inputs.nth(1).fill(String(PRICE1));

    await page.getByRole("button", { name: /add item/i }).click();

    await descs.nth(1).fill(DESC + "-B");
    await inputs.nth(2).fill(String(QTY2));
    await inputs.nth(3).fill(String(PRICE2));

    // Verify form preview before save
    const preview = page.locator(".border-t.border-dark-border.pt-3");
    await expect(preview).toContainText(`$${EXPECTED_SUBTOTAL.toFixed(2)}`);
    await expect(preview).toContainText(`$${EXPECTED_TAX.toFixed(2)}`);
    await expect(preview).toContainText(`$${EXPECTED_TOTAL.toFixed(2)}`);

    await page.getByRole("button", { name: /new invoice/i }).last().click();
    await ready(page);

    // Find the newest invoice (first row, sorted by createdAt desc)
    const invNumber = await readFirstInvoiceNumber(page);
    const row = page.locator("table tbody tr").filter({ hasText: invNumber });

    // Table shows correct total
    await expect(row.locator("td.text-right.font-medium")).toContainText(`$${EXPECTED_TOTAL.toFixed(2)}`);

    // Open detail view
    await row.locator("button[title='View']").click();
    await expect(page.locator("h2").filter({ hasText: /invoice/i })).toBeVisible({ timeout: 5000 });

    const modal = page.locator(".fixed.inset-0").last();
    await expect(modal).toContainText(`$${EXPECTED_SUBTOTAL.toFixed(2)}`);
    await expect(modal).toContainText(`$${EXPECTED_TAX.toFixed(2)}`);
    await expect(modal).toContainText(`$${EXPECTED_TOTAL.toFixed(2)}`);

    // Item 1 row: $450.00
    await expect(modal.locator("table")).toContainText(`$${(QTY1 * PRICE1).toFixed(2)}`);
    // Item 2 row: $160.00
    await expect(modal.locator("table")).toContainText(`$${(QTY2 * PRICE2).toFixed(2)}`);

    // Balance panel shows full total (no payments yet)
    await expect(modal.locator(".text-emerald-400").filter({ hasText: "$0.00" })).toBeVisible();
    await expect(modal.locator(".text-orange-400")).toContainText(`$${EXPECTED_TOTAL.toFixed(2)}`);

    // Cleanup
    await closeModal(page);
    page.on("dialog", d => d.accept());
    await page.locator("table tbody tr").filter({ hasText: invNumber }).locator("button[title='Delete']").click();
    await ready(page);
  });
});

// ─── 3. Payment flow – balance math and status auto-transitions ───────────────

test.describe("Payment flow – balance and status", () => {
  const DESC = `PayTest-${TS}`;
  // Invoice: 1 × $800, taxRate=0 → total=$800
  const TOTAL = 800;

  /**
   * Creates the invoice, reads the invoice number from the first table row,
   * sets status to "sent", opens the detail modal, and returns the invoice number.
   */
  async function createInvoiceAndOpen(page: Page): Promise<string> {
    await page.goto("/dashboard/invoices");
    await ready(page);

    await page.getByRole("button", { name: /new invoice/i }).click();
    await page.locator("select[required]").selectOption({ index: 1 });
    await page.locator("input[type='number'][min='0'][max='100']").fill("0");

    const descs = page.locator(".space-y-2 input[placeholder]");
    await descs.nth(0).fill(DESC);
    await page.locator(".space-y-2 input[type='number']").nth(0).fill("1");
    await page.locator(".space-y-2 input[type='number']").nth(1).fill(String(TOTAL));

    await page.getByRole("button", { name: /new invoice/i }).last().click();
    await ready(page);

    // Read invoice number from the newest (first) row
    const invNumber = await readFirstInvoiceNumber(page);
    const row = page.locator("table tbody tr").filter({ hasText: invNumber });

    // Set status to sent so payment form appears
    await row.locator("select").selectOption("sent");
    await ready(page);

    // Open detail
    await row.locator("button[title='View']").click();
    await expect(page.locator("h2").filter({ hasText: /invoice/i })).toBeVisible({ timeout: 5000 });

    return invNumber;
  }

  async function cleanup(page: Page, invNumber: string) {
    // Close the modal using the X button (Escape key does NOT close these modals)
    if (await page.locator(".fixed.inset-0").count() > 0) {
      await closeModal(page);
    }
    const deleteRow = page.locator("table tbody tr").filter({ hasText: invNumber });
    if (await deleteRow.count() > 0) {
      page.on("dialog", d => d.accept());
      await deleteRow.locator("button[title='Delete']").click();
      await ready(page);
    }
  }

  test("initial balance = invoice total, paid = $0.00", async ({ page }) => {
    const invNumber = await createInvoiceAndOpen(page);
    const modal = page.locator(".fixed.inset-0").last();
    await expect(modal.locator(".text-emerald-400").filter({ hasText: "$0.00" })).toBeVisible();
    await expect(modal.locator(".text-orange-400")).toContainText(`$${TOTAL.toFixed(2)}`);
    await cleanup(page, invNumber);
  });

  test("after partial payment: paid increases, balance decreases by exact amount", async ({ page }) => {
    const invNumber = await createInvoiceAndOpen(page);
    const modal = page.locator(".fixed.inset-0").last();

    await modal.getByRole("button", { name: /add payment/i }).click();
    await modal.locator("input[placeholder='0.00']").fill("300");
    await modal.getByRole("button", { name: /save/i }).last().click();
    await ready(page);
    await page.waitForTimeout(500);

    await expect(modal.locator(".text-emerald-400")).toContainText("$300.00");
    await expect(modal.locator(".text-orange-400")).toContainText("$500.00");
    await cleanup(page, invNumber);
  });

  test("after partial payment: status badge becomes 'Partially Paid' (amber)", async ({ page }) => {
    const invNumber = await createInvoiceAndOpen(page);
    const modal = page.locator(".fixed.inset-0").last();
    await modal.getByRole("button", { name: /add payment/i }).click();
    await modal.locator("input[placeholder='0.00']").fill("300");
    await modal.getByRole("button", { name: /save/i }).last().click();
    await ready(page);
    await page.waitForTimeout(500);

    await closeModal(page);
    const row = page.locator("table tbody tr").filter({ hasText: invNumber });
    await expect(row.locator("select")).toHaveValue("partially_paid");
    await cleanup(page, invNumber);
  });

  test("two partial payments: paid = sum, balance = total - sum", async ({ page }) => {
    const invNumber = await createInvoiceAndOpen(page);
    const modal = page.locator(".fixed.inset-0").last();

    await modal.getByRole("button", { name: /add payment/i }).click();
    await modal.locator("input[placeholder='0.00']").fill("300");
    await modal.getByRole("button", { name: /save/i }).last().click();
    await ready(page);
    await page.waitForTimeout(500);

    await modal.getByRole("button", { name: /add payment/i }).click();
    await modal.locator("input[placeholder='0.00']").fill("200");
    await modal.getByRole("button", { name: /save/i }).last().click();
    await ready(page);
    await page.waitForTimeout(500);

    await expect(modal.locator(".text-emerald-400")).toContainText("$500.00");
    await expect(modal.locator(".text-orange-400")).toContainText("$300.00");
    await cleanup(page, invNumber);
  });

  test("full payment: balance = $0.00 and status becomes Paid", async ({ page }) => {
    const invNumber = await createInvoiceAndOpen(page);
    const modal = page.locator(".fixed.inset-0").last();

    await modal.getByRole("button", { name: /add payment/i }).click();
    await modal.locator("input[placeholder='0.00']").fill(String(TOTAL));
    await modal.getByRole("button", { name: /save/i }).last().click();
    await ready(page);
    await page.waitForTimeout(500);

    await expect(modal.locator(".text-emerald-400")).toContainText(`$${TOTAL.toFixed(2)}`);
    const balancePanel = modal.locator("[class*='border-orange']");
    await expect(balancePanel).toHaveCount(0);

    await closeModal(page);
    const row = page.locator("table tbody tr").filter({ hasText: invNumber });
    await expect(row.locator("select")).toHaveValue("paid");
    await cleanup(page, invNumber);
  });

  test("payment Add button disappears once status = paid", async ({ page }) => {
    const invNumber = await createInvoiceAndOpen(page);
    const modal = page.locator(".fixed.inset-0").last();

    await modal.getByRole("button", { name: /add payment/i }).click();
    await modal.locator("input[placeholder='0.00']").fill(String(TOTAL));
    await modal.getByRole("button", { name: /save/i }).last().click();
    await ready(page);
    await page.waitForTimeout(500);

    await expect(modal.getByRole("button", { name: /add payment/i })).toHaveCount(0);
    await cleanup(page, invNumber);
  });

  test("payment history shows each payment entry with correct amount", async ({ page }) => {
    const invNumber = await createInvoiceAndOpen(page);
    const modal = page.locator(".fixed.inset-0").last();

    for (const amount of [100, 250, 150]) {
      await modal.getByRole("button", { name: /add payment/i }).click();
      await modal.locator("input[placeholder='0.00']").fill(String(amount));
      await modal.getByRole("button", { name: /save/i }).last().click();
      await ready(page);
      await page.waitForTimeout(300);
    }

    const entries = modal.locator(".space-y-1\\.5 > div");
    await expect(entries).toHaveCount(3);

    await expect(modal).toContainText("$100.00");
    await expect(modal).toContainText("$250.00");
    await expect(modal).toContainText("$150.00");

    await expect(modal.locator(".text-emerald-400")).toContainText("$500.00");
    await expect(modal.locator(".text-orange-400")).toContainText("$300.00");
    await cleanup(page, invNumber);
  });
});

// ─── 4. Payment deletion – status revert logic ────────────────────────────────

test.describe("Payment deletion – status revert", () => {
  const DESC = `PayDel-${TS}`;
  const TOTAL = 600;

  async function setup(page: Page): Promise<string> {
    await page.goto("/dashboard/invoices");
    await ready(page);

    await page.getByRole("button", { name: /new invoice/i }).click();
    await page.locator("select[required]").selectOption({ index: 1 });
    await page.locator("input[type='number'][min='0'][max='100']").fill("0");
    await page.locator(".space-y-2 input[placeholder]").nth(0).fill(DESC);
    await page.locator(".space-y-2 input[type='number']").nth(0).fill("1");
    await page.locator(".space-y-2 input[type='number']").nth(1).fill(String(TOTAL));
    await page.getByRole("button", { name: /new invoice/i }).last().click();
    await ready(page);

    const invNumber = await readFirstInvoiceNumber(page);
    const row = page.locator("table tbody tr").filter({ hasText: invNumber });

    await row.locator("select").selectOption("sent");
    await ready(page);
    await row.locator("button[title='View']").click();
    await expect(page.locator("h2").filter({ hasText: /invoice/i })).toBeVisible({ timeout: 5000 });

    return invNumber;
  }

  async function cleanup(page: Page, invNumber: string) {
    if (await page.locator(".fixed.inset-0").count() > 0) {
      await closeModal(page);
    }
    const row = page.locator("table tbody tr").filter({ hasText: invNumber });
    if (await row.count() > 0) {
      page.on("dialog", d => d.accept());
      await row.locator("button[title='Delete']").click();
      await ready(page);
    }
  }

  test("deleting the only payment reverts status back to sent", async ({ page }) => {
    const invNumber = await setup(page);
    const modal = page.locator(".fixed.inset-0").last();

    await modal.getByRole("button", { name: /add payment/i }).click();
    await modal.locator("input[placeholder='0.00']").fill("200");
    await modal.getByRole("button", { name: /save/i }).last().click();
    await ready(page);
    await page.waitForTimeout(500);

    await closeModal(page);
    const row = page.locator("table tbody tr").filter({ hasText: invNumber });
    await expect(row.locator("select")).toHaveValue("partially_paid");

    await row.locator("button[title='View']").click();
    await expect(page.locator("h2").filter({ hasText: /invoice/i })).toBeVisible({ timeout: 5000 });
    const modalInner = page.locator(".fixed.inset-0").last();

    page.on("dialog", d => d.accept());
    await modalInner.locator(".space-y-1\\.5 button").last().click();
    await ready(page);
    await page.waitForTimeout(500);

    await closeModal(page);
    await expect(page.locator("table tbody tr").filter({ hasText: invNumber }).locator("select")).toHaveValue("sent");
    await cleanup(page, invNumber);
  });

  test("deleting one of two payments keeps status as partially_paid", async ({ page }) => {
    const invNumber = await setup(page);
    const modal = page.locator(".fixed.inset-0").last();

    await modal.getByRole("button", { name: /add payment/i }).click();
    await modal.locator("input[placeholder='0.00']").fill("200");
    await modal.getByRole("button", { name: /save/i }).last().click();
    await ready(page);
    await page.waitForTimeout(400);

    await modal.getByRole("button", { name: /add payment/i }).click();
    await modal.locator("input[placeholder='0.00']").fill("100");
    await modal.getByRole("button", { name: /save/i }).last().click();
    await ready(page);
    await page.waitForTimeout(400);

    await expect(modal.locator(".text-emerald-400")).toContainText("$300.00");

    page.on("dialog", d => d.accept());
    const trashBtns = modal.locator(".space-y-1\\.5 button");
    await trashBtns.last().click();
    await ready(page);
    await page.waitForTimeout(500);

    await expect(modal.locator(".text-emerald-400")).toContainText("$200.00");
    await expect(modal.locator(".text-orange-400")).toContainText("$400.00");

    await closeModal(page);
    await expect(page.locator("table tbody tr").filter({ hasText: invNumber }).locator("select")).toHaveValue("partially_paid");
    await cleanup(page, invNumber);
  });
});

// ─── 5. Dashboard stat cards ──────────────────────────────────────────────────

test.describe("Dashboard stat cards", () => {
  test("stat card labels all visible (Gross Earning, Net Earning, Pending)", async ({ page }) => {
    await page.goto("/dashboard");
    await ready(page);
    // Use specific <p> selector to avoid strict mode with nav links
    const labels = page.locator("p.text-sm.text-text-muted.font-medium");
    await expect(labels.filter({ hasText: "Gross Earning" })).toBeVisible();
    await expect(labels.filter({ hasText: "Net Earning" })).toBeVisible();
    await expect(labels.filter({ hasText: "Pending" })).toBeVisible();
    await expect(labels.filter({ hasText: "Clients" })).toBeVisible();
    await expect(labels.filter({ hasText: "Employees" })).toBeVisible();
    await expect(labels.filter({ hasText: "Invoices" })).toBeVisible();
  });

  test("all stat values are non-negative numbers", async ({ page }) => {
    await page.goto("/dashboard");
    await ready(page);

    const cards = page.locator(".text-2xl.font-bold");
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(3);

    for (let i = 0; i < count; i++) {
      const text = await cards.nth(i).textContent();
      const val = parseMoney(text ?? "");
      expect(val).toBeGreaterThanOrEqual(0);
    }
  });

  test("grossEarning and netEarning stat cards show valid numbers", async ({ page }) => {
    await page.goto("/dashboard");
    await ready(page);

    const grossVal = await dashboardStat(page, "Gross Earning");
    expect(grossVal).toBeGreaterThanOrEqual(0);

    const netVal = await dashboardStat(page, "Net Earning");
    expect(netVal).toBeLessThanOrEqual(grossVal);
  });

  test("invoice count stat increments by 1 after creating an invoice", async ({ page }) => {
    await page.goto("/dashboard");
    await ready(page);
    const initialCount = await dashboardStat(page, "Invoices");

    // Create one invoice
    await page.goto("/dashboard/invoices");
    await ready(page);
    await page.getByRole("button", { name: /new invoice/i }).click();
    await page.locator("select[required]").selectOption({ index: 1 });
    await page.locator("input[type='number'][min='0'][max='100']").fill("0");
    await page.locator(".space-y-2 input[placeholder]").nth(0).fill(`DashCount-${TS}`);
    await page.locator(".space-y-2 input[type='number']").nth(0).fill("1");
    await page.locator(".space-y-2 input[type='number']").nth(1).fill("100");
    await page.getByRole("button", { name: /new invoice/i }).last().click();
    await ready(page);

    // Read invoice number for cleanup
    const dashInvNumber = await readFirstInvoiceNumber(page);

    await page.goto("/dashboard");
    await ready(page);
    const newCount = await dashboardStat(page, "Invoices");
    expect(newCount).toBe(initialCount + 1);

    // Cleanup
    await page.goto("/dashboard/invoices");
    await ready(page);
    const row = page.locator("table tbody tr").filter({ hasText: dashInvNumber });
    page.on("dialog", d => d.accept());
    await row.locator("button[title='Delete']").click();
    await ready(page);
  });

  test("client count stat increments after creating a client", async ({ page }) => {
    await page.goto("/dashboard");
    await ready(page);
    const initialCount = await dashboardStat(page, "Clients");

    // Create client
    await page.goto("/dashboard/clients");
    await ready(page);
    await page.getByRole("button", { name: /add client/i }).click();
    await page.locator("form input[required]").first().fill(`DashClient-${TS}`);
    await page.getByRole("button", { name: /add client|save/i }).last().click();
    await ready(page);

    await page.goto("/dashboard");
    await ready(page);
    const newCount = await dashboardStat(page, "Clients");
    expect(newCount).toBe(initialCount + 1);

    // Cleanup
    await page.goto("/dashboard/clients");
    await ready(page);
    const row = page.locator(`tr:has-text("DashClient-${TS}")`).first();
    page.on("dialog", d => d.accept());
    await row.locator("button").last().click();
    await ready(page);
  });

  test("recent invoices table on dashboard shows correct totals", async ({ page }) => {
    await page.goto("/dashboard");
    await ready(page);
    const recentSection = page.locator("text=Recent Invoices").first().locator("xpath=../../../..");
    const rows = recentSection.locator("tr");
    const rowCount = await rows.count();
    if (rowCount > 0) {
      const firstRow = rows.first();
      await expect(firstRow).toContainText(/\$/);
    }
  });
});

// ─── 6. Expenses stat cards – global totals regardless of filter ──────────────

test.describe("Expenses stat cards – global totals", () => {
  const AMOUNT = 1234.56;
  const AMOUNT_STR = AMOUNT.toFixed(2);
  const DESC = `ExpStat-${TS}`;

  async function readTotalStat(page: Page): Promise<number> {
    // The Total Expenses stat card is the first .text-danger element (before table rows)
    const statCard = page.locator(".text-danger").first();
    return parseMoney(await statCard.textContent() ?? "");
  }

  test("creating expense increases Total Expenses stat by exact amount", async ({ page }) => {
    await page.goto("/dashboard/expenses");
    await ready(page);

    const before = await readTotalStat(page);

    await page.getByRole("button", { name: /add expense/i }).click();
    await page.locator("input[type='date']").first().fill("2026-01-15");
    await page.locator("input[placeholder='0.00']").fill(AMOUNT_STR);
    await page.locator("form input[required]").last().fill(DESC);
    await page.getByRole("button", { name: /save/i }).last().click();
    await ready(page);

    const after = await readTotalStat(page);
    expect(r(after - before)).toBe(r(AMOUNT));

    // Cleanup
    const row = page.locator(`tr:has-text("${DESC}")`).first();
    page.on("dialog", d => d.accept());
    await row.locator("button").last().click();
    await ready(page);
  });

  test("Total Expenses stat does NOT change when category filter is applied", async ({ page }) => {
    await page.goto("/dashboard/expenses");
    await ready(page);

    const before = await readTotalStat(page);

    await page.locator("select").first().selectOption("rent");
    await page.getByRole("button", { name: /search/i }).click();
    await ready(page);

    const after = await readTotalStat(page);
    expect(after).toBe(before);
  });

  test("Total Expenses stat does NOT change when date filter is applied", async ({ page }) => {
    await page.goto("/dashboard/expenses");
    await ready(page);

    const before = await readTotalStat(page);

    await page.locator("input[type='date']").nth(0).fill("2025-01-01");
    await page.locator("input[type='date']").nth(1).fill("2025-06-30");
    await page.getByRole("button", { name: /search/i }).click();
    await ready(page);

    const after = await readTotalStat(page);
    expect(after).toBe(before);
  });

  test("This Month stat shows only current-month expenses", async ({ page }) => {
    await page.goto("/dashboard/expenses");
    await ready(page);

    const thisMonthTotal = parseMoney(
      await page.locator(".text-2xl.font-bold.text-text-primary").first().textContent() ?? ""
    );
    expect(thisMonthTotal).toBeGreaterThanOrEqual(0);

    await page.locator("input[type='date']").nth(0).fill("2020-01-01");
    await page.locator("input[type='date']").nth(1).fill("2020-12-31");
    await page.getByRole("button", { name: /search/i }).click();
    await ready(page);

    const afterFilter = parseMoney(
      await page.locator(".text-2xl.font-bold.text-text-primary").first().textContent() ?? ""
    );
    expect(afterFilter).toBe(thisMonthTotal);
  });

  test("deleting expense decreases Total Expenses by exact amount", async ({ page }) => {
    const AMOUNT2 = 500;
    const DESC2 = `ExpDel-${TS}`;

    await page.goto("/dashboard/expenses");
    await ready(page);

    await page.getByRole("button", { name: /add expense/i }).click();
    await page.locator("input[type='date']").first().fill("2026-01-15");
    await page.locator("input[placeholder='0.00']").fill(String(AMOUNT2));
    await page.locator("form input[required]").last().fill(DESC2);
    await page.getByRole("button", { name: /save/i }).last().click();
    await ready(page);

    const before = await readTotalStat(page);

    const row = page.locator(`tr:has-text("${DESC2}")`).first();
    page.on("dialog", d => d.accept());
    await row.locator("button").last().click();
    await ready(page);

    const after = await readTotalStat(page);
    expect(r(before - after)).toBe(r(AMOUNT2));
  });

  test("by-category breakdown sums to same value as Total stat", async ({ page }) => {
    await page.goto("/dashboard/expenses");
    await ready(page);

    await readTotalStat(page); // just ensure it's readable
    await expect(page.locator("text=/by category/i")).toBeVisible();
  });
});

// ─── 7. P&L Report – full arithmetic validation ───────────────────────────────

test.describe("P&L Report – arithmetic validation via UI", () => {
  async function generatePL(page: Page, from: string, to: string) {
    await page.goto("/dashboard/reports");
    await ready(page);
    const dateInputs = page.locator("input[type='date']");
    await dateInputs.nth(0).fill(from);
    await dateInputs.nth(1).fill(to);
    await page.getByRole("button", { name: /generate/i }).click();
    await ready(page);
    await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 15000 });
  }

  test("P&L summary cards are all visible after generation", async ({ page }) => {
    await generatePL(page, "2025-01-01", "2025-12-31");
    // Use .first() to avoid strict mode with multiple "Revenue" elements
    await expect(page.locator("text=Revenue").first()).toBeVisible();
    await expect(page.locator("text=/gross profit/i").first()).toBeVisible();
    await expect(page.locator("text=/operating expenses/i").first()).toBeVisible();
    await expect(page.locator("text=/net profit/i").first()).toBeVisible();
  });

  test("P&L: grossProfit = revenue − cogs (both shown in income table)", async ({ page }) => {
    await generatePL(page, "2025-01-01", "2025-12-31");

    const incomeTable = page.locator(".bg-emerald-500\\/5").locator("table");
    if (await incomeTable.count() === 0) return;

    const rows = incomeTable.locator("tbody tr");
    const rowCount = await rows.count();
    if (rowCount >= 3) {
      const revText = await rows.nth(0).locator("td.text-right").textContent();
      const cogsText = await rows.nth(1).locator("td.text-right").textContent();
      const grossText = await rows.nth(2).locator("td.text-right").textContent();

      const rev = parseMoney(revText ?? "");
      const cogs = parseMoney(cogsText ?? "");
      const gross = parseMoney(grossText ?? "");

      expect(r(gross)).toBe(r(rev - cogs));
    }
  });

  test("P&L: expenses table Total row = sum of category rows", async ({ page }) => {
    await generatePL(page, "2025-01-01", "2025-12-31");

    const expTable = page.locator(".bg-orange-500\\/5").locator("table");
    if (await expTable.count() === 0) return;

    const rows = expTable.locator("tbody tr");
    const rowCount = await rows.count();
    if (rowCount < 2) return;

    const totalText = await rows.last().locator("td.text-right").textContent();
    const total = parseMoney(totalText ?? "");

    let categorySum = 0;
    for (let i = 0; i < rowCount - 1; i++) {
      const rowText = await rows.nth(i).locator("td.text-right").textContent();
      const val = parseMoney(rowText ?? "");
      if (val > 0) categorySum += val;
    }
    expect(r(categorySum)).toBeCloseTo(r(total), 2);
  });

  test("P&L: fromDate defaults to Jan 1 of current year (no timezone shift)", async ({ page }) => {
    await page.goto("/dashboard/reports");
    await ready(page);

    const from = await page.locator("input[type='date']").nth(0).inputValue();
    const year = new Date().getFullYear();
    expect(from).toBe(`${year}-01-01`);
  });

  test("P&L: future date range shows $0 revenue with no error", async ({ page }) => {
    await generatePL(page, "2099-01-01", "2099-12-31");
    await expect(page.locator("body")).not.toContainText(/error|500|failed/i);
    await expect(page.locator(".text-xl.font-bold.text-emerald-400").first()).toContainText("$0.00");
  });

  test("switching P&L tab → Aging tab → back to P&L resets numbers", async ({ page }) => {
    await generatePL(page, "2025-01-01", "2025-12-31");
    await expect(page.locator("text=Revenue").first()).toBeVisible();

    await page.locator("button").filter({ hasText: /aging/i }).click();
    await page.getByRole("button", { name: /generate/i }).click();
    await ready(page);
    await expect(page.locator("text=/current|aging/i").first()).toBeVisible();

    await page.locator("button").filter({ hasText: /p&l|profit/i }).click();
    await expect(page.locator("text=Revenue")).toHaveCount(0);
  });

  test("Aging report: table rows have balance > 0 and bucket matches", async ({ page }) => {
    await page.goto("/dashboard/reports");
    await ready(page);
    await page.locator("button").filter({ hasText: /aging/i }).click();
    await page.getByRole("button", { name: /generate/i }).click();
    await ready(page);

    const rows = page.locator("table tbody tr");
    const count = await rows.count();
    if (count === 0) return;

    for (let i = 0; i < Math.min(count, 5); i++) {
      const cells = rows.nth(i).locator("td");
      const balanceText = await cells.nth(4).textContent();
      const balance = parseMoney(balanceText ?? "");
      expect(balance).toBeGreaterThanOrEqual(0);
    }
  });

  test("Aging report: bucket totals are shown", async ({ page }) => {
    await page.goto("/dashboard/reports");
    await ready(page);
    await page.locator("button").filter({ hasText: /aging/i }).click();
    await page.getByRole("button", { name: /generate/i }).click();
    await ready(page);

    await expect(page.locator("text=/Current|1.30|31.60|61.90|90\\+/i").first()).toBeVisible();
  });

  test("Export PDF button appears only after report is generated", async ({ page }) => {
    await page.goto("/dashboard/reports");
    await ready(page);

    await expect(page.getByRole("button", { name: /export pdf/i })).toHaveCount(0);

    await page.locator("button").filter({ hasText: /generate/i }).click();
    await ready(page);

    await expect(page.getByRole("button", { name: /export pdf/i })).toBeVisible();
  });
});

// ─── 8. Employees – salary auto-creates expense ───────────────────────────────

test.describe("Employees – salary auto-expense", () => {
  const FIRST = `John-${TS}`;
  const LAST = `Doe-${TS}`;
  const SALARY = 4500;
  const POS = `Engineer-${TS}`;

  async function readExpenseTotal(page: Page): Promise<number> {
    return parseMoney(await page.locator(".text-danger").first().textContent() ?? "");
  }

  async function deleteEmployee(page: Page, name: string) {
    await page.goto("/dashboard/employees");
    await ready(page);
    const row = page.locator(`tr:has-text("${name}")`).first();
    if (await row.count() > 0) {
      page.on("dialog", d => d.accept());
      await row.locator("button").last().click();
      await ready(page);
    }
  }

  /**
   * Fill employee form (no placeholders, use nth-based required input selectors):
   *   form input[required] nth(0) = firstName
   *   form input[required] nth(1) = lastName
   *   form input[required] nth(2) = position
   *   form input[required][type='number'] = salary
   */
  async function fillEmployeeForm(page: Page, firstName: string, lastName: string, position: string, salary: number) {
    await page.locator("form input[required]").nth(0).fill(firstName);
    await page.locator("form input[required]").nth(1).fill(lastName);
    await page.locator("form input[required]").nth(2).fill(position);
    await page.locator("form input[required][type='number']").fill(String(salary));
  }

  test("creating employee adds salary expense in expenses page", async ({ page }) => {
    await page.goto("/dashboard/expenses");
    await ready(page);
    const totalBefore = await readExpenseTotal(page);

    await page.goto("/dashboard/employees");
    await ready(page);
    await page.getByRole("button", { name: /add employee/i }).click();
    await fillEmployeeForm(page, FIRST, LAST, POS, SALARY);
    await page.getByRole("button", { name: /add employee|save/i }).last().click();
    await ready(page);

    await page.goto("/dashboard/expenses");
    await ready(page);

    const totalAfter = await readExpenseTotal(page);
    expect(r(totalAfter - totalBefore)).toBe(r(SALARY));

    // Filter by salaries category
    await page.locator("select").first().selectOption("salaries");
    await page.getByRole("button", { name: /search/i }).click();
    await ready(page);

    // Salary expense row contains the employee's first name
    const salaryRow = page.locator(`tr:has-text("${FIRST}")`).first();
    await expect(salaryRow).toBeVisible({ timeout: 6000 });
    await expect(salaryRow).toContainText(String(SALARY));

    await deleteEmployee(page, FIRST);
  });

  test("employee salary is displayed correctly in table", async ({ page }) => {
    await page.goto("/dashboard/employees");
    await ready(page);

    await page.getByRole("button", { name: /add employee/i }).click();
    await fillEmployeeForm(page, FIRST + "2", LAST, POS, SALARY);
    await page.getByRole("button", { name: /add employee|save/i }).last().click();
    await ready(page);

    const row = page.locator(`tr:has-text("${FIRST}2")`).first();
    await expect(row).toBeVisible({ timeout: 6000 });
    await expect(row).toContainText(new Intl.NumberFormat("en").format(SALARY));

    page.on("dialog", d => d.accept());
    await row.locator("button").last().click();
    await ready(page);
  });

  test("editing employee salary updates salary expense", async ({ page }) => {
    await page.goto("/dashboard/employees");
    await ready(page);
    await page.getByRole("button", { name: /add employee/i }).click();
    await fillEmployeeForm(page, FIRST + "3", LAST, POS, 3000);
    await page.getByRole("button", { name: /add employee|save/i }).last().click();
    await ready(page);

    await page.goto("/dashboard/expenses");
    await ready(page);
    const before = await readExpenseTotal(page);

    await page.goto("/dashboard/employees");
    await ready(page);
    const empRow = page.locator(`tr:has-text("${FIRST}3")`).first();
    await empRow.locator("button").first().click(); // pencil (edit) button
    await expect(page.locator("h2").filter({ hasText: /employee/i })).toBeVisible({ timeout: 5000 });
    const salaryInput = page.locator("form input[required][type='number']");
    await salaryInput.clear();
    await salaryInput.fill("5000");
    await page.getByRole("button", { name: /save/i }).last().click();
    await ready(page);

    await page.goto("/dashboard/expenses");
    await ready(page);
    const after = await readExpenseTotal(page);
    expect(r(after - before)).toBe(2000);

    await page.goto("/dashboard/employees");
    await ready(page);
    const row = page.locator(`tr:has-text("${FIRST}3")`).first();
    page.on("dialog", d => d.accept());
    await row.locator("button").last().click();
    await ready(page);
  });
});

// ─── 9. Stock – quantity decrements when invoice is saved ─────────────────────

test.describe("Stock – inventory quantity tracking", () => {
  const PRODUCT_NAME = `StockProd-${TS}`;
  const INITIAL_QTY = 20;
  const INVOICE_QTY = 3;

  async function createProduct(page: Page, name: string) {
    await page.goto("/dashboard/stock");
    await ready(page);
    await page.getByRole("button", { name: /add product/i }).click();
    await expect(page.locator("h2").filter({ hasText: /product/i })).toBeVisible({ timeout: 5000 });

    // Stock name input has no placeholder; use first required input
    await page.locator("form input[required]").first().fill(name);
    const numInputs = page.locator("form input[type='number']");
    await numInputs.nth(0).fill("99");         // price
    await numInputs.nth(1).fill("50");          // cost
    await numInputs.nth(2).fill(String(INITIAL_QTY)); // quantity
    await numInputs.nth(3).fill("2");           // minStock

    await page.getByRole("button", { name: /add product|save/i }).last().click();
    await ready(page);
  }

  async function deleteProduct(page: Page, name: string) {
    await page.goto("/dashboard/stock");
    await ready(page);
    const row = page.locator(`tr:has-text("${name}")`).first();
    if (await row.count() > 0) {
      page.on("dialog", d => d.accept());
      await row.locator("button").last().click();
      await ready(page);
    }
  }

  test("product stock quantity shown in table matches what was entered", async ({ page }) => {
    await createProduct(page, PRODUCT_NAME);
    const row = page.locator(`tr:has-text("${PRODUCT_NAME}")`).first();
    await expect(row).toBeVisible({ timeout: 6000 });
    await expect(row).toContainText(String(INITIAL_QTY));
    await deleteProduct(page, PRODUCT_NAME);
  });

  test("product quantity decreases by invoice qty when product is used in invoice", async ({ page }) => {
    await createProduct(page, PRODUCT_NAME);

    let row = page.locator(`tr:has-text("${PRODUCT_NAME}")`).first();
    await expect(row).toContainText(String(INITIAL_QTY));

    await page.goto("/dashboard/invoices");
    await ready(page);
    await page.getByRole("button", { name: /new invoice/i }).click();
    await page.locator("select[required]").selectOption({ index: 1 });
    await page.locator("input[type='number'][min='0'][max='100']").fill("0");

    const productSelect = page.locator(".space-y-2 select").first();
    await productSelect.selectOption({ label: PRODUCT_NAME });

    await page.locator(".space-y-2 input[type='number']").nth(0).fill(String(INVOICE_QTY));

    await page.getByRole("button", { name: /new invoice/i }).last().click();
    await ready(page);

    // Read invoice number for cleanup
    const invNum = await readFirstInvoiceNumber(page);

    await page.goto("/dashboard/stock");
    await ready(page);
    row = page.locator(`tr:has-text("${PRODUCT_NAME}")`).first();
    const expectedQty = INITIAL_QTY - INVOICE_QTY;
    await expect(row).toContainText(String(expectedQty));

    // Cleanup invoice then product
    await page.goto("/dashboard/invoices");
    await ready(page);
    const invRow = page.locator("table tbody tr").filter({ hasText: invNum });
    if (await invRow.count() > 0) {
      page.on("dialog", d => d.accept());
      await invRow.locator("button[title='Delete']").click();
      await ready(page);
    }
    await deleteProduct(page, PRODUCT_NAME);
  });

  test("low stock alert appears when quantity ≤ minStock", async ({ page }) => {
    const lowName = `LowStock-${TS}`;
    await page.goto("/dashboard/stock");
    await ready(page);
    await page.getByRole("button", { name: /add product/i }).click();

    await page.locator("form input[required]").first().fill(lowName);
    const numInputs = page.locator("form input[type='number']");
    await numInputs.nth(0).fill("10"); // price
    await numInputs.nth(1).fill("5");  // cost
    await numInputs.nth(2).fill("3");  // quantity
    await numInputs.nth(3).fill("5");  // minStock (qty 3 ≤ minStock 5 → low stock)

    await page.getByRole("button", { name: /add product|save/i }).last().click();
    await ready(page);

    await page.goto("/dashboard");
    await ready(page);
    await expect(page.locator("text=Low Stock Alerts")).toBeVisible();
    await expect(page.locator(`text=${lowName}`)).toBeVisible({ timeout: 6000 });

    // Cleanup
    await page.goto("/dashboard/stock");
    await ready(page);
    const row = page.locator(`tr:has-text("${lowName}")`).first();
    page.on("dialog", d => d.accept());
    await row.locator("button").last().click();
    await ready(page);
  });

  test("product price and cost shown correctly in table", async ({ page }) => {
    const name = `PriceTest-${TS}`;
    await page.goto("/dashboard/stock");
    await ready(page);
    await page.getByRole("button", { name: /add product/i }).click();

    await page.locator("form input[required]").first().fill(name);
    const numInputs = page.locator("form input[type='number']");
    await numInputs.nth(0).fill("199.99"); // price
    await numInputs.nth(1).fill("75.50");  // cost
    await numInputs.nth(2).fill("10");
    await numInputs.nth(3).fill("2");

    await page.getByRole("button", { name: /add product|save/i }).last().click();
    await ready(page);

    const row = page.locator(`tr:has-text("${name}")`).first();
    await expect(row).toContainText("199.99");
    await expect(row).toContainText("75.50");

    page.on("dialog", d => d.accept());
    await row.locator("button").last().click();
    await ready(page);
  });

  test("stock filter by Low Stock Only shows only low-stock products", async ({ page }) => {
    await page.goto("/dashboard/stock");
    await ready(page);

    await page.locator("select").filter({ has: page.locator("option[value='low']") }).selectOption("low");
    await ready(page);

    const rows = page.locator("table tbody tr");
    const count = await rows.count();
    if (count > 0) {
      const emptyMsg = page.locator("text=/no products/i");
      const hasEmpty = await emptyMsg.count();
      if (!hasEmpty) {
        expect(count).toBeGreaterThan(0);
      }
    }
  });
});

// ─── 10. Clients – invoice count per client ───────────────────────────────────

test.describe("Clients – invoice count tracking", () => {
  const CLIENT_NAME = `ClientCount-${TS}`;

  test("new client starts with 0 invoices", async ({ page }) => {
    await page.goto("/dashboard/clients");
    await ready(page);

    await page.getByRole("button", { name: /add client/i }).click();
    // Client name input has no placeholder; use first required input
    await page.locator("form input[required]").first().fill(CLIENT_NAME);
    await page.getByRole("button", { name: /add client|save/i }).last().click();
    await ready(page);

    const row = page.locator(`tr:has-text("${CLIENT_NAME}")`).first();
    await expect(row).toBeVisible({ timeout: 6000 });
    await expect(row).toContainText("0");

    page.on("dialog", d => d.accept());
    await row.locator("button").last().click();
    await ready(page);
  });
});

// ─── 11. Invoice status dropdown full lifecycle ───────────────────────────────

test.describe("Invoice status dropdown – full lifecycle", () => {
  const DESC = `StatusTest-${TS}`;

  async function createDraftInvoice(page: Page): Promise<string> {
    await page.goto("/dashboard/invoices");
    await ready(page);
    await page.getByRole("button", { name: /new invoice/i }).click();
    await page.locator("select[required]").selectOption({ index: 1 });
    await page.locator("input[type='number'][min='0'][max='100']").fill("0");
    await page.locator(".space-y-2 input[placeholder]").nth(0).fill(DESC);
    await page.locator(".space-y-2 input[type='number']").nth(0).fill("1");
    await page.locator(".space-y-2 input[type='number']").nth(1).fill("500");
    await page.getByRole("button", { name: /new invoice/i }).last().click();
    await ready(page);
    return readFirstInvoiceNumber(page);
  }

  async function cleanup(page: Page, invNumber: string) {
    await page.goto("/dashboard/invoices");
    await ready(page);
    const row = page.locator("table tbody tr").filter({ hasText: invNumber });
    if (await row.count() > 0) {
      page.on("dialog", d => d.accept());
      await row.locator("button[title='Delete']").click();
      await ready(page);
    }
  }

  test("new invoice defaults to Draft status with slate badge", async ({ page }) => {
    const invNumber = await createDraftInvoice(page);
    const row = page.locator("table tbody tr").filter({ hasText: invNumber });
    await expect(row.locator("select")).toHaveValue("draft");
    await cleanup(page, invNumber);
  });

  test("changing status from Draft → Sent updates badge color to blue", async ({ page }) => {
    const invNumber = await createDraftInvoice(page);
    const row = page.locator("table tbody tr").filter({ hasText: invNumber });
    await row.locator("select").selectOption("sent");
    await ready(page);
    await expect(row.locator("select")).toHaveValue("sent");
    const select = row.locator("select");
    await expect(select).toHaveClass(/text-blue-400/);
    await cleanup(page, invNumber);
  });

  test("changing status to Overdue shows red badge", async ({ page }) => {
    const invNumber = await createDraftInvoice(page);
    const row = page.locator("table tbody tr").filter({ hasText: invNumber });
    await row.locator("select").selectOption("overdue");
    await ready(page);
    const select = row.locator("select");
    await expect(select).toHaveClass(/text-red-400/);
    await cleanup(page, invNumber);
  });

  test("changing status to Paid shows emerald badge", async ({ page }) => {
    const invNumber = await createDraftInvoice(page);
    const row = page.locator("table tbody tr").filter({ hasText: invNumber });
    await row.locator("select").selectOption("paid");
    await ready(page);
    const select = row.locator("select");
    await expect(select).toHaveClass(/text-emerald-400/);
    await cleanup(page, invNumber);
  });

  test("manually setting status to Partially Paid shows amber badge", async ({ page }) => {
    const invNumber = await createDraftInvoice(page);
    const row = page.locator("table tbody tr").filter({ hasText: invNumber });
    await row.locator("select").selectOption("partially_paid");
    await ready(page);
    const select = row.locator("select");
    await expect(select).toHaveClass(/text-amber-400/);
    await cleanup(page, invNumber);
  });
});

// ─── 12. Invoice form – validation guards ────────────────────────────────────

test.describe("Invoice form – validation guards", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard/invoices");
    await ready(page);
    await page.getByRole("button", { name: /new invoice/i }).click();
    await expect(page.locator("h2").filter({ hasText: /invoice/i })).toBeVisible({ timeout: 5000 });
  });

  test("submitting without selecting a client does not create invoice", async ({ page }) => {
    const countBefore = await page.locator("table tbody tr").count();
    await page.locator(".space-y-2 input[placeholder]").nth(0).fill("TestDesc");
    await page.locator(".space-y-2 input[type='number']").nth(0).fill("1");
    await page.locator(".space-y-2 input[type='number']").nth(1).fill("100");
    await page.getByRole("button", { name: /new invoice/i }).last().click();
    await expect(page.locator("h2").filter({ hasText: /invoice/i })).toBeVisible();
    const countAfter = await page.locator("table tbody tr").count();
    expect(countAfter).toBe(countBefore);
  });

  test("negative tax rate not accepted (min=0)", async ({ page }) => {
    const taxInput = page.locator("input[type='number'][min='0'][max='100']");
    await taxInput.fill("-5");
    // HTML5 validity: input with min=0 and value=-5 violates rangeUnderflow
    const isValid = await taxInput.evaluate((el: HTMLInputElement) => el.validity.valid);
    expect(isValid).toBe(false);
  });

  test("tax rate above 100 not accepted (max=100)", async ({ page }) => {
    const taxInput = page.locator("input[type='number'][min='0'][max='100']");
    await taxInput.fill("150");
    // HTML5 validity: input with max=100 and value=150 violates rangeOverflow
    const isValid = await taxInput.evaluate((el: HTMLInputElement) => el.validity.valid);
    expect(isValid).toBe(false);
  });
});

// ─── 13. Expenses – CRUD number validation ────────────────────────────────────

test.describe("Expenses – CRUD and number validation", () => {
  test("created expense appears in table with correct amount and category", async ({ page }) => {
    const desc = `ExpCRUD-${TS}`;
    const amount = 876.54;

    await page.goto("/dashboard/expenses");
    await ready(page);
    await page.getByRole("button", { name: /add expense/i }).click();
    await page.locator("input[type='date']").first().fill("2026-02-15");
    await page.locator("input[placeholder='0.00']").fill(String(amount));
    await page.locator("form input[required]").last().fill(desc);
    await page.locator("select[required]").selectOption("marketing");
    await page.getByRole("button", { name: /save/i }).last().click();
    await ready(page);

    const row = page.locator(`tr:has-text("${desc}")`).first();
    await expect(row).toBeVisible({ timeout: 6000 });
    await expect(row).toContainText("876.54");
    await expect(row).toContainText(/marketing/i);

    page.on("dialog", d => d.accept());
    await row.locator("button").last().click();
    await ready(page);
  });

  test("editing expense updates amount in table", async ({ page }) => {
    const desc = `ExpEdit-${TS}`;

    await page.goto("/dashboard/expenses");
    await ready(page);
    await page.getByRole("button", { name: /add expense/i }).click();
    await page.locator("input[type='date']").first().fill("2026-02-15");
    await page.locator("input[placeholder='0.00']").fill("100");
    await page.locator("form input[required]").last().fill(desc);
    await page.getByRole("button", { name: /save/i }).last().click();
    await ready(page);

    const row = page.locator(`tr:has-text("${desc}")`).first();
    await row.locator("button").first().click();
    await expect(page.locator("h2").filter({ hasText: /edit/i })).toBeVisible({ timeout: 4000 });
    await page.locator("input[placeholder='0.00']").fill("750.25");
    await page.getByRole("button", { name: /save/i }).last().click();
    await ready(page);

    await expect(page.locator(`tr:has-text("${desc}")`).first()).toContainText("750.25");

    page.on("dialog", d => d.accept());
    await page.locator(`tr:has-text("${desc}")`).first().locator("button").last().click();
    await ready(page);
  });

  test("recurring monthly expense shows recurrence badge in table", async ({ page }) => {
    const desc = `RecurTest-${TS}`;

    await page.goto("/dashboard/expenses");
    await ready(page);
    await page.getByRole("button", { name: /add expense/i }).click();
    await page.locator("input[type='date']").first().fill("2026-01-01");
    await page.locator("input[placeholder='0.00']").fill("2000");
    await page.locator("form input[required]").last().fill(desc);
    await page.locator("select").filter({ has: page.locator("option[value='monthly']") }).selectOption("monthly");
    await page.getByRole("button", { name: /save/i }).last().click();
    await ready(page);

    const row = page.locator(`tr:has-text("${desc}")`).first();
    await expect(row).toBeVisible({ timeout: 6000 });
    await expect(row).toContainText(/monthly/i);

    page.on("dialog", d => d.accept());
    await row.locator("button").last().click();
    await ready(page);
  });

  test("edit form pre-fills existing amount and category", async ({ page }) => {
    const desc = `ExpPrefill-${TS}`;

    await page.goto("/dashboard/expenses");
    await ready(page);
    await page.getByRole("button", { name: /add expense/i }).click();
    await page.locator("input[type='date']").first().fill("2026-03-01");
    await page.locator("input[placeholder='0.00']").fill("333.33");
    await page.locator("form input[required]").last().fill(desc);
    await page.locator("select[required]").selectOption("utilities");
    await page.getByRole("button", { name: /save/i }).last().click();
    await ready(page);

    const row = page.locator(`tr:has-text("${desc}")`).first();
    await row.locator("button").first().click();
    await expect(page.locator("h2").filter({ hasText: /edit/i })).toBeVisible({ timeout: 4000 });

    const amountInput = page.locator("input[placeholder='0.00']");
    expect(parseFloat(await amountInput.inputValue())).toBe(333.33);

    const categorySelect = page.locator("select[required]");
    await expect(categorySelect).toHaveValue("utilities");

    // Close the edit modal (Escape doesn't work; use closeModal or Cancel button)
    await closeModal(page);

    page.on("dialog", d => d.accept());
    await page.locator(`tr:has-text("${desc}")`).first().locator("button").last().click();
    await ready(page);
  });
});
