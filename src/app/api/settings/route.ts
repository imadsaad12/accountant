import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions, hashPassword, verifyPassword } from "@/lib/auth";
import { canEdit } from "@/lib/permissions";
import { parseOrgSettings } from "@/lib/settings";

export async function GET() {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [org, user] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: session.organizationId },
      select: { settings: true, name: true, deletionRequestedAt: true, dataExportRequestedAt: true },
    }),
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { theme: true, language: true, email: true },
    }),
  ]);

  return NextResponse.json({
    orgSettings: parseOrgSettings(org?.settings),
    orgName: org?.name ?? "",
    userPrefs: {
      theme: user?.theme ?? "dark",
      language: user?.language ?? "en",
    },
    userEmail: session.role === "admin" ? (user?.email || session.email) : null,
    canEditOrg: canEdit(session.permissions, "settings"),
    deletionRequestedAt: org?.deletionRequestedAt ?? null,
    dataExportRequestedAt: org?.dataExportRequestedAt ?? null,
  });
}

export async function PUT(req: NextRequest) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  if (body.type === "org") {
    if (!canEdit(session.permissions, "settings")) {
      return NextResponse.json({ error: "No permission" }, { status: 403 });
    }

    // Handle org name update separately
    if (body.data.orgName !== undefined) {
      const name = String(body.data.orgName).trim();
      if (name) {
        await prisma.organization.update({
          where: { id: session.organizationId },
          data: { name },
        });
      }
    }

    // Handle org settings (JSON blob)
    const { orgName, ...settingsData } = body.data;
    void orgName; // acknowledged
    if (Object.keys(settingsData).length > 0) {
      const current = await prisma.organization.findUnique({
        where: { id: session.organizationId },
        select: { settings: true },
      });
      const current_settings = parseOrgSettings(current?.settings);
      const updated = { ...current_settings, ...settingsData };
      await prisma.organization.update({
        where: { id: session.organizationId },
        data: { settings: JSON.stringify(updated) },
      });
      return NextResponse.json({ orgSettings: updated });
    }

    return NextResponse.json({ success: true });
  }

  if (body.type === "user") {
    const allowed = ["theme", "language"];
    const data: Record<string, string> = {};
    for (const key of allowed) {
      if (body.data[key] !== undefined) data[key] = body.data[key];
    }
    const user = await prisma.user.update({
      where: { id: session.userId },
      data,
      select: { theme: true, language: true },
    });
    return NextResponse.json({ userPrefs: user });
  }

  if (body.type === "account") {
    if (session.role !== "admin") {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }
    const updateData: Record<string, unknown> = {};

    if (body.data.email !== undefined) {
      const email = String(body.data.email).trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
      }
      const taken = await prisma.user.findFirst({ where: { email, NOT: { id: session.userId } } });
      if (taken) {
        return NextResponse.json({ error: "Email already in use" }, { status: 400 });
      }
      updateData.email = email;
    }

    if (body.data.password !== undefined) {
      const password = String(body.data.password);
      if (password.length < 6) {
        return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
      }
      const currentUser = await prisma.user.findUnique({ where: { id: session.userId }, select: { password: true } });
      const valid = await verifyPassword(String(body.data.currentPassword ?? ""), currentUser?.password ?? "");
      if (!valid) {
        return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
      }
      updateData.password = await hashPassword(password);
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.user.update({ where: { id: session.userId }, data: updateData });
    }
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid type" }, { status: 400 });
}
