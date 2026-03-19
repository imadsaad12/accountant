import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
import { canView } from "@/lib/permissions";

/** Count how many times a recurring expense falls within [fromDate, toDate]. */
function countOccurrences(expenseDate: Date, recurrence: string, fromDate: Date, toDate: Date): number {
  if (recurrence === "none" || expenseDate > toDate) return 0;
  let count = 0;
  let current = new Date(expenseDate);
  while (current <= toDate) {
    if (current >= fromDate) count++;
    if (recurrence === "weekly") {
      current = new Date(current.getTime() + 7 * 24 * 60 * 60 * 1000);
    } else if (recurrence === "monthly") {
      current = new Date(current.getFullYear(), current.getMonth() + 1, current.getDate());
    } else if (recurrence === "quarterly") {
      current = new Date(current.getFullYear(), current.getMonth() + 3, current.getDate());
    } else if (recurrence === "yearly") {
      current = new Date(current.getFullYear() + 1, current.getMonth(), current.getDate());
    } else {
      break;
    }
  }
  return count;
}

export async function GET(req: NextRequest) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canView(session.permissions, "reports")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") || "pl"; // pl | bs
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const fromDate = from ? new Date(from) : new Date(new Date().getFullYear(), 0, 1);
  const toDate = to ? new Date(to) : new Date();
  toDate.setHours(23, 59, 59, 999);

  const orgId = session.organizationId;

  if (type === "pl") {
    // Profit & Loss
    const [paidInvoices, allExpenses, invoiceItems] = await Promise.all([
      prisma.invoice.findMany({
        where: { organizationId: orgId, status: "paid", date: { gte: fromDate, lte: toDate } },
        include: { items: { include: { product: true } } },
      }),
      // Fetch all expenses that started on or before the end of the period
      prisma.expense.findMany({
        where: { organizationId: orgId, date: { lte: toDate } },
        orderBy: { category: "asc" },
      }),
      prisma.invoiceItem.findMany({
        where: {
          invoice: { organizationId: orgId, status: "paid", date: { gte: fromDate, lte: toDate } },
          productId: { not: null },
        },
        include: { product: true },
      }),
    ]);

    const revenue = paidInvoices.reduce((s, inv) => s + inv.subtotal, 0);
    const taxCollected = paidInvoices.reduce((s, inv) => s + inv.tax, 0);

    // COGS: cost × quantity for items linked to products
    const cogs = invoiceItems.reduce((s, item) => {
      const cost = item.product?.cost ?? 0;
      return s + cost * item.quantity;
    }, 0);

    const grossProfit = revenue - cogs;

    // Group expenses by category
    // - One-time (none/null): count only if date falls within [fromDate, toDate]
    // - Recurring: multiply amount by number of occurrences within the range
    const expensesByCategory: Record<string, number> = {};
    for (const exp of allExpenses) {
      const recurrence = exp.recurrence || "none";
      const expDate = new Date(exp.date);
      let amount = 0;

      if (recurrence === "none") {
        if (expDate >= fromDate) amount = exp.amount;
      } else {
        const occurrences = countOccurrences(expDate, recurrence, fromDate, toDate);
        amount = exp.amount * occurrences;
      }

      if (amount > 0) {
        expensesByCategory[exp.category] = (expensesByCategory[exp.category] ?? 0) + amount;
      }
    }

    const totalExpenses = Object.values(expensesByCategory).reduce((s, v) => s + v, 0);
    const netProfit = grossProfit - totalExpenses;

    return NextResponse.json({
      type: "pl",
      period: { from: fromDate, to: toDate },
      revenue,
      taxCollected,
      cogs,
      grossProfit,
      expensesByCategory,
      totalExpenses,
      netProfit,
      invoiceCount: paidInvoices.length,
    });
  }

  if (type === "bs") {
    // Balance Sheet (snapshot at toDate)
    const [products, invoices, payments] = await Promise.all([
      prisma.product.findMany({ where: { organizationId: orgId } }),
      prisma.invoice.findMany({
        where: { organizationId: orgId, status: { in: ["sent", "overdue", "paid"] } },
        include: { payments: true },
      }),
      prisma.payment.findMany({ where: { organizationId: orgId, date: { lte: toDate } } }),
    ]);

    // Assets
    const cashReceived = payments.reduce((s, p) => s + p.amount, 0);

    // AR = unpaid invoice balance
    const ar = invoices
      .filter((inv) => inv.status !== "paid")
      .reduce((s, inv) => {
        const paid = inv.payments.reduce((ps, p) => ps + p.amount, 0);
        return s + Math.max(0, inv.total - paid);
      }, 0);

    const inventoryValue = products.reduce((s, p) => s + p.cost * p.quantity, 0);
    const totalAssets = cashReceived + ar + inventoryValue;

    // Liabilities (simplified — tax payable from unpaid invoices)
    const unpaidInvoices = invoices.filter((inv) => inv.status !== "paid");
    const taxPayable = unpaidInvoices.reduce((s, inv) => {
      const paid = inv.payments.reduce((ps, p) => ps + p.amount, 0);
      const balance = Math.max(0, inv.total - paid);
      const taxPortion = inv.total > 0 ? (inv.tax / inv.total) * balance : 0;
      return s + taxPortion;
    }, 0);

    const totalLiabilities = taxPayable;
    const equity = totalAssets - totalLiabilities;

    return NextResponse.json({
      type: "bs",
      asOf: toDate,
      assets: { cash: cashReceived, ar, inventory: inventoryValue, total: totalAssets },
      liabilities: { taxPayable, total: totalLiabilities },
      equity,
    });
  }

  // Aging report
  if (type === "aging") {
    const now = new Date();
    const invoices = await prisma.invoice.findMany({
      where: { organizationId: orgId, status: { in: ["sent", "overdue"] } },
      include: { client: true, payments: true },
    });

    const buckets = { current: 0, days1_30: 0, days31_60: 0, days61_90: 0, days90plus: 0 };
    const rows = invoices.map((inv) => {
      const paid = inv.payments.reduce((s, p) => s + p.amount, 0);
      const balance = Math.max(0, inv.total - paid);
      const daysOverdue = inv.dueDate ? Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / 86400000) : 0;

      let bucket: keyof typeof buckets = "current";
      if (daysOverdue > 90) bucket = "days90plus";
      else if (daysOverdue > 60) bucket = "days61_90";
      else if (daysOverdue > 30) bucket = "days31_60";
      else if (daysOverdue > 0) bucket = "days1_30";

      buckets[bucket] += balance;
      return { invoiceId: inv.id, number: inv.number, client: inv.client.name, total: inv.total, paid, balance, daysOverdue, bucket };
    });

    return NextResponse.json({ type: "aging", buckets, rows });
  }

  return NextResponse.json({ error: "Unknown report type" }, { status: 400 });
}
