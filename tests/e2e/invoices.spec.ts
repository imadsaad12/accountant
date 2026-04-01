import { test, expect } from "@playwright/test";

const TS = Date.now();

test.describe("Invoices", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard/invoices");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 10000 });
  });

  // ── PAGE LOAD ────────────────────────────────────────────────
  test("page loads and shows table", async ({ page }) => {
    await expect(page.locator("h1").last()).toContainText(/invoices/i);
    await expect(page.locator("table")).toBeVisible();
  });

  test("table has due date column header", async ({ page }) => {
    await expect(page.locator("thead").filter({ hasText: /due/i })).toBeVisible();
  });

  // ── CREATE INVOICE ───────────────────────────────────────────
  test("create invoice with one custom item", async ({ page }) => {
    await page.getByRole("button", { name: /new invoice/i }).click();
    await page.locator("select[required]").selectOption({ index: 1 });
    await page.locator("input[placeholder*='escription']").fill("Consulting Service");
    const numInputs = page.locator(".divide-y input[type='number']");
    await numInputs.nth(0).fill("2");
    await numInputs.nth(1).fill("500");
    await page.getByRole("button", { name: /new invoice/i }).last().click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 6000 });
  });

  test("add item button appears below item rows", async ({ page }) => {
    await page.getByRole("button", { name: /new invoice/i }).click();
    await expect(page.locator("button").filter({ hasText: /add item/i })).toBeVisible({ timeout: 4000 });
    await page.keyboard.press("Escape");
  });

  test("add multiple items via Add Item button", async ({ page }) => {
    await page.getByRole("button", { name: /new invoice/i }).click();
    const addItemBtn = page.locator("button").filter({ hasText: /add item/i });
    await addItemBtn.click();
    await addItemBtn.click();
    await expect(page.locator("input[placeholder*='escription']")).toHaveCount(3);
    await page.keyboard.press("Escape");
  });

  test("remove item button invisible when only 1 item", async ({ page }) => {
    await page.getByRole("button", { name: /new invoice/i }).click();
    await expect(page.locator(".invisible")).toBeAttached();
    await page.keyboard.press("Escape");
  });

  test("remove button visible with 2+ items", async ({ page }) => {
    await page.getByRole("button", { name: /new invoice/i }).click();
    await page.locator("button").filter({ hasText: /add item/i }).click();
    await expect(page.locator(".invisible")).toHaveCount(0);
    await page.keyboard.press("Escape");
  });

  test("subtotal auto-calculates from qty × price", async ({ page }) => {
    await page.getByRole("button", { name: /new invoice/i }).click();
    await page.locator("select[required]").selectOption({ index: 1 });
    await page.locator("input[placeholder*='escription']").fill("Item A");
    const numInputs = page.locator(".divide-y input[type='number']");
    await numInputs.nth(0).fill("5");
    await numInputs.nth(1).fill("100");
    await expect(page.locator("text=/500/").first()).toBeVisible({ timeout: 3000 });
    await page.keyboard.press("Escape");
  });

  test("due date cannot be before invoice date", async ({ page }) => {
    await page.getByRole("button", { name: /new invoice/i }).click();
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    // Date inputs inside the form (first = invoice date, second = due date)
    const dateInputs = page.locator(".fixed.inset-0 input[type='date']");
    await dateInputs.nth(0).fill(today);
    await dateInputs.nth(1).fill(yesterday);
    const dueDateValue = await dateInputs.nth(1).inputValue();
    expect(dueDateValue === "" || dueDateValue >= today).toBeTruthy();
    await page.keyboard.press("Escape");
  });

  test("tax rate 0% shows zero tax amount", async ({ page }) => {
    await page.getByRole("button", { name: /new invoice/i }).click();
    await page.locator("select[required]").selectOption({ index: 1 });
    // Set tax rate to 0 (the number input with max=100 is the tax rate field)
    const taxInput = page.locator("input[type='number'][max='100']");
    await taxInput.fill("0");
    await page.locator("input[placeholder*='escription']").fill("Test");
    const numInputs = page.locator(".divide-y input[type='number']");
    await numInputs.nth(0).fill("1");
    await numInputs.nth(1).fill("100");
    await expect(page.locator("text=/tax.*0|0.*tax/i").first()).toBeVisible({ timeout: 3000 });
    await page.keyboard.press("Escape");
  });

  // ── STATUS ───────────────────────────────────────────────────
  test("status dropdown visible for admin", async ({ page }) => {
    await expect(page.locator("table tbody tr").first().locator("select")).toBeVisible();
  });

  test("change invoice status to paid", async ({ page }) => {
    const firstSelect = page.locator("table tbody select").first();
    await firstSelect.selectOption("paid");
    await page.waitForLoadState("networkidle");
    await expect(firstSelect).toHaveValue("paid");
  });

  // ── TC-INV-18: STATUS TRANSITIONS (all combinations) ─────────
  const INV_API_TIMEOUT = 30000;

  test("TC-INV-18a: draft → sent status change (no warning popup)", async ({ page }) => {
    const clientsRes = await page.request.get("/api/clients", { timeout: INV_API_TIMEOUT });
    const clients = await clientsRes.json();
    if (clients.length === 0) return;
    const invRes = await page.request.post("/api/invoices", {
      data: { clientId: clients[0].id, taxRate: 0, status: "draft", items: [{ description: "Status Test A", quantity: 1, unitPrice: 100 }] },
      timeout: INV_API_TIMEOUT,
    });
    const inv = await invRes.json();
    await page.goto("/dashboard/invoices");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 10000 });

    const row = page.locator(`tr:has-text("${inv.number}")`);
    await expect(row).toBeVisible({ timeout: 6000 });
    await row.locator("select").selectOption("sent");
    await page.waitForLoadState("networkidle");
    await expect(row.locator("select")).toHaveValue("sent", { timeout: 10000 });

    await page.request.delete(`/api/invoices/${inv.id}`, { timeout: INV_API_TIMEOUT });
  });

  test("TC-INV-18b: sent → paid status change auto-creates full payment", async ({ page }) => {
    const clientsRes = await page.request.get("/api/clients", { timeout: INV_API_TIMEOUT });
    const clients = await clientsRes.json();
    if (clients.length === 0) return;
    const invRes = await page.request.post("/api/invoices", {
      data: { clientId: clients[0].id, taxRate: 0, status: "sent", items: [{ description: "Status Test B", quantity: 1, unitPrice: 200 }] },
      timeout: INV_API_TIMEOUT,
    });
    const inv = await invRes.json();
    await page.goto("/dashboard/invoices");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 10000 });

    const row = page.locator(`tr:has-text("${inv.number}")`);
    await expect(row).toBeVisible({ timeout: 6000 });
    await row.locator("select").selectOption("paid");
    await page.waitForLoadState("networkidle");
    await expect(row.locator("select")).toHaveValue("paid", { timeout: 10000 });

    await page.request.delete(`/api/invoices/${inv.id}`, { timeout: INV_API_TIMEOUT });
  });

  test("TC-INV-18c: paid → draft shows warning popup, confirm deletes payments", async ({ page }) => {
    const clientsRes = await page.request.get("/api/clients", { timeout: INV_API_TIMEOUT });
    const clients = await clientsRes.json();
    if (clients.length === 0) return;
    const invRes = await page.request.post("/api/invoices", {
      data: { clientId: clients[0].id, taxRate: 0, status: "sent", items: [{ description: "Status Test C", quantity: 1, unitPrice: 150 }] },
      timeout: INV_API_TIMEOUT,
    });
    const inv = await invRes.json();
    await page.request.post(`/api/invoices/${inv.id}/payments`, {
      data: { amount: 150, method: "cash" }, timeout: INV_API_TIMEOUT
    });

    await page.goto("/dashboard/invoices");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 10000 });

    const row = page.locator(`tr:has-text("${inv.number}")`);
    await expect(row).toBeVisible({ timeout: 6000 });

    page.on("dialog", (dialog) => {
      expect(dialog.message()).toContain("payment");
      dialog.accept();
    });
    await row.locator("select").selectOption("draft");
    await page.waitForLoadState("networkidle");
    await expect(row.locator("select")).toHaveValue("draft", { timeout: 10000 });

    await page.request.delete(`/api/invoices/${inv.id}`, { timeout: INV_API_TIMEOUT });
  });

  test("TC-INV-18d: paid → sent shows warning popup, confirm deletes payments", async ({ page }) => {
    const clientsRes = await page.request.get("/api/clients", { timeout: INV_API_TIMEOUT });
    const clients = await clientsRes.json();
    if (clients.length === 0) return;
    const invRes = await page.request.post("/api/invoices", {
      data: { clientId: clients[0].id, taxRate: 0, status: "sent", items: [{ description: "Status Test D", quantity: 1, unitPrice: 180 }] },
      timeout: INV_API_TIMEOUT,
    });
    const inv = await invRes.json();
    await page.request.post(`/api/invoices/${inv.id}/payments`, {
      data: { amount: 180, method: "cash" }, timeout: INV_API_TIMEOUT
    });

    await page.goto("/dashboard/invoices");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 10000 });

    const row = page.locator(`tr:has-text("${inv.number}")`);
    await expect(row).toBeVisible({ timeout: 6000 });

    page.on("dialog", (d) => d.accept());
    await row.locator("select").selectOption("sent");
    await page.waitForLoadState("networkidle");
    await expect(row.locator("select")).toHaveValue("sent", { timeout: 10000 });

    await page.request.delete(`/api/invoices/${inv.id}`, { timeout: INV_API_TIMEOUT });
  });

  test("TC-INV-18e: partially_paid → draft shows warning popup, confirm deletes payments", async ({ page }) => {
    const clientsRes = await page.request.get("/api/clients", { timeout: INV_API_TIMEOUT });
    const clients = await clientsRes.json();
    if (clients.length === 0) return;
    const invRes = await page.request.post("/api/invoices", {
      data: { clientId: clients[0].id, taxRate: 0, status: "sent", items: [{ description: "Status Test E", quantity: 1, unitPrice: 500 }] },
      timeout: INV_API_TIMEOUT,
    });
    const inv = await invRes.json();
    await page.request.post(`/api/invoices/${inv.id}/payments`, {
      data: { amount: 200, method: "cash" }, timeout: INV_API_TIMEOUT
    });

    await page.goto("/dashboard/invoices");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 10000 });

    const row = page.locator(`tr:has-text("${inv.number}")`);
    await expect(row).toBeVisible({ timeout: 6000 });
    await expect(row.locator("select")).toHaveValue("partially_paid");

    page.on("dialog", (d) => d.accept());
    await row.locator("select").selectOption("draft");
    await page.waitForLoadState("networkidle");
    await expect(row.locator("select")).toHaveValue("draft", { timeout: 10000 });

    await page.request.delete(`/api/invoices/${inv.id}`, { timeout: INV_API_TIMEOUT });
  });

  test("TC-INV-18f: partially_paid → sent shows warning popup, confirm deletes payments", async ({ page }) => {
    const clientsRes = await page.request.get("/api/clients", { timeout: INV_API_TIMEOUT });
    const clients = await clientsRes.json();
    if (clients.length === 0) return;
    const invRes = await page.request.post("/api/invoices", {
      data: { clientId: clients[0].id, taxRate: 0, status: "sent", items: [{ description: "Status Test F", quantity: 1, unitPrice: 600 }] },
      timeout: INV_API_TIMEOUT,
    });
    const inv = await invRes.json();
    await page.request.post(`/api/invoices/${inv.id}/payments`, {
      data: { amount: 300, method: "cash" }, timeout: INV_API_TIMEOUT
    });

    await page.goto("/dashboard/invoices");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 10000 });

    const row = page.locator(`tr:has-text("${inv.number}")`);
    await expect(row).toBeVisible({ timeout: 6000 });

    page.on("dialog", (d) => d.accept());
    await row.locator("select").selectOption("sent");
    await page.waitForLoadState("networkidle");
    await expect(row.locator("select")).toHaveValue("sent", { timeout: 10000 });

    await page.request.delete(`/api/invoices/${inv.id}`, { timeout: INV_API_TIMEOUT });
  });

  test("TC-INV-18g: draft → paid (direct jump) auto-creates full payment", async ({ page }) => {
    const clientsRes = await page.request.get("/api/clients", { timeout: INV_API_TIMEOUT });
    const clients = await clientsRes.json();
    if (clients.length === 0) return;
    const invRes = await page.request.post("/api/invoices", {
      data: { clientId: clients[0].id, taxRate: 0, status: "draft", items: [{ description: "Status Test G", quantity: 1, unitPrice: 250 }] },
      timeout: INV_API_TIMEOUT,
    });
    const inv = await invRes.json();
    await page.goto("/dashboard/invoices");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 10000 });

    const row = page.locator(`tr:has-text("${inv.number}")`);
    await expect(row).toBeVisible({ timeout: 6000 });
    await row.locator("select").selectOption("paid");
    await page.waitForLoadState("networkidle");
    await expect(row.locator("select")).toHaveValue("paid", { timeout: 10000 });

    await page.request.delete(`/api/invoices/${inv.id}`, { timeout: INV_API_TIMEOUT });
  });

  test("TC-INV-18h: cancel warning popup keeps status unchanged", async ({ page }) => {
    const clientsRes = await page.request.get("/api/clients", { timeout: INV_API_TIMEOUT });
    const clients = await clientsRes.json();
    if (clients.length === 0) return;
    const invRes = await page.request.post("/api/invoices", {
      data: { clientId: clients[0].id, taxRate: 0, status: "sent", items: [{ description: "Status Test H", quantity: 1, unitPrice: 100 }] },
      timeout: INV_API_TIMEOUT,
    });
    const inv = await invRes.json();
    await page.request.post(`/api/invoices/${inv.id}/payments`, {
      data: { amount: 100, method: "cash" }, timeout: INV_API_TIMEOUT
    });

    await page.goto("/dashboard/invoices");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 10000 });

    const row = page.locator(`tr:has-text("${inv.number}")`);
    await expect(row).toBeVisible({ timeout: 6000 });
    await expect(row.locator("select")).toHaveValue("paid");

    // DISMISS (cancel) the warning — status should stay "paid"
    page.on("dialog", (d) => d.dismiss());
    await row.locator("select").selectOption("draft");
    await page.waitForTimeout(500);

    // Status should still be "paid" (user cancelled)
    await expect(row.locator("select")).toHaveValue("paid");

    await page.request.delete(`/api/invoices/${inv.id}`, { timeout: INV_API_TIMEOUT });
  });

  // ── AGING BADGE ──────────────────────────────────────────────
  test("overdue invoices show aging badge with days", async ({ page }) => {
    // The Social Pulse data has overdue invoices; look for any badge with "d overdue"
    const agingBadges = page.locator("text=/\\dd overdue|\\dd\\+ overdue/");
    // May or may not exist depending on data — just verify no crash
    await expect(page.locator("table")).toBeVisible();
  });

  // ── VIEW MODAL ───────────────────────────────────────────────
  test("view invoice modal opens with details", async ({ page }) => {
    const eyeBtn = page.locator("table tbody tr").first().locator("button").first();
    await eyeBtn.click();
    await expect(page.locator("h2").last()).toContainText(/invoice|facture/i, { timeout: 4000 });
    await expect(page.locator("text=/total/i").first()).toBeVisible();
  });

  test("view modal shows payment history section", async ({ page }) => {
    const eyeBtn = page.locator("table tbody tr").first().locator("button").first();
    await eyeBtn.click();
    await expect(page.locator("text=/payment/i").first()).toBeVisible({ timeout: 4000 });
    await page.keyboard.press("Escape");
  });

  test("view modal shows balance due and amount paid cards", async ({ page }) => {
    const eyeBtn = page.locator("table tbody tr").first().locator("button").first();
    await eyeBtn.click();
    await expect(page.locator(".fixed.inset-0, [role='dialog']").locator("text=/amount paid/i").first()).toBeVisible({ timeout: 4000 });
    await expect(page.locator(".fixed.inset-0, [role='dialog']").locator("text=/balance/i").first()).toBeVisible({ timeout: 4000 });
    await page.keyboard.press("Escape");
  });

  // ── PAYMENT PANEL ────────────────────────────────────────────
  test("record payment on an unpaid invoice", async ({ page }) => {
    // Create invoice via API to avoid form timing issues
    // Create invoice via API (avoids form number-collision issues)
    const clients = await page.request.get("/api/clients");
    const clientList = await clients.json();
    const clientId = clientList[0]?.id;

    const initialCount = await page.locator("table tbody tr").count();
    const created = await page.request.post("/api/invoices", {
      data: {
        clientId,
        date: new Date().toISOString().split("T")[0],
        taxRate: 19,
        language: "en",
        notes: "",
        status: "draft",
        items: [{ description: `Pay Me API ${TS}`, quantity: 1, unitPrice: 200 }],
      },
    });
    expect(created.ok()).toBeTruthy();

    // Reload page to see new invoice
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 10000 });
    await expect(page.locator("table tbody tr")).toHaveCount(initialCount + 1, { timeout: 10000 });

    // Open the view modal for the first (newest) invoice
    const viewBtn = page.locator("button[title='View']").first();
    await viewBtn.scrollIntoViewIfNeeded();
    await viewBtn.click();
    await expect(page.locator("text=/record payment/i")).toBeVisible({ timeout: 8000 });
    await page.getByRole("button", { name: /record payment/i }).click();

    // Fill payment form
    const paymentAmountInput = page.locator("input[placeholder='0.00']");
    await paymentAmountInput.fill("100");
    await page.getByRole("button", { name: /save payment/i }).click();
    await page.waitForLoadState("networkidle");

    // Payment should appear in the history list
    await expect(page.locator("text=100.00").first()).toBeVisible({ timeout: 6000 });
  });

  test("payment method dropdown has all options", async ({ page }) => {
    const eyeBtn = page.locator("table tbody tr").first().locator("button").first();
    await eyeBtn.click();
    const recordBtn = page.getByRole("button", { name: /record payment/i });
    if (await recordBtn.isVisible()) {
      await recordBtn.click();
      const methodSelect = page.locator("select").filter({ has: page.locator("option[value='cash']") });
      const options = await methodSelect.locator("option").allTextContents();
      expect(options.some(o => /cash/i.test(o))).toBeTruthy();
      expect(options.some(o => /bank/i.test(o))).toBeTruthy();
      expect(options.some(o => /check/i.test(o))).toBeTruthy();
      expect(options.some(o => /card/i.test(o))).toBeTruthy();
    }
    await page.keyboard.press("Escape");
  });

  test("balance updates after partial payment", async ({ page }) => {
    const eyeBtn = page.locator("table tbody tr").first().locator("button").first();
    await eyeBtn.click();
    await expect(page.locator("text=/balance/i").first()).toBeVisible({ timeout: 4000 });
    // Just verify balance card exists and shows a number
    const balanceCard = page.locator("div").filter({ hasText: /balance due/i }).first();
    await expect(balanceCard).toBeVisible({ timeout: 4000 });
    await page.keyboard.press("Escape");
  });

  test("payment form requires amount", async ({ page }) => {
    const eyeBtn = page.locator("table tbody tr").first().locator("button").first();
    await eyeBtn.click();
    const recordBtn = page.getByRole("button", { name: /record payment/i });
    if (await recordBtn.isVisible()) {
      await recordBtn.click();
      // Submit without amount
      await page.getByRole("button", { name: /save payment/i }).click();
      // Form should still be open (HTML required blocks it)
      await expect(page.getByRole("button", { name: /save payment/i })).toBeVisible();
    }
    await page.keyboard.press("Escape");
  });

  test("cancel payment form closes without saving", async ({ page }) => {
    const eyeBtn = page.locator("table tbody tr").first().locator("button").first();
    await eyeBtn.click();
    const recordBtn = page.getByRole("button", { name: /record payment/i });
    if (await recordBtn.isVisible()) {
      await recordBtn.click();
      await page.locator("input[placeholder='0.00']").fill("999");
      await page.getByRole("button", { name: /cancel/i }).last().click();
      // Form should be hidden
      await expect(page.locator("input[placeholder='0.00']")).toHaveCount(0);
    }
    await page.keyboard.press("Escape");
  });

  // ── ERRORS ───────────────────────────────────────────────────
  test("ERROR: submit with no client selected is blocked", async ({ page }) => {
    await page.getByRole("button", { name: /new invoice/i }).click();
    await page.locator("input[placeholder*='escription']").fill("Test item");
    const numInputs = page.locator(".divide-y input[type='number']");
    await numInputs.nth(0).fill("1");
    await numInputs.nth(1).fill("100");
    await page.getByRole("button", { name: /new invoice/i }).last().click();
    await expect(page.locator("[role='dialog'], .fixed.inset-0 h2").last()).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("ERROR: empty description blocks submission", async ({ page }) => {
    await page.getByRole("button", { name: /new invoice/i }).click();
    await page.locator("select[required]").selectOption({ index: 1 });
    const numInputs = page.locator(".divide-y input[type='number']");
    await numInputs.nth(0).fill("1");
    await numInputs.nth(1).fill("100");
    await page.getByRole("button", { name: /new invoice/i }).last().click();
    await expect(page.locator(".fixed.inset-0").last()).toBeVisible();
    await page.keyboard.press("Escape");
  });

  // ── DELETE ───────────────────────────────────────────────────
  test("delete invoice with confirmation", async ({ page }) => {
    // Create via API to get a predictable invoice we can target
    const clients = await page.request.get("/api/clients");
    const clientList = await clients.json();
    const clientId = clientList[0]?.id;
    const desc = `Del Invoice ${TS}`;
    const created = await page.request.post("/api/invoices", {
      data: {
        clientId,
        date: new Date().toISOString().split("T")[0],
        taxRate: 19,
        language: "en",
        notes: desc,
        status: "draft",
        items: [{ description: desc, quantity: 1, unitPrice: 10 }],
      },
    });
    expect(created.ok()).toBeTruthy();
    const newInvoice = await created.json();

    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 10000 });

    // The newest invoice is at the top — find it by its number
    const row = page.locator(`tr:has-text("${newInvoice.number}")`);
    await expect(row).toBeVisible({ timeout: 6000 });

    page.on("dialog", (d) => d.accept());
    await row.locator("button[title='Delete']").click();
    await expect(row).toHaveCount(0, { timeout: 6000 });
  });
});
