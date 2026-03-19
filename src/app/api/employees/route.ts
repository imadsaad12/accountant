import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canView, canEdit } from "@/lib/permissions";

export async function GET() {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canView(session.permissions, "employees")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const employees = await prisma.employee.findMany({
    where: { organizationId: session.organizationId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(employees);
}

export async function POST(req: NextRequest) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "employees")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const data = await req.json();
  const employee = await prisma.employee.create({
    data: {
      ...data,
      salary: parseFloat(data.salary),
      hireDate: data.hireDate ? new Date(data.hireDate) : new Date(),
      organizationId: session.organizationId,
    },
  });

  // Auto-create salary expense for the current month
  const now = new Date();
  const monthLabel = now.toLocaleString("en", { month: "long", year: "numeric" });
  await prisma.expense.create({
    data: {
      date: new Date(now.getFullYear(), now.getMonth(), 1),
      amount: parseFloat(data.salary),
      description: `Salary — ${employee.firstName} ${employee.lastName}`,
      category: "salaries",
      recurrence: "monthly",
      vendor: `${employee.firstName} ${employee.lastName}`,
      reference: employee.id,
      organizationId: session.organizationId,
      createdById: session.userId,
    },
  });

  await logAudit({ session, action: "create", entity: "employee", entityId: employee.id, description: `Created employee "${employee.firstName} ${employee.lastName}" (${employee.position})` });
  return NextResponse.json(employee, { status: 201 });
}
