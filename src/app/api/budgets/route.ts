import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
import { canView, canEdit } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canView(session.permissions, "budgets")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const year = searchParams.get("year");
  const status = searchParams.get("status");

  const where: Record<string, unknown> = { organizationId: session.organizationId };
  if (year) where.fiscalYear = parseInt(year);
  if (status) where.status = status;

  const budgets = await prisma.budget.findMany({
    where,
    orderBy: [{ fiscalYear: "desc" }, { name: "asc" }],
    include: {
      lines: {
        include: { account: { select: { id: true, code: true, name: true, type: true } } },
        orderBy: { account: { code: "asc" } },
      },
    },
  });

  return NextResponse.json(budgets);
}

export async function POST(req: NextRequest) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "budgets")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const data = await req.json();
  const { name, fiscalYear, lines, copyFromBudgetId } = data;

  if (!name || !fiscalYear) {
    return NextResponse.json({ error: "Name and fiscal year required" }, { status: 400 });
  }

  // If copying from another budget, load its lines
  let copyLines: { accountId: string; month1: number; month2: number; month3: number; month4: number; month5: number; month6: number; month7: number; month8: number; month9: number; month10: number; month11: number; month12: number }[] = [];
  if (copyFromBudgetId) {
    const source = await prisma.budget.findFirst({
      where: { id: copyFromBudgetId, organizationId: session.organizationId },
      include: { lines: true },
    });
    if (source) {
      copyLines = source.lines.map((l) => ({
        accountId: l.accountId,
        month1: l.month1, month2: l.month2, month3: l.month3, month4: l.month4,
        month5: l.month5, month6: l.month6, month7: l.month7, month8: l.month8,
        month9: l.month9, month10: l.month10, month11: l.month11, month12: l.month12,
      }));
    }
  }

  const linesToCreate = lines?.length > 0 ? lines : copyLines;

  const budget = await prisma.budget.create({
    data: {
      name,
      fiscalYear: parseInt(fiscalYear),
      organizationId: session.organizationId,
      lines: linesToCreate.length > 0
        ? { create: linesToCreate.map((l: { accountId: string; month1?: number; month2?: number; month3?: number; month4?: number; month5?: number; month6?: number; month7?: number; month8?: number; month9?: number; month10?: number; month11?: number; month12?: number }) => ({
            accountId: l.accountId,
            month1: l.month1 || 0, month2: l.month2 || 0, month3: l.month3 || 0,
            month4: l.month4 || 0, month5: l.month5 || 0, month6: l.month6 || 0,
            month7: l.month7 || 0, month8: l.month8 || 0, month9: l.month9 || 0,
            month10: l.month10 || 0, month11: l.month11 || 0, month12: l.month12 || 0,
          }))
        }
        : undefined,
    },
    include: {
      lines: {
        include: { account: { select: { id: true, code: true, name: true, type: true } } },
        orderBy: { account: { code: "asc" } },
      },
    },
  });

  await logAudit({
    session,
    action: "create",
    entity: "budget",
    entityId: budget.id,
    description: `Created budget "${name}" for ${fiscalYear}`,
  });

  return NextResponse.json(budget, { status: 201 });
}
