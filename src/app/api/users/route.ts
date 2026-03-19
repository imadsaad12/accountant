import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, hashPassword } from "@/lib/auth";
import { DEFAULT_EMPLOYEE_PERMISSIONS } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const users = await prisma.user.findMany({
    where: { organizationId: session.organizationId },
    select: { id: true, email: true, username: true, name: true, role: true, permissions: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { username, password, name, permissions } = await req.json();

  if (!username || !password || !name) {
    return NextResponse.json({ error: "Username, password, and name are required" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return NextResponse.json({ error: "Username already taken" }, { status: 400 });
  }

  // Generate a placeholder email so the unique email constraint is satisfied
  const placeholderEmail = `${username}@team.local`;

  const hashed = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email: placeholderEmail,
      username,
      password: hashed,
      name,
      role: "employee",
      permissions: JSON.stringify(permissions || DEFAULT_EMPLOYEE_PERMISSIONS),
      organizationId: session.organizationId,
    },
    select: { id: true, email: true, username: true, name: true, role: true, permissions: true, createdAt: true },
  });

  await logAudit({
    session,
    action: "create",
    entity: "team",
    entityId: user.id,
    description: `Added team member "${name}" (@${username})`,
  });

  return NextResponse.json(user, { status: 201 });
}
