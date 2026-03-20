import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, createToken } from "@/lib/auth";
import { DEFAULT_ADMIN_PERMISSIONS } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const { email, password, name, organizationName } = await req.json();

    if (!organizationName || !organizationName.trim()) {
      return NextResponse.json({ error: "Organization name is required" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Email already exists" }, { status: 400 });
    }

    const hashed = await hashPassword(password);

    // Create organization and admin user in a transaction
    const platformConfig = await prisma.platformConfig.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    });

    const { user, organization } = await prisma.$transaction(async (tx) => {
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + platformConfig.defaultTrialDays);

      const organization = await tx.organization.create({
        data: {
          name: organizationName.trim(),
          status: "trial",
          plan: "trial",
          trialEndsAt,
          maxUsers: platformConfig.defaultMaxUsers,
          aiTokensLimit: platformConfig.defaultAiTokensLimit,
          aiTokensUsed: 0,
        },
      });

      const user = await tx.user.create({
        data: {
          email,
          password: hashed,
          name,
          role: "admin",
          permissions: JSON.stringify(DEFAULT_ADMIN_PERMISSIONS),
          organizationId: organization.id,
        },
      });

      return { user, organization };
    });

    await logAudit({
      session: { userId: user.id, email: user.email, name: user.name, organizationId: organization.id },
      action: "create",
      entity: "auth",
      entityId: user.id,
      description: `Organization "${organization.name}" registered by "${user.name}"`,
    });

    const token = await createToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: organization.id,
    });

    const response = NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      organization: { id: organization.id, name: organization.name },
    });
    response.cookies.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
