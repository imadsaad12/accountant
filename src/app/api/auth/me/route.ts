import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parsePermissions, DEFAULT_ADMIN_PERMISSIONS } from "@/lib/permissions";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { permissions: true, role: true, organizationId: true },
  });

  const permissions = user?.role === "admin"
    ? DEFAULT_ADMIN_PERMISSIONS
    : parsePermissions(user?.permissions);

  return NextResponse.json({
    user: session,
    role: user?.role || session.role,
    organizationId: session.organizationId,
    permissions,
  });
}
