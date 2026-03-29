import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canView, canEdit } from "@/lib/permissions";
import { cacheInvalidate } from "@/lib/server-cache";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canView(session.permissions, "clients")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const fromDate = from ? new Date(from + "T00:00:00Z") : undefined;
  const toDate = to ? new Date(to + "T23:59:59Z") : undefined;

  const client = await prisma.client.findFirst({
    where: { id, organizationId: session.organizationId },
    include: {
      invoices: {
        where: {
          ...(fromDate || toDate ? { date: { ...(fromDate && { gte: fromDate }), ...(toDate && { lte: toDate }) } } : {}),
        },
        orderBy: { date: "asc" },
        select: {
          id: true,
          number: true,
          date: true,
          dueDate: true,
          status: true,
          total: true,
          payments: { select: { amount: true } },
        },
      },
    },
  });
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const invoices = client.invoices.map(inv => {
    const paid = inv.payments.reduce((s, p) => s + p.amount, 0);
    return {
      id: inv.id,
      number: inv.number,
      date: inv.date,
      dueDate: inv.dueDate,
      status: inv.status,
      total: inv.total,
      paid: parseFloat(paid.toFixed(2)),
      pending: parseFloat((inv.total - paid).toFixed(2)),
    };
  });

  const totalInvoiced = invoices.reduce((s, inv) => s + inv.total, 0);
  const totalPaid = invoices.reduce((s, inv) => s + inv.paid, 0);

  return NextResponse.json({
    ...client,
    invoices,
    totalInvoiced: parseFloat(totalInvoiced.toFixed(2)),
    totalPaid: parseFloat(totalPaid.toFixed(2)),
    totalPending: parseFloat((totalInvoiced - totalPaid).toFixed(2)),
    invoiceCount: invoices.length,
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "clients")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.client.findFirst({ where: { id, organizationId: session.organizationId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data = await req.json();
  const { organizationId } = session;

  if (data.email) {
    const emailExists = await prisma.client.findFirst({ where: { email: data.email, organizationId, NOT: { id } } });
    if (emailExists) return NextResponse.json({ error: "A client with this email already exists." }, { status: 400 });
  }
  if (data.phone) {
    const phoneExists = await prisma.client.findFirst({ where: { phone: data.phone, organizationId, NOT: { id } } });
    if (phoneExists) return NextResponse.json({ error: "A client with this phone number already exists." }, { status: 400 });
  }

  const client = await prisma.client.update({ where: { id }, data });
  cacheInvalidate(session.organizationId, "clients", "dashboard");
  await logAudit({ session, action: "update", entity: "client", entityId: client.id, description: `Updated client "${client.name}"` });
  return NextResponse.json(client);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "clients")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { id } = await params;
  const client = await prisma.client.findFirst({ where: { id, organizationId: session.organizationId }, include: { _count: { select: { invoices: true } } } });
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (client._count.invoices > 0)
    return NextResponse.json({ error: `Cannot delete this client — they have ${client._count.invoices} invoice(s) on record. Delete or reassign the invoices first.` }, { status: 409 });

  await prisma.client.delete({ where: { id } });
  cacheInvalidate(session.organizationId, "clients", "dashboard");
  await logAudit({ session, action: "delete", entity: "client", entityId: id, description: `Deleted client "${client.name}"` });
  return NextResponse.json({ success: true });
}
