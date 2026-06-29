import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canView, canEdit } from "@/lib/permissions";
import { journalSupplierBillPayment } from "@/lib/auto-journal";

export async function GET(req: NextRequest) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canView(session.permissions, "suppliers")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const supplierId = searchParams.get("supplierId");

  const where: Record<string, unknown> = { organizationId: session.organizationId };
  if (supplierId) where.supplierId = supplierId;

  const bills = await prisma.supplierBill.findMany({
    where,
    orderBy: { date: "desc" },
    include: { supplier: { select: { id: true, name: true } }, payments: { orderBy: { date: "asc" } } },
  });
  return NextResponse.json(bills);
}

export async function POST(req: NextRequest) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "suppliers")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const data = await req.json();
  const amount = parseFloat(data.amount);
  const status = data.status || "pending";
  // When a bill is created already marked "paid", fully settle it: set amountPaid
  // and record a real payment (so remaining = 0 and reports/Cash Out reflect it).
  const isPaid = status === "paid" && amount > 0;
  const billDate = new Date(data.date);
  const billType = data.billType || "stock";

  // Stock bills can be tied to a product: receiving the bill restocks that product.
  const qty = parseFloat(data.quantity);
  let stockProduct: { id: string; name: string } | null = null;
  if (billType === "stock" && data.productId && qty > 0) {
    stockProduct = await prisma.product.findFirst({
      where: { id: data.productId, organizationId: session.organizationId },
      select: { id: true, name: true },
    });
    if (!stockProduct) return NextResponse.json({ error: "Selected product not found" }, { status: 400 });
  }

  const { bill, payment } = await prisma.$transaction(async (tx) => {
    const bill = await tx.supplierBill.create({
      data: {
        supplierId: data.supplierId,
        amount,
        amountPaid: isPaid ? amount : 0,
        billType,
        description: data.description,
        productId: stockProduct ? stockProduct.id : null,
        quantity: stockProduct ? qty : 0,
        reference: data.reference || null,
        date: billDate,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        status,
        note: data.note || null,
        organizationId: session.organizationId,
      },
      include: { supplier: { select: { id: true, name: true } } },
    });
    // Restock: increase the product's on-hand quantity by the units received.
    if (stockProduct) {
      await tx.product.update({ where: { id: stockProduct.id }, data: { quantity: { increment: qty } } });
    }
    let payment = null;
    if (isPaid) {
      payment = await tx.supplierBillPayment.create({
        data: {
          billId: bill.id,
          amount,
          date: billDate,
          method: data.method || "cash",
          note: data.note || null,
          organizationId: session.organizationId,
        },
      });
    }
    return { bill, payment };
  }, { maxWait: 10000, timeout: 20000 });

  if (payment) {
    // Auto-journal: Debit Accounts Payable, Credit Cash
    await journalSupplierBillPayment({
      organizationId: session.organizationId,
      paymentId: payment.id,
      amount,
      date: billDate,
      supplierName: bill.supplier.name,
      billReference: bill.reference || undefined,
    });
  }

  await logAudit({ session, action: "create", entity: "supplier_bill", entityId: bill.id, description: `Added bill "${bill.description}" for supplier${stockProduct ? ` (restocked ${qty} × ${stockProduct.name})` : ""}${isPaid ? ` (paid ${amount})` : ""}` });
  return NextResponse.json(bill, { status: 201 });
}
