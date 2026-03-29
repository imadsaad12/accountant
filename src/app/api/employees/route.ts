import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canView, canEdit } from "@/lib/permissions";
import { cacheGet, cacheSet, cacheInvalidate } from "@/lib/server-cache";

export async function GET() {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canView(session.permissions, "employees")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const cacheKey = session.organizationId + ":employees";
  const cached = cacheGet<unknown[]>(cacheKey);
  if (cached) return NextResponse.json(cached);

  const [employees, advances] = await Promise.all([
    prisma.employee.findMany({
      where: { organizationId: session.organizationId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.salaryAdvance.groupBy({
      by: ["employeeId"],
      where: { organizationId: session.organizationId, status: "pending" },
      _sum: { amount: true },
    }),
  ]);

  const advanceMap = new Map(advances.map(a => [a.employeeId, a._sum.amount ?? 0]));
  const result = employees.map(emp => ({ ...emp, outstandingAdvance: advanceMap.get(emp.id) ?? 0 }));

  cacheSet(cacheKey, result, 120_000);
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "employees")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const data = await req.json();
  const salaryRate = parseFloat(data.salary);
  const salaryPeriod: string = data.salaryPeriod || "month";

  const employee = await prisma.employee.create({
    data: {
      ...data,
      salary: salaryRate,
      salaryPeriod,
      hireDate: data.hireDate ? new Date(data.hireDate) : new Date(),
      organizationId: session.organizationId,
    },
  });

  cacheInvalidate(session.organizationId, "employees", "dashboard");
  await logAudit({ session, action: "create", entity: "employee", entityId: employee.id, description: `Created employee "${employee.firstName} ${employee.lastName}" (${employee.position})` });
  return NextResponse.json(employee, { status: 201 });
}
