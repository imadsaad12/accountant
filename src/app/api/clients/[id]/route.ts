import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canView, canEdit } from "@/lib/permissions";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canView(session.permissions, "clients")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { id } = await params;
  const client = await prisma.client.findFirst({ where: { id, organizationId: session.organizationId }, include: { invoices: true } });
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(client);
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
  await logAudit({ session, action: "update", entity: "client", entityId: client.id, description: `Updated client "${client.name}"` });
  return NextResponse.json(client);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "clients")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { id } = await params;
  const client = await prisma.client.findFirst({ where: { id, organizationId: session.organizationId } });
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.client.delete({ where: { id } });
  await logAudit({ session, action: "delete", entity: "client", entityId: id, description: `Deleted client "${client.name}"` });
  return NextResponse.json({ success: true });
}
