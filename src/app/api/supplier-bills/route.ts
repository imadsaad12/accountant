import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canView, canEdit } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canView(session.permissions, "suppliers")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const supplierId = searchParams.get("supplierId");

  const where: Record<string, unknown> = { organizationId: session.organizationId };
  if (supplierId) where.supplierId = supplierId;

  const bills = await prisma.supplierBill.findMany({
    where,
    orderBy: { date: "desc" },
    include: { supplier: { select: { id: true, name: true } } },
  });
  return NextResponse.json(bills);
}

export async function POST(req: NextRequest) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "suppliers")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const data = await req.json();
  const bill = await prisma.supplierBill.create({
    data: {
      supplierId: data.supplierId,
      amount: parseFloat(data.amount),
      description: data.description,
      reference: data.reference || null,
      date: new Date(data.date),
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      status: data.status || "pending",
      note: data.note || null,
      organizationId: session.organizationId,
    },
    include: { supplier: { select: { id: true, name: true } } },
  });

  await logAudit({ session, action: "create", entity: "supplier_bill", entityId: bill.id, description: `Added bill "${bill.description}" for supplier` });
  return NextResponse.json(bill, { status: 201 });
}
