import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
import { canView } from "@/lib/permissions";

function calcDays(start: Date, end: Date): number {
  return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

function calcMonths(start: Date, end: Date): number {
  const sy = start.getUTCFullYear(), sm = start.getUTCMonth(), sd = start.getUTCDate();
  const ey = end.getUTCFullYear(), em = end.getUTCMonth(), ed = end.getUTCDate();
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

  const fromStr = (from ?? `${new Date().getUTCFullYear()}-01-01`).split("T")[0];
  const toStr = (to ?? new Date().toISOString().split("T")[0]).split("T")[0];
  const fromDate = new Date(fromStr + "T00:00:00Z");
  const toDate = new Date(toStr + "T23:59:59.999Z");

  const orgId = session.organizationId;

  if (type === "pl") {
    // Profit & Loss
    const [payments, allExpenses, employees, paidBills, periodInvoices] = await Promise.all([
      prisma.payment.findMany({
        where: { organizationId: orgId, date: { gte: fromDate, lte: toDate } },
        select: {
          invoiceId: true,
          amount: true,
          invoice: {
            select: {
              total: true,
              tax: true,
              items: { select: { unitCost: true, quantity: true } },
            },
          },
        },
      }),
      prisma.expense.findMany({
        where: { organizationId: orgId, date: { lte: toDate } },
        orderBy: { category: "asc" },
        select: { amount: true, recurrence: true, date: true, category: true },
      }),
      prisma.employee.findMany({
        where: { organizationId: orgId, hireDate: { lte: toDate } },
        select: {
          id: true, salary: true, salaryPeriod: true, hireDate: true,
          salaryAdvances: {
            where: { organizationId: orgId, status: { in: ["pending", "paid"] } },
            select: { amount: true, date: true },
          },
        },
      }),
      prisma.supplierBillPayment.findMany({
        where: { organizationId: orgId, date: { gte: fromDate, lte: toDate } },
        select: { amount: true },
      }),
      prisma.invoice.findMany({
        where: { organizationId: orgId, date: { gte: fromDate, lte: toDate } },
        select: { total: true, tax: true, status: true, items: { select: { description: true, quantity: true, unitPrice: true, unitCost: true, total: true } }, payments: { select: { amount: true } } },
      }),
    ]);

    // Revenue = all payments received within the period (cash basis)
    // COGS & Tax = full amount per invoice in the period (like COGS, counted once regardless of payment status)
    let revenue = 0;
    let taxCollected = 0;
    let cogs = 0;
    const seenInvoices = new Set<string>();

    for (const payment of payments) {
      revenue += payment.amount;
      if (!seenInvoices.has(payment.invoiceId)) {
        seenInvoices.add(payment.invoiceId);
        const inv = payment.invoice;
        for (const item of inv.items) {
          cogs += (item.unitCost ?? 0) * item.quantity;
        }
      }
    }

    // Tax is calculated on ALL invoices in the period, regardless of payment status
    for (const inv of periodInvoices) {
      taxCollected += inv.tax ?? 0;
    }

    const invoiceCount = periodInvoices.length;

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
      // Deduct each advance pro-rated over remaining days in its pay period from advance date
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
        const overlapStart = advDate > fromDate ? advDate : fromDate;
        const overlapEnd = periodEnd < toDate ? periodEnd : toDate;
        if (overlapStart > overlapEnd) continue;
        totalDeduction += (Number(adv.amount) / remainingDays) * calcDays(overlapStart, overlapEnd);
      }
      totalDeduction = parseFloat(totalDeduction.toFixed(2));
      if (totalDeduction > 0) {
        salaryAmount = parseFloat((salaryAmount - totalDeduction).toFixed(2));
      }
      if (salaryAmount > 0) {
        expensesByCategory["salaries"] = (expensesByCategory["salaries"] ?? 0) + salaryAmount;
      }
    }

    // Add supplier bill payments made in period
    if (!excludedCategories.has("supplier_bill"))
    for (const bp of paidBills) {
      expensesByCategory["supplier_bill"] = (expensesByCategory["supplier_bill"] ?? 0) + bp.amount;
    }

    const totalExpenses = Object.values(expensesByCategory).reduce((s, v) => s + v, 0);
    const netProfit = grossProfit - totalExpenses;

    // Total Sales in Period (all invoices regardless of status)
    const totalSalesRevenue = periodInvoices.reduce((s, inv) => s + inv.total, 0);
    const totalSalesCogs = periodInvoices.reduce((s, inv) => s + inv.items.reduce((is, item) => is + (item.unitCost ?? 0) * item.quantity, 0), 0);
    const totalSalesGrossProfit = totalSalesRevenue - totalSalesCogs;
    const totalSalesPaid = periodInvoices.reduce((s, inv) => s + inv.payments.reduce((ps, p) => ps + p.amount, 0), 0);
    const totalSalesPending = totalSalesRevenue - totalSalesPaid;
    const paidInvoiceCount = periodInvoices.filter(inv => inv.status === "paid").length;
    const partialInvoiceCount = periodInvoices.filter(inv => inv.status === "partially_paid").length;

    const productSalesMap: Record<string, { description: string; quantity: number; unitPrice: number; total: number }> = {};
    for (const inv of periodInvoices) {
      for (const item of inv.items) {
        if (!productSalesMap[item.description]) {
          productSalesMap[item.description] = { description: item.description, quantity: 0, unitPrice: item.unitPrice, total: 0 };
        }
        productSalesMap[item.description].quantity += item.quantity;
        productSalesMap[item.description].total += item.total;
      }
    }
    const mostSoldProducts = Object.values(productSalesMap)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10)
      .map(p => ({ description: p.description, quantity: p.quantity, unitPrice: parseFloat(p.unitPrice.toFixed(2)), total: parseFloat(p.total.toFixed(2)) }));

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
      totalSalesInPeriod: {
        revenue: parseFloat(totalSalesRevenue.toFixed(2)),
        cogs: parseFloat(totalSalesCogs.toFixed(2)),
        grossProfit: parseFloat(totalSalesGrossProfit.toFixed(2)),
        invoiceCount: periodInvoices.length,
        totalPaid: parseFloat(totalSalesPaid.toFixed(2)),
        totalPending: parseFloat(totalSalesPending.toFixed(2)),
        paidCount: paidInvoiceCount,
        partialCount: partialInvoiceCount,
      },
      mostSoldProducts,
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
        status: true,
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
      return { invoiceId: inv.id, number: inv.number, client: inv.client.name, total: inv.total, paid, balance, daysOverdue, bucket, status: inv.status };
    });

    return NextResponse.json({ type: "aging", buckets, rows });
  }

  return NextResponse.json({ error: "Unknown report type" }, { status: 400 });
}
