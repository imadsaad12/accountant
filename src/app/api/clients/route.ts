import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canView, canEdit } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canView(session.permissions, "clients")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const fromDate = from ? new Date(from + "T00:00:00Z") : undefined;
  const toDate = to ? new Date(to + "T23:59:59Z") : undefined;

  const clients = await prisma.client.findMany({
    where: { organizationId: session.organizationId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { invoices: true } },
      invoices: {
        where: {
          ...(fromDate || toDate ? { date: { ...(fromDate && { gte: fromDate }), ...(toDate && { lte: toDate }) } } : {}),
        },
        select: {
          total: true,
          status: true,
          payments: { select: { amount: true } },
        },
      },
    },
  });

  const result = clients.map(c => {
    const totalInvoiced = c.invoices.reduce((s, inv) => s + inv.total, 0);
    const totalPaid = c.invoices.reduce((s, inv) => s + inv.payments.reduce((ps, p) => ps + p.amount, 0), 0);
    return {
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      address: c.address,
      city: c.city,
      country: c.country,
      taxId: c.taxId,
      notes: c.notes,
      balance: c.balance,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      organizationId: c.organizationId,
      _count: c._count,
      totalInvoiced: parseFloat(totalInvoiced.toFixed(2)),
      totalPaid: parseFloat(totalPaid.toFixed(2)),
      totalPending: parseFloat((totalInvoiced - totalPaid).toFixed(2)),
    };
  });

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "clients")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const data = await req.json();
  const { organizationId } = session;

  if (data.email) {
    const emailExists = await prisma.client.findFirst({ where: { email: data.email, organizationId } });
    if (emailExists) return NextResponse.json({ error: "A client with this email already exists." }, { status: 400 });
  }
  if (data.phone) {
    const phoneExists = await prisma.client.findFirst({ where: { phone: data.phone, organizationId } });
    if (phoneExists) return NextResponse.json({ error: "A client with this phone number already exists." }, { status: 400 });
  }

  const client = await prisma.client.create({ data: { ...data, organizationId } });
  await logAudit({ session, action: "create", entity: "client", entityId: client.id, description: `Created client "${client.name}"` });
  return NextResponse.json(client, { status: 201 });
}
