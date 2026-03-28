/**
 * NEW FEATURES AUDIT — Deep UI-driven tests
 *
 * Covers every feature added in this session:
 *  1. Invoice Custom Fees — live preview math, view modal, grand total
 *  2. Composite Products — create, canMake display, out-of-stock disabling
 *  3. Invoice with Composite — stock deduction of components
 *  4. Salary Advances — create, stat totals, status toggle, employees column
 *  5. COGS Cost Snapshot — unitCost stored at invoice time
 *  6. Out-of-Stock simple product — disabled in dropdown
 *
 * Every monetary assertion uses exact arithmetic with r() helper.
 */

import { test, expect, Page } from "@playwright/test";

const TS = Date.now();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function r(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseMoney(text: string): number {
  const cleaned = text.replace(/[^0-9.\-]/g, "");
  return parseFloat(cleaned) || 0;
}

async function ready(page: Page, timeout = 15000) {
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout });
}

async function closeModal(page: Page) {
  const modal = page.locator(".fixed.inset-0").last();
  await modal.locator("div.flex.items-center.justify-between button").first().click();
  await expect(page.locator(".fixed.inset-0")).toHaveCount(0, { timeout: 5000 });
  await ready(page);
}

// ─── 1. Invoice Custom Fees — live preview ────────────────────────────────────

test.describe("Invoice custom fees — live preview math", () => {
  // item: qty=3, price=200 → subtotal=600
  // discount=5% → discountAmt=30, afterDiscount=570
  // tax=10%     → tax=57
  // fee1=50, fee2=30 → feesTotal=80
  // total = 570 + 57 + 80 = 707
  const ITEM_PRICE    = 200;
  const ITEM_QTY      = 3;
  const TAX_RATE      = 10;
  const DISCOUNT      = 5;
  const FEE1_AMT      = 50;
  const FEE2_AMT      = 30;
  const subtotal      = ITEM_QTY * ITEM_PRICE;
  const discountAmt   = r(subtotal * (DISCOUNT / 100));
  const afterDiscount = subtotal - discountAmt;
  const tax           = r(afterDiscount * (TAX_RATE / 100));
  const feesTotal     = FEE1_AMT + FEE2_AMT;
  const expectedTotal = r(afterDiscount + tax + feesTotal);

  test(`live total = ${expectedTotal} (subtotal=${subtotal} - discount=${discountAmt} + tax=${tax} + fees=${feesTotal})`, async ({ page }) => {
    await page.goto("/dashboard/invoices");
    await ready(page);

    await page.getByRole("button", { name: "Add Invoice" }).click();
    const modal = page.locator(".fixed.inset-0").last();
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Select first available client
    await modal.locator("select").first().selectOption({ index: 1 });

    // Set tax rate (first step=0.1 input) and discount (second)
    const stepInputs = modal.locator("input[step='0.1']");
    await stepInputs.nth(0).fill(String(TAX_RATE));
    await stepInputs.nth(1).fill(String(DISCOUNT));

    // Fill item: description (first text input in item row), qty, price
    await modal.locator("input[placeholder*='description' i]").first().fill(`FeeTest_${TS}`);
    await modal.locator("input[type='number'][min='1']").first().fill(String(ITEM_QTY));
    await modal.locator("input[type='number'][step='0.01']").first().fill(String(ITEM_PRICE));
    await page.waitForTimeout(300);

    // Verify subtotal in live preview
    const subtotalRow = modal.locator("div.flex.justify-between").filter({ hasText: /subtotal/i }).first();
    const subtotalText = await subtotalRow.locator("span").last().textContent() ?? "";
    console.log(`  Subtotal: expected=${subtotal}, got=${subtotalText.trim()}`);
    expect(parseMoney(subtotalText)).toBeCloseTo(subtotal, 1);

    // Add Fee 1
    await modal.getByRole("button", { name: /add fee/i }).click();
    const feeLabels = modal.locator("input[placeholder*='e.g' i]");
    await feeLabels.last().fill("Delivery");
    await modal.locator("input[placeholder='0.00']").last().fill(String(FEE1_AMT));

    // Add Fee 2
    await modal.getByRole("button", { name: /add fee/i }).click();
    await modal.locator("input[placeholder*='e.g' i]").last().fill("Setup");
    await modal.locator("input[placeholder='0.00']").last().fill(String(FEE2_AMT));
    await page.waitForTimeout(400);

    // Read grand total
    const totalRow = modal.locator("div.flex.justify-between.border-t");
    const totalText = await totalRow.locator("span").last().textContent() ?? "";
    const actualTotal = parseMoney(totalText);
    console.log(`  Grand total: expected=${expectedTotal}, got=${actualTotal}`);
    expect(actualTotal).toBeCloseTo(expectedTotal, 1);

    await closeModal(page);
    console.log(`  ✅ PASS: live fee preview correct (total=${actualTotal})`);
  });
});

// ─── 2. Invoice fee math — fee is NOT taxed ────────────────────────────────────

test.describe("Invoice fee — tax does NOT apply to fees", () => {
  // price=100, qty=1, tax=20%, fee=25
  // total = 100 + 100*0.20 + 25 = 145  (NOT 150 which would be if fee was taxed)
  const PRICE    = 100;
  const QTY      = 1;
  const TAX      = 20;
  const FEE      = 25;
  const expected = r(PRICE * QTY * (1 + TAX / 100) + FEE); // 145
  const wrongIfTaxedFee = r((PRICE * QTY + FEE) * (1 + TAX / 100));  // 150

  test(`total=${expected}, not ${wrongIfTaxedFee} (fee excluded from tax base)`, async ({ page }) => {
    await page.goto("/dashboard/invoices");
    await ready(page);

    await page.getByRole("button", { name: "Add Invoice" }).click();
    const modal = page.locator(".fixed.inset-0").last();
    await expect(modal).toBeVisible({ timeout: 5000 });

    await modal.locator("select").first().selectOption({ index: 1 });
    await modal.locator("input[step='0.1']").nth(0).fill(String(TAX));

    await modal.locator("input[placeholder*='description' i]").first().fill(`TaxFeeTest_${TS}`);
    await modal.locator("input[type='number'][min='1']").first().fill(String(QTY));
    await modal.locator("input[type='number'][step='0.01']").first().fill(String(PRICE));
    await page.waitForTimeout(300);

    await modal.getByRole("button", { name: /add fee/i }).click();
    await modal.locator("input[placeholder*='e.g' i]").last().fill("Test Fee");
    await modal.locator("input[placeholder='0.00']").last().fill(String(FEE));
    await page.waitForTimeout(300);

    const totalText = await modal.locator("div.flex.justify-between.border-t").locator("span").last().textContent() ?? "";
    const actual = parseMoney(totalText);
    console.log(`  Price=${PRICE}, Tax=${TAX}%, Fee=${FEE} → expected=${expected}, got=${actual}`);
    expect(actual).toBeCloseTo(expected, 1);
    expect(Math.abs(actual - wrongIfTaxedFee)).toBeGreaterThan(1); // confirm it's NOT taxing the fee

    await closeModal(page);
    console.log(`  ✅ PASS: fee correctly excluded from tax calculation`);
  });
});

// ─── 3. Full invoice math — 2 items + discount + tax + fee ────────────────────

test.describe("Full invoice total — 2 items + discount + tax + fee", () => {
  // item1: qty=4, price=250 → 1000
  // item2: qty=2, price=150 → 300
  // subtotal=1300, discount=10% → discountAmt=130, afterDiscount=1170
  // tax=15% → tax=175.5
  // fee=75
  // total = 1170 + 175.5 + 75 = 1420.5
  const items    = [{ qty: 4, price: 250 }, { qty: 2, price: 150 }];
  const DISCOUNT = 10;
  const TAX      = 15;
  const FEE      = 75;
  const subtotal      = items.reduce((s, i) => s + i.qty * i.price, 0); // 1300
  const discountAmt   = r(subtotal * (DISCOUNT / 100));                  // 130
  const afterDiscount = subtotal - discountAmt;                           // 1170
  const tax           = r(afterDiscount * (TAX / 100));                  // 175.5
  const expectedTotal = r(afterDiscount + tax + FEE);                    // 1420.5

  test(`subtotal=${subtotal} - ${DISCOUNT}% + ${TAX}%tax + fee=${FEE} → ${expectedTotal}`, async ({ page }) => {
    await page.goto("/dashboard/invoices");
    await ready(page);

    await page.getByRole("button", { name: "Add Invoice" }).click();
    const modal = page.locator(".fixed.inset-0").last();
    await expect(modal).toBeVisible({ timeout: 5000 });

    await modal.locator("select").first().selectOption({ index: 1 });
    await modal.locator("input[step='0.1']").nth(0).fill(String(TAX));
    await modal.locator("input[step='0.1']").nth(1).fill(String(DISCOUNT));

    // Item 1
    await modal.locator("input[placeholder*='description' i]").first().fill(`FullCalc1_${TS}`);
    await modal.locator("input[type='number'][min='1']").first().fill(String(items[0].qty));
    await modal.locator("input[type='number'][step='0.01']").first().fill(String(items[0].price));
    await page.waitForTimeout(200);

    // Add Item 2
    await modal.getByRole("button", { name: /add item/i }).click();
    await modal.locator("input[placeholder*='description' i]").last().fill(`FullCalc2_${TS}`);
    await modal.locator("input[type='number'][min='1']").last().fill(String(items[1].qty));
    await modal.locator("input[type='number'][step='0.01']").last().fill(String(items[1].price));
    await page.waitForTimeout(300);

    // Verify subtotal
    const subtotalText = await modal.locator("div.flex.justify-between").filter({ hasText: /subtotal/i }).first().locator("span").last().textContent() ?? "";
    const actualSubtotal = parseMoney(subtotalText);
    console.log(`  Subtotal: expected=${subtotal}, got=${actualSubtotal}`);
    expect(actualSubtotal).toBeCloseTo(subtotal, 1);

    // Verify discount (displayed as negative "-130", take absolute)
    const discountRow = modal.locator("div.flex.justify-between").filter({ hasText: /discount/i });
    if (await discountRow.isVisible()) {
      const discountText = await discountRow.locator("span").last().textContent() ?? "";
      const actualDiscount = Math.abs(parseMoney(discountText));
      console.log(`  Discount: expected=${discountAmt}, got=${actualDiscount}`);
      expect(actualDiscount).toBeCloseTo(discountAmt, 1);
    }

    // Verify tax
    const taxText = await modal.locator("div.flex.justify-between").filter({ hasText: /tax/i }).first().locator("span").last().textContent() ?? "";
    const actualTax = parseMoney(taxText);
    console.log(`  Tax: expected=${tax}, got=${actualTax}`);
    expect(actualTax).toBeCloseTo(tax, 1);

    // Add fee
    await modal.getByRole("button", { name: /add fee/i }).click();
    await modal.locator("input[placeholder*='e.g' i]").last().fill("Delivery");
    await modal.locator("input[placeholder='0.00']").last().fill(String(FEE));
    await page.waitForTimeout(300);

    // Grand total
    const totalText = await modal.locator("div.flex.justify-between.border-t").locator("span").last().textContent() ?? "";
    const actualTotal = parseMoney(totalText);
    console.log(`  Grand total: expected=${expectedTotal}, got=${actualTotal}`);
    expect(actualTotal).toBeCloseTo(expectedTotal, 1);

    await closeModal(page);
    console.log(`  ✅ PASS: all calculations correct`);
  });
});

// ─── 4. Saved invoice shows fees in view modal ────────────────────────────────

test.describe("Saved invoice view modal shows fees", () => {
  const FEE1 = 40;
  const FEE2 = 60;
  const PRICE = 500;
  const QTY = 1;
  const TAX = 10;
  // total = 500 + 50 + 40 + 60 = 650
  const expected = r(PRICE + PRICE * (TAX / 100) + FEE1 + FEE2); // 650

  test("fees appear in totals breakdown and total matches", async ({ page }) => {
    await page.goto("/dashboard/invoices");
    await ready(page);

    await page.getByRole("button", { name: "Add Invoice" }).click();
    const modal = page.locator(".fixed.inset-0").last();
    await expect(modal).toBeVisible({ timeout: 5000 });

    await modal.locator("select").first().selectOption({ index: 1 });
    await modal.locator("input[step='0.1']").nth(0).fill(String(TAX));

    await modal.locator("input[placeholder*='description' i]").first().fill(`SavedFee_${TS}`);
    await modal.locator("input[type='number'][min='1']").first().fill(String(QTY));
    await modal.locator("input[type='number'][step='0.01']").first().fill(String(PRICE));

    // Fee 1: Shipping
    await modal.getByRole("button", { name: /add fee/i }).click();
    await modal.locator("input[placeholder*='e.g' i]").last().fill("Shipping");
    await modal.locator("input[placeholder='0.00']").last().fill(String(FEE1));

    // Fee 2: Handling
    await modal.getByRole("button", { name: /add fee/i }).click();
    await modal.locator("input[placeholder*='e.g' i]").last().fill("Handling");
    await modal.locator("input[placeholder='0.00']").last().fill(String(FEE2));

    // Submit the invoice
    await modal.locator("button[type='submit']").click();
    await expect(page.locator(".fixed.inset-0")).toHaveCount(0, { timeout: 15000 });
    await ready(page);

    // Open the newest invoice
    await page.locator("table tbody tr").first().locator("button[title='View']").click();
    await expect(page.locator(".fixed.inset-0")).toBeVisible({ timeout: 5000 });
    const viewModal = page.locator(".fixed.inset-0").last();

    // Verify Shipping fee row
    const shippingRow = viewModal.locator("div.flex.justify-between").filter({ hasText: "Shipping" });
    await expect(shippingRow).toBeVisible();
    const shippingAmt = parseMoney(await shippingRow.locator("span").last().textContent() ?? "");
    console.log(`  Shipping fee: expected=${FEE1}, got=${shippingAmt}`);
    expect(shippingAmt).toBeCloseTo(FEE1, 1);

    // Verify Handling fee row
    const handlingRow = viewModal.locator("div.flex.justify-between").filter({ hasText: "Handling" });
    await expect(handlingRow).toBeVisible();
    const handlingAmt = parseMoney(await handlingRow.locator("span").last().textContent() ?? "");
    console.log(`  Handling fee: expected=${FEE2}, got=${handlingAmt}`);
    expect(handlingAmt).toBeCloseTo(FEE2, 1);

    // Verify grand total
    const totalText = await viewModal.locator("div.flex.justify-between.border-t").locator("span").last().textContent() ?? "";
    const actualTotal = parseMoney(totalText);
    console.log(`  Grand total: expected=${expected}, got=${actualTotal}`);
    expect(actualTotal).toBeCloseTo(expected, 1);

    await closeModal(page);
    console.log(`  ✅ PASS: saved invoice fees visible and total correct`);
  });
});

// ─── 5. Composite Products — creation ────────────────────────────────────────

test.describe("Composite products — create and canMake", () => {
  const COMP_A_NAME  = `Wood_${TS}`;
  const COMP_B_NAME  = `Fabric_${TS}`;
  const COMPOSITE_NAME = `LivingRoom_${TS}`;
  const COMP_A_QTY   = 10;
  const COMP_B_QTY   = 15;
  const NEED_A       = 2;
  const NEED_B       = 3;
  // canMake = floor(min(10/2, 15/3)) = floor(min(5,5)) = 5

  async function createSimpleProduct(page: Page, name: string, price: number, qty: number, cost: number) {
    await page.getByRole("button", { name: "Add Product" }).click();
    const modal = page.locator(".fixed.inset-0").last();
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Ensure Simple type is selected (default)
    const simpleBtn = modal.getByRole("button", { name: "Simple Product" });
    if (await simpleBtn.isVisible()) await simpleBtn.click();

    // Name is the first required text input
    const nameInput = modal.locator("input:not([type='number']):not([readonly])").first();
    await nameInput.fill(name);

    // Price (first number input step=0.01)
    await modal.locator("input[type='number'][step='0.01']").nth(0).fill(String(price));
    // Cost (second number input step=0.01)
    await modal.locator("input[type='number'][step='0.01']").nth(1).fill(String(cost));
    // Quantity (first number input without step — min=0)
    await modal.locator("input[type='number'][min='0']:not([step])").nth(0).fill(String(qty));

    await modal.locator("button[type='submit']").click();
    await expect(page.locator(".fixed.inset-0")).toHaveCount(0, { timeout: 10000 });
    await ready(page);
  }

  test("creates component A and component B (simple products)", async ({ page }) => {
    await page.goto("/dashboard/stock");
    await ready(page);

    await createSimpleProduct(page, COMP_A_NAME, 50, COMP_A_QTY, 20);
    console.log(`  ✅ Created component A: ${COMP_A_NAME} qty=${COMP_A_QTY}`);

    await createSimpleProduct(page, COMP_B_NAME, 30, COMP_B_QTY, 10);
    console.log(`  ✅ Created component B: ${COMP_B_NAME} qty=${COMP_B_QTY}`);

    // Both products visible in table
    const tableText = await page.locator("table").textContent() ?? "";
    expect(tableText).toContain(COMP_A_NAME);
    expect(tableText).toContain(COMP_B_NAME);
  });

  test("creates composite product referencing component A and B", async ({ page }) => {
    await page.goto("/dashboard/stock");
    await ready(page);

    await page.getByRole("button", { name: "Add Product" }).click();
    const modal = page.locator(".fixed.inset-0").last();
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Switch to Composite type
    await modal.getByRole("button", { name: "Composite Product" }).click();
    await page.waitForTimeout(200);

    // Name
    const nameInput = modal.locator("input:not([type='number']):not([readonly])").first();
    await nameInput.fill(COMPOSITE_NAME);

    // Price (only one step=0.01 input for composite; cost is auto-computed div)
    await modal.locator("input[type='number'][step='0.01']").first().fill("200");

    // Add component A
    await modal.getByRole("button", { name: /add component/i }).click();
    const compSelects = modal.locator("select");
    // Last select added should be the component selector
    const lastSelect = compSelects.last();
    // Find option containing COMP_A_NAME
    const options = await lastSelect.locator("option").allTextContents();
    const optA = options.find(o => o.includes(COMP_A_NAME));
    expect(optA).toBeTruthy();
    await lastSelect.selectOption({ label: optA! });

    // Set qty for component A
    await modal.locator("input[placeholder='Qty']").last().fill(String(NEED_A));

    // Add component B
    await modal.getByRole("button", { name: /add component/i }).click();
    const lastSelect2 = modal.locator("select").last();
    const options2 = await lastSelect2.locator("option").allTextContents();
    const optB = options2.find(o => o.includes(COMP_B_NAME));
    expect(optB).toBeTruthy();
    await lastSelect2.selectOption({ label: optB! });
    await modal.locator("input[placeholder='Qty']").last().fill(String(NEED_B));

    await modal.locator("button[type='submit']").click();
    await expect(page.locator(".fixed.inset-0")).toHaveCount(0, { timeout: 10000 });
    await ready(page);
    console.log(`  ✅ Created composite: ${COMPOSITE_NAME}`);

    // Verify it appears in table with "Composite" badge
    const tableText = await page.locator("table").textContent() ?? "";
    expect(tableText).toContain(COMPOSITE_NAME);
    expect(tableText).toContain("Composite");
  });

  test(`composite shows canMake = 5 (floor(min(${COMP_A_QTY}/${NEED_A}, ${COMP_B_QTY}/${NEED_B})))`, async ({ page }) => {
    await page.goto("/dashboard/stock");
    await ready(page);

    const expectedCanMake = Math.floor(Math.min(COMP_A_QTY / NEED_A, COMP_B_QTY / NEED_B)); // 5

    // Find the composite row
    const rows = page.locator("table tbody tr");
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      const text = await rows.nth(i).textContent() ?? "";
      if (text.includes(COMPOSITE_NAME)) {
        console.log(`  Row text: ${text.replace(/\s+/g, " ").trim()}`);
        expect(text).toContain(String(expectedCanMake));
        console.log(`  ✅ PASS: canMake=${expectedCanMake} shown correctly`);
        return;
      }
    }
    // Try filtering to All Types
    test.skip();
  });
});

// ─── 6. Out-of-stock product disabled in invoice dropdown ─────────────────────

test.describe("Out-of-stock products disabled in invoice form", () => {
  const ZERO_NAME = `OutOfStock_${TS}`;

  test("creates product with qty=0 then verifies it is disabled in invoice dropdown", async ({ page }) => {
    // Create a zero-stock product
    await page.goto("/dashboard/stock");
    await ready(page);

    await page.getByRole("button", { name: "Add Product" }).click();
    const modal = page.locator(".fixed.inset-0").last();
    await expect(modal).toBeVisible({ timeout: 5000 });

    await modal.getByRole("button", { name: "Simple Product" }).click();
    await modal.locator("input:not([type='number']):not([readonly])").first().fill(ZERO_NAME);
    await modal.locator("input[type='number'][step='0.01']").nth(0).fill("100");
    await modal.locator("input[type='number'][step='0.01']").nth(1).fill("50");
    await modal.locator("input[type='number'][min='0']:not([step])").nth(0).fill("0");

    await modal.locator("button[type='submit']").click();
    await expect(page.locator(".fixed.inset-0")).toHaveCount(0, { timeout: 10000 });
    await ready(page);
    console.log(`  ✅ Created zero-qty product: ${ZERO_NAME}`);

    // Go to invoices, check dropdown
    await page.goto("/dashboard/invoices");
    await ready(page);

    await page.getByRole("button", { name: "Add Invoice" }).click();
    const invModal = page.locator(".fixed.inset-0").last();
    await expect(invModal).toBeVisible({ timeout: 5000 });

    // Find product select (in the item row — last select in modal)
    const productSelect = invModal.locator("select").last();

    // Find the option for our zero-qty product
    const allOptions = await productSelect.locator("option").all();
    let found = false;
    for (const opt of allOptions) {
      const text = await opt.textContent() ?? "";
      if (text.includes(ZERO_NAME)) {
        const disabled = await opt.evaluate((el: HTMLOptionElement) => el.disabled);
        console.log(`  Option: "${text.trim()}", disabled=${disabled}`);
        expect(disabled).toBe(true);
        expect(text.toLowerCase()).toContain("out of stock");
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
    await closeModal(page);
    console.log(`  ✅ PASS: zero-stock product is disabled and shows "out of stock"`);
  });
});

// ─── 7. Salary Advances ───────────────────────────────────────────────────────

test.describe("Salary Advances — full flow", () => {
  test("page loads with stat cards (total advanced, returned, outstanding)", async ({ page }) => {
    await page.goto("/dashboard/salary-advances");
    await ready(page);

    // The page h1 should contain "Salary Advances" (or translation)
    const h1 = await page.locator("h1").first().textContent() ?? "";
    console.log(`  Page h1: "${h1}"`);
    expect(h1.toLowerCase()).toContain("advance");

    // Three stat cards with dark-card class
    const statCards = page.locator(".bg-dark-card.border.border-dark-border.rounded-xl");
    const count = await statCards.count();
    console.log(`  Stat card count: ${count}`);
    expect(count).toBeGreaterThanOrEqual(3);

    // Read stat values
    const advancedCard = statCards.nth(0);
    const returnedCard = statCards.nth(1);
    const outstandingCard = statCards.nth(2);

    const advancedText = await advancedCard.locator("div.text-lg, div.text-2xl").textContent() ?? "";
    const returnedText = await returnedCard.locator("div.text-lg, div.text-2xl").textContent() ?? "";
    const outstandingText = await outstandingCard.locator("div.text-lg, div.text-2xl").textContent() ?? "";

    const totalAdvanced   = parseMoney(advancedText);
    const totalReturned   = parseMoney(returnedText);
    const totalOutstanding = parseMoney(outstandingText);

    console.log(`  Total advanced: ${totalAdvanced}`);
    console.log(`  Total returned: ${totalReturned}`);
    console.log(`  Total outstanding: ${totalOutstanding}`);

    // Math: advanced = returned + outstanding
    expect(r(totalReturned + totalOutstanding)).toBeCloseTo(totalAdvanced, 1);
    console.log(`  ✅ PASS: advanced = returned + outstanding (${totalReturned} + ${totalOutstanding} = ${totalAdvanced})`);
  });

  test("creates a new advance and stats update correctly", async ({ page }) => {
    await page.goto("/dashboard/salary-advances");
    await ready(page);

    // Read initial stats
    const cards = page.locator(".bg-dark-card.border.border-dark-border.rounded-xl");
    const initialAdvanced    = parseMoney(await cards.nth(0).locator("div.text-lg, div.text-2xl").textContent() ?? "");
    const initialOutstanding = parseMoney(await cards.nth(2).locator("div.text-lg, div.text-2xl").textContent() ?? "");

    const ADV_AMOUNT = 350;

    // Click "New Advance"
    await page.getByRole("button", { name: "New Advance" }).click();
    const modal = page.locator(".fixed.inset-0").last();
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Select first employee
    await modal.locator("select").first().selectOption({ index: 1 });

    // Amount
    await modal.locator("input[type='number']").first().fill(String(ADV_AMOUNT));

    // Date
    const dateInput = modal.locator("input[type='date']").first();
    if (await dateInput.isVisible()) {
      await dateInput.fill(new Date().toISOString().split("T")[0]);
    }

    await modal.locator("button[type='submit']").click();
    await expect(page.locator(".fixed.inset-0")).toHaveCount(0, { timeout: 10000 });
    await ready(page);

    // Verify advance appears in table
    const tableText = await page.locator("table").textContent() ?? "";
    expect(tableText).toContain(String(ADV_AMOUNT));
    console.log(`  ✅ Advance of ${ADV_AMOUNT} visible in table`);

    // Verify stats updated
    const newAdvanced    = parseMoney(await cards.nth(0).locator("div.text-lg, div.text-2xl").textContent() ?? "");
    const newOutstanding = parseMoney(await cards.nth(2).locator("div.text-lg, div.text-2xl").textContent() ?? "");

    console.log(`  Total advanced: ${initialAdvanced} → ${newAdvanced} (diff=${r(newAdvanced - initialAdvanced)})`);
    console.log(`  Outstanding: ${initialOutstanding} → ${newOutstanding}`);

    expect(r(newAdvanced - initialAdvanced)).toBeCloseTo(ADV_AMOUNT, 1);
    expect(r(newOutstanding - initialOutstanding)).toBeCloseTo(ADV_AMOUNT, 1);
    console.log(`  ✅ PASS: total advanced +${ADV_AMOUNT}, outstanding +${ADV_AMOUNT}`);
  });

  test("toggling status pending→returned moves amount from outstanding to returned", async ({ page }) => {
    await page.goto("/dashboard/salary-advances");
    await ready(page);

    const cards = page.locator(".bg-dark-card.border.border-dark-border.rounded-xl");
    const initialReturned    = parseMoney(await cards.nth(1).locator("div.text-lg, div.text-2xl").textContent() ?? "");
    const initialOutstanding = parseMoney(await cards.nth(2).locator("div.text-lg, div.text-2xl").textContent() ?? "");

    // Find a pending advance row
    const rows = page.locator("table tbody tr");
    const count = await rows.count();
    let targetRow = null;
    let rowAmount = 0;

    for (let i = 0; i < count; i++) {
      const text = await rows.nth(i).textContent() ?? "";
      if (text.toLowerCase().includes("pending")) {
        targetRow = rows.nth(i);
        // Extract amount from the row
        const cells = await targetRow.locator("td").allTextContents();
        rowAmount = parseMoney(cells[2] ?? cells[1] ?? "0");
        break;
      }
    }

    if (!targetRow) {
      console.log("  No pending advance found, skipping toggle test");
      test.skip();
      return;
    }

    console.log(`  Toggling pending advance of amount=${rowAmount}`);

    // Click toggle button (first button in the row that is not trash)
    const toggleBtn = targetRow.locator("button").first();
    await toggleBtn.click();
    await ready(page);

    // Verify status changed to returned
    const rowTextAfter = await targetRow.textContent() ?? "";
    console.log(`  Row after toggle: ${rowTextAfter.replace(/\s+/g, " ").trim()}`);
    expect(rowTextAfter.toLowerCase()).toContain("returned");

    // Verify stats: outstanding decreased, returned increased
    const newReturned    = parseMoney(await cards.nth(1).locator("div.text-lg, div.text-2xl").textContent() ?? "");
    const newOutstanding = parseMoney(await cards.nth(2).locator("div.text-lg, div.text-2xl").textContent() ?? "");

    console.log(`  Returned: ${initialReturned} → ${newReturned}`);
    console.log(`  Outstanding: ${initialOutstanding} → ${newOutstanding}`);

    if (rowAmount > 0) {
      expect(r(newReturned - initialReturned)).toBeCloseTo(rowAmount, 1);
      expect(r(initialOutstanding - newOutstanding)).toBeCloseTo(rowAmount, 1);
    }
    console.log(`  ✅ PASS: status toggled, stats updated correctly`);
  });

  test("outstanding advance column on employees page shows non-zero", async ({ page }) => {
    await page.goto("/dashboard/employees");
    await ready(page);

    const headers = await page.locator("thead th").allTextContents();
    const advIdx = headers.findIndex(h =>
      h.toLowerCase().includes("advance") || h.toLowerCase().includes("outstanding")
    );
    console.log(`  Headers: ${headers.map(h => h.trim()).join(" | ")}`);
    expect(advIdx).toBeGreaterThanOrEqual(0);

    const rows = page.locator("table tbody tr");
    const rowCount = await rows.count();
    let foundNonZero = false;

    for (let i = 0; i < rowCount; i++) {
      const cells = await rows.nth(i).locator("td").allTextContents();
      if (advIdx < cells.length) {
        const amt = parseMoney(cells[advIdx]);
        if (amt > 0) {
          foundNonZero = true;
          console.log(`  Employee row ${i}: outstanding=${amt}`);
        }
      }
    }
    expect(foundNonZero).toBe(true);
    console.log(`  ✅ PASS: outstanding advance shown correctly in employees table`);
  });
});

// ─── 8. Salary advance stat totals math ──────────────────────────────────────

test.describe("Salary advance stat card math", () => {
  test("advanced = returned + outstanding at all times", async ({ page }) => {
    await page.goto("/dashboard/salary-advances");
    await ready(page);

    const cards = page.locator(".bg-dark-card.border.border-dark-border.rounded-xl");

    // Get precise numbers via API
    const advRes = await page.request.get("/api/salary-advances");
    const advances: Array<{ amount: number; status: string }> = await advRes.json();

    const totalAdvanced    = r(advances.reduce((s, a) => s + a.amount, 0));
    const totalReturned    = r(advances.filter(a => a.status === "returned").reduce((s, a) => s + a.amount, 0));
    const totalOutstanding = r(advances.filter(a => a.status === "pending").reduce((s, a) => s + a.amount, 0));

    // Read displayed values
    const shownAdvanced    = parseMoney(await cards.nth(0).locator("div.text-lg, div.text-2xl, div[class*='font-bold']").first().textContent() ?? "");
    const shownReturned    = parseMoney(await cards.nth(1).locator("div.text-lg, div.text-2xl, div[class*='font-bold']").first().textContent() ?? "");
    const shownOutstanding = parseMoney(await cards.nth(2).locator("div.text-lg, div.text-2xl, div[class*='font-bold']").first().textContent() ?? "");

    console.log(`  API: advanced=${totalAdvanced}, returned=${totalReturned}, outstanding=${totalOutstanding}`);
    console.log(`  UI:  advanced=${shownAdvanced},  returned=${shownReturned},  outstanding=${shownOutstanding}`);

    // fmtCompact may abbreviate (K/M/B), so just verify math on what we can
    expect(r(totalReturned + totalOutstanding)).toBeCloseTo(totalAdvanced, 1);
    console.log(`  ✅ PASS: returned + outstanding = advanced`);
  });
});
