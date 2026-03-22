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

  const [clientCount, productCount, employeeCount, invoices, lowStockProducts, recentInvoices, allPayments, allExpenses, newClientsThisMonth, newInvoicesThisMonth] = await Promise.all([
    prisma.client.count({ where: { organizationId: orgId } }),
    prisma.product.count({ where: { organizationId: orgId } }),
    prisma.employee.count({ where: { organizationId: orgId } }),
    prisma.invoice.findMany({ where: { organizationId: orgId }, select: { total: true, status: true, id: true } }),
    prisma.product.findMany({ where: { organizationId: orgId }, select: { id: true, name: true, quantity: true, minStock: true } }),
    prisma.invoice.findMany({ where: { organizationId: orgId }, take: 5, orderBy: { createdAt: "desc" }, include: { client: true } }),
    prisma.payment.findMany({ where: { organizationId: orgId }, select: { invoiceId: true, amount: true } }),
    prisma.expense.findMany({ where: { organizationId: orgId }, select: { amount: true } }),
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

  // grossEarning = all cash actually received (sum of all payments)
  const grossEarning = allPayments.reduce((sum, p) => sum + p.amount, 0);

  // pendingAmount = remaining balance on unpaid invoices (total − paid so far)
  const pendingAmount = invoices
    .filter(i => i.status === "sent" || i.status === "overdue" || i.status === "partially_paid")
    .reduce((sum, i) => {
      const paid = paymentsByInvoice[i.id] ?? 0;
      return sum + Math.max(0, i.total - paid);
    }, 0);

  // netEarning = gross (cash received) − all recorded expenses
  const totalExpenses = allExpenses.reduce((sum, e) => sum + e.amount, 0);
  const netEarning = grossEarning - totalExpenses;

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
