import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canView, canEdit } from "@/lib/permissions";

const DEFAULT_ACCOUNTS = [
  { code: "1000", name: "Cash", type: "asset", subtype: "current_asset", isDefault: true },
  { code: "1100", name: "Accounts Receivable", type: "asset", subtype: "current_asset", isDefault: true },
  { code: "1200", name: "Inventory", type: "asset", subtype: "current_asset", isDefault: true },
  { code: "1500", name: "Equipment", type: "asset", subtype: "fixed_asset", isDefault: true },
  { code: "2000", name: "Accounts Payable", type: "liability", subtype: "current_liability", isDefault: true },
  { code: "2100", name: "Tax Payable", type: "liability", subtype: "current_liability", isDefault: true },
  { code: "3000", name: "Owner's Equity", type: "equity", subtype: null, isDefault: true },
  { code: "3100", name: "Retained Earnings", type: "equity", subtype: null, isDefault: true },
  { code: "4000", name: "Sales Revenue", type: "revenue", subtype: null, isDefault: true },
  { code: "4100", name: "Service Revenue", type: "revenue", subtype: null, isDefault: true },
  { code: "5000", name: "Cost of Goods Sold", type: "expense", subtype: null, isDefault: true },
  { code: "5100", name: "Rent Expense", type: "expense", subtype: null, isDefault: true },
  { code: "5200", name: "Utilities Expense", type: "expense", subtype: null, isDefault: true },
  { code: "5300", name: "Salaries Expense", type: "expense", subtype: null, isDefault: true },
  { code: "5400", name: "Marketing Expense", type: "expense", subtype: null, isDefault: true },
  { code: "5500", name: "Office Supplies", type: "expense", subtype: null, isDefault: true },
  { code: "5600", name: "Travel Expense", type: "expense", subtype: null, isDefault: true },
  { code: "5700", name: "Insurance Expense", type: "expense", subtype: null, isDefault: true },
  { code: "5900", name: "Other Expenses", type: "expense", subtype: null, isDefault: true },
];

export async function GET(_req: NextRequest) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canView(session.permissions, "accounts")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  // Seed defaults if org has no accounts yet
  const count = await prisma.account.count({ where: { organizationId: session.organizationId } });
  if (count === 0) {
    await prisma.account.createMany({
      data: DEFAULT_ACCOUNTS.map((a) => ({ ...a, organizationId: session.organizationId })),
      skipDuplicates: true,
    });
  }

  const accounts = await prisma.account.findMany({
    where: { organizationId: session.organizationId },
    orderBy: { code: "asc" },
  });
  return NextResponse.json(accounts);
}

export async function POST(req: NextRequest) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "accounts")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const data = await req.json();
  const account = await prisma.account.create({
    data: {
      code: data.code,
      name: data.name,
      type: data.type,
      subtype: data.subtype || null,
      description: data.description || null,
      organizationId: session.organizationId,
    },
  });

  await logAudit({ session, action: "create", entity: "account", entityId: account.id, description: `Created account ${account.code} - ${account.name}` });
  return NextResponse.json(account, { status: 201 });
}
