import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

// GET /api/ai/chats — list all chats for current user
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const chats = await prisma.aiChat.findMany({
    where: { userId: session.userId, organizationId: session.organizationId },
    select: { id: true, title: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  return NextResponse.json(chats);
}

// POST /api/ai/chats — create a new chat
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const title = body.title || "New Chat";
  const messages = body.messages ? JSON.stringify(body.messages) : "[]";

  const chat = await prisma.aiChat.create({
    data: {
      title,
      messages,
      userId: session.userId,
      organizationId: session.organizationId,
    },
  });

  return NextResponse.json(chat);
}
