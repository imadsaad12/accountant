import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
// import { generateInvoicePDF } from "@/lib/generate-invoice-pdf";
// import { sendInvoiceEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";
import { canView, canEdit } from "@/lib/permissions";
import { journalInvoicePayment, deleteJournalEntriesBySource } from "@/lib/auto-journal";

const round2 = (n: number) => parseFloat((n || 0).toFixed(2));
class InvoiceValidationError extends Error {}

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
  const existing = await prisma.invoice.findFirst({
    where: { id, organizationId: session.organizationId },
    include: { items: { include: { product: { include: { components: true } } } } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data = await req.json();
  const { items, fees, ...invoiceData } = data;

  if (items) {
    // ---- Validation (mirror of create) ----
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "At least one invoice item is required." }, { status: 400 });
    }
    for (const item of items) {
      if (!(Number(item.quantity) > 0)) {
        return NextResponse.json({ error: "Each item quantity must be greater than 0." }, { status: 400 });
      }
      if (item.unitPrice == null || Number(item.unitPrice) < 0) {
        return NextResponse.json({ error: "Each item unit price must be 0 or greater." }, { status: 400 });
      }
    }
    const taxRate = invoiceData.taxRate != null ? Number(invoiceData.taxRate) : 19;
    const discount = invoiceData.discount != null ? Number(invoiceData.discount) : 0;
    if (!(taxRate >= 0 && taxRate <= 100)) {
      return NextResponse.json({ error: "Tax rate must be between 0 and 100." }, { status: 400 });
    }
    if (!(discount >= 0 && discount <= 100)) {
      return NextResponse.json({ error: "Discount must be between 0 and 100." }, { status: 400 });
    }

    const subtotal = round2(items.reduce((sum: number, item: { quantity: number; unitPrice: number }) => sum + item.quantity * item.unitPrice, 0));
    const discountAmount = round2(subtotal * (discount / 100));
    const afterDiscount = round2(subtotal - discountAmount);
    const tax = round2(afterDiscount * (taxRate / 100));
    const feesTotal = round2(Array.isArray(fees) ? fees.reduce((s: number, f: { amount: number }) => s + (f.amount || 0), 0) : 0);
    const total = round2(afterDiscount + tax + feesTotal);

    // Atomically: restore old items' stock → validate+deduct new items' stock →
    // replace items (snapshotting unitCost) → update totals.
    const result = await prisma.$transaction(async (tx) => {
      // 1. Restore stock for the OLD items
      for (const old of existing.items) {
        if (!old.productId || !old.product) continue;
        if (old.product.type === "service") continue; // services are not stock-tracked
        if (old.product.components && old.product.components.length > 0) {
          for (const comp of old.product.components) {
            await tx.product.update({ where: { id: comp.componentId }, data: { quantity: { increment: comp.quantity * old.quantity } } });
          }
        } else {
          await tx.product.update({ where: { id: old.productId }, data: { quantity: { increment: old.quantity } } });
        }
      }

      // 2. Remove existing items & fees
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
      await tx.invoiceFee.deleteMany({ where: { invoiceId: id } });

      // 3. Validate + deduct stock for the NEW items, snapshot costs
      const costSnapshot = new Map<string, number>();
      for (const item of items) {
        if (!item.productId) continue;
        const product = await tx.product.findFirst({
          where: { id: item.productId, organizationId: session.organizationId },
          include: { components: { include: { component: { select: { id: true, name: true, quantity: true } } } } },
        });
        if (!product) throw new InvoiceValidationError("One of the selected products no longer exists.");
        costSnapshot.set(item.productId, product.cost);
        if (Number(item.unitPrice) < product.cost) {
          throw new InvoiceValidationError(`Unit price for "${product.name}" cannot be below its cost ($${product.cost.toFixed(2)}).`);
        }
        if (product.type === "service") {
          if (!product.available) throw new InvoiceValidationError(`"${product.name}" is not available.`);
          continue; // services are not stock-tracked
        }
        if (product.type === "composite") {
          for (const comp of product.components) {
            const needed = comp.quantity * item.quantity;
            const res = await tx.product.updateMany({ where: { id: comp.componentId, quantity: { gte: needed } }, data: { quantity: { decrement: needed } } });
            if (res.count === 0) {
              const fresh = await tx.product.findUnique({ where: { id: comp.componentId }, select: { quantity: true } });
              throw new InvoiceValidationError(`Insufficient stock for component "${comp.component.name}" (needed for "${product.name}"). Available: ${fresh?.quantity ?? 0}, needed: ${needed}.`);
            }
          }
        } else {
          const res = await tx.product.updateMany({ where: { id: item.productId, quantity: { gte: item.quantity } }, data: { quantity: { decrement: item.quantity } } });
          if (res.count === 0) {
            throw new InvoiceValidationError(`Insufficient stock for "${product.name}". Available: ${product.quantity}, requested: ${item.quantity}.`);
          }
        }
      }

      // 4. Update the invoice with new items + totals
      return tx.invoice.update({
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
              unitCost: item.productId ? (costSnapshot.get(item.productId) ?? 0) : 0,
              total: round2(item.quantity * item.unitPrice),
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
    }).catch((e): { error: string } => {
      if (e instanceof InvoiceValidationError) return { error: e.message };
      throw e;
    });

    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

    await logAudit({ session, action: "update", entity: "invoice", entityId: result.id, description: `Updated invoice ${result.number}` });
    return NextResponse.json(result);
  }

  // Validate partially_paid: must have payments > 0 and < total
  if (invoiceData.status === "partially_paid") {
    const agg = await prisma.payment.aggregate({ where: { invoiceId: id }, _sum: { amount: true } });
    const paid = agg._sum.amount ?? 0;
    if (paid <= 0 || paid >= existing.total) {
      return NextResponse.json({ error: "Cannot set to Partially Paid: recorded payments must be greater than 0 and less than the invoice total." }, { status: 400 });
    }
  }

  // When reverting to draft/sent, delete all payment records and their journal entries
  if ((invoiceData.status === "draft" || invoiceData.status === "sent") &&
      (existing.status === "paid" || existing.status === "partially_paid")) {
    const payments = await prisma.payment.findMany({ where: { invoiceId: id, organizationId: session.organizationId }, select: { id: true } });
    for (const p of payments) await deleteJournalEntriesBySource(p.id);
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
      const autoPayment = await prisma.payment.create({
        data: { invoiceId: id, organizationId: session.organizationId, amount: remaining, date: new Date(), method: "cash", note: "Auto-recorded when status set to Paid" },
      });
      await journalInvoicePayment({
        organizationId: session.organizationId,
        paymentId: autoPayment.id,
        amount: remaining,
        date: autoPayment.date,
        invoiceNumber: invoice.number,
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

  // Refund any "balance" payments back to the client's credit balance
  const balancePayments = await prisma.payment.findMany({
    where: { invoiceId: id, method: "balance" },
    select: { amount: true },
  });
  const balanceRefund = balancePayments.reduce((s, p) => s + p.amount, 0);
  if (balanceRefund > 0) {
    await prisma.client.update({
      where: { id: invoice.clientId },
      data: { balance: { increment: parseFloat(balanceRefund.toFixed(2)) } },
    });
  }

  // Restore stock for each invoice item before deleting
  for (const item of invoice.items) {
    if (!item.productId) continue;
    const product = item.product;
    if (!product) continue;
    if (product.type === "service") continue; // services are not stock-tracked

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
