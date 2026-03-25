import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword, createToken } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { parsePermissions, DEFAULT_ADMIN_PERMISSIONS } from "@/lib/permissions";

export async function POST(req: NextRequest) {
  try {
    const { email: input, password } = await req.json();

    const user = input?.includes("@")
      ? await prisma.user.findUnique({ where: { email: input }, select: { id: true, email: true, name: true, role: true, organizationId: true, password: true, username: true, permissions: true } })
      : await prisma.user.findUnique({ where: { username: input }, select: { id: true, email: true, name: true, role: true, organizationId: true, password: true, username: true, permissions: true } });
    if (!user) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const valid = await verifyPassword(password, user.password);
    if (!valid) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const token = await createToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
    });

    await logAudit({
      session: { userId: user.id, email: user.email, name: user.name, organizationId: user.organizationId },
      action: "create",
      entity: "auth",
      entityId: user.id,
      description: `User "${user.name}" logged in`,
    });

    const permissions = user.role === "admin"
      ? DEFAULT_ADMIN_PERMISSIONS
      : parsePermissions(user.permissions);

    const response = NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      role: user.role,
      permissions,
    });
    response.cookies.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
