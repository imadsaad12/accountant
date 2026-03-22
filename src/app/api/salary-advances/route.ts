import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canView, canEdit } from "@/lib/permissions";

export async function GET() {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canView(session.permissions, "salary_advances")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const advances = await prisma.salaryAdvance.findMany({
    where: { organizationId: session.organizationId },
    include: { employee: { select: { id: true, firstName: true, lastName: true, position: true } } },
    orderBy: { date: "desc" },
  });

  return NextResponse.json(advances);
}

export async function POST(req: NextRequest) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "salary_advances")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const data = await req.json();
  const advance = await prisma.salaryAdvance.create({
    data: {
      employeeId: data.employeeId,
      amount: parseFloat(data.amount),
      date: new Date(data.date),
      status: "pending",
      note: data.note || null,
      organizationId: session.organizationId,
    },
    include: { employee: { select: { id: true, firstName: true, lastName: true, position: true } } },
  });

  await logAudit({
    session,
    action: "create",
    entity: "salary_advance",
    entityId: advance.id,
    description: `Salary advance of ${advance.amount} given to ${advance.employee.firstName} ${advance.employee.lastName}`,
  });

  return NextResponse.json(advance, { status: 201 });
}
