import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canView, canEdit } from "@/lib/permissions";

// Shared helper: compute calendar-accurate months between two UTC dates
// Uses actual days-in-month (28/29/30/31) instead of fixed 30
function calcMonths(start: Date, end: Date): number {
  const sy = start.getUTCFullYear(), sm = start.getUTCMonth(), sd = start.getUTCDate();
  const ey = end.getUTCFullYear(), em = end.getUTCMonth(), ed = end.getUTCDate();

  // Same month
  if (sy === ey && sm === em) {
    const dim = new Date(Date.UTC(sy, sm + 1, 0)).getUTCDate();
    if (sd === 1 && ed === dim) return 1;
    return (ed - sd + 1) / dim;
  }

  // Fraction of first month
  const dimFirst = new Date(Date.UTC(sy, sm + 1, 0)).getUTCDate();
  let total = (dimFirst - sd + 1) / dimFirst;

  // Full months in between
  let y = sy, m = sm + 1;
  if (m > 11) { m = 0; y++; }
  while (y < ey || (y === ey && m < em)) {
    total += 1;
    m++;
    if (m > 11) { m = 0; y++; }
  }

  // Fraction of last month
  const dimLast = new Date(Date.UTC(ey, em + 1, 0)).getUTCDate();
  total += ed / dimLast;

  return parseFloat(total.toFixed(4));
}

function calcDays(start: Date, end: Date): number {
  return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

export async function GET(req: NextRequest) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canView(session.permissions, "expenses")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const category = searchParams.get("category");

  // Default range: current year
  const now = new Date();
  const effectiveFrom = from ?? `${now.getUTCFullYear()}-01-01`;
  const effectiveTo   = to   ?? `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
  const fromDate = new Date(effectiveFrom + "T00:00:00.000Z");
  const toDate   = new Date(effectiveTo   + "T23:59:59.999Z");

  // 1. Non-recurring expenses — filtered by date range as before
  const nonRecurringWhere: Record<string, unknown> = {
    organizationId: session.organizationId,
    recurrence: "none",
    date: { gte: fromDate, lte: toDate },
  };
  if (category) nonRecurringWhere.category = category;

  const storedExpenses = await prisma.expense.findMany({
    where: nonRecurringWhere,
    orderBy: { date: "desc" },
    include: { createdBy: { select: { name: true } }, account: { select: { name: true, code: true } }, supplier: { select: { id: true, name: true } } },
  });

  // 2. Recurring expenses — fetch all that started on or before toDate, compute for the filter range
  const recurringWhere: Record<string, unknown> = {
    organizationId: session.organizationId,
    recurrence: { not: "none" },
    date: { lte: toDate },
  };
  if (category) recurringWhere.category = category;

  const recurringExpenses = await prisma.expense.findMany({
    where: recurringWhere,
    include: { createdBy: { select: { name: true } }, account: { select: { name: true, code: true } }, supplier: { select: { id: true, name: true } } },
  });

  type StoredExpense = typeof storedExpenses[number];
  const recurringRows: StoredExpense[] = [];

  for (const exp of recurringExpenses) {
    const expStart = new Date(exp.date);
    const effectiveStart = expStart > fromDate ? expStart : fromDate;
    const days = calcDays(effectiveStart, toDate);
    if (days <= 0) continue;

    const rate = Number(exp.amount);
    let computedAmount = 0;
    let computedDescription = exp.description;

    if (exp.recurrence === "weekly") {
      const weeks = parseFloat((days / 7).toFixed(2));
      computedAmount = parseFloat((rate * weeks).toFixed(2));
      computedDescription = `${exp.description} (${rate}/week × ${weeks} weeks)`;
    } else if (exp.recurrence === "monthly") {
      const months = calcMonths(effectiveStart, toDate);
      computedAmount = parseFloat((rate * months).toFixed(2));
      const monthsDisplay = parseFloat(months.toFixed(2));
      computedDescription = `${exp.description} (${rate}/month × ${monthsDisplay} month${months === 1 ? "" : "s"})`;
    } else if (exp.recurrence === "quarterly") {
      const months = calcMonths(effectiveStart, toDate);
      const quarters = parseFloat((months / 3).toFixed(2));
      computedAmount = parseFloat((rate * quarters).toFixed(2));
      computedDescription = `${exp.description} (${rate}/quarter × ${quarters} quarter${quarters === 1 ? "" : "s"})`;
    } else if (exp.recurrence === "yearly") {
      const startMonth = effectiveStart.getUTCMonth();
      const startDay2  = effectiveStart.getUTCDate();
      const endMonth   = toDate.getUTCMonth();
      const endDay2    = toDate.getUTCDate();
      const lastDayOfEndMonth = new Date(Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth() + 1, 0)).getUTCDate();
      let years: number;
      if (startMonth === 0 && startDay2 === 1 && endMonth === 11 && endDay2 === lastDayOfEndMonth) {
        years = toDate.getUTCFullYear() - effectiveStart.getUTCFullYear() + 1;
      } else {
        years = parseFloat((days / 365).toFixed(2));
      }
      computedAmount = parseFloat((rate * years).toFixed(2));
      computedDescription = `${exp.description} (${rate}/year × ${years} year${years === 1 ? "" : "s"})`;
    }

    // Keep original amount/description intact (used by edit form) — add computed fields for display
    recurringRows.push({ ...exp, date: effectiveStart, _computedAmount: computedAmount, _computedDescription: computedDescription } as typeof exp & { _computedAmount: number; _computedDescription: string });
  }

  // 3. Salary rows — dynamically computed from employees
  const salaryRows: StoredExpense[] = [];
  if (!category || category === "salaries") {
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const startOfCurrentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    // Start of current week (Sunday)
    const startOfCurrentWeek = new Date(today);
    startOfCurrentWeek.setUTCDate(startOfCurrentWeek.getUTCDate() - startOfCurrentWeek.getUTCDay());

    const employees = await prisma.employee.findMany({
      where: {
        organizationId: session.organizationId,
        hireDate: { lte: toDate },
      },
      include: {
        salaryAdvances: {
          where: {
            organizationId: session.organizationId,
            status: { in: ["pending", "paid"] },
          },
        },
      },
    });

    // Auto-mark pending advances as "paid" once the employee's pay period has passed
    const advancesToMarkPaid: string[] = [];
    for (const emp of employees) {
      const period = emp.salaryPeriod || "month";
      for (const adv of emp.salaryAdvances) {
        if (adv.status !== "pending") continue;
        const advDate = new Date(adv.date);
        let periodPassed = false;
        if (period === "month") {
          periodPassed = advDate < startOfCurrentMonth;
        } else if (period === "week") {
          periodPassed = advDate < startOfCurrentWeek;
        } else if (period === "day") {
          periodPassed = advDate < today;
        }
        if (periodPassed) advancesToMarkPaid.push(adv.id);
      }
    }
    if (advancesToMarkPaid.length > 0) {
      await prisma.salaryAdvance.updateMany({
        where: { id: { in: advancesToMarkPaid } },
        data: { status: "paid" },
      });
    }

    for (const emp of employees) {
      const hireDate = new Date(emp.hireDate);
      const empStart = hireDate > fromDate ? hireDate : fromDate;
      const days = calcDays(empStart, toDate);
      if (days <= 0) continue;

      const rate = Number(emp.salary);
      const period = emp.salaryPeriod || "month";
      let amount = 0;
      let description = "";

      if (period === "day") {
        amount = parseFloat((rate * days).toFixed(2));
        description = `Salary — ${emp.firstName} ${emp.lastName} (${rate}/day × ${days} days)`;
      } else if (period === "week") {
        amount = parseFloat((rate * (days / 7)).toFixed(2));
        const weeks = parseFloat((days / 7).toFixed(2));
        description = `Salary — ${emp.firstName} ${emp.lastName} (${rate}/week × ${weeks} weeks)`;
      } else {
        const months = calcMonths(empStart, toDate);
        amount = parseFloat((rate * months).toFixed(2));
        const monthsDisplay = parseFloat(months.toFixed(2));
        description = `Salary — ${emp.firstName} ${emp.lastName} (${rate}/month × ${monthsDisplay} month${months === 1 ? "" : "s"})`;
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
        const netAmount = parseFloat((amount - totalDeduction).toFixed(2));
        description = `${description} − ${totalDeduction} advance = ${netAmount}`;
        amount = netAmount;
      }

      salaryRows.push({
        id: `salary-${emp.id}`,
        date: empStart,
        amount,
        description,
        category: "salaries",
        recurrence: "none",
        vendor: `${emp.firstName} ${emp.lastName}`,
        reference: emp.id,
        note: null,
        accountId: null,
        supplierId: null,
        organizationId: session.organizationId,
        createdById: null,
        createdAt: empStart,
        updatedAt: empStart,
        createdBy: null,
        account: null,
        supplier: null,
      });
    }
  }

  // 4. Supplier bill payments — show each payment as a separate expense entry
  const billRows: StoredExpense[] = [];
  if (!category || category === "supplier_bill") {
    const billPayments = await prisma.supplierBillPayment.findMany({
      where: {
        organizationId: session.organizationId,
        date: { gte: fromDate, lte: toDate },
        bill: { billType: "expense" },
      },
      include: {
        bill: {
          include: { supplier: { select: { id: true, name: true } } },
        },
      },
    });

    for (const payment of billPayments) {
      billRows.push({
        id: `bill-payment-${payment.id}`,
        date: new Date(payment.date),
        amount: payment.amount,
        description: `Payment — ${payment.bill.supplier.name}: ${payment.bill.description}`,
        category: "supplier_bill",
        recurrence: "none",
        vendor: payment.bill.supplier.name,
        reference: payment.bill.reference,
        note: payment.note,
        accountId: null,
        supplierId: payment.bill.supplierId,
        organizationId: session.organizationId,
        createdById: null,
        createdAt: new Date(payment.bill.createdAt),
        updatedAt: new Date(payment.bill.updatedAt),
        createdBy: null,
        account: null,
        supplier: payment.bill.supplier,
      });
    }
  }

  return NextResponse.json([...salaryRows, ...billRows, ...recurringRows, ...storedExpenses]);
}

export async function POST(req: NextRequest) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "expenses")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const data = await req.json();
  const expense = await prisma.expense.create({
    data: {
      date: new Date(data.date),
      amount: parseFloat(data.amount),
      description: data.description,
      category: data.category,
      recurrence: data.recurrence || "none",
      vendor: data.vendor || null,
      reference: data.reference || null,
      note: data.note || null,
      accountId: data.accountId || null,
      supplierId: data.supplierId || null,
      organizationId: session.organizationId,
      createdById: session.userId,
    },
    include: { createdBy: { select: { name: true } }, account: { select: { name: true, code: true } }, supplier: { select: { id: true, name: true } } },
  });

  await logAudit({
    session,
    action: "create",
    entity: "expense",
    entityId: expense.id,
    description: `Recorded expense: ${expense.description} - ${expense.amount}`,
  });

  return NextResponse.json(expense, { status: 201 });
}
