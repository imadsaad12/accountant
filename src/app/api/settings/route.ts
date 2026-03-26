import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
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
      select: { theme: true, language: true },
    }),
  ]);

  return NextResponse.json({
    orgSettings: parseOrgSettings(org?.settings),
    orgName: org?.name ?? "",
    userPrefs: {
      theme: user?.theme ?? "dark",
      language: user?.language ?? "en",
    },
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

  return NextResponse.json({ error: "Invalid type" }, { status: 400 });
}
