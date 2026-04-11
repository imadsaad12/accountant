import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
import { canView } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canView(session.permissions, "accounts")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const asOf = searchParams.get("asOf");

  const dateFilter = asOf ? { date: { lte: new Date(asOf + "T23:59:59Z") } } : {};

  const accounts = await prisma.account.findMany({
    where: { organizationId: session.organizationId },
    orderBy: { code: "asc" },
    include: {
      journalLines: {
        where: {
          journalEntry: { organizationId: session.organizationId, ...dateFilter },
        },
        select: { debit: true, credit: true },
      },
    },
  });

  // Compute balance for each account
  const withBalance = accounts.map((acc) => {
    const totalDebit = acc.journalLines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = acc.journalLines.reduce((s, l) => s + l.credit, 0);
    const isDebitNormal = acc.type === "asset" || acc.type === "expense";
    const balance = isDebitNormal ? totalDebit - totalCredit : totalCredit - totalDebit;
    return { id: acc.id, code: acc.code, name: acc.name, type: acc.type, balance };
  });

  // Group by type
  const assets = withBalance.filter((a) => a.type === "asset" && a.balance !== 0);
  const liabilities = withBalance.filter((a) => a.type === "liability" && a.balance !== 0);
  const equityAccounts = withBalance.filter((a) => a.type === "equity" && a.balance !== 0);
  const revenueAccounts = withBalance.filter((a) => a.type === "revenue");
  const expenseAccounts = withBalance.filter((a) => a.type === "expense");

  const totalAssets = assets.reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = liabilities.reduce((s, a) => s + a.balance, 0);
  const totalEquityAccounts = equityAccounts.reduce((s, a) => s + a.balance, 0);

  // Retained earnings = total revenue - total expenses
  const totalRevenue = revenueAccounts.reduce((s, a) => s + a.balance, 0);
  const totalExpenses = expenseAccounts.reduce((s, a) => s + a.balance, 0);
  const retainedEarnings = totalRevenue - totalExpenses;

  const totalEquity = totalEquityAccounts + retainedEarnings;
  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;

  return NextResponse.json({
    assets,
    liabilities,
    equityAccounts,
    retainedEarnings,
    totalAssets,
    totalLiabilities,
    totalEquityAccounts,
    totalEquity,
    totalLiabilitiesAndEquity,
    isBalanced: Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.01,
  });
}
