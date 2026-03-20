import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canView, canEdit } from "@/lib/permissions";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canView(session.permissions, "products")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { id } = await params;
  const product = await prisma.product.findFirst({ where: { id, organizationId: session.organizationId }, include: { category: true } });
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(product);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "products")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.product.findFirst({ where: { id, organizationId: session.organizationId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data = await req.json();
  const product = await prisma.product.update({ where: { id }, data });
  await logAudit({ session, action: "update", entity: "product", entityId: product.id, description: `Updated product "${product.name}"` });
  return NextResponse.json(product);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "products")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { id } = await params;
  const product = await prisma.product.findFirst({ where: { id, organizationId: session.organizationId }, include: { _count: { select: { invoiceItems: true } } } });
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (product._count.invoiceItems > 0)
    return NextResponse.json({ error: `Cannot delete "${product.name}" — it is referenced in ${product._count.invoiceItems} invoice(s).` }, { status: 409 });

  await prisma.product.delete({ where: { id } });
  await logAudit({ session, action: "delete", entity: "product", entityId: id, description: `Deleted product "${product.name}"` });
  return NextResponse.json({ success: true });
}
