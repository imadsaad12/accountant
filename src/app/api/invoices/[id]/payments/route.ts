import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canEdit, canView } from "@/lib/permissions";
import { journalInvoicePayment, deleteJournalEntriesBySource } from "@/lib/auto-journal";

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
  const totalPaidSoFar = invoice.payments.reduce((s, p) => s + p.amount, 0);
  const remaining = parseFloat((invoice.total - totalPaidSoFar).toFixed(2));
  const requestedAmount = parseFloat(data.amount);
  if (requestedAmount <= 0) {
    return NextResponse.json({ error: "Payment amount must be greater than 0" }, { status: 400 });
  }

  // Cap the payment record at the remaining invoice balance; excess goes to client balance
  const appliedToInvoice = Math.min(requestedAmount, Math.max(remaining, 0));
  const excessAmount = parseFloat((requestedAmount - appliedToInvoice).toFixed(2));

  const payment = await prisma.payment.create({
    data: {
      invoiceId: id,
      amount: appliedToInvoice,
      date: data.date ? new Date(data.date) : new Date(),
      method: data.method || "cash",
      reference: data.reference || null,
      note: data.note || null,
      organizationId: session.organizationId,
    },
  });

  const totalPaid = totalPaidSoFar + appliedToInvoice;
  if (totalPaid >= invoice.total) {
    await prisma.invoice.update({ where: { id }, data: { status: "paid" } });
  } else if (totalPaid > 0) {
    await prisma.invoice.update({ where: { id }, data: { status: "partially_paid" } });
  }

  // Auto-journal: Debit Cash, Credit Accounts Receivable
  await journalInvoicePayment({
    organizationId: session.organizationId,
    paymentId: payment.id,
    amount: appliedToInvoice,
    date: payment.date,
    invoiceNumber: invoice.number,
  });

  // Add excess to client balance
  if (excessAmount > 0) {
    await prisma.client.update({
      where: { id: invoice.clientId },
      data: { balance: { increment: excessAmount } },
    });
  }

  await logAudit({
    session,
    action: "create",
    entity: "payment",
    entityId: payment.id,
    description: `Recorded payment of ${requestedAmount} for invoice ${invoice.number}${excessAmount > 0 ? ` (${excessAmount} added to client balance)` : ""}`,
  });

  return NextResponse.json({ ...payment, excessAmount }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "invoices")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const paymentId = searchParams.get("paymentId");
  if (!paymentId) return NextResponse.json({ error: "paymentId required" }, { status: 400 });

  await deleteJournalEntriesBySource(paymentId);
  await prisma.payment.deleteMany({ where: { id: paymentId, organizationId: session.organizationId } });

  // Recalculate invoice status after payment deletion
  const invoice = await prisma.invoice.findFirst({
    where: { id, organizationId: session.organizationId },
    include: { payments: true },
  });
  if (invoice) {
    const totalPaid = invoice.payments.reduce((s, p) => s + p.amount, 0);
    let newStatus: string;
    if (totalPaid >= invoice.total) {
      newStatus = "paid";
    } else if (totalPaid > 0) {
      newStatus = "partially_paid";
    } else {
      // No payments left — revert to sent if it was paid/partially_paid
      newStatus = invoice.status === "paid" || invoice.status === "partially_paid" ? "sent" : invoice.status;
    }
    if (newStatus !== invoice.status) {
      await prisma.invoice.update({ where: { id }, data: { status: newStatus } });
    }
  }

  return NextResponse.json({ ok: true });
}
