import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canView, canEdit } from "@/lib/permissions";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canView(session.permissions, "employees")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { id } = await params;
  const employee = await prisma.employee.findFirst({ where: { id, organizationId: session.organizationId } });
  if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(employee);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "employees")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.employee.findFirst({ where: { id, organizationId: session.organizationId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data = await req.json();
  const newSalary = data.salary ? parseFloat(data.salary) : undefined;
  const newPeriod: string = data.salaryPeriod || existing.salaryPeriod || "month";
  const employee = await prisma.employee.update({
    where: { id },
    data: {
      ...data,
      salary: newSalary,
      salaryPeriod: newPeriod,
      hireDate: data.hireDate ? new Date(data.hireDate) : undefined,
      inactiveDate: data.status === "inactive" && data.inactiveDate ? new Date(data.inactiveDate) : data.status === "active" ? null : undefined,
    },
  });

  await logAudit({ session, action: "update", entity: "employee", entityId: employee.id, description: `Updated employee "${employee.firstName} ${employee.lastName}"` });
  return NextResponse.json(employee);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "employees")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { id } = await params;
  const employee = await prisma.employee.findFirst({ where: { id, organizationId: session.organizationId } });
  if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.expense.deleteMany({ where: { organizationId: session.organizationId, category: "salaries", reference: id } });
  await prisma.employee.delete({ where: { id } });
  await logAudit({ session, action: "delete", entity: "employee", entityId: id, description: `Deleted employee "${employee.firstName} ${employee.lastName}"` });
  return NextResponse.json({ success: true });
}
