import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canEdit } from "@/lib/permissions";
import { cacheInvalidate } from "@/lib/server-cache";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "salary_advances")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.salaryAdvance.findFirst({ where: { id, organizationId: session.organizationId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data = await req.json();
  const advance = await prisma.salaryAdvance.update({
    where: { id },
    data: {
      status: data.status ?? existing.status,
      note: data.note !== undefined ? data.note : existing.note,
    },
    include: { employee: { select: { id: true, firstName: true, lastName: true, position: true } } },
  });

  cacheInvalidate(session.organizationId, "salary-advances", "dashboard");
  await logAudit({
    session,
    action: "update",
    entity: "salary_advance",
    entityId: advance.id,
    description: `Salary advance status updated to "${advance.status}" for ${advance.employee.firstName} ${advance.employee.lastName}`,
  });

  return NextResponse.json(advance);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "salary_advances")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { id } = await params;
  const advance = await prisma.salaryAdvance.findFirst({
    where: { id, organizationId: session.organizationId },
    include: { employee: { select: { firstName: true, lastName: true } } },
  });
  if (!advance) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.salaryAdvance.delete({ where: { id } });
  cacheInvalidate(session.organizationId, "salary-advances", "dashboard");
  await logAudit({
    session,
    action: "delete",
    entity: "salary_advance",
    entityId: id,
    description: `Deleted salary advance for ${advance.employee.firstName} ${advance.employee.lastName}`,
  });

  return NextResponse.json({ success: true });
}
