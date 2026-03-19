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
    include: { category: true },
  });
  return NextResponse.json(products);
}

export async function POST(req: NextRequest) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "products")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const data = await req.json();
  const product = await prisma.product.create({ data: { ...data, organizationId: session.organizationId } });
  await logAudit({ session, action: "create", entity: "product", entityId: product.id, description: `Created product "${product.name}" (SKU: ${product.sku})` });
  return NextResponse.json(product, { status: 201 });
}
