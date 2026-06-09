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
  const product = await prisma.product.findFirst({
    where: { id, organizationId: session.organizationId },
    include: {
      category: true,
      components: {
        include: { component: { select: { id: true, name: true, quantity: true, unit: true, cost: true } } },
      },
    },
  });
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
  const { components, ...productData } = data;
  const isComposite = existing.type === "composite";
  const isService = existing.type === "service";

  // Services stay filed under the dedicated "Service" category (find-or-create).
  let categoryId: string | null = productData.categoryId || null;
  if (isService) {
    let cat = await prisma.category.findFirst({ where: { organizationId: session.organizationId, name: "Service" } });
    if (!cat) cat = await prisma.category.create({ data: { name: "Service", organizationId: session.organizationId } });
    categoryId = cat.id;
  }

  const product = await prisma.product.update({
    where: { id },
    data: {
      name: productData.name,
      description: productData.description || null,
      price: parseFloat(productData.price),
      cost: parseFloat(productData.cost) || 0,
      quantity: isComposite || isService ? 0 : (parseFloat(productData.quantity) || 0),
      minStock: isService ? 0 : (parseInt(productData.minStock) || 0),
      unit: productData.unit || existing.unit,
      ...(isService ? { available: productData.available !== false } : {}),
      categoryId,
    },
  });

  if (isComposite) {
    await prisma.productComponent.deleteMany({ where: { compositeId: id } });
    if (Array.isArray(components) && components.length > 0) {
      await prisma.productComponent.createMany({
        data: components.map((c: { componentId: string; quantity: number }) => ({
          compositeId: id,
          componentId: c.componentId,
          quantity: parseFloat(String(c.quantity)),
        })),
      });
    }
  }

  await logAudit({ session, action: "update", entity: "product", entityId: product.id, description: `Updated product "${product.name}"` });

  const full = await prisma.product.findUnique({
    where: { id: product.id },
    include: {
      category: { select: { id: true, name: true } },
      components: {
        include: { component: { select: { id: true, name: true, quantity: true, unit: true, cost: true } } },
      },
    },
  });
  return NextResponse.json(full);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "products")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { id } = await params;
  const product = await prisma.product.findFirst({
    where: { id, organizationId: session.organizationId },
    include: {
      _count: { select: { invoiceItems: true } },
      usedIn: true,
    },
  });
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (product._count.invoiceItems > 0)
    return NextResponse.json({ error: `Cannot delete "${product.name}" — it is referenced in ${product._count.invoiceItems} invoice(s).` }, { status: 409 });

  if (product.usedIn.length > 0)
    return NextResponse.json({ error: `Cannot delete "${product.name}" — it is used as a component in ${product.usedIn.length} composite product(s).` }, { status: 409 });

  await prisma.product.delete({ where: { id } });
  await logAudit({ session, action: "delete", entity: "product", entityId: id, description: `Deleted product "${product.name}"` });
  return NextResponse.json({ success: true });
}
