import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
import { canView } from "@/lib/permissions";

function calcDays(start: Date, end: Date) {
  return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}
function calcMonths(start: Date, end: Date) {
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
function computeRecurring(rate: number, recurrence: string, expStart: Date, fromDate: Date, toDate: Date): number {
  const eff = expStart > fromDate ? expStart : fromDate;
  const days = calcDays(eff, toDate);
  if (days <= 0) return 0;
  if (recurrence === "weekly") return parseFloat((rate * (days / 7)).toFixed(2));
  if (recurrence === "monthly") return parseFloat((rate * calcMonths(eff, toDate)).toFixed(2));
  if (recurrence === "quarterly") return parseFloat((rate * (calcMonths(eff, toDate) / 3)).toFixed(2));
  if (recurrence === "yearly") return parseFloat((rate * (days / 365)).toFixed(2));
  return 0;
}

export async function GET(req: NextRequest) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canView(session.permissions, "reports")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const fromStr = searchParams.get("from") ?? new Date(new Date().getFullYear(), 0, 1).toISOString().split("T")[0];
  const toStr = searchParams.get("to") ?? new Date().toISOString().split("T")[0];
  const excludeParam = searchParams.get("exclude") ?? "";
  const excludedCategories = new Set(excludeParam ? excludeParam.split(",") : []);
  const fromDate = new Date(fromStr + "T00:00:00Z");
  const toDate = new Date(toStr + "T23:59:59Z");
  const orgId = session.organizationId;

  const [invoices, expenses, employees, bills, receivedPayments] = await Promise.all([
    prisma.invoice.findMany({
      where: { organizationId: orgId, date: { gte: fromDate, lte: toDate } },
      include: {
        client: { select: { id: true, name: true } },
        items: { select: { description: true, quantity: true, unitPrice: true, total: true, unitCost: true, productId: true } },
        payments: { select: { amount: true, date: true, method: true } },
        fees: { select: { label: true, amount: true } },
      },
      orderBy: { date: "asc" },
    }),
    prisma.expense.findMany({
      where: { organizationId: orgId },
      orderBy: { date: "asc" },
    }),
    prisma.employee.findMany({
      where: { organizationId: orgId, status: "active" },
      select: { id: true, firstName: true, lastName: true, salary: true, salaryPeriod: true, hireDate: true },
    }),
    prisma.supplierBill.findMany({
      where: { organizationId: orgId, date: { gte: fromDate, lte: toDate } },
      include: { supplier: { select: { name: true } } },
      orderBy: { date: "asc" },
    }),
    prisma.payment.findMany({
      where: { organizationId: orgId, date: { gte: fromDate, lte: toDate } },
      include: {
        invoice: {
          select: {
            date: true,
            number: true,
            total: true,
            client: { select: { name: true } },
            items: { select: { unitCost: true, quantity: true } },
          },
        },
      },
      orderBy: { date: "asc" },
    }),
  ]);

  // ── Revenue & COGS ──────────────────────────────────────────────────────────
  const invoiceRows = invoices.map(inv => {
    const totalPaid = inv.payments.reduce((s, p) => s + p.amount, 0);
    const balance = inv.total - totalPaid;
    // Full COGS regardless of paid ratio
    const cogs = inv.items.reduce((s, item) => s + (item.unitCost ?? 0) * item.quantity, 0);
    const daysOverdue = inv.dueDate ? Math.max(0, Math.floor((Date.now() - new Date(inv.dueDate).getTime()) / 86400000)) : 0;
    return {
      id: inv.id,
      number: inv.number,
      client: inv.client.name,
      clientId: inv.client.id,
      date: inv.date.toISOString().split("T")[0],
      dueDate: inv.dueDate ? inv.dueDate.toISOString().split("T")[0] : null,
      status: inv.status,
      subtotal: inv.subtotal,
      total: inv.total,
      totalPaid,
      balance,
      cogs: parseFloat(cogs.toFixed(2)),
      grossProfit: parseFloat((totalPaid - cogs).toFixed(2)),
      itemCount: inv.items.length,
      daysOverdue,
      notes: inv.notes,
    };
  });

  // Revenue has two parts:
  // 1. Payments from invoices issued IN this period (paid/partially_paid)
  // 2. Payments received in this period from OLD invoices (issued before the period)
  // COGS = full unit cost per invoice, counted once even with multiple payments
  let periodInvoiceRevenue = 0;
  let oldInvoiceRevenue = 0;
  let totalCogs = 0;
  const seenInvoiceIds = new Set<string>();
  for (const payment of receivedPayments) {
    const invoiceDate = new Date(payment.invoice.date);
    if (invoiceDate >= fromDate && invoiceDate <= toDate) {
      periodInvoiceRevenue += payment.amount;
    } else {
      oldInvoiceRevenue += payment.amount;
    }
    if (!seenInvoiceIds.has(payment.invoiceId)) {
      seenInvoiceIds.add(payment.invoiceId);
      for (const item of payment.invoice.items) {
        totalCogs += (item.unitCost ?? 0) * item.quantity;
      }
    }
  }
  periodInvoiceRevenue = parseFloat(periodInvoiceRevenue.toFixed(2));
  oldInvoiceRevenue = parseFloat(oldInvoiceRevenue.toFixed(2));
  const totalRevenue = parseFloat((periodInvoiceRevenue + oldInvoiceRevenue).toFixed(2));
  totalCogs = parseFloat(totalCogs.toFixed(2));
  const grossProfit = parseFloat((totalRevenue - totalCogs).toFixed(2));

  // ── Expenses ────────────────────────────────────────────────────────────────
  const expenseRows: { category: string; description: string; amount: number; recurrence: string; vendor: string | null; date: string; salary?: number; salaryAdvance?: number; amountPaid?: number }[] = [];

  // Stored one-time & recurring expenses
  for (const e of expenses) {
    const eDate = new Date(e.date);
    if (e.recurrence === "none") {
      if (eDate >= fromDate && eDate <= toDate) {
        expenseRows.push({ category: e.category, description: e.description, amount: e.amount, recurrence: "none", vendor: e.vendor, date: eDate.toISOString().split("T")[0] });
      }
    } else {
      if (eDate <= toDate) {
        const amt = computeRecurring(e.amount, e.recurrence, eDate, fromDate, toDate);
        if (amt > 0) expenseRows.push({ category: e.category, description: `${e.description} (${e.recurrence})`, amount: amt, recurrence: e.recurrence, vendor: e.vendor, date: eDate.toISOString().split("T")[0] });
      }
    }
  }

  // Fetch salary advances for deduction (per employee, no date filter — filtered in JS by pay period)
  const allSalaryAdvances = await prisma.salaryAdvance.findMany({
    where: { organizationId: orgId, status: { in: ["pending", "paid"] } },
    select: { employeeId: true, amount: true, date: true },
  });
  const advancesByEmployee: Record<string, { amount: number; date: Date }[]> = {};
  for (const adv of allSalaryAdvances) {
    if (!advancesByEmployee[adv.employeeId]) advancesByEmployee[adv.employeeId] = [];
    advancesByEmployee[adv.employeeId].push({ amount: Number(adv.amount), date: new Date(adv.date) });
  }

  // Salary rows
  const daysInPeriod = calcDays(fromDate, toDate);
  for (const emp of employees) {
    const hireDate = new Date(emp.hireDate);
    if (hireDate > toDate) continue;
    const eff = hireDate > fromDate ? hireDate : fromDate;
    const days = calcDays(eff, toDate);
    let salary = 0;
    if (emp.salaryPeriod === "month") salary = emp.salary * calcMonths(eff, toDate);
    else if (emp.salaryPeriod === "week") salary = emp.salary * (days / 7);
    else if (emp.salaryPeriod === "day") salary = emp.salary * days;
    else if (emp.salaryPeriod === "year") salary = emp.salary * (days / 365);
    salary = parseFloat(salary.toFixed(2));

    // Deduct each advance pro-rated over remaining days in its pay period from advance date
    let deduction = 0;
    for (const adv of (advancesByEmployee[emp.id] ?? [])) {
      const advDate = adv.date;
      let periodEnd: Date;
      if (emp.salaryPeriod === "month") {
        periodEnd = new Date(Date.UTC(advDate.getUTCFullYear(), advDate.getUTCMonth() + 1, 0, 23, 59, 59, 999));
      } else if (emp.salaryPeriod === "week") {
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
      deduction += (adv.amount / remainingDays) * calcDays(overlapStart, overlapEnd);
    }
    deduction = parseFloat(deduction.toFixed(2));
    const amountPaid = parseFloat((salary - deduction).toFixed(2));

    const desc = deduction > 0
      ? `${emp.firstName} ${emp.lastName} salary (−${deduction} advance)`
      : `${emp.firstName} ${emp.lastName} salary`;
    if (amountPaid > 0) {
      expenseRows.push({
        category: "salaries",
        description: desc,
        amount: amountPaid,
        recurrence: emp.salaryPeriod,
        vendor: null,
        date: fromDate.toISOString().split("T")[0],
        salary,
        salaryAdvance: deduction,
        amountPaid,
      });
    }
  }
  void daysInPeriod;

  // Supplier bill payments made in period (by payment date)
  const billPaymentsForExpenses = await prisma.supplierBillPayment.findMany({
    where: { organizationId: orgId, date: { gte: fromDate, lte: toDate } },
    include: { bill: { include: { supplier: { select: { name: true } } } } },
    orderBy: { date: "asc" },
  });
  for (const sp of billPaymentsForExpenses) {
    expenseRows.push({ category: "supplier_bill", description: `${sp.bill.supplier.name}: ${sp.bill.description}`, amount: sp.amount, recurrence: "none", vendor: sp.bill.supplier.name, date: sp.date.toISOString().split("T")[0] });
  }

  const expensesByCategory: Record<string, number> = {};
  for (const e of expenseRows) {
    if (excludedCategories.has(e.category)) continue;
    expensesByCategory[e.category] = (expensesByCategory[e.category] ?? 0) + e.amount;
  }
  const filteredExpenseRows = excludedCategories.size > 0 ? expenseRows.filter(e => !excludedCategories.has(e.category)) : expenseRows;
  const totalExpenses = Object.values(expensesByCategory).reduce((s, v) => s + v, 0);
  const netProfit = grossProfit - totalExpenses;

  // ── Receivable Aging ────────────────────────────────────────────────────────
  const allOpenInvoices = await prisma.invoice.findMany({
    where: { organizationId: orgId, status: { in: ["sent", "overdue", "partially_paid"] } },
    include: { client: { select: { name: true } }, payments: { select: { amount: true } } },
    orderBy: { dueDate: "asc" },
  });

  const agingRows = allOpenInvoices.map(inv => {
    const paid = inv.payments.reduce((s, p) => s + p.amount, 0);
    const balance = inv.total - paid;
    const daysOverdue = inv.dueDate ? Math.max(0, Math.floor((Date.now() - new Date(inv.dueDate).getTime()) / 86400000)) : 0;
    const bucket = daysOverdue === 0 ? "current" : daysOverdue <= 30 ? "1-30" : daysOverdue <= 60 ? "31-60" : daysOverdue <= 90 ? "61-90" : "90+";
    return { invoiceId: inv.id, number: inv.number, client: inv.client.name, total: inv.total, paid, balance, daysOverdue, bucket, status: inv.status, dueDate: inv.dueDate ? inv.dueDate.toISOString().split("T")[0] : null };
  });

  const agingTotals = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  for (const r of agingRows) agingTotals[r.bucket as keyof typeof agingTotals] = (agingTotals[r.bucket as keyof typeof agingTotals] ?? 0) + r.balance;

  // ── Payable Aging (supplier bills with payments in period) ──────────────────
  const supplierPaymentsInPeriod = await prisma.supplierBillPayment.findMany({
    where: { organizationId: orgId, date: { gte: fromDate, lte: toDate } },
    include: { bill: { include: { supplier: { select: { name: true } } } } },
    orderBy: { date: "asc" },
  });

  // Unique bills that had a payment in the period (still unpaid/partially paid)
  const billsWithPayments = new Map<string, typeof supplierPaymentsInPeriod[0]["bill"]>();
  for (const sp of supplierPaymentsInPeriod) {
    if (!billsWithPayments.has(sp.billId)) billsWithPayments.set(sp.billId, sp.bill);
  }
  // Also include unpaid bills within the period that have no payments yet
  for (const bill of bills.filter(b => b.status !== "paid")) {
    if (!billsWithPayments.has(bill.id)) billsWithPayments.set(bill.id, bill as typeof supplierPaymentsInPeriod[0]["bill"]);
  }

  const payableRows = Array.from(billsWithPayments.values()).map(bill => {
    const remaining = bill.amount - (bill.amountPaid ?? 0);
    const daysOverdue = bill.dueDate ? Math.max(0, Math.floor((Date.now() - new Date(bill.dueDate).getTime()) / 86400000)) : 0;
    const bucket = daysOverdue === 0 ? "current" : daysOverdue <= 30 ? "1-30" : daysOverdue <= 60 ? "31-60" : daysOverdue <= 90 ? "61-90" : "90+";
    // Calculate period payment (total paid for this bill in the selected period)
    const periodPayment = supplierPaymentsInPeriod
      .filter(sp => sp.billId === bill.id)
      .reduce((s, sp) => s + sp.amount, 0);
    return {
      billId: bill.id,
      supplier: bill.supplier.name,
      description: bill.description,
      amount: bill.amount,
      amountPaid: bill.amountPaid ?? 0,
      remaining,
      daysOverdue,
      bucket,
      status: bill.status,
      dueDate: bill.dueDate ? bill.dueDate.toISOString().split("T")[0] : null,
      periodPayment: parseFloat(periodPayment.toFixed(2)),
      totalPaidToDate: parseFloat((bill.amountPaid ?? 0).toFixed(2)),
    };
  });

  const totalPayable = payableRows.filter(r => r.remaining > 0).reduce((s, r) => s + r.remaining, 0);

  // ── Partially paid invoice summary ─────────────────────────────────────────
  return NextResponse.json({
    period: { from: fromStr, to: toStr },
    summary: {
      periodInvoiceRevenue,
      oldInvoiceRevenue,
      totalRevenue: parseFloat(totalRevenue.toFixed(2)),
      totalCogs: parseFloat(totalCogs.toFixed(2)),
      grossProfit: parseFloat(grossProfit.toFixed(2)),
      totalExpenses: parseFloat(totalExpenses.toFixed(2)),
      netProfit: parseFloat(netProfit.toFixed(2)),
      invoiceCount: new Set(receivedPayments.map(p => p.invoiceId)).size,
      cogsMargin: totalRevenue > 0 ? parseFloat(((totalCogs / totalRevenue) * 100).toFixed(1)) : 0,
      grossMargin: totalRevenue > 0 ? parseFloat(((grossProfit / totalRevenue) * 100).toFixed(1)) : 0,
      netMargin: totalRevenue > 0 ? parseFloat(((netProfit / totalRevenue) * 100).toFixed(1)) : 0,
    },
    revenue: {
      invoices: invoiceRows,
      byStatus: {
        paid: invoiceRows.filter(i => i.status === "paid").length,
        partially_paid: invoiceRows.filter(i => i.status === "partially_paid").length,
        sent: invoiceRows.filter(i => i.status === "sent").length,
        overdue: invoiceRows.filter(i => i.status === "overdue").length,
        draft: invoiceRows.filter(i => i.status === "draft").length,
      },
    },
    cogs: {
      total: parseFloat(totalCogs.toFixed(2)),
      explanation: "COGS (Cost of Goods Sold) is the full unit cost of all items on each invoice that received a payment in this period. Even if an invoice is only partially paid, the full product cost is recognised. Each invoice's COGS is counted once regardless of how many payments it received.",
      byInvoice: (() => {
        const map: Record<string, { number: string; client: string; total: number; totalPaid: number; cogs: number }> = {};
        for (const payment of receivedPayments) {
          const inv = payment.invoice;
          const key = inv.number;
          if (!map[key]) {
            const fullCogs = inv.items.reduce((s, item) => s + (item.unitCost ?? 0) * item.quantity, 0);
            if (fullCogs === 0) continue;
            map[key] = { number: inv.number, client: inv.client.name, total: inv.total, totalPaid: 0, cogs: fullCogs };
          }
          map[key].totalPaid += payment.amount;
        }
        return Object.values(map).map(r => ({ ...r, totalPaid: parseFloat(r.totalPaid.toFixed(2)), cogs: parseFloat(r.cogs.toFixed(2)), grossProfit: parseFloat((r.totalPaid - r.cogs).toFixed(2)) }));
      })(),
    },
    expenses: {
      rows: filteredExpenseRows,
      byCategory: expensesByCategory,
      total: parseFloat(totalExpenses.toFixed(2)),
    },
    receivableAging: {
      rows: agingRows,
      totals: agingTotals,
      totalOutstanding: parseFloat(agingRows.reduce((s, r) => s + r.balance, 0).toFixed(2)),
    },
    payableAging: {
      rows: payableRows,
      total: parseFloat(totalPayable.toFixed(2)),
    },
    receivedPayments: {
      rows: receivedPayments.map(p => {
        // Get the specific invoice to get all its payments
        const invoice = invoices.find(inv => inv.id === p.invoiceId);
        const totalPaidToDate = invoice ? invoice.payments.reduce((s, pay) => s + pay.amount, 0) : p.amount;
        // Period payment = sum of all payments for this invoice within the selected period
        const periodPayment = receivedPayments
          .filter(payment => payment.invoiceId === p.invoiceId)
          .reduce((s, payment) => s + payment.amount, 0);
        return {
          id: p.id,
          date: p.date.toISOString().split("T")[0],
          amount: p.amount,
          method: p.method,
          reference: p.reference,
          invoiceNumber: p.invoice.number,
          invoiceTotal: p.invoice.total,
          client: p.invoice.client.name,
          periodPayment: parseFloat(periodPayment.toFixed(2)),
          totalPaidToDate: parseFloat(totalPaidToDate.toFixed(2)),
        };
      }),
      total: parseFloat(receivedPayments.reduce((s, p) => s + p.amount, 0).toFixed(2)),
    },
  });
}
