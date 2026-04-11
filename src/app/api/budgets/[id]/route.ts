import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
import { canView, canEdit } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

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
        orderBy: { account: { code: "asc" } },
      },
    },
  });

  if (!budget) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(budget);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "budgets")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.budget.findFirst({
    where: { id, organizationId: session.organizationId },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data = await req.json();
  const { name, fiscalYear, status, lines } = data;

  // Update budget metadata
  const budget = await prisma.budget.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(fiscalYear !== undefined && { fiscalYear: parseInt(fiscalYear) }),
      ...(status !== undefined && { status }),
    },
  });

  // If lines provided, upsert them
  if (lines && Array.isArray(lines)) {
    for (const line of lines) {
      await prisma.budgetLine.upsert({
        where: {
          budgetId_accountId: { budgetId: id, accountId: line.accountId },
        },
        update: {
          month1: line.month1 ?? 0, month2: line.month2 ?? 0, month3: line.month3 ?? 0,
          month4: line.month4 ?? 0, month5: line.month5 ?? 0, month6: line.month6 ?? 0,
          month7: line.month7 ?? 0, month8: line.month8 ?? 0, month9: line.month9 ?? 0,
          month10: line.month10 ?? 0, month11: line.month11 ?? 0, month12: line.month12 ?? 0,
        },
        create: {
          budgetId: id,
          accountId: line.accountId,
          month1: line.month1 ?? 0, month2: line.month2 ?? 0, month3: line.month3 ?? 0,
          month4: line.month4 ?? 0, month5: line.month5 ?? 0, month6: line.month6 ?? 0,
          month7: line.month7 ?? 0, month8: line.month8 ?? 0, month9: line.month9 ?? 0,
          month10: line.month10 ?? 0, month11: line.month11 ?? 0, month12: line.month12 ?? 0,
        },
      });
    }
  }

  // Return full budget with lines
  const full = await prisma.budget.findUnique({
    where: { id },
    include: {
      lines: {
        include: { account: { select: { id: true, code: true, name: true, type: true } } },
        orderBy: { account: { code: "asc" } },
      },
    },
  });

  await logAudit({
    session,
    action: "update",
    entity: "budget",
    entityId: id,
    description: `Updated budget "${budget.name}"`,
  });

  return NextResponse.json(full);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "budgets")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.budget.findFirst({
    where: { id, organizationId: session.organizationId },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.budget.delete({ where: { id } });

  await logAudit({
    session,
    action: "delete",
    entity: "budget",
    entityId: id,
    description: `Deleted budget "${existing.name}" (${existing.fiscalYear})`,
  });

  return NextResponse.json({ ok: true });
}
