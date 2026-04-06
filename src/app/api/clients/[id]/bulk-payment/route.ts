import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canEdit } from "@/lib/permissions";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "invoices")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { id: clientId } = await params;
  const { amount, date, method, reference, note } = await req.json();

  if (!amount || amount <= 0) return NextResponse.json({ error: "Amount must be greater than 0" }, { status: 400 });

  const client = await prisma.client.findFirst({
    where: { id: clientId, organizationId: session.organizationId },
  });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  // Fetch all unpaid/partially-paid invoices for this client, oldest first
  const invoices = await prisma.invoice.findMany({
    where: {
      clientId,
      organizationId: session.organizationId,
      status: { in: ["sent", "overdue", "partially_paid"] },
    },
    include: { payments: { select: { amount: true } } },
    orderBy: { date: "asc" },
  });

  let remaining = amount;
  const paymentsCreated: { invoiceId: string; invoiceNumber: string; amount: number; newStatus: string }[] = [];

  for (const inv of invoices) {
    if (remaining <= 0) break;

    const paid = inv.payments.reduce((s, p) => s + p.amount, 0);
    const balance = parseFloat((inv.total - paid).toFixed(2));
    if (balance <= 0) continue;

    const paymentAmount = parseFloat(Math.min(remaining, balance).toFixed(2));
    const newPaid = parseFloat((paid + paymentAmount).toFixed(2));
    const newStatus = newPaid >= inv.total - 0.001 ? "paid" : "partially_paid";

    await prisma.payment.create({
      data: {
        invoiceId: inv.id,
        amount: paymentAmount,
        date: date ? new Date(date) : new Date(),
        method: method || "cash",
        reference: reference || null,
        note: note || null,
        organizationId: session.organizationId,
      },
    });

    await prisma.invoice.update({
      where: { id: inv.id },
      data: { status: newStatus },
    });

    paymentsCreated.push({ invoiceId: inv.id, invoiceNumber: inv.number, amount: paymentAmount, newStatus });
    remaining = parseFloat((remaining - paymentAmount).toFixed(2));
  }

  // After applying to invoices, apply remaining to pendingBalance
  let appliedToPending = 0;
  if (remaining > 0 && client.pendingBalance > 0) {
    appliedToPending = parseFloat(Math.min(remaining, client.pendingBalance).toFixed(2));
    remaining = parseFloat((remaining - appliedToPending).toFixed(2));
  }

  const totalApplied = parseFloat((amount - remaining).toFixed(2));

  // Update client: reduce pendingBalance and/or add excess to balance
  const clientUpdate: { pendingBalance?: { decrement: number }; balance?: { increment: number } } = {};
  if (appliedToPending > 0) {
    clientUpdate.pendingBalance = { decrement: appliedToPending };
  }
  if (remaining > 0) {
    clientUpdate.balance = { increment: remaining };
  }
  if (Object.keys(clientUpdate).length > 0) {
    await prisma.client.update({
      where: { id: clientId },
      data: clientUpdate,
    });
  }

  // Save payment history record
  const clientPayment = await prisma.clientPayment.create({
    data: {
      clientId,
      amount,
      applied: totalApplied,
      date: date ? new Date(date) : new Date(),
      method: method || "cash",
      reference: reference || null,
      note: note || null,
      invoicesSummary: JSON.stringify(paymentsCreated),
      organizationId: session.organizationId,
    },
  });

  await logAudit({
    session,
    action: "create",
    entity: "payment",
    entityId: clientPayment.id,
    description: `Bulk payment of ${totalApplied} applied to ${paymentsCreated.length} invoice(s) for client "${client.name}"${remaining > 0 ? `. ${remaining} added to client balance.` : ""}`,
  });

  return NextResponse.json({ id: clientPayment.id, applied: totalApplied, remaining, addedToBalance: remaining, payments: paymentsCreated });
}
