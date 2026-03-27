import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canView, canEdit } from "@/lib/permissions";

export async function GET() {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canView(session.permissions, "suppliers")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const suppliers = await prisma.supplier.findMany({
    where: { organizationId: session.organizationId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(suppliers);
}

export async function POST(req: NextRequest) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "suppliers")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const data = await req.json();
  const { organizationId } = session;

  if (data.email) {
    const emailExists = await prisma.supplier.findFirst({ where: { email: data.email, organizationId } });
    if (emailExists) return NextResponse.json({ error: "A supplier with this email already exists." }, { status: 400 });
  }

  const supplier = await prisma.supplier.create({ data: { ...data, organizationId } });
  await logAudit({ session, action: "create", entity: "supplier", entityId: supplier.id, description: `Created supplier "${supplier.name}"` });
  return NextResponse.json(supplier, { status: 201 });
}
