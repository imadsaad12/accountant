import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canView, canEdit } from "@/lib/permissions";
import { cacheGet, cacheSet, cacheInvalidate } from "@/lib/server-cache";

export async function GET() {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canView(session.permissions, "salary_advances")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const cacheKey = session.organizationId + ":salary-advances";
  const cached = cacheGet<unknown[]>(cacheKey);
  if (cached) return NextResponse.json(cached);

  const advances = await prisma.salaryAdvance.findMany({
    where: { organizationId: session.organizationId },
    include: { employee: { select: { id: true, firstName: true, lastName: true, position: true } } },
    orderBy: { date: "desc" },
  });

  cacheSet(cacheKey, advances, 30_000);
  return NextResponse.json(advances);
}

export async function POST(req: NextRequest) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "salary_advances")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const data = await req.json();

  // Validate: advance cannot exceed employee's salary
  const employee = await prisma.employee.findFirst({
    where: { id: data.employeeId, organizationId: session.organizationId },
    select: { salary: true },
  });
  if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  if (parseFloat(data.amount) > employee.salary) {
    return NextResponse.json({ error: `Advance amount cannot exceed employee salary (${employee.salary})` }, { status: 400 });
  }

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

  cacheInvalidate(session.organizationId, "salary-advances", "dashboard");
  await logAudit({
    session,
    action: "create",
    entity: "salary_advance",
    entityId: advance.id,
    description: `Salary advance of ${advance.amount} given to ${advance.employee.firstName} ${advance.employee.lastName}`,
  });

  return NextResponse.json(advance, { status: 201 });
}
