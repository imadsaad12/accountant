import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

function calcDays(start: Date, end: Date): number {
  return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}
function calcMonths(start: Date, end: Date): number {
  const sy = start.getUTCFullYear(), sm = start.getUTCMonth(), sd = start.getUTCDate();
  const ey = end.getUTCFullYear(),   em = end.getUTCMonth(),   ed = end.getUTCDate();
  if (sy === ey && sm === em) {
    const dim = new Date(Date.UTC(sy, sm + 1, 0)).getUTCDate();
    if (sd === 1 && ed === dim) return 1;
    return (ed - sd + 1) / dim;
  }
  const dimFirst = new Date(Date.UTC(sy, sm + 1, 0)).getUTCDate();
  let total = (dimFirst - sd + 1) / dimFirst;
  let y = sy, m = sm + 1;
  if (m > 11) { m = 0; y++; }
  while (y < ey || (y === ey && m < em)) { total += 1; m++; if (m > 11) { m = 0; y++; } }
  const dimLast = new Date(Date.UTC(ey, em + 1, 0)).getUTCDate();
  total += ed / dimLast;
  return parseFloat(total.toFixed(4));
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
  const now = new Date();

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  // Last 12 months window for trend chart (client slices based on selected period)
  const twelveMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));

  const [clientCount, productCount, employeeCount, invoices, allInvoiceItems, lowStockProducts, recentInvoices, allPayments, allBills, allExpenses, allEmployees, newClientsThisMonth, newInvoicesThisMonth, trendInvoices] = await Promise.all([
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
    prisma.supplierBill.aggregate({ where: { organizationId: orgId, billType: "expense" }, _sum: { amount: true } }),
    prisma.expense.findMany({ where: { organizationId: orgId }, select: { amount: true, recurrence: true, date: true } }),
    prisma.employee.findMany({
      where: { organizationId: orgId },
      select: {
        hireDate: true, salary: true, salaryPeriod: true,
        salaryAdvances: { select: { amount: true, date: true, status: true } },
      },
    }),
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

  // Total Salaries = sum of all employee salaries prorated from hire date to today
  let totalSalaries = 0;
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  for (const emp of allEmployees) {
    const hireDate = new Date(emp.hireDate);
    if (hireDate > today) continue;
    const days = calcDays(hireDate, today);
    if (days <= 0) continue;
    const rate = Number(emp.salary);
    const period = emp.salaryPeriod || "month";
    let amount = 0;
    if (period === "day") {
      amount = parseFloat((rate * days).toFixed(2));
    } else if (period === "week") {
      amount = parseFloat((rate * (days / 7)).toFixed(2));
    } else {
      amount = parseFloat((rate * calcMonths(hireDate, today)).toFixed(2));
    }
    // Deduct advances (same logic as expenses page)
    let totalDeduction = 0;
    for (const adv of emp.salaryAdvances) {
      const advDate = new Date(adv.date);
      let periodEnd: Date;
      if (period === "month") {
        periodEnd = new Date(Date.UTC(advDate.getUTCFullYear(), advDate.getUTCMonth() + 1, 0, 23, 59, 59, 999));
      } else if (period === "week") {
        const satDate = advDate.getUTCDate() + (6 - advDate.getUTCDay());
        periodEnd = new Date(Date.UTC(advDate.getUTCFullYear(), advDate.getUTCMonth(), satDate, 23, 59, 59, 999));
      } else {
        periodEnd = new Date(Date.UTC(advDate.getUTCFullYear(), advDate.getUTCMonth(), advDate.getUTCDate(), 23, 59, 59, 999));
      }
      const remainingDays = calcDays(advDate, periodEnd);
      if (remainingDays <= 0) continue;
      totalDeduction += (Number(adv.amount) / remainingDays) * calcDays(advDate, periodEnd);
    }
    totalSalaries += Math.max(0, amount - parseFloat(totalDeduction.toFixed(2)));
  }

  // Net = Gross - COGS - Total Tax - Total Supplier Bills - Total Expenses - Total Salaries
  const netEarning = grossEarning - cogs - totalTax - totalSupplierBills - totalExpenses - totalSalaries;

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

  // Daily trend for current month (used when "1 month" is selected)
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const dayMap: Record<string, number> = {};
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    dayMap[key] = 0;
  }
  for (const inv of trendInvoices) {
    const d = new Date(inv.date);
    if (d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth()) {
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      if (key in dayMap) dayMap[key] += inv.total;
    }
  }
  const revenueTrendDaily = Object.entries(dayMap).map(([key, revenue]) => {
    const day = parseInt(key.split("-")[2]);
    return { month: `${day}`, revenue: parseFloat(revenue.toFixed(2)) };
  });

  return NextResponse.json({
    clientCount,
    productCount,
    employeeCount,
    invoiceCount: invoices.length,
    totalRevenue: grossEarning,
    grossEarning,
    netEarning,
    pendingAmount,
    totalSalaries: parseFloat(totalSalaries.toFixed(2)),
    lowStockProducts: lowStock,
    recentInvoices,
    newClientsThisMonth,
    newInvoicesThisMonth,
    revenueTrend,
    revenueTrendDaily,
  });
}
