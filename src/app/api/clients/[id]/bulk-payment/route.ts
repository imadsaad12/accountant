import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canEdit } from "@/lib/permissions";

const round2 = (n: number) => parseFloat((n || 0).toFixed(2));

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "invoices")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { id: clientId } = await params;
  const body = await req.json();
  const { date, method, reference, note } = body;
  const amount = round2(Number(body.amount));

  if (!amount || amount <= 0) return NextResponse.json({ error: "Amount must be greater than 0" }, { status: 400 });

  const client = await prisma.client.findFirst({
    where: { id: clientId, organizationId: session.organizationId },
  });
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const paymentDate = date ? new Date(date) : new Date();

  // Distribute the whole payment ATOMICALLY so concurrent bulk payments cannot
  // over-apply to the same invoices or corrupt pendingBalance/balance. Balances
  // are re-read inside the transaction.
  const { paymentsCreated, remaining, totalApplied, clientPayment } = await prisma.$transaction(async (tx) => {
    // Re-read unpaid/partially-paid invoices inside the transaction, oldest first (FIFO)
    const invoices = await tx.invoice.findMany({
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

      const paid = round2(inv.payments.reduce((s, p) => s + p.amount, 0));
      const balance = round2(inv.total - paid);
      if (balance <= 0) continue;

      const paymentAmount = round2(Math.min(remaining, balance));
      const newPaid = round2(paid + paymentAmount);
      const newStatus = newPaid >= round2(inv.total) ? "paid" : "partially_paid";

      await tx.payment.create({
        data: {
          invoiceId: inv.id,
          amount: paymentAmount,
          date: paymentDate,
          method: method || "cash",
          reference: reference || null,
          note: note || null,
          organizationId: session.organizationId,
        },
      });

      await tx.invoice.update({ where: { id: inv.id }, data: { status: newStatus } });

      paymentsCreated.push({ invoiceId: inv.id, invoiceNumber: inv.number, amount: paymentAmount, newStatus });
      remaining = round2(remaining - paymentAmount);
    }

    // Re-read the client inside the transaction for an up-to-date pendingBalance
    const freshClient = await tx.client.findUnique({ where: { id: clientId }, select: { pendingBalance: true } });

    // After invoices, apply remaining to pendingBalance, then to credit balance
    let appliedToPending = 0;
    if (remaining > 0 && (freshClient?.pendingBalance ?? 0) > 0) {
      appliedToPending = round2(Math.min(remaining, freshClient!.pendingBalance));
      remaining = round2(remaining - appliedToPending);
    }

    const totalApplied = round2(amount - remaining);

    const clientUpdate: { pendingBalance?: { decrement: number }; balance?: { increment: number } } = {};
    if (appliedToPending > 0) clientUpdate.pendingBalance = { decrement: appliedToPending };
    if (remaining > 0) clientUpdate.balance = { increment: remaining };
    if (Object.keys(clientUpdate).length > 0) {
      await tx.client.update({ where: { id: clientId }, data: clientUpdate });
    }

    const clientPayment = await tx.clientPayment.create({
      data: {
        clientId,
        amount,
        applied: totalApplied,
        date: paymentDate,
        method: method || "cash",
        reference: reference || null,
        note: note || null,
        invoicesSummary: JSON.stringify(paymentsCreated),
        organizationId: session.organizationId,
      },
    });

    return { paymentsCreated, remaining, totalApplied, clientPayment };
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
