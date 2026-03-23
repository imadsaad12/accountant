import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canView, canEdit } from "@/lib/permissions";

// Shared helper: compute calendar-accurate months between two UTC dates
function calcMonths(start: Date, end: Date): number {
  const startDay = start.getUTCDate();
  const endDay   = end.getUTCDate();
  const lastDayOfEndMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  if (startDay === 1 && endDay === lastDayOfEndMonth) {
    return (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth()) + 1;
  }
  const days = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return parseFloat((days / 30).toFixed(2));
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
    include: { createdBy: { select: { name: true } }, account: { select: { name: true, code: true } } },
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
    include: { createdBy: { select: { name: true } }, account: { select: { name: true, code: true } } },
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
    let description = exp.description;

    if (exp.recurrence === "day") {
      computedAmount = parseFloat((rate * days).toFixed(2));
      description = `${exp.description} (${rate}/day × ${days} days)`;
    } else if (exp.recurrence === "week") {
      const weeks = parseFloat((days / 7).toFixed(2));
      computedAmount = parseFloat((rate * weeks).toFixed(2));
      description = `${exp.description} (${rate}/week × ${weeks} weeks)`;
    } else if (exp.recurrence === "month") {
      const months = calcMonths(effectiveStart, toDate);
      computedAmount = parseFloat((rate * months).toFixed(2));
      description = `${exp.description} (${rate}/month × ${months} month${months === 1 ? "" : "s"})`;
    } else if (exp.recurrence === "year") {
      // Use same boundary logic: Jan 1 → Dec 31 = exactly 1 year
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
      description = `${exp.description} (${rate}/year × ${years} year${years === 1 ? "" : "s"})`;
    }

    recurringRows.push({ ...exp, date: effectiveStart, amount: computedAmount, description });
  }

  // 3. Salary rows — dynamically computed from employees
  const salaryRows: StoredExpense[] = [];
  if (!category || category === "salaries") {
    const employees = await prisma.employee.findMany({
      where: {
        organizationId: session.organizationId,
        hireDate: { lte: toDate },
      },
    });

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
        const weeks = parseFloat((days / 7).toFixed(2));
        amount = parseFloat((rate * weeks).toFixed(2));
        description = `Salary — ${emp.firstName} ${emp.lastName} (${rate}/week × ${weeks} weeks)`;
      } else {
        const months = calcMonths(empStart, toDate);
        amount = parseFloat((rate * months).toFixed(2));
        description = `Salary — ${emp.firstName} ${emp.lastName} (${rate}/month × ${months} month${months === 1 ? "" : "s"})`;
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
        organizationId: session.organizationId,
        createdById: null,
        createdAt: empStart,
        updatedAt: empStart,
        createdBy: null,
        account: null,
      });
    }
  }

  return NextResponse.json([...salaryRows, ...recurringRows, ...storedExpenses]);
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
      organizationId: session.organizationId,
      createdById: session.userId,
    },
    include: { createdBy: { select: { name: true } }, account: { select: { name: true, code: true } } },
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
