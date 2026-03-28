import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";

async function getCustomCategories(orgId: string): Promise<string[]> {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { settings: true } });
  try {
    const settings = JSON.parse(org?.settings ?? "{}");
    return Array.isArray(settings.customExpenseCategories) ? settings.customExpenseCategories : [];
  } catch {
    return [];
  }
}

async function saveCustomCategories(orgId: string, categories: string[]) {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { settings: true } });
  const settings = (() => { try { return JSON.parse(org?.settings ?? "{}"); } catch { return {}; } })();
  settings.customExpenseCategories = categories;
  await prisma.organization.update({ where: { id: orgId }, data: { settings: JSON.stringify(settings) } });
}

export async function GET() {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const categories = await getCustomCategories(session.organizationId);
  return NextResponse.json({ categories });
}

export async function POST(req: NextRequest) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "settings")) return NextResponse.json({ error: "No permission" }, { status: 403 });
  const { name } = await req.json();
  const slug = String(name ?? "").trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  if (!slug) return NextResponse.json({ error: "Invalid category name" }, { status: 400 });
  const categories = await getCustomCategories(session.organizationId);
  if (categories.includes(slug)) return NextResponse.json({ error: "Category already exists" }, { status: 400 });
  categories.push(slug);
  await saveCustomCategories(session.organizationId, categories);
  return NextResponse.json({ categories });
}

export async function DELETE(req: NextRequest) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "settings")) return NextResponse.json({ error: "No permission" }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const name = searchParams.get("name");
  if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });
  const categories = await getCustomCategories(session.organizationId);
  const updated = categories.filter(c => c !== name);
  await saveCustomCategories(session.organizationId, updated);
  return NextResponse.json({ categories: updated });
}
