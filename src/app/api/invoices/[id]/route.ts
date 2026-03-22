import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
// import { generateInvoicePDF } from "@/lib/generate-invoice-pdf";
// import { sendInvoiceEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";
import { canView, canEdit } from "@/lib/permissions";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canView(session.permissions, "invoices")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { id } = await params;
  const [invoice, org] = await Promise.all([
    prisma.invoice.findFirst({
      where: { id, organizationId: session.organizationId },
      include: { client: true, items: { include: { product: true } } },
    }),
    prisma.organization.findUnique({ where: { id: session.organizationId }, select: { name: true } }),
  ]);
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ...invoice, orgName: org?.name ?? "" });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "invoices")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.invoice.findFirst({ where: { id, organizationId: session.organizationId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data = await req.json();
  const { items, ...invoiceData } = data;

  if (items) {
    await prisma.invoiceItem.deleteMany({ where: { invoiceId: id } });

    const subtotal = items.reduce((sum: number, item: { quantity: number; unitPrice: number }) => sum + item.quantity * item.unitPrice, 0);
    const taxRate = invoiceData.taxRate != null ? invoiceData.taxRate : 19;
    const discount = invoiceData.discount != null ? invoiceData.discount : 0;
    const discountAmount = subtotal * (discount / 100);
    const afterDiscount = subtotal - discountAmount;
    const tax = afterDiscount * (taxRate / 100);
    const total = afterDiscount + tax;

    const invoice = await prisma.invoice.update({
      where: { id },
      data: {
        ...invoiceData,
        subtotal,
        discount,
        tax,
        taxRate,
        total,
        date: invoiceData.date ? new Date(invoiceData.date) : undefined,
        dueDate: invoiceData.dueDate ? new Date(invoiceData.dueDate) : undefined,
        items: {
          create: items.map((item: { description: string; quantity: number; unitPrice: number; productId?: string }) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.quantity * item.unitPrice,
            productId: item.productId || null,
          })),
        },
      },
      include: { client: true, items: { include: { product: true } } },
    });
    await logAudit({ session, action: "update", entity: "invoice", entityId: invoice.id, description: `Updated invoice ${invoice.number}` });
    return NextResponse.json(invoice);
  }

  const invoice = await prisma.invoice.update({
    where: { id },
    data: invoiceData,
    include: { client: true, items: { include: { product: true } } },
  });

  // BUG-001 fix: when status changes to "paid", auto-create a full payment if none covers the total
  if (invoiceData.status === "paid" && existing.status !== "paid") {
    const existingPayments = await prisma.payment.aggregate({ where: { invoiceId: id }, _sum: { amount: true } });
    const alreadyPaid = existingPayments._sum.amount ?? 0;
    const remaining = invoice.total - alreadyPaid;
    if (remaining > 0) {
      await prisma.payment.create({
        data: { invoiceId: id, organizationId: session.organizationId, amount: remaining, date: new Date(), method: "cash", note: "Auto-recorded when status set to Paid" },
      });
    }
  }

  const statusChanged = invoiceData.status ? `status to "${invoiceData.status}"` : "";
  await logAudit({ session, action: "update", entity: "invoice", entityId: invoice.id, description: `Updated invoice ${invoice.number}${statusChanged ? ` - changed ${statusChanged}` : ""}` });

  // TODO: Re-enable email sending when ready
  // if (invoiceData.status === "sent" && invoice.client?.email) {
  //   try {
  //     const pdfBuffer = generateInvoicePDF(invoice, invoice.language || "fr");
  //     await sendInvoiceEmail(invoice.client.email, invoice.number, pdfBuffer, invoice.language || "fr");
  //     return NextResponse.json({ ...invoice, emailSent: true });
  //   } catch (emailErr) {
  //     console.error("Failed to send invoice email:", emailErr);
  //     return NextResponse.json({ ...invoice, emailSent: false, emailError: "Failed to send email" });
  //   }
  // }

  return NextResponse.json(invoice);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "invoices")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { id } = await params;
  const invoice = await prisma.invoice.findFirst({ where: { id, organizationId: session.organizationId } });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.invoice.delete({ where: { id } });
  await logAudit({ session, action: "delete", entity: "invoice", entityId: id, description: `Deleted invoice ${invoice.number}` });
  return NextResponse.json({ success: true });
}
