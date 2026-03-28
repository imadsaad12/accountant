import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canEdit } from "@/lib/permissions";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "suppliers")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { id } = await params;
  const payment = await prisma.supplierBillPayment.findFirst({
    where: { id, organizationId: session.organizationId },
  });
  if (!payment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Recalculate amountPaid after removing this payment
  const otherPayments = await prisma.supplierBillPayment.findMany({
    where: { billId: payment.billId, organizationId: session.organizationId, id: { not: id } },
  });
  const newAmountPaid = otherPayments.reduce((s, p) => s + p.amount, 0);
  const bill = await prisma.supplierBill.findFirst({ where: { id: payment.billId } });
  const newStatus = newAmountPaid <= 0 ? "pending" : newAmountPaid >= (bill?.amount ?? 0) - 0.01 ? "paid" : "partially_paid";

  await prisma.$transaction([
    prisma.supplierBillPayment.delete({ where: { id } }),
    prisma.supplierBill.update({
      where: { id: payment.billId },
      data: { amountPaid: newAmountPaid, status: newStatus },
    }),
  ]);

  const updatedBill = await prisma.supplierBill.findFirst({
    where: { id: payment.billId },
    include: { payments: { orderBy: { date: "asc" } } },
  });

  await logAudit({ session, action: "delete", entity: "supplier_bill_payment", entityId: id, description: `Deleted payment of ${payment.amount} from bill` });
  return NextResponse.json(updatedBill);
}
