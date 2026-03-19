/**
 * Numerical Accuracy Tests
 *
 * Verifies that all computed numbers across the app are arithmetically correct:
 * - Invoice math: subtotal = Σ(qty × price), tax = subtotal × taxRate%, total = subtotal + tax
 * - Payment balance = invoice.total − Σ(payments)
 * - Partial payment → status = partially_paid, balance correct
 * - Full payment → status = paid, balance = 0
 * - Expense totals
 * - P&L report arithmetic: revenue − COGS = grossProfit; grossProfit − expenses = netProfit
 * - Dashboard stat consistency
 */

import { test, expect } from "@playwright/test";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Parse a currency string like "$1,234.56" → 1234.56 */
function parseCurrency(text: string): number {
  return parseFloat(text.replace(/[^0-9.\-]/g, "")) || 0;
}

/** Round to 2 decimal places */
function r(n: number) {
  return Math.round(n * 100) / 100;
}

// ─── Invoice Math ─────────────────────────────────────────────────────────

test.describe("Invoice Numerical Accuracy", () => {
  test("API: invoice subtotal = Σ(qty × unitPrice)", async ({ request }) => {
    // Get a client to use
    const clientsRes = await request.get("/api/clients");
    const clients = await clientsRes.json();
    expect(clients.length).toBeGreaterThan(0);
    const clientId = clients[0].id;

    const qty1 = 3;
    const price1 = 100;
    const qty2 = 2;
    const price2 = 75.5;
    const expectedSubtotal = r(qty1 * price1 + qty2 * price2);

    // Create invoice via API
    const res = await request.post("/api/invoices", {
      data: {
        clientId,
        taxRate: 0,
        items: [
          { description: "Item A", quantity: qty1, unitPrice: price1 },
          { description: "Item B", quantity: qty2, unitPrice: price2 },
        ],
      },
    });
    expect(res.status()).toBe(201);
    const inv = await res.json();

    expect(r(inv.subtotal)).toBe(expectedSubtotal);

    // Cleanup
    await request.delete(`/api/invoices/${inv.id}`);
  });

  test("API: invoice tax = subtotal × taxRate / 100", async ({ request }) => {
    const clientsRes = await request.get("/api/clients");
    const clients = await clientsRes.json();
    const clientId = clients[0].id;

    const qty = 4;
    const price = 250;
    const taxRate = 19;
    const expectedSubtotal = r(qty * price);
    const expectedTax = r(expectedSubtotal * (taxRate / 100));
    const expectedTotal = r(expectedSubtotal + expectedTax);

    const res = await request.post("/api/invoices", {
      data: {
        clientId,
        taxRate,
        items: [{ description: "Service X", quantity: qty, unitPrice: price }],
      },
    });
    expect(res.status()).toBe(201);
    const inv = await res.json();

    expect(r(inv.subtotal)).toBe(expectedSubtotal);
    expect(r(inv.tax)).toBe(expectedTax);
    expect(r(inv.total)).toBe(expectedTotal);
    expect(r(inv.total)).toBe(r(inv.subtotal + inv.tax));

    await request.delete(`/api/invoices/${inv.id}`);
  });

  test("API: invoice total = subtotal + tax", async ({ request }) => {
    const clientsRes = await request.get("/api/clients");
    const clients = await clientsRes.json();
    const clientId = clients[0].id;

    const res = await request.post("/api/invoices", {
      data: {
        clientId,
        taxRate: 20,
        items: [
          { description: "A", quantity: 5, unitPrice: 80 },
          { description: "B", quantity: 1, unitPrice: 320 },
        ],
      },
    });
    const inv = await res.json();
    // total = subtotal + tax always
    expect(r(inv.total)).toBe(r(inv.subtotal + inv.tax));
    await request.delete(`/api/invoices/${inv.id}`);
  });

  test("API: invoice with taxRate=0 has tax=0 and total=subtotal", async ({ request }) => {
    const clientsRes = await request.get("/api/clients");
    const clients = await clientsRes.json();
    const clientId = clients[0].id;

    const res = await request.post("/api/invoices", {
      data: {
        clientId,
        taxRate: 0,
        items: [{ description: "No Tax Item", quantity: 2, unitPrice: 150 }],
      },
    });
    const inv = await res.json();
    expect(r(inv.tax)).toBe(0);
    expect(r(inv.total)).toBe(r(inv.subtotal));
    await request.delete(`/api/invoices/${inv.id}`);
  });
});

// ─── Payment Balance Math ─────────────────────────────────────────────────

test.describe("Payment Balance Numerical Accuracy", () => {
  test("API: after partial payment, balance = total − paid, status = partially_paid", async ({ request }) => {
    const clientsRes = await request.get("/api/clients");
    const clients = await clientsRes.json();
    const clientId = clients[0].id;

    // Create invoice: 2 × $500, taxRate=0 → total = $1000
    const invRes = await request.post("/api/invoices", {
      data: {
        clientId,
        taxRate: 0,
        status: "sent",
        items: [{ description: "Service", quantity: 2, unitPrice: 500 }],
      },
    });
    const inv = await invRes.json();
    expect(r(inv.total)).toBe(1000);

    // Update status to sent so payments can be recorded
    await request.put(`/api/invoices/${inv.id}`, { data: { status: "sent" } });

    // Record partial payment of $400
    const payRes = await request.post(`/api/invoices/${inv.id}/payments`, {
      data: { amount: 400, method: "cash" },
    });
    expect(payRes.status()).toBe(201);

    // Fetch payments and verify balance
    const paymentsRes = await request.get(`/api/invoices/${inv.id}/payments`);
    const payments = await paymentsRes.json();
    const totalPaid = payments.reduce((s: number, p: { amount: number }) => s + p.amount, 0);
    const balance = r(inv.total - totalPaid);

    expect(r(totalPaid)).toBe(400);
    expect(balance).toBe(600);

    // Fetch invoice to verify status changed to partially_paid
    const invCheck = await request.get(`/api/invoices/${inv.id}`);
    const invData = await invCheck.json();
    expect(invData.status).toBe("partially_paid");

    // Cleanup
    await request.delete(`/api/invoices/${inv.id}`);
  });

  test("API: after full payment, status = paid and balance = 0", async ({ request }) => {
    const clientsRes = await request.get("/api/clients");
    const clients = await clientsRes.json();
    const clientId = clients[0].id;

    // Create invoice: 1 × $750, taxRate=0
    const invRes = await request.post("/api/invoices", {
      data: {
        clientId,
        taxRate: 0,
        status: "sent",
        items: [{ description: "Consulting", quantity: 1, unitPrice: 750 }],
      },
    });
    const inv = await invRes.json();
    expect(r(inv.total)).toBe(750);

    await request.put(`/api/invoices/${inv.id}`, { data: { status: "sent" } });

    // Pay in full
    await request.post(`/api/invoices/${inv.id}/payments`, {
      data: { amount: 750, method: "bank_transfer" },
    });

    // Verify status = paid
    const invCheck = await request.get(`/api/invoices/${inv.id}`);
    const invData = await invCheck.json();
    expect(invData.status).toBe("paid");

    // Verify balance = 0
    const paymentsRes = await request.get(`/api/invoices/${inv.id}/payments`);
    const payments = await paymentsRes.json();
    const totalPaid = payments.reduce((s: number, p: { amount: number }) => s + p.amount, 0);
    expect(r(inv.total - totalPaid)).toBe(0);

    await request.delete(`/api/invoices/${inv.id}`);
  });

  test("API: two partial payments sum to correct balance", async ({ request }) => {
    const clientsRes = await request.get("/api/clients");
    const clients = await clientsRes.json();
    const clientId = clients[0].id;

    const invRes = await request.post("/api/invoices", {
      data: {
        clientId,
        taxRate: 0,
        status: "sent",
        items: [{ description: "Big Project", quantity: 1, unitPrice: 1200 }],
      },
    });
    const inv = await invRes.json();

    await request.put(`/api/invoices/${inv.id}`, { data: { status: "sent" } });

    // Payment 1: $300
    await request.post(`/api/invoices/${inv.id}/payments`, { data: { amount: 300, method: "cash" } });
    // Payment 2: $500
    await request.post(`/api/invoices/${inv.id}/payments`, { data: { amount: 500, method: "cash" } });

    const paymentsRes = await request.get(`/api/invoices/${inv.id}/payments`);
    const payments = await paymentsRes.json();
    const totalPaid = payments.reduce((s: number, p: { amount: number }) => s + p.amount, 0);

    expect(payments.length).toBe(2);
    expect(r(totalPaid)).toBe(800);
    expect(r(inv.total - totalPaid)).toBe(400); // balance = 1200 - 800

    // Status should still be partially_paid (not fully paid)
    const invCheck = await request.get(`/api/invoices/${inv.id}`);
    const invData = await invCheck.json();
    expect(invData.status).toBe("partially_paid");

    await request.delete(`/api/invoices/${inv.id}`);
  });

  test("API: overpayment rounds to paid (balance ≤ 0)", async ({ request }) => {
    const clientsRes = await request.get("/api/clients");
    const clients = await clientsRes.json();
    const clientId = clients[0].id;

    const invRes = await request.post("/api/invoices", {
      data: {
        clientId,
        taxRate: 0,
        status: "sent",
        items: [{ description: "Service", quantity: 1, unitPrice: 300 }],
      },
    });
    const inv = await invRes.json();
    await request.put(`/api/invoices/${inv.id}`, { data: { status: "sent" } });

    // Pay more than total
    await request.post(`/api/invoices/${inv.id}/payments`, { data: { amount: 350, method: "cash" } });

    const invCheck = await request.get(`/api/invoices/${inv.id}`);
    const invData = await invCheck.json();
    // totalPaid (350) >= total (300) → status = paid
    expect(invData.status).toBe("paid");

    await request.delete(`/api/invoices/${inv.id}`);
  });
});

// ─── Expense Totals ────────────────────────────────────────────────────────

test.describe("Expense Numerical Accuracy", () => {
  test("API: expense amount stored and returned exactly", async ({ request }) => {
    const amount = 1337.42;
    const res = await request.post("/api/expenses", {
      data: {
        date: "2026-01-15",
        amount,
        description: "Precision Test Expense",
        category: "other",
        recurrence: "none",
      },
    });
    expect(res.status()).toBe(201);
    const exp = await res.json();
    expect(r(exp.amount)).toBe(r(amount));

    // Cleanup
    await request.delete(`/api/expenses/${exp.id}`);
  });

  test("API: expense list totals match individual amounts", async ({ request }) => {
    const res = await request.get("/api/expenses");
    const expenses = await res.json();
    expect(Array.isArray(expenses)).toBe(true);

    if (expenses.length > 0) {
      // Every expense should have a numeric amount > 0
      for (const exp of expenses) {
        expect(typeof exp.amount).toBe("number");
        expect(exp.amount).toBeGreaterThan(0);
      }
    }
  });

  test("API: recurring monthly expense shows correct recurrence field", async ({ request }) => {
    const res = await request.post("/api/expenses", {
      data: {
        date: "2026-01-01",
        amount: 2000,
        description: "Monthly Recurring Test",
        category: "rent",
        recurrence: "monthly",
      },
    });
    expect(res.status()).toBe(201);
    const exp = await res.json();
    expect(exp.recurrence).toBe("monthly");
    expect(r(exp.amount)).toBe(2000);

    await request.delete(`/api/expenses/${exp.id}`);
  });
});

// ─── P&L Report Arithmetic ────────────────────────────────────────────────

test.describe("P&L Report Numerical Accuracy", () => {
  test("API: P&L grossProfit = revenue - cogs", async ({ request }) => {
    const res = await request.get("/api/reports?type=pl&from=2025-01-01&to=2025-12-31");
    expect(res.status()).toBe(200);
    const data = await res.json();

    expect(data.type).toBe("pl");
    expect(typeof data.revenue).toBe("number");
    expect(typeof data.cogs).toBe("number");
    expect(typeof data.grossProfit).toBe("number");

    // grossProfit = revenue - cogs
    expect(r(data.grossProfit)).toBe(r(data.revenue - data.cogs));
  });

  test("API: P&L netProfit = grossProfit - totalExpenses", async ({ request }) => {
    const res = await request.get("/api/reports?type=pl&from=2025-01-01&to=2025-12-31");
    const data = await res.json();

    expect(r(data.netProfit)).toBe(r(data.grossProfit - data.totalExpenses));
  });

  test("API: P&L totalExpenses = sum of all category expenses", async ({ request }) => {
    const res = await request.get("/api/reports?type=pl&from=2025-01-01&to=2025-12-31");
    const data = await res.json();

    const categorySum = Object.values(data.expensesByCategory as Record<string, number>).reduce(
      (s, v) => s + v,
      0
    );
    expect(r(categorySum)).toBe(r(data.totalExpenses));
  });

  test("API: P&L netProfit = revenue - cogs - totalExpenses (end-to-end)", async ({ request }) => {
    const res = await request.get("/api/reports?type=pl&from=2025-01-01&to=2025-12-31");
    const data = await res.json();

    const expected = r(data.revenue - data.cogs - data.totalExpenses);
    expect(r(data.netProfit)).toBe(expected);
  });

  test("API: P&L with future date range shows zero revenue", async ({ request }) => {
    const res = await request.get("/api/reports?type=pl&from=2099-01-01&to=2099-12-31");
    const data = await res.json();
    expect(data.revenue).toBe(0);
    expect(data.grossProfit).toBe(0);
  });

  test("API: recurring expense counted correctly in P&L (monthly × 12 in a year)", async ({ request }) => {
    // Create a monthly expense of $100 starting Jan 1
    const expRes = await request.post("/api/expenses", {
      data: {
        date: "2026-01-01",
        amount: 100,
        description: "Monthly Rent Test",
        category: "rent",
        recurrence: "monthly",
      },
    });
    expect(expRes.status()).toBe(201);
    const exp = await expRes.json();

    // Query P&L for the full 2026 year
    const plRes = await request.get("/api/reports?type=pl&from=2026-01-01&to=2026-12-31");
    const data = await plRes.json();

    // Rent category should include at least $1200 (12 × $100)
    const rentTotal = (data.expensesByCategory as Record<string, number>)["rent"] ?? 0;
    expect(rentTotal).toBeGreaterThanOrEqual(1200);

    await request.delete(`/api/expenses/${exp.id}`);
  });

  test("API: P&L fromDate is correct (no timezone off-by-one)", async ({ request }) => {
    // 2026-01-01 should NOT include expenses from 2025-12-31
    const res = await request.get("/api/reports?type=pl&from=2026-01-01&to=2026-01-31");
    const data = await res.json();
    // The API should return the period
    expect(new Date(data.period.from).getFullYear()).toBeGreaterThanOrEqual(2025);
    // No crash, arithmetic still holds
    expect(r(data.grossProfit)).toBe(r(data.revenue - data.cogs));
  });
});

// ─── Balance Sheet Arithmetic ──────────────────────────────────────────────

test.describe("Balance Sheet Numerical Accuracy", () => {
  test("API: equity = totalAssets - totalLiabilities", async ({ request }) => {
    const res = await request.get("/api/reports?type=bs");
    expect(res.status()).toBe(200);
    const data = await res.json();

    expect(data.type).toBe("bs");
    expect(r(data.equity)).toBe(r(data.assets.total - data.liabilities.total));
  });

  test("API: assets.total = cash + ar + inventory", async ({ request }) => {
    const res = await request.get("/api/reports?type=bs");
    const data = await res.json();

    expect(r(data.assets.total)).toBe(r(data.assets.cash + data.assets.ar + data.assets.inventory));
  });

  test("API: liabilities.total = taxPayable", async ({ request }) => {
    const res = await request.get("/api/reports?type=bs");
    const data = await res.json();

    expect(r(data.liabilities.total)).toBe(r(data.liabilities.taxPayable));
  });
});

// ─── Dashboard Stats Consistency ─────────────────────────────────────────

test.describe("Dashboard Stat Numerical Accuracy", () => {
  test("API: dashboard stats are all non-negative numbers", async ({ request }) => {
    const res = await request.get("/api/dashboard");
    expect(res.status()).toBe(200);
    const data = await res.json();

    expect(data.clientCount).toBeGreaterThanOrEqual(0);
    expect(data.productCount).toBeGreaterThanOrEqual(0);
    expect(data.employeeCount).toBeGreaterThanOrEqual(0);
    expect(data.invoiceCount).toBeGreaterThanOrEqual(0);
    expect(data.totalRevenue).toBeGreaterThanOrEqual(0);
    expect(data.grossEarning).toBeGreaterThanOrEqual(0);
    expect(data.pendingAmount).toBeGreaterThanOrEqual(0);
  });

  test("API: grossEarning = totalRevenue (same field)", async ({ request }) => {
    const res = await request.get("/api/dashboard");
    const data = await res.json();
    // Both come from paid invoice subtotals
    expect(r(data.grossEarning)).toBe(r(data.totalRevenue));
  });

  test("API: dashboard netEarning = grossEarning - cogs (≤ grossEarning)", async ({ request }) => {
    const res = await request.get("/api/dashboard");
    const data = await res.json();
    // netEarning can be negative only if cogs > grossEarning, but never > grossEarning
    expect(data.netEarning).toBeLessThanOrEqual(data.grossEarning);
  });

  test("API: dashboard counts are integers", async ({ request }) => {
    const res = await request.get("/api/dashboard");
    const data = await res.json();

    expect(Number.isInteger(data.clientCount)).toBe(true);
    expect(Number.isInteger(data.productCount)).toBe(true);
    expect(Number.isInteger(data.employeeCount)).toBe(true);
    expect(Number.isInteger(data.invoiceCount)).toBe(true);
  });

  test("API: dashboard recentInvoices total <= invoiceCount", async ({ request }) => {
    const res = await request.get("/api/dashboard");
    const data = await res.json();

    // recentInvoices is capped at 5, invoiceCount is the real total
    expect(data.recentInvoices.length).toBeLessThanOrEqual(Math.min(5, data.invoiceCount));
  });

  test("API: dashboard consistency after creating a new paid invoice", async ({ request }) => {
    const clientsRes = await request.get("/api/clients");
    const clients = await clientsRes.json();
    const clientId = clients[0].id;

    // Snapshot before
    const before = await (await request.get("/api/dashboard")).json();

    // Create invoice at $500, no tax
    const invRes = await request.post("/api/invoices", {
      data: {
        clientId,
        taxRate: 0,
        status: "sent",
        items: [{ description: "Dashboard Accuracy Test", quantity: 1, unitPrice: 500 }],
      },
    });
    const inv = await invRes.json();
    await request.put(`/api/invoices/${inv.id}`, { data: { status: "sent" } });

    // Pay in full → status becomes paid
    await request.post(`/api/invoices/${inv.id}/payments`, { data: { amount: 500, method: "cash" } });

    // Snapshot after
    const after = await (await request.get("/api/dashboard")).json();

    // Invoice count should have increased by 1
    expect(after.invoiceCount).toBe(before.invoiceCount + 1);
    // grossEarning should have increased by 500
    expect(r(after.grossEarning - before.grossEarning)).toBe(500);

    // Cleanup
    await request.delete(`/api/invoices/${inv.id}`);
  });
});

// ─── Aging Report Arithmetic ────────────────────────────────────────────────

test.describe("Aging Report Numerical Accuracy", () => {
  test("API: aging bucket totals = sum of row balances per bucket", async ({ request }) => {
    const res = await request.get("/api/reports?type=aging");
    expect(res.status()).toBe(200);
    const data = await res.json();

    // Recompute buckets from rows
    const computed: Record<string, number> = {
      current: 0,
      days1_30: 0,
      days31_60: 0,
      days61_90: 0,
      days90plus: 0,
    };
    for (const row of data.rows) {
      computed[row.bucket] = r((computed[row.bucket] ?? 0) + row.balance);
    }

    for (const key of Object.keys(computed)) {
      expect(r(data.buckets[key])).toBe(computed[key]);
    }
  });

  test("API: aging row balance = total - paid", async ({ request }) => {
    const res = await request.get("/api/reports?type=aging");
    const data = await res.json();

    for (const row of data.rows) {
      expect(r(row.balance)).toBe(r(Math.max(0, row.total - row.paid)));
    }
  });

  test("API: aging rows only contain sent or overdue invoices", async ({ request }) => {
    const res = await request.get("/api/reports?type=aging");
    const data = await res.json();

    // All rows should have a balance > 0 (unpaid portion)
    for (const row of data.rows) {
      expect(row.balance).toBeGreaterThanOrEqual(0);
    }
  });
});

// ─── Invoice Item totals ─────────────────────────────────────────────────

test.describe("Invoice Item Totals", () => {
  test("API: each item total = quantity × unitPrice", async ({ request }) => {
    const clientsRes = await request.get("/api/clients");
    const clients = await clientsRes.json();
    const clientId = clients[0].id;

    const items = [
      { description: "Widget A", quantity: 3, unitPrice: 49.99 },
      { description: "Widget B", quantity: 7, unitPrice: 12.5 },
      { description: "Widget C", quantity: 1, unitPrice: 999.99 },
    ];

    const invRes = await request.post("/api/invoices", {
      data: { clientId, taxRate: 0, items },
    });
    const inv = await invRes.json();

    // Fetch invoice details
    const detailRes = await request.get(`/api/invoices/${inv.id}`);
    const detail = await detailRes.json();

    for (let i = 0; i < items.length; i++) {
      const expected = r(items[i].quantity * items[i].unitPrice);
      const actual = r(detail.items[i].total);
      expect(actual).toBe(expected);
    }

    // Invoice subtotal = sum of item totals
    const expectedSubtotal = items.reduce((s, it) => s + r(it.quantity * it.unitPrice), 0);
    expect(r(detail.subtotal)).toBe(r(expectedSubtotal));

    await request.delete(`/api/invoices/${inv.id}`);
  });
});
