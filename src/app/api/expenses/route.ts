import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canView, canEdit } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canView(session.permissions, "expenses")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const category = searchParams.get("category");

  const where: Record<string, unknown> = { organizationId: session.organizationId };
  if (from || to) {
    where.date = {};
    if (from) (where.date as Record<string, unknown>).gte = new Date(from);
    if (to) (where.date as Record<string, unknown>).lte = new Date(to);
  }
  if (category) where.category = category;

  const expenses = await prisma.expense.findMany({
    where,
    orderBy: { date: "desc" },
    include: { createdBy: { select: { name: true } }, account: { select: { name: true, code: true } } },
  });
  return NextResponse.json(expenses);
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
