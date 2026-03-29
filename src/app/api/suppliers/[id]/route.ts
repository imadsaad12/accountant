import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canView, canEdit } from "@/lib/permissions";
import { cacheInvalidate } from "@/lib/server-cache";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canView(session.permissions, "suppliers")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { id } = await params;
  const supplier = await prisma.supplier.findFirst({ where: { id, organizationId: session.organizationId } });
  if (!supplier) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(supplier);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "suppliers")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.supplier.findFirst({ where: { id, organizationId: session.organizationId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data = await req.json();
  const { organizationId } = session;

  if (data.email) {
    const emailExists = await prisma.supplier.findFirst({ where: { email: data.email, organizationId, NOT: { id } } });
    if (emailExists) return NextResponse.json({ error: "A supplier with this email already exists." }, { status: 400 });
  }

  const supplier = await prisma.supplier.update({ where: { id }, data });
  cacheInvalidate(session.organizationId, "suppliers");
  await logAudit({ session, action: "update", entity: "supplier", entityId: supplier.id, description: `Updated supplier "${supplier.name}"` });
  return NextResponse.json(supplier);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "suppliers")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { id } = await params;
  const supplier = await prisma.supplier.findFirst({ where: { id, organizationId: session.organizationId } });
  if (!supplier) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.supplier.delete({ where: { id } });
  cacheInvalidate(session.organizationId, "suppliers");
  await logAudit({ session, action: "delete", entity: "supplier", entityId: id, description: `Deleted supplier "${supplier.name}"` });
  return NextResponse.json({ success: true });
}
