import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

function calcDays(start: Date, end: Date): number {
  return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

function calcMonths(start: Date, end: Date): number {
  const startDay = start.getUTCDate();
  const endDay   = end.getUTCDate();
  const lastDayOfEndMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  if (startDay === 1 && endDay === lastDayOfEndMonth) {
    return (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth()) + 1;
  }
  return parseFloat((calcDays(start, end) / 30).toFixed(2));
}

function computeRecurringAmount(rate: number, recurrence: string, expStart: Date, toDate: Date): number {
  const days = calcDays(expStart, toDate);
  if (days <= 0) return 0;
  if (recurrence === "weekly")    return parseFloat((rate * (days / 7)).toFixed(2));
  if (recurrence === "monthly")   return parseFloat((rate * calcMonths(expStart, toDate)).toFixed(2));
  if (recurrence === "quarterly") return parseFloat((rate * (calcMonths(expStart, toDate) / 3)).toFixed(2));
  if (recurrence === "yearly") {
    const sm = expStart.getUTCMonth(), sd = expStart.getUTCDate();
    const em = toDate.getUTCMonth(), ed = toDate.getUTCDate();
    const lastDay = new Date(Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth() + 1, 0)).getUTCDate();
    const years = (sm === 0 && sd === 1 && em === 11 && ed === lastDay)
      ? toDate.getUTCFullYear() - expStart.getUTCFullYear() + 1
      : parseFloat((days / 365).toFixed(2));
    return parseFloat((rate * years).toFixed(2));
  }
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

  const [clientCount, productCount, employeeCount, invoices, paidInvoiceItems, lowStockProducts, recentInvoices, allPayments, allExpenses, employees, paidBills, newClientsThisMonth, newInvoicesThisMonth] = await Promise.all([
    prisma.client.count({ where: { organizationId: orgId } }),
    prisma.product.count({ where: { organizationId: orgId } }),
    prisma.employee.count({ where: { organizationId: orgId } }),
    prisma.invoice.findMany({ where: { organizationId: orgId }, select: { total: true, status: true, id: true } }),
    prisma.invoiceItem.findMany({
      where: { invoice: { organizationId: orgId, status: { in: ["paid", "partially_paid"] } } },
      select: { quantity: true, unitCost: true, invoiceId: true },
    }),
    prisma.product.findMany({ where: { organizationId: orgId }, select: { id: true, name: true, quantity: true, minStock: true } }),
    prisma.invoice.findMany({ where: { organizationId: orgId }, take: 5, orderBy: { createdAt: "desc" }, include: { client: true } }),
    prisma.payment.findMany({ where: { organizationId: orgId }, select: { invoiceId: true, amount: true } }),
    prisma.expense.findMany({ where: { organizationId: orgId }, select: { amount: true, recurrence: true, date: true } }),
    prisma.employee.findMany({ where: { organizationId: orgId }, select: { salary: true, salaryPeriod: true, hireDate: true } }),
    prisma.supplierBill.aggregate({ where: { organizationId: orgId, status: "paid" }, _sum: { amount: true } }),
    prisma.client.count({ where: { organizationId: orgId, createdAt: { gte: monthStart } } }),
    prisma.invoice.count({ where: { organizationId: orgId, createdAt: { gte: monthStart } } }),
  ]);

  // Filter low stock
  const lowStock = lowStockProducts.filter(p => p.quantity <= (p.minStock ?? 0));

  // Build payments map
  const paymentsByInvoice: Record<string, number> = {};
  for (const p of allPayments) {
    paymentsByInvoice[p.invoiceId] = (paymentsByInvoice[p.invoiceId] ?? 0) + p.amount;
  }

  // Gross = cash actually received
  const grossEarning =
    invoices.filter(i => i.status === "paid").reduce((sum, i) => sum + i.total, 0) +
    invoices.filter(i => i.status === "partially_paid").reduce((sum, i) => sum + (paymentsByInvoice[i.id] ?? 0), 0);

  // Pending = remaining balance on open invoices
  const pendingAmount = invoices
    .filter(i => i.status === "sent" || i.status === "overdue" || i.status === "partially_paid")
    .reduce((sum, i) => sum + Math.max(0, i.total - (paymentsByInvoice[i.id] ?? 0)), 0);

  // COGS: use unitCost snapshot, prorated by paid fraction
  const invoiceTotals: Record<string, number> = {};
  for (const inv of invoices) invoiceTotals[inv.id] = inv.total;

  const cogs = paidInvoiceItems.reduce((sum, item) => {
    if (!item.unitCost || item.unitCost === 0) return sum;
    const total = invoiceTotals[item.invoiceId] ?? 0;
    const paid = paymentsByInvoice[item.invoiceId] ?? 0;
    const paidRatio = total > 0 ? Math.min(paid / total, 1) : 1;
    return sum + item.unitCost * item.quantity * paidRatio;
  }, 0);

  // Expenses: one-time use stored amount; recurring compute from start to today
  let totalExpenses = 0;
  for (const exp of allExpenses) {
    const recurrence = exp.recurrence || "none";
    if (recurrence === "none") {
      totalExpenses += exp.amount;
    } else {
      const expStart = new Date(exp.date);
      if (expStart <= now) {
        totalExpenses += computeRecurringAmount(exp.amount, recurrence, expStart, now);
      }
    }
  }

  // Salaries: compute from hire date to today
  for (const emp of employees) {
    const hireDate = new Date(emp.hireDate);
    if (hireDate > now) continue;
    const days = calcDays(hireDate, now);
    const rate = Number(emp.salary);
    const period = emp.salaryPeriod || "month";
    if (period === "day")        totalExpenses += parseFloat((rate * days).toFixed(2));
    else if (period === "week")  totalExpenses += parseFloat((rate * (days / 7)).toFixed(2));
    else                         totalExpenses += parseFloat((rate * calcMonths(hireDate, now)).toFixed(2));
  }

  // Paid supplier bills
  totalExpenses += paidBills._sum.amount ?? 0;

  const netEarning = grossEarning - cogs - totalExpenses;

  return NextResponse.json({
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
  });
}
