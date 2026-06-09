import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canView, canEdit } from "@/lib/permissions";
import { journalSupplierBillPayment } from "@/lib/auto-journal";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canView(session.permissions, "suppliers")) return NextResponse.json({ error: "No permission" }, { status: 403 });
  const { id } = await params;
  const bill = await prisma.supplierBill.findFirst({ where: { id, organizationId: session.organizationId } });
  if (!bill) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(bill);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "suppliers")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.supplierBill.findFirst({ where: { id, organizationId: session.organizationId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data = await req.json();
  const newAmount = parseFloat(data.amount);
  // If bill amount changes, adjust amountPaid to not exceed new amount
  const amountPaid = Math.min(existing.amountPaid, newAmount);
  const status = amountPaid >= newAmount ? "paid" : amountPaid > 0 ? "partially_paid" : "pending";

  const bill = await prisma.supplierBill.update({
    where: { id },
    data: {
      amount: newAmount,
      billType: data.billType || existing.billType || "stock",
      description: data.description,
      reference: data.reference || null,
      date: new Date(data.date),
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      status,
      amountPaid,
      note: data.note || null,
    },
  });

  await logAudit({ session, action: "update", entity: "supplier_bill", entityId: bill.id, description: `Updated bill "${bill.description}"` });
  return NextResponse.json(bill);
}

// PATCH: record a payment against the bill
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "suppliers")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.supplierBill.findFirst({ where: { id, organizationId: session.organizationId }, include: { supplier: { select: { name: true } } } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();

  // Record payment action
  if (body.action === "pay") {
    const payAmount = parseFloat(body.amount ?? 0);
    if (isNaN(payAmount) || payAmount <= 0) return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    const remaining = existing.amount - existing.amountPaid;
    if (payAmount > remaining + 0.01) return NextResponse.json({ error: `Amount exceeds remaining balance of ${remaining.toFixed(2)}` }, { status: 400 });
    const newAmountPaid = Math.min(existing.amountPaid + payAmount, existing.amount);
    const newStatus = newAmountPaid >= existing.amount - 0.01 ? "paid" : "partially_paid";
    const payDate = body.date ? new Date(body.date + "T12:00:00Z") : new Date();
    const [bill, payment] = await prisma.$transaction([
      prisma.supplierBill.update({
        where: { id },
        data: { amountPaid: newAmountPaid, status: newStatus },
      }),
      prisma.supplierBillPayment.create({
        data: {
          billId: id,
          amount: payAmount,
          date: payDate,
          method: body.method || "cash",
          note: body.note || null,
          organizationId: session.organizationId,
        },
      }),
    ]);

    // Auto-journal: Debit Accounts Payable, Credit Cash
    await journalSupplierBillPayment({
      organizationId: session.organizationId,
      paymentId: payment.id,
      amount: payAmount,
      date: payDate,
      supplierName: existing.supplier.name,
      billReference: existing.reference || undefined,
    });

    await logAudit({ session, action: "update", entity: "supplier_bill", entityId: id, description: `Recorded payment of ${payAmount} on ${payDate.toISOString().split("T")[0]} for bill "${existing.description}"` });
    const updatedBill = await prisma.supplierBill.findFirst({ where: { id }, include: { payments: { orderBy: { date: "asc" } } } });
    return NextResponse.json(updatedBill);
  }

  // Reset payments action
  if (body.action === "reset") {
    const bill = await prisma.supplierBill.update({ where: { id }, data: { amountPaid: 0, status: "pending" } });
    await logAudit({ session, action: "update", entity: "supplier_bill", entityId: id, description: `Reset payments for bill "${existing.description}"` });
    return NextResponse.json(bill);
  }

  // Legacy: direct status toggle
  if (body.status) {
    const amountPaid = body.status === "paid" ? existing.amount : existing.amountPaid;
    const bill = await prisma.supplierBill.update({ where: { id }, data: { status: body.status, amountPaid } });
    await logAudit({ session, action: "update", entity: "supplier_bill", entityId: id, description: `Marked bill as ${body.status}` });
    return NextResponse.json(bill);
  }

  return NextResponse.json({ error: "No action specified" }, { status: 400 });
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
