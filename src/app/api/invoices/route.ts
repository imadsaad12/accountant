import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canView, canEdit } from "@/lib/permissions";
import { cacheGet, cacheSet, cacheInvalidate } from "@/lib/server-cache";

export async function GET(req: NextRequest) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canView(session.permissions, "invoices")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const status = searchParams.get("status");
  const clientId = searchParams.get("clientId");

  // Only cache unfiltered list
  const cacheKey = session.organizationId + ":invoices";
  if (!from && !to && !status && !clientId) {
    const cached = cacheGet<unknown[]>(cacheKey);
    if (cached) return NextResponse.json(cached);
  }

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
  const result = invoices.map(inv => ({
    ...inv,
    amountPaid: inv.payments.reduce((s, p) => s + p.amount, 0),
    payments: undefined,
  }));
  if (!from && !to && !status && !clientId) cacheSet(cacheKey, result, 30_000);
  return NextResponse.json(result);
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

  const subtotal = items.reduce((sum: number, item: { quantity: number; unitPrice: number }) => sum + item.quantity * item.unitPrice, 0);
  if (subtotal <= 0) return NextResponse.json({ error: "Invoice total must be greater than $0." }, { status: 400 });
  const taxRate = invoiceData.taxRate != null ? invoiceData.taxRate : 19;
  const discount = invoiceData.discount != null ? invoiceData.discount : 0;
  const discountAmount = subtotal * (discount / 100);
  const afterDiscount = subtotal - discountAmount;
  const tax = afterDiscount * (taxRate / 100);
  const feesTotal = Array.isArray(fees) ? fees.reduce((s: number, f: { amount: number }) => s + (f.amount || 0), 0) : 0;
  const total = afterDiscount + tax + feesTotal;

  // Pre-validate all stock before creating the invoice
  // Also snapshot product costs now so COGS in reports uses historical cost
  const costSnapshot = new Map<string, number>();
  for (const item of items) {
    if (!item.productId) continue;
    const product = await prisma.product.findUnique({
      where: { id: item.productId },
      include: {
        components: {
          include: { component: { select: { id: true, name: true, quantity: true } } },
        },
      },
    });
    if (!product) continue;
    costSnapshot.set(item.productId, product.cost);

    if (product.type === "composite") {
      for (const comp of product.components) {
        const needed = comp.quantity * item.quantity;
        if (comp.component.quantity < needed) {
          return NextResponse.json({
            error: `Insufficient stock for component "${comp.component.name}" (needed for "${product.name}"). Available: ${comp.component.quantity}, needed: ${needed}.`,
          }, { status: 400 });
        }
      }
    } else {
      if (item.quantity > product.quantity) {
        return NextResponse.json({
          error: `Insufficient stock for "${product.name}". Available: ${product.quantity}, requested: ${item.quantity}.`,
        }, { status: 400 });
      }
    }
  }

  const invoice = await prisma.invoice.create({
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

  // Deduct stock after successful invoice creation
  for (const item of items) {
    if (!item.productId) continue;
    const product = await prisma.product.findUnique({
      where: { id: item.productId },
      include: { components: true },
    });
    if (!product) continue;

    if (product.type === "composite") {
      for (const comp of product.components) {
        await prisma.product.update({
          where: { id: comp.componentId },
          data: { quantity: { decrement: comp.quantity * item.quantity } },
        });
      }
    } else {
      await prisma.product.update({
        where: { id: item.productId },
        data: { quantity: { decrement: item.quantity } },
      });
    }
  }

  cacheInvalidate(session.organizationId, "invoices", "clients", "dashboard", "products");
  await logAudit({ session, action: "create", entity: "invoice", entityId: invoice.id, description: `Created invoice ${invoice.number} for ${invoice.client.name} - $${total.toFixed(2)}` });
  return NextResponse.json(invoice, { status: 201 });
}
