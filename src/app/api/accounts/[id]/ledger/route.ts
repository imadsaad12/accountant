import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
import { canView } from "@/lib/permissions";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canView(session.permissions, "accounts")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const account = await prisma.account.findFirst({
    where: { id, organizationId: session.organizationId },
    select: { id: true, code: true, name: true, type: true },
  });
  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const dateFilter: Record<string, unknown> = {};
  if (from) dateFilter.gte = new Date(from);
  if (to) dateFilter.lte = new Date(to + "T23:59:59Z");

  const lines = await prisma.journalLine.findMany({
    where: {
      accountId: id,
      journalEntry: {
        organizationId: session.organizationId,
        ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}),
      },
    },
    include: {
      journalEntry: { select: { id: true, date: true, description: true, type: true, reference: true } },
    },
    orderBy: { journalEntry: { date: "asc" } },
  });

  // Compute running balance
  const isDebitNormal = account.type === "asset" || account.type === "expense";
  let runningBalance = 0;
  const entries = lines.map((line) => {
    runningBalance += isDebitNormal ? line.debit - line.credit : line.credit - line.debit;
    return {
      id: line.id,
      date: line.journalEntry.date,
      description: line.journalEntry.description,
      type: line.journalEntry.type,
      reference: line.journalEntry.reference,
      debit: line.debit,
      credit: line.credit,
      balance: runningBalance,
    };
  });

  return NextResponse.json({ account, entries });
}
