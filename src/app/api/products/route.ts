import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canView, canEdit } from "@/lib/permissions";

export async function GET() {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canView(session.permissions, "products")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const products = await prisma.product.findMany({
    where: { organizationId: session.organizationId },
    orderBy: { createdAt: "desc" },
    include: {
      category: true,
      components: {
        include: { component: { select: { id: true, name: true, quantity: true, unit: true, cost: true } } },
      },
    },
  });
  return NextResponse.json(products);
}

export async function POST(req: NextRequest) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "products")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const data = await req.json();
  const { components, ...productData } = data;
  const isComposite = productData.type === "composite";

  const product = await prisma.product.create({
    data: {
      name: productData.name,
      sku: productData.sku,
      description: productData.description || null,
      price: parseFloat(productData.price),
      cost: parseFloat(productData.cost) || 0,
      quantity: isComposite ? 0 : (parseFloat(productData.quantity) || 0),
      minStock: parseInt(productData.minStock) || 0,
      unit: productData.unit || "piece",
      type: productData.type || "simple",
      categoryId: productData.categoryId || null,
      organizationId: session.organizationId,
    },
  });

  if (isComposite && Array.isArray(components) && components.length > 0) {
    await prisma.productComponent.createMany({
      data: components.map((c: { componentId: string; quantity: number }) => ({
        compositeId: product.id,
        componentId: c.componentId,
        quantity: parseFloat(String(c.quantity)),
      })),
    });
  }

  await logAudit({ session, action: "create", entity: "product", entityId: product.id, description: `Created ${isComposite ? "composite " : ""}product "${product.name}" (SKU: ${product.sku})` });
  return NextResponse.json(product, { status: 201 });
}
