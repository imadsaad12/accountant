import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canEdit, canView } from "@/lib/permissions";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canView(session.permissions, "invoices")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { id } = await params;
  const payments = await prisma.payment.findMany({
    where: { invoiceId: id, organizationId: session.organizationId },
    orderBy: { date: "desc" },
  });
  return NextResponse.json(payments);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "invoices")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { id } = await params;
  const invoice = await prisma.invoice.findFirst({
    where: { id, organizationId: session.organizationId },
    include: { payments: true },
  });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data = await req.json();
  const payment = await prisma.payment.create({
    data: {
      invoiceId: id,
      amount: parseFloat(data.amount),
      date: data.date ? new Date(data.date) : new Date(),
      method: data.method || "cash",
      reference: data.reference || null,
      note: data.note || null,
      organizationId: session.organizationId,
    },
  });

  const totalPaid = invoice.payments.reduce((s, p) => s + p.amount, 0) + payment.amount;
  if (totalPaid >= invoice.total) {
    await prisma.invoice.update({ where: { id }, data: { status: "paid" } });
  } else if (totalPaid > 0) {
    await prisma.invoice.update({ where: { id }, data: { status: "partially_paid" } });
  }

  await logAudit({
    session,
    action: "create",
    entity: "payment",
    entityId: payment.id,
    description: `Recorded payment of ${payment.amount} for invoice ${invoice.number}`,
  });

  return NextResponse.json(payment, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "invoices")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  await params; // consumed
  const { searchParams } = new URL(req.url);
  const paymentId = searchParams.get("paymentId");
  if (!paymentId) return NextResponse.json({ error: "paymentId required" }, { status: 400 });

  await prisma.payment.deleteMany({ where: { id: paymentId, organizationId: session.organizationId } });
  return NextResponse.json({ ok: true });
}
