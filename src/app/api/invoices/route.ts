import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canView, canEdit } from "@/lib/permissions";

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
    include: { client: true, items: { include: { product: true } } },
  });
  return NextResponse.json(invoices);
}

export async function POST(req: NextRequest) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "invoices")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const data = await req.json();
  const { items, ...invoiceData } = data;

  const org = await prisma.organization.findUnique({ where: { id: session.organizationId }, select: { name: true } });
  const prefix = (org?.name ?? "INV").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
  // Use MAX sequence to avoid unique-constraint collisions when invoices have been deleted
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
  const taxRate = invoiceData.taxRate != null ? invoiceData.taxRate : 19;
  const tax = subtotal * (taxRate / 100);
  const total = subtotal + tax;

  const invoice = await prisma.invoice.create({
    data: {
      ...invoiceData,
      number,
      subtotal,
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
          total: item.quantity * item.unitPrice,
          productId: item.productId || null,
        })),
      },
    },
    include: { client: true, items: { include: { product: true } } },
  });

  for (const item of items) {
    if (item.productId) {
      await prisma.product.update({
        where: { id: item.productId },
        data: { quantity: { decrement: item.quantity } },
      });
    }
  }

  await logAudit({ session, action: "create", entity: "invoice", entityId: invoice.id, description: `Created invoice ${invoice.number} for ${invoice.client.name} - $${total.toFixed(2)}` });
  return NextResponse.json(invoice, { status: 201 });
}
