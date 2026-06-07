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
      category: { select: { id: true, name: true } },
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
  const isService = productData.type === "service";

  const baseData = {
    name: productData.name,
    description: productData.description || null,
    price: parseFloat(productData.price),
    cost: parseFloat(productData.cost) || 0,
    // Services and composites are not directly stock-tracked.
    quantity: isComposite || isService ? 0 : (parseFloat(productData.quantity) || 0),
    minStock: isService ? 0 : (parseInt(productData.minStock) || 0),
    unit: productData.unit || "piece",
    type: productData.type || "simple",
    available: isService ? productData.available !== false : true,
    categoryId: productData.categoryId || null,
    organizationId: session.organizationId,
  };

  // SKU is unique per org and the column is non-nullable, so an empty SKU would
  // collide with any other SKU-less product. Auto-generate a unique one when blank.
  const providedSku = String(productData.sku ?? "").trim();
  const genSku = () => {
    const base = (String(productData.name ?? "").toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 4)) || "PRD";
    const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
    return `${base}-${rand}`;
  };

  let product;
  let sku = providedSku || genSku();
  for (let attempt = 0; ; attempt++) {
    try {
      product = await prisma.product.create({ data: { ...baseData, sku } });
      break;
    } catch (e: unknown) {
      const isDup = typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
      if (isDup) {
        // A user-supplied SKU that clashes → clear error. An auto-generated clash → retry.
        if (providedSku) {
          return NextResponse.json({ error: `SKU "${providedSku}" is already in use. Please use a different SKU.` }, { status: 409 });
        }
        if (attempt < 5) { sku = genSku(); continue; }
      }
      throw e;
    }
  }

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

  const full = await prisma.product.findUnique({
    where: { id: product.id },
    include: {
      category: { select: { id: true, name: true } },
      components: {
        include: { component: { select: { id: true, name: true, quantity: true, unit: true, cost: true } } },
      },
    },
  });
  return NextResponse.json(full, { status: 201 });
}
