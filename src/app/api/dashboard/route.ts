import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = session.organizationId;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [clientCount, productCount, employeeCount, invoices, lowStockProducts, recentInvoices, allPayments, allExpenses, employees, newClientsThisMonth, newInvoicesThisMonth] = await Promise.all([
    prisma.client.count({ where: { organizationId: orgId } }),
    prisma.product.count({ where: { organizationId: orgId } }),
    prisma.employee.count({ where: { organizationId: orgId } }),
    prisma.invoice.findMany({ where: { organizationId: orgId }, select: { total: true, status: true, id: true } }),
    prisma.product.findMany({ where: { organizationId: orgId }, select: { id: true, name: true, quantity: true, minStock: true } }),
    prisma.invoice.findMany({ where: { organizationId: orgId }, take: 5, orderBy: { createdAt: "desc" }, include: { client: true } }),
    prisma.payment.findMany({ where: { organizationId: orgId }, select: { invoiceId: true, amount: true } }),
    // Exclude old auto-created salary rows (reference = employee id, category = salaries)
    prisma.expense.findMany({
      where: { organizationId: orgId, NOT: { AND: [{ category: "salaries" }, { reference: { not: null } }] } },
      select: { amount: true },
    }),
    prisma.employee.findMany({ where: { organizationId: orgId }, select: { salary: true, salaryPeriod: true } }),
    prisma.client.count({ where: { organizationId: orgId, createdAt: { gte: monthStart } } }),
    prisma.invoice.count({ where: { organizationId: orgId, createdAt: { gte: monthStart } } }),
  ]);

  // Filter low stock: products where quantity <= minStock
  const lowStock = lowStockProducts.filter(p => p.quantity <= (p.minStock ?? 0));

  // Build a map of invoiceId → total payments received
  const paymentsByInvoice: Record<string, number> = {};
  for (const p of allPayments) {
    paymentsByInvoice[p.invoiceId] = (paymentsByInvoice[p.invoiceId] ?? 0) + p.amount;
  }

  // grossEarning = total value of all fully paid invoices
  //   + actual payments received on partially paid invoices
  const grossEarning =
    invoices
      .filter(i => i.status === "paid")
      .reduce((sum, i) => sum + i.total, 0) +
    invoices
      .filter(i => i.status === "partially_paid")
      .reduce((sum, i) => sum + (paymentsByInvoice[i.id] ?? 0), 0);

  // pendingAmount = remaining balance on unpaid invoices (total − paid so far)
  const pendingAmount = invoices
    .filter(i => i.status === "sent" || i.status === "overdue" || i.status === "partially_paid")
    .reduce((sum, i) => {
      const paid = paymentsByInvoice[i.id] ?? 0;
      return sum + Math.max(0, i.total - paid);
    }, 0);

  // Compute this month's salary cost from active employees
  const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  const monthlySalaryCost = employees.reduce((sum, emp) => {
    const rate = Number(emp.salary);
    const period = emp.salaryPeriod || "month";
    if (period === "day") return sum + rate * daysInMonth;
    if (period === "week") return sum + rate * (daysInMonth / 7);
    return sum + rate;
  }, 0);

  // netEarning = gross − stored non-salary expenses − this month's salary cost
  const totalStoredExpenses = allExpenses.reduce((sum, e) => sum + e.amount, 0);
  const netEarning = grossEarning - totalStoredExpenses - monthlySalaryCost;

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
