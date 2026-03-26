import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
import { canView } from "@/lib/permissions";

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
  const days = calcDays(start, end);
  return parseFloat((days / 30).toFixed(2));
}

/** Compute the pro-rated amount of a recurring expense for the period [fromDate, toDate]. */
function computeRecurringAmount(rate: number, recurrence: string, expStart: Date, fromDate: Date, toDate: Date): number {
  const effectiveStart = expStart > fromDate ? expStart : fromDate;
  const days = calcDays(effectiveStart, toDate);
  if (days <= 0) return 0;
  if (recurrence === "weekly") {
    return parseFloat((rate * (days / 7)).toFixed(2));
  } else if (recurrence === "monthly") {
    return parseFloat((rate * calcMonths(effectiveStart, toDate)).toFixed(2));
  } else if (recurrence === "quarterly") {
    return parseFloat((rate * (calcMonths(effectiveStart, toDate) / 3)).toFixed(2));
  } else if (recurrence === "yearly") {
    const sm = effectiveStart.getUTCMonth(), sd = effectiveStart.getUTCDate();
    const em = toDate.getUTCMonth(), ed = toDate.getUTCDate();
    const lastDay = new Date(Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth() + 1, 0)).getUTCDate();
    const years = (sm === 0 && sd === 1 && em === 11 && ed === lastDay)
      ? toDate.getUTCFullYear() - effectiveStart.getUTCFullYear() + 1
      : parseFloat((days / 365).toFixed(2));
    return parseFloat((rate * years).toFixed(2));
  }
  return 0;
}

export async function GET(req: NextRequest) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canView(session.permissions, "reports")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") || "pl"; // pl | bs
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const excludeParam = searchParams.get("exclude") || "";
  const excludedCategories = new Set(excludeParam.split(",").map(c => c.trim()).filter(Boolean));

  const fromDate = from ? new Date(from) : new Date(new Date().getFullYear(), 0, 1);
  const toDate = to ? new Date(to) : new Date();
  toDate.setHours(23, 59, 59, 999);

  const orgId = session.organizationId;

  if (type === "pl") {
    // Profit & Loss
    const [invoices, allExpenses, employees] = await Promise.all([
      prisma.invoice.findMany({
        where: {
          organizationId: orgId,
          status: { in: ["paid", "partially_paid"] },
          date: { gte: fromDate, lte: toDate },
        },
        select: {
          id: true,
          total: true,
          tax: true,
          items: { select: { unitCost: true, quantity: true } },
          payments: { select: { amount: true } },
        },
      }),
      prisma.expense.findMany({
        where: { organizationId: orgId, date: { lte: toDate } },
        orderBy: { category: "asc" },
        select: { amount: true, recurrence: true, date: true, category: true },
      }),
      prisma.employee.findMany({
        where: { organizationId: orgId, hireDate: { lte: toDate } },
        select: { salary: true, salaryPeriod: true, hireDate: true },
      }),
    ]);

    // Revenue = cash actually received:
    //   - "paid" invoices: sum of their payments (= full invoice total)
    //   - "partially_paid" invoices: sum of payments received so far
    let revenue = 0;
    let taxCollected = 0;
    let cogs = 0;

    for (const inv of invoices) {
      const totalPaid = inv.payments.reduce((s, p) => s + p.amount, 0);
      revenue += totalPaid;

      // Tax portion: prorate tax by (paid / total)
      if (inv.total > 0) {
        taxCollected += (totalPaid / inv.total) * inv.tax;
      }

      // COGS: prorate product costs by the paid fraction (use unitCost snapshot from invoice time)
      const paidRatio = inv.total > 0 ? Math.min(totalPaid / inv.total, 1) : 0;
      for (const item of inv.items) {
        if (item.unitCost > 0) {
          cogs += item.unitCost * item.quantity * paidRatio;
        }
      }
    }

    const invoiceCount = invoices.length;

    const grossProfit = revenue - cogs;

    // Group expenses by category
    // - One-time (recurrence=none): count only if date falls within [fromDate, toDate]
    // - Recurring: pro-rate over the period (same logic as expenses page)
    const expensesByCategory: Record<string, number> = {};
    for (const exp of allExpenses) {
      if (excludedCategories.has(exp.category)) continue;
      const recurrence = exp.recurrence || "none";
      const expDate = new Date(exp.date);
      let amount = 0;

      if (recurrence === "none") {
        if (expDate >= fromDate && expDate <= toDate) amount = exp.amount;
      } else {
        amount = computeRecurringAmount(exp.amount, recurrence, expDate, fromDate, toDate);
      }

      if (amount > 0) {
        expensesByCategory[exp.category] = (expensesByCategory[exp.category] ?? 0) + amount;
      }
    }

    // Add dynamically computed salary rows (skip if salaries excluded)
    if (!excludedCategories.has("salaries"))
    for (const emp of employees) {
      const hireDate = new Date(emp.hireDate);
      const empStart = hireDate > fromDate ? hireDate : fromDate;
      const days = calcDays(empStart, toDate);
      if (days <= 0) continue;
      const rate = Number(emp.salary);
      const period = emp.salaryPeriod || "month";
      let salaryAmount = 0;
      if (period === "day") {
        salaryAmount = parseFloat((rate * days).toFixed(2));
      } else if (period === "week") {
        salaryAmount = parseFloat((rate * (days / 7)).toFixed(2));
      } else {
        salaryAmount = parseFloat((rate * calcMonths(empStart, toDate)).toFixed(2));
      }
      if (salaryAmount > 0) {
        expensesByCategory["salaries"] = (expensesByCategory["salaries"] ?? 0) + salaryAmount;
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
      invoiceCount,
    });
  }

  if (type === "bs") {
    // Balance Sheet (snapshot at toDate)
    const [products, invoices, payments] = await Promise.all([
      prisma.product.findMany({
        where: { organizationId: orgId },
        select: { cost: true, quantity: true },
      }),
      prisma.invoice.findMany({
        where: { organizationId: orgId, status: { in: ["sent", "overdue", "paid"] } },
        select: {
          id: true,
          total: true,
          tax: true,
          status: true,
          payments: { select: { amount: true } },
        },
      }),
      prisma.payment.findMany({
        where: { organizationId: orgId, date: { lte: toDate } },
        select: { amount: true },
      }),
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
      where: { organizationId: orgId, status: { in: ["sent", "overdue", "partially_paid"] } },
      select: {
        id: true,
        number: true,
        total: true,
        dueDate: true,
        client: { select: { name: true } },
        payments: { select: { amount: true } },
      },
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
