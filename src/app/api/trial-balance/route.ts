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

  let totalDebit = 0;
  let totalCredit = 0;

  const rows = accounts
    .map((acc) => {
      const sumDebit = acc.journalLines.reduce((s, l) => s + l.debit, 0);
      const sumCredit = acc.journalLines.reduce((s, l) => s + l.credit, 0);
      const net = sumDebit - sumCredit;

      // Trial balance shows each account on one side only
      const isDebitNormal = acc.type === "asset" || acc.type === "expense";
      let debitBalance = 0;
      let creditBalance = 0;

      if (isDebitNormal) {
        if (net >= 0) debitBalance = net;
        else creditBalance = Math.abs(net);
      } else {
        if (net <= 0) creditBalance = Math.abs(net);
        else debitBalance = net;
      }

      return {
        id: acc.id,
        code: acc.code,
        name: acc.name,
        type: acc.type,
        debitBalance,
        creditBalance,
      };
    })
    .filter((r) => r.debitBalance !== 0 || r.creditBalance !== 0);

  rows.forEach((r) => {
    totalDebit += r.debitBalance;
    totalCredit += r.creditBalance;
  });

  return NextResponse.json({
    rows,
    totalDebit,
    totalCredit,
    isBalanced: Math.abs(totalDebit - totalCredit) < 0.01,
  });
}
