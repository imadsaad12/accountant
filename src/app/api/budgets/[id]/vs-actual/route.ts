import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
import { canView } from "@/lib/permissions";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canView(session.permissions, "budgets")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { id } = await params;
  const budget = await prisma.budget.findFirst({
    where: { id, organizationId: session.organizationId },
    include: {
      lines: {
        include: { account: { select: { id: true, code: true, name: true, type: true } } },
      },
    },
  });

  if (!budget) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const year = budget.fiscalYear;
  const yearStart = new Date(`${year}-01-01T00:00:00Z`);
  const yearEnd = new Date(`${year}-12-31T23:59:59Z`);

  // Get all journal lines for accounts in this budget within the fiscal year
  const accountIds = budget.lines.map((l) => l.accountId);

  const journalLines = await prisma.journalLine.findMany({
    where: {
      accountId: { in: accountIds },
      journalEntry: {
        organizationId: session.organizationId,
        date: { gte: yearStart, lte: yearEnd },
      },
    },
    include: {
      journalEntry: { select: { date: true } },
    },
  });

  // Build actual amounts per account per month
  const actuals: Record<string, Record<number, number>> = {};
  for (const jl of journalLines) {
    const accId = jl.accountId;
    const month = jl.journalEntry.date.getMonth() + 1; // 1-12
    if (!actuals[accId]) actuals[accId] = {};
    if (!actuals[accId][month]) actuals[accId][month] = 0;

    // For expense/asset accounts (debit-normal): actual = debit - credit
    // For revenue/liability/equity accounts (credit-normal): actual = credit - debit
    // Budget amounts are always positive representing the planned amount
    // We compare absolute actual spending/earning vs budget
    actuals[accId][month] += Math.abs(jl.debit - jl.credit);
  }

  // Build comparison rows
  const rows = budget.lines.map((line) => {
    const monthData: { month: number; budgeted: number; actual: number; variance: number; variancePct: number }[] = [];
    let totalBudgeted = 0;
    let totalActual = 0;

    for (let m = 1; m <= 12; m++) {
      const budgeted = (line as unknown as Record<string, number>)[`month${m}`] || 0;
      const actual = actuals[line.accountId]?.[m] || 0;
      const variance = budgeted - actual;
      const variancePct = budgeted > 0 ? ((variance / budgeted) * 100) : (actual > 0 ? -100 : 0);

      totalBudgeted += budgeted;
      totalActual += actual;
      monthData.push({ month: m, budgeted, actual, variance, variancePct });
    }

    return {
      accountId: line.accountId,
      accountCode: line.account.code,
      accountName: line.account.name,
      accountType: line.account.type,
      months: monthData,
      totalBudgeted,
      totalActual,
      totalVariance: totalBudgeted - totalActual,
      totalVariancePct: totalBudgeted > 0 ? (((totalBudgeted - totalActual) / totalBudgeted) * 100) : (totalActual > 0 ? -100 : 0),
    };
  });

  // Sort by account code
  rows.sort((a, b) => a.accountCode.localeCompare(b.accountCode));

  // Grand totals
  const grandBudgeted = rows.reduce((s, r) => s + r.totalBudgeted, 0);
  const grandActual = rows.reduce((s, r) => s + r.totalActual, 0);

  return NextResponse.json({
    budget: { id: budget.id, name: budget.name, fiscalYear: budget.fiscalYear },
    rows,
    grandBudgeted,
    grandActual,
    grandVariance: grandBudgeted - grandActual,
    grandVariancePct: grandBudgeted > 0 ? (((grandBudgeted - grandActual) / grandBudgeted) * 100) : 0,
  });
}
