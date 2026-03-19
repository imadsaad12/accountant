import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canView, canEdit } from "@/lib/permissions";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canView(session.permissions, "accounts")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { id } = await params;
  const account = await prisma.account.findFirst({ where: { id, organizationId: session.organizationId } });
  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(account);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "accounts")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { id } = await params;
  const data = await req.json();
  await prisma.account.updateMany({
    where: { id, organizationId: session.organizationId },
    data: {
      code: data.code,
      name: data.name,
      type: data.type,
      subtype: data.subtype || null,
      description: data.description || null,
    },
  });

  await logAudit({ session, action: "update", entity: "account", entityId: id, description: `Updated account ${data.code} - ${data.name}` });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "accounts")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { id } = await params;
  const account = await prisma.account.findFirst({ where: { id, organizationId: session.organizationId } });
  if (account?.isDefault) return NextResponse.json({ error: "Cannot delete default accounts" }, { status: 400 });

  await prisma.account.deleteMany({ where: { id, organizationId: session.organizationId } });
  await logAudit({ session, action: "delete", entity: "account", entityId: id, description: `Deleted account` });
  return NextResponse.json({ ok: true });
}
