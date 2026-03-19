import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, hashPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { id } = await params;
  const data = await req.json();

  // Ensure user belongs to same org
  const existing = await prisma.user.findFirst({ where: { id, organizationId: session.organizationId } });
  if (!existing) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const updateData: Record<string, unknown> = {};
  if (data.name) updateData.name = data.name;
  if (data.username) {
    const taken = await prisma.user.findFirst({ where: { username: data.username, NOT: { id } } });
    if (taken) return NextResponse.json({ error: "Username already taken" }, { status: 400 });
    updateData.username = data.username;
    updateData.email = `${data.username}@team.local`;
  }
  if (data.permissions) updateData.permissions = JSON.stringify(data.permissions);
  if (data.password) updateData.password = await hashPassword(data.password);

  const user = await prisma.user.update({
    where: { id },
    data: updateData,
    select: { id: true, email: true, username: true, name: true, role: true, permissions: true, createdAt: true },
  });

  await logAudit({
    session,
    action: "update",
    entity: "team",
    entityId: id,
    description: `Updated team member "${user.name}"`,
  });

  return NextResponse.json(user);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { id } = await params;

  // Cannot delete yourself
  if (id === session.userId) {
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
  }

  const existing = await prisma.user.findFirst({ where: { id, organizationId: session.organizationId } });
  if (!existing) return NextResponse.json({ error: "User not found" }, { status: 404 });

  await prisma.user.delete({ where: { id } });

  await logAudit({
    session,
    action: "delete",
    entity: "team",
    entityId: id,
    description: `Removed team member "${existing.name}"`,
  });

  return NextResponse.json({ success: true });
}
