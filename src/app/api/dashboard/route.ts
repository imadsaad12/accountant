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

  const [clientCount, productCount, employeeCount, invoices, paidInvoiceItems, lowStockProducts, recentInvoices, allPayments, newClientsThisMonth, newInvoicesThisMonth] = await Promise.all([
    prisma.client.count({ where: { organizationId: orgId } }),
    prisma.product.count({ where: { organizationId: orgId } }),
    prisma.employee.count({ where: { organizationId: orgId } }),
    prisma.invoice.findMany({ where: { organizationId: orgId }, select: { subtotal: true, total: true, status: true, id: true } }),
    prisma.invoiceItem.findMany({
      where: { invoice: { organizationId: orgId, status: "paid" } },
      select: { quantity: true, unitPrice: true, product: { select: { cost: true } } },
    }),
    prisma.product.findMany({ where: { organizationId: orgId, quantity: { lte: 5 } }, select: { id: true, name: true, quantity: true, minStock: true } }),
    prisma.invoice.findMany({ where: { organizationId: orgId }, take: 5, orderBy: { createdAt: "desc" }, include: { client: true } }),
    prisma.payment.findMany({ where: { organizationId: orgId }, select: { invoiceId: true, amount: true } }),
    prisma.client.count({ where: { organizationId: orgId, createdAt: { gte: monthStart } } }),
    prisma.invoice.count({ where: { organizationId: orgId, createdAt: { gte: monthStart } } }),
  ]);

  // Build a map of invoiceId → total payments received
  const paymentsByInvoice: Record<string, number> = {};
  for (const p of allPayments) {
    paymentsByInvoice[p.invoiceId] = (paymentsByInvoice[p.invoiceId] ?? 0) + p.amount;
  }

  // grossEarning = all cash actually received (payments on any invoice)
  const grossEarning = allPayments.reduce((sum, p) => sum + p.amount, 0);

  // pendingAmount = remaining balance on unpaid invoices (total − paid so far)
  const pendingAmount = invoices
    .filter(i => i.status === "sent" || i.status === "overdue" || i.status === "partially_paid")
    .reduce((sum, i) => {
      const paid = paymentsByInvoice[i.id] ?? 0;
      return sum + Math.max(0, i.total - paid);
    }, 0);

  const cogs = paidInvoiceItems.reduce((sum, item) => sum + (item.product?.cost ?? 0) * item.quantity, 0);
  const netEarning = grossEarning - cogs;

  return NextResponse.json({
    clientCount,
    productCount,
    employeeCount,
    invoiceCount: invoices.length,
    totalRevenue: grossEarning,
    grossEarning,
    netEarning,
    pendingAmount,
    lowStockProducts,
    recentInvoices,
    newClientsThisMonth,
    newInvoicesThisMonth,
  });
}
