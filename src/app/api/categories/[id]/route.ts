import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const category = await prisma.category.findFirst({
    where: { id, organizationId: session.organizationId },
    include: { _count: { select: { products: true } } },
  });
  if (!category) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (category._count.products > 0) {
    return NextResponse.json({ error: `Cannot delete — ${category._count.products} product(s) are using this category. Reassign them first.` }, { status: 409 });
  }

  await prisma.category.delete({ where: { id } });
  await logAudit({ session, action: "delete", entity: "category", entityId: id, description: `Deleted category "${category.name}"` });
  return NextResponse.json({ success: true });
}
