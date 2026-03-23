import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canView, canEdit } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canView(session.permissions, "expenses")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const category = searchParams.get("category");

  const where: Record<string, unknown> = {
    organizationId: session.organizationId,
  };
  if (from || to) {
    where.date = {};
    if (from) (where.date as Record<string, unknown>).gte = new Date(from + "T00:00:00.000Z");
    if (to) (where.date as Record<string, unknown>).lte = new Date(to + "T23:59:59.999Z");
  }
  if (category) where.category = category;

  const storedExpenses = await prisma.expense.findMany({
    where,
    orderBy: { date: "desc" },
    include: { createdBy: { select: { name: true } }, account: { select: { name: true, code: true } } },
  });

  // Dynamically compute salary rows — use provided range or default to current year
  const salaryRows: typeof storedExpenses = [];
  const now = new Date();
  const effectiveFrom = from ?? `${now.getFullYear()}-01-01`;
  const effectiveTo   = to   ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  if (!category || category === "salaries") {
    const fromDate = new Date(effectiveFrom + "T00:00:00.000Z");
    const toDate = new Date(effectiveTo + "T23:59:59.999Z");

    const employees = await prisma.employee.findMany({
      where: {
        organizationId: session.organizationId,
        hireDate: { lte: toDate },
      },
    });

    for (const emp of employees) {
      const hireDate = new Date(emp.hireDate);
      const empStart = hireDate > fromDate ? hireDate : fromDate;
      const days = Math.floor((toDate.getTime() - empStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      if (days <= 0) continue;

      const rate = Number(emp.salary);
      const period = emp.salaryPeriod || "month";
      let amount = 0;
      let description = "";

      if (period === "day") {
        amount = parseFloat((rate * days).toFixed(2));
        description = `Salary — ${emp.firstName} ${emp.lastName} (${rate}/day × ${days} days)`;
      } else if (period === "week") {
        const weeks = parseFloat((days / 7).toFixed(2));
        amount = parseFloat((rate * weeks).toFixed(2));
        description = `Salary — ${emp.firstName} ${emp.lastName} (${rate}/week × ${weeks} weeks)`;
      } else {
        // Use exact calendar months when the range aligns to month boundaries
        // (e.g. Feb 1–Feb 28 = 1 month, not 0.93; Mar 1–Mar 31 = 1 month, not 1.03)
        const startDay = empStart.getDate();
        const endDay   = toDate.getDate();
        const lastDayOfEndMonth = new Date(toDate.getFullYear(), toDate.getMonth() + 1, 0).getDate();
        let months: number;
        if (startDay === 1 && endDay === lastDayOfEndMonth) {
          months = (toDate.getFullYear() - empStart.getFullYear()) * 12 + (toDate.getMonth() - empStart.getMonth()) + 1;
        } else {
          months = parseFloat((days / 30).toFixed(2));
        }
        amount = parseFloat((rate * months).toFixed(2));
        description = `Salary — ${emp.firstName} ${emp.lastName} (${rate}/month × ${months} month${months === 1 ? "" : "s"})`;
      }

      salaryRows.push({
        id: `salary-${emp.id}`,
        date: empStart,
        amount,
        description,
        category: "salaries",
        recurrence: "none",
        vendor: `${emp.firstName} ${emp.lastName}`,
        reference: emp.id,
        note: null,
        accountId: null,
        organizationId: session.organizationId,
        createdById: null,
        createdAt: empStart,
        updatedAt: empStart,
        createdBy: null,
        account: null,
      });
    }
  }

  return NextResponse.json([...salaryRows, ...storedExpenses]);
}

export async function POST(req: NextRequest) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "expenses")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const data = await req.json();
  const expense = await prisma.expense.create({
    data: {
      date: new Date(data.date),
      amount: parseFloat(data.amount),
      description: data.description,
      category: data.category,
      recurrence: data.recurrence || "none",
      vendor: data.vendor || null,
      reference: data.reference || null,
      note: data.note || null,
      accountId: data.accountId || null,
      organizationId: session.organizationId,
      createdById: session.userId,
    },
    include: { createdBy: { select: { name: true } }, account: { select: { name: true, code: true } } },
  });

  await logAudit({
    session,
    action: "create",
    entity: "expense",
    entityId: expense.id,
    description: `Recorded expense: ${expense.description} - ${expense.amount}`,
  });

  return NextResponse.json(expense, { status: 201 });
}
