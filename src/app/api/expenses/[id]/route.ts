import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canView, canEdit } from "@/lib/permissions";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canView(session.permissions, "expenses")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { id } = await params;
  const expense = await prisma.expense.findFirst({
    where: { id, organizationId: session.organizationId },
    include: { createdBy: { select: { name: true } }, account: { select: { name: true, code: true } }, supplier: { select: { id: true, name: true } } },
  });
  if (!expense) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(expense);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "expenses")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { id } = await params;
  const data = await req.json();
  await prisma.expense.updateMany({
    where: { id, organizationId: session.organizationId },
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
    },
  });

  await logAudit({ session, action: "update", entity: "expense", entityId: id, description: `Updated expense: ${data.description}` });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "expenses")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { id } = await params;
  await prisma.expense.deleteMany({ where: { id, organizationId: session.organizationId } });
  await logAudit({ session, action: "delete", entity: "expense", entityId: id, description: `Deleted expense` });
  return NextResponse.json({ ok: true });
}
