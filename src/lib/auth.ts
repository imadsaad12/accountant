import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { parsePermissions, type Permissions } from "@/lib/permissions";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "accountant-secret-key-change-in-production"
);

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hashed: string) {
  return bcrypt.compare(password, hashed);
}

export async function createToken(payload: { userId: string; email: string; name: string; role: string; organizationId: string }) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("180d")
    .sign(SECRET);
}

export async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as { userId: string; email: string; name: string; role: string; organizationId: string };
  } catch {
    return null;
  }
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function getSessionWithPermissions() {
  const session = await getSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { permissions: true },
  });

  if (session.role === "admin") {
    // Use stored permissions if set by admin panel (plan-based), otherwise full access
    const { DEFAULT_ADMIN_PERMISSIONS } = await import("@/lib/permissions");
    return {
      ...session,
      permissions: user?.permissions ? parsePermissions(user.permissions) : DEFAULT_ADMIN_PERMISSIONS,
      isAdmin: true,
    };
  }

  return {
    ...session,
    permissions: parsePermissions(user?.permissions) as Permissions,
    isAdmin: false,
  };
}
