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
  const salaryRate = parseFloat(data.salary);
  const salaryPeriod: string = data.salaryPeriod || "month";
  const monthlyAmount = salaryPeriod === "day" ? salaryRate * 30 : salaryPeriod === "week" ? salaryRate * 4 : salaryRate;

  const employee = await prisma.employee.create({
    data: {
      ...data,
      salary: salaryRate,
      salaryPeriod,
      hireDate: data.hireDate ? new Date(data.hireDate) : new Date(),
      organizationId: session.organizationId,
    },
  });

  // Auto-create salary expense dated on the employee's hire date
  const periodLabel = salaryPeriod === "day" ? `${salaryRate}/day × 30 days` : salaryPeriod === "week" ? `${salaryRate}/week × 4 weeks` : null;
  await prisma.expense.create({
    data: {
      date: data.hireDate ? new Date(data.hireDate) : new Date(),
      amount: monthlyAmount,
      description: `Salary — ${employee.firstName} ${employee.lastName}${periodLabel ? ` (${periodLabel})` : ""}`,
      category: "salaries",
      recurrence: salaryPeriod === "month" ? "monthly" : salaryPeriod === "week" ? "weekly" : "none",
      vendor: `${employee.firstName} ${employee.lastName}`,
      reference: employee.id,
      organizationId: session.organizationId,
    },
  });

  await logAudit({ session, action: "create", entity: "employee", entityId: employee.id, description: `Created employee "${employee.firstName} ${employee.lastName}" (${employee.position})` });
  return NextResponse.json(employee, { status: 201 });
}
