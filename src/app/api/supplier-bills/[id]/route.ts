import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canView, canEdit } from "@/lib/permissions";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "suppliers")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.supplierBill.findFirst({ where: { id, organizationId: session.organizationId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data = await req.json();
  const bill = await prisma.supplierBill.update({
    where: { id },
    data: {
      amount: parseFloat(data.amount),
      description: data.description,
      reference: data.reference || null,
      date: new Date(data.date),
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      status: data.status || "pending",
      note: data.note || null,
    },
  });

  await logAudit({ session, action: "update", entity: "supplier_bill", entityId: bill.id, description: `Updated bill "${bill.description}"` });
  return NextResponse.json(bill);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "suppliers")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { id } = await params;
  const bill = await prisma.supplierBill.findFirst({ where: { id, organizationId: session.organizationId } });
  if (!bill) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.supplierBill.delete({ where: { id } });
  await logAudit({ session, action: "delete", entity: "supplier_bill", entityId: id, description: `Deleted bill "${bill.description}"` });
  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "suppliers")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.supplierBill.findFirst({ where: { id, organizationId: session.organizationId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { status } = await req.json();
  const bill = await prisma.supplierBill.update({ where: { id }, data: { status } });
  await logAudit({ session, action: "update", entity: "supplier_bill", entityId: id, description: `Marked bill as ${status}` });
  return NextResponse.json(bill);
}

// Also need a GET for stats
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canView(session.permissions, "suppliers")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { id } = await params;
  const bill = await prisma.supplierBill.findFirst({ where: { id, organizationId: session.organizationId } });
  if (!bill) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(bill);
}
