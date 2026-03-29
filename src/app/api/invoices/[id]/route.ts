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
      include: {
        client: { select: { id: true, name: true, email: true, phone: true, address: true } },
        items: { include: { product: { select: { id: true, name: true, unit: true } } } },
        fees: true,
      },
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
  const { items, fees, ...invoiceData } = data;

  if (items) {
    await prisma.invoiceItem.deleteMany({ where: { invoiceId: id } });
    await prisma.invoiceFee.deleteMany({ where: { invoiceId: id } });

    const subtotal = items.reduce((sum: number, item: { quantity: number; unitPrice: number }) => sum + item.quantity * item.unitPrice, 0);
    const taxRate = invoiceData.taxRate != null ? invoiceData.taxRate : 19;
    const discount = invoiceData.discount != null ? invoiceData.discount : 0;
    const discountAmount = subtotal * (discount / 100);
    const afterDiscount = subtotal - discountAmount;
    const tax = afterDiscount * (taxRate / 100);
    const feesTotal = Array.isArray(fees) ? fees.reduce((s: number, f: { amount: number }) => s + (f.amount || 0), 0) : 0;
    const total = afterDiscount + tax + feesTotal;

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
        fees: Array.isArray(fees) && fees.length > 0 ? {
          create: fees.map((f: { label: string; amount: number }) => ({ label: f.label, amount: f.amount })),
        } : undefined,
      },
      include: {
        client: { select: { id: true, name: true, email: true, phone: true, address: true } },
        items: { include: { product: { select: { id: true, name: true, unit: true } } } },
        fees: true,
      },
    });
    await logAudit({ session, action: "update", entity: "invoice", entityId: invoice.id, description: `Updated invoice ${invoice.number}` });
    return NextResponse.json(invoice);
  }

  // Validate partially_paid: must have payments > 0 and < total
  if (invoiceData.status === "partially_paid") {
    const agg = await prisma.payment.aggregate({ where: { invoiceId: id }, _sum: { amount: true } });
    const paid = agg._sum.amount ?? 0;
    if (paid <= 0 || paid >= existing.total) {
      return NextResponse.json({ error: "Cannot set to Partially Paid: recorded payments must be greater than 0 and less than the invoice total." }, { status: 400 });
    }
  }

  // When reverting to draft/sent, delete all payment records
  if ((invoiceData.status === "draft" || invoiceData.status === "sent") &&
      (existing.status === "paid" || existing.status === "partially_paid")) {
    await prisma.payment.deleteMany({ where: { invoiceId: id, organizationId: session.organizationId } });
  }

  const invoice = await prisma.invoice.update({
    where: { id },
    data: invoiceData,
    include: { client: true, items: { include: { product: true } }, fees: true },
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
  const invoice = await prisma.invoice.findFirst({
    where: { id, organizationId: session.organizationId },
    include: { items: { include: { product: { include: { components: true } } } } },
  });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Restore stock for each invoice item before deleting
  for (const item of invoice.items) {
    if (!item.productId) continue;
    const product = item.product;
    if (!product) continue;

    if (product.components && product.components.length > 0) {
      // Composite product: restore each component's stock
      for (const comp of product.components) {
        await prisma.product.update({
          where: { id: comp.componentId },
          data: { quantity: { increment: comp.quantity * item.quantity } },
        });
      }
    } else {
      // Simple product: restore its stock directly
      await prisma.product.update({
        where: { id: item.productId },
        data: { quantity: { increment: item.quantity } },
      });
    }
  }

  await prisma.invoice.delete({ where: { id } });
  await logAudit({ session, action: "delete", entity: "invoice", entityId: id, description: `Deleted invoice ${invoice.number}` });
  return NextResponse.json({ success: true });
}
