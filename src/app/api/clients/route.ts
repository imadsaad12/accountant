import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canView, canEdit } from "@/lib/permissions";

export async function GET() {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canView(session.permissions, "clients")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const clients = await prisma.client.findMany({
    where: { organizationId: session.organizationId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { invoices: true } } },
  });
  return NextResponse.json(clients);
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
