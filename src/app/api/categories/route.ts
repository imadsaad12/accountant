import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

const DEFAULT_CATEGORIES = [
  "Electronics",
  "Clothing & Apparel",
  "Food & Beverages",
  "Office Supplies",
  "Furniture",
  "Tools & Equipment",
  "Raw Materials",
  "Finished Goods",
  "Packaging",
  "Services",
];

export async function GET() {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Seed defaults only if this org has no categories yet
  const existingCount = await prisma.category.count({ where: { organizationId: session.organizationId } });
  if (existingCount === 0) {
    await prisma.category.createMany({
      data: DEFAULT_CATEGORIES.map(name => ({ name, organizationId: session.organizationId })),
      skipDuplicates: true,
    });
  }

  const categories = await prisma.category.findMany({
    where: { organizationId: session.organizationId },
    orderBy: { name: "asc" },
    include: { _count: { select: { products: true } } },
  });

  return NextResponse.json(categories);
}

export async function POST(req: NextRequest) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await req.json();
  const category = await prisma.category.create({
    data: { name, organizationId: session.organizationId },
  });

  await logAudit({
    session,
    action: "create",
    entity: "category",
    entityId: category.id,
    description: `Created category "${category.name}"`,
  });

  return NextResponse.json(category, { status: 201 });
}
