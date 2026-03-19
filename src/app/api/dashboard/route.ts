import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = session.organizationId;

  const [clientCount, productCount, employeeCount, invoices, paidInvoiceItems, lowStockProducts, recentInvoices] = await Promise.all([
    prisma.client.count({ where: { organizationId: orgId } }),
    prisma.product.count({ where: { organizationId: orgId } }),
    prisma.employee.count({ where: { organizationId: orgId } }),
    prisma.invoice.findMany({ where: { organizationId: orgId }, select: { subtotal: true, total: true, status: true } }),
    prisma.invoiceItem.findMany({
      where: { invoice: { organizationId: orgId, status: "paid" } },
      select: { quantity: true, unitPrice: true, product: { select: { cost: true } } },
    }),
    prisma.product.findMany({ where: { organizationId: orgId, quantity: { lte: 5 } }, select: { id: true, name: true, quantity: true, minStock: true } }),
    prisma.invoice.findMany({ where: { organizationId: orgId }, take: 5, orderBy: { createdAt: "desc" }, include: { client: true } }),
  ]);

  const grossEarning = invoices.filter(i => i.status === "paid").reduce((sum, i) => sum + i.subtotal, 0);
  const pendingAmount = invoices.filter(i => i.status === "sent" || i.status === "overdue").reduce((sum, i) => sum + i.total, 0);
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
  });
}
