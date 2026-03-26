import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  await prisma.organization.update({
    where: { id: session.organizationId },
    data: {
      deletionRequestedAt: new Date(),
      status: "pending_deletion",
    },
  });

  return NextResponse.json({ success: true });
}

// Undo — only callable internally but kept here for symmetry
export async function DELETE() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  await prisma.organization.update({
    where: { id: session.organizationId },
    data: { deletionRequestedAt: null, status: "active" },
  });

  return NextResponse.json({ success: true });
}
