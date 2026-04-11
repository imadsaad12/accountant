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

  // Get all accounts with aggregated debit/credit from journal lines
  const accounts = await prisma.account.findMany({
    where: { organizationId: session.organizationId },
    orderBy: { code: "asc" },
    include: {
      children: { select: { id: true } },
      journalLines: {
        where: {
          journalEntry: { organizationId: session.organizationId, ...dateFilter },
        },
        select: { debit: true, credit: true },
      },
    },
  });

  const result = accounts.map((acc) => {
    const totalDebit = acc.journalLines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = acc.journalLines.reduce((s, l) => s + l.credit, 0);

    // Normal balance depends on account type:
    // Assets & Expenses: debit balance (debit - credit)
    // Liabilities, Equity, Revenue: credit balance (credit - debit)
    const isDebitNormal = acc.type === "asset" || acc.type === "expense";
    const balance = isDebitNormal ? totalDebit - totalCredit : totalCredit - totalDebit;

    return {
      id: acc.id,
      code: acc.code,
      name: acc.name,
      type: acc.type,
      subtype: acc.subtype,
      parentId: acc.parentId,
      isDefault: acc.isDefault,
      children: acc.children,
      totalDebit,
      totalCredit,
      balance,
    };
  });

  return NextResponse.json(result);
}
