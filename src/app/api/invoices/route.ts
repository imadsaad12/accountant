import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canView, canEdit } from "@/lib/permissions";

const round2 = (n: number) => parseFloat((n || 0).toFixed(2));

// Thrown inside the create transaction to roll back and surface a 400 to the client.
class InvoiceValidationError extends Error {}

export async function GET(req: NextRequest) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canView(session.permissions, "invoices")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const status = searchParams.get("status");
  const clientId = searchParams.get("clientId");

  const where: Record<string, unknown> = { organizationId: session.organizationId };
  if (from || to) {
    where.date = {};
    if (from) (where.date as Record<string, unknown>).gte = new Date(from);
    if (to) (where.date as Record<string, unknown>).lte = new Date(to);
  }
  if (status) where.status = status;
  if (clientId) where.clientId = clientId;

  const invoices = await prisma.invoice.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      client: { select: { id: true, name: true, email: true, phone: true, address: true } },
      items: { include: { product: { select: { id: true, name: true, unit: true } } } },
      fees: true,
      payments: { select: { amount: true } },
    },
  });
  return NextResponse.json(invoices.map(inv => ({
    ...inv,
    amountPaid: inv.payments.reduce((s, p) => s + p.amount, 0),
    payments: undefined,
  })));
}

export async function POST(req: NextRequest) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "invoices")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const data = await req.json();
  const { items, fees, ...invoiceData } = data;

  const org = await prisma.organization.findUnique({ where: { id: session.organizationId }, select: { name: true } });
  const prefix = (org?.name ?? "INV").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  const lastInvoice = await prisma.invoice.findFirst({
    where: { organizationId: session.organizationId, number: { startsWith: prefix } },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  let nextSeq = 1;
  if (lastInvoice) {
    const seq = parseInt(lastInvoice.number.replace(`${prefix}-`, ""), 10);
    if (!isNaN(seq)) nextSeq = seq + 1;
  }
  const number = `${prefix}-${String(nextSeq).padStart(5, "0")}`;

  // ---- Input validation (spec: Data Integrity & Validation) ----
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "At least one invoice item is required." }, { status: 400 });
  }
  if (!invoiceData.clientId) {
    return NextResponse.json({ error: "A client is required." }, { status: 400 });
  }
  const client = await prisma.client.findFirst({
    where: { id: invoiceData.clientId, organizationId: session.organizationId },
    select: { id: true, name: true, balance: true },
  });
  if (!client) return NextResponse.json({ error: "Client not found." }, { status: 400 });

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
  if (subtotal <= 0) return NextResponse.json({ error: "Invoice total must be greater than $0." }, { status: 400 });
  const discountAmount = round2(subtotal * (discount / 100));
  const afterDiscount = round2(subtotal - discountAmount);
  const tax = round2(afterDiscount * (taxRate / 100));
  const feesTotal = round2(Array.isArray(fees) ? fees.reduce((s: number, f: { amount: number }) => s + (f.amount || 0), 0) : 0);
  const total = round2(afterDiscount + tax + feesTotal);

  // Create invoice + validate/deduct stock + auto-apply client balance ATOMICALLY.
  // updateMany with a `quantity >= needed` guard makes deduction safe against
  // concurrent invoices (no oversell), and the transaction guarantees no
  // orphaned invoice without deduction (and vice-versa).
  const result = await prisma.$transaction(async (tx) => {
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

      if (product.type === "composite") {
        for (const comp of product.components) {
          const needed = comp.quantity * item.quantity;
          const res = await tx.product.updateMany({
            where: { id: comp.componentId, quantity: { gte: needed } },
            data: { quantity: { decrement: needed } },
          });
          if (res.count === 0) {
            const fresh = await tx.product.findUnique({ where: { id: comp.componentId }, select: { quantity: true } });
            throw new InvoiceValidationError(`Insufficient stock for component "${comp.component.name}" (needed for "${product.name}"). Available: ${fresh?.quantity ?? 0}, needed: ${needed}.`);
          }
        }
      } else {
        const res = await tx.product.updateMany({
          where: { id: item.productId, quantity: { gte: item.quantity } },
          data: { quantity: { decrement: item.quantity } },
        });
        if (res.count === 0) {
          throw new InvoiceValidationError(`Insufficient stock for "${product.name}". Available: ${product.quantity}, requested: ${item.quantity}.`);
        }
      }
    }

    const created = await tx.invoice.create({
      data: {
        ...invoiceData,
        number,
        subtotal,
        discount,
        tax,
        taxRate,
        total,
        date: invoiceData.date ? new Date(invoiceData.date) : new Date(),
        dueDate: invoiceData.dueDate ? new Date(invoiceData.dueDate) : null,
        organizationId: session.organizationId,
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

    // Auto-apply client credit balance (capped at the invoice total, rounded).
    let balanceApplied = 0;
    let finalStatus = created.status;
    if (client.balance > 0) {
      balanceApplied = round2(Math.min(client.balance, total));
      finalStatus = balanceApplied >= total ? "paid" : "partially_paid";
      await tx.payment.create({
        data: {
          invoiceId: created.id,
          amount: balanceApplied,
          date: new Date(),
          method: "balance",
          note: "Auto-applied from client balance",
          organizationId: session.organizationId,
        },
      });
      await tx.invoice.update({ where: { id: created.id }, data: { status: finalStatus } });
      await tx.client.update({ where: { id: client.id }, data: { balance: { decrement: balanceApplied } } });
    }

    return { invoice: created, balanceApplied, finalStatus };
  }).catch((e): { error: string } => {
    if (e instanceof InvoiceValidationError) return { error: e.message };
    throw e;
  });

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

  const { invoice, balanceApplied, finalStatus } = result;
  await logAudit({ session, action: "create", entity: "invoice", entityId: invoice.id, description: `Created invoice ${invoice.number} for ${invoice.client.name} - $${total.toFixed(2)}${balanceApplied > 0 ? `. $${balanceApplied.toFixed(2)} auto-applied from client balance.` : ""}` });
  return NextResponse.json({ ...invoice, status: finalStatus, balanceApplied, amountPaid: balanceApplied }, { status: 201 });
}
