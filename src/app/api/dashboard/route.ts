import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { cacheGet, cacheSet } from "@/lib/server-cache";

function calcDays(start: Date, end: Date): number {
  return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}
function calcMonths(start: Date, end: Date): number {
  const startDay = start.getUTCDate();
  const endDay = end.getUTCDate();
  const lastDayOfEndMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  if (startDay === 1 && endDay === lastDayOfEndMonth) {
    return (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth()) + 1;
  }
  return parseFloat((calcDays(start, end) / 30).toFixed(2));
}
function computeRecurring(rate: number, recurrence: string, expStart: Date, now: Date): number {
  const days = calcDays(expStart, now);
  if (days <= 0) return 0;
  if (recurrence === "weekly")    return parseFloat((rate * (days / 7)).toFixed(2));
  if (recurrence === "monthly")   return parseFloat((rate * calcMonths(expStart, now)).toFixed(2));
  if (recurrence === "quarterly") return parseFloat((rate * (calcMonths(expStart, now) / 3)).toFixed(2));
  if (recurrence === "yearly")    return parseFloat((rate * (days / 365)).toFixed(2));
  return 0;
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = session.organizationId;

  const cached = cacheGet<ReturnType<typeof NextResponse.json>>(orgId + ":dashboard");
  if (cached) return NextResponse.json(cached);

  const now = new Date();

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  // Last 12 months window for trend chart (client slices based on selected period)
  const twelveMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));

  const [clientCount, productCount, employeeCount, invoices, allInvoiceItems, lowStockProducts, recentInvoices, allPayments, allBills, allExpenses, newClientsThisMonth, newInvoicesThisMonth, trendInvoices] = await Promise.all([
    prisma.client.count({ where: { organizationId: orgId } }),
    prisma.product.count({ where: { organizationId: orgId } }),
    prisma.employee.count({ where: { organizationId: orgId } }),
    prisma.invoice.findMany({ where: { organizationId: orgId }, select: { total: true, tax: true, status: true, id: true } }),
    prisma.invoiceItem.findMany({
      where: { invoice: { organizationId: orgId } },
      select: { quantity: true, unitCost: true },
    }),
    prisma.product.findMany({
      where: { organizationId: orgId },
      select: {
        id: true, name: true, quantity: true, minStock: true, type: true,
        components: {
          select: { quantity: true, component: { select: { quantity: true } } },
        },
      },
    }),
    prisma.invoice.findMany({ where: { organizationId: orgId }, take: 5, orderBy: { createdAt: "desc" }, include: { client: true } }),
    prisma.payment.findMany({ where: { organizationId: orgId }, select: { invoiceId: true, amount: true } }),
    prisma.supplierBill.aggregate({ where: { organizationId: orgId }, _sum: { amount: true } }),
    prisma.expense.findMany({ where: { organizationId: orgId }, select: { amount: true, recurrence: true, date: true } }),
    prisma.client.count({ where: { organizationId: orgId, createdAt: { gte: monthStart } } }),
    prisma.invoice.count({ where: { organizationId: orgId, createdAt: { gte: monthStart } } }),
    // All invoices in last 12 months for trend chart
    prisma.invoice.findMany({
      where: { organizationId: orgId, date: { gte: twelveMonthsAgo } },
      select: { total: true, date: true },
      orderBy: { date: "asc" },
    }),
  ]);

  // Filter low stock — compute effective quantity for composite products
  const lowStock = lowStockProducts
    .map(p => {
      const effectiveQty = p.type === "composite" && p.components.length > 0
        ? Math.floor(Math.min(...p.components.map(c => c.component.quantity / c.quantity)))
        : p.quantity;
      return { id: p.id, name: p.name, quantity: effectiveQty, minStock: p.minStock };
    })
    .filter(p => p.quantity <= (p.minStock ?? 0));

  // Build payments map (for pending calculation)
  const paymentsByInvoice: Record<string, number> = {};
  for (const p of allPayments) {
    paymentsByInvoice[p.invoiceId] = (paymentsByInvoice[p.invoiceId] ?? 0) + p.amount;
  }

  // Gross = sum of ALL invoice totals regardless of status
  const grossEarning = invoices.reduce((sum, i) => sum + i.total, 0);

  // Pending = remaining balance on unpaid/partially-paid invoices
  const pendingAmount = invoices
    .filter(i => i.status !== "paid")
    .reduce((sum, i) => sum + Math.max(0, i.total - (paymentsByInvoice[i.id] ?? 0)), 0);

  // COGS = sum of (unitCost × quantity) for ALL invoice items
  const cogs = allInvoiceItems.reduce((sum, item) => sum + (item.unitCost ?? 0) * item.quantity, 0);

  // Total Tax = sum of tax field across all invoices
  const totalTax = invoices.reduce((sum, i) => sum + (i.tax ?? 0), 0);

  // Total Supplier Bills = all bills (any status) — separate table from expenses, no overlap
  const totalSupplierBills = allBills._sum.amount ?? 0;

  // Total Expenses = one-time (stored amount) + recurring (prorated from start to today)
  // Note: expenses table does NOT include supplier bills or salaries — no double-counting
  let totalExpenses = 0;
  for (const exp of allExpenses) {
    const recurrence = exp.recurrence || "none";
    if (recurrence === "none") {
      totalExpenses += exp.amount;
    } else {
      const expStart = new Date(exp.date);
      if (expStart <= now) totalExpenses += computeRecurring(exp.amount, recurrence, expStart, now);
    }
  }

  // Net = Gross - COGS - Total Tax - Total Supplier Bills - Total Expenses
  const netEarning = grossEarning - cogs - totalTax - totalSupplierBills - totalExpenses;

  // Revenue Trend: group trendInvoices by month (last 12 months), filling empty months with 0
  const monthMap: Record<string, number> = {};
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    monthMap[key] = 0;
  }
  for (const inv of trendInvoices) {
    const d = new Date(inv.date);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    if (key in monthMap) monthMap[key] += inv.total;
  }
  const revenueTrend = Object.entries(monthMap).map(([key, revenue]) => {
    const [y, m] = key.split("-");
    const label = new Date(Date.UTC(Number(y), Number(m) - 1, 1))
      .toLocaleString("en", { month: "short", year: "2-digit" });
    return { month: label, revenue: parseFloat(revenue.toFixed(2)) };
  });

  const payload = {
    clientCount,
    productCount,
    employeeCount,
    invoiceCount: invoices.length,
    totalRevenue: grossEarning,
    grossEarning,
    netEarning,
    pendingAmount,
    lowStockProducts: lowStock,
    recentInvoices,
    newClientsThisMonth,
    newInvoicesThisMonth,
    revenueTrend,
  };

  cacheSet(orgId + ":dashboard", payload, 60_000);
  return NextResponse.json(payload);
}
