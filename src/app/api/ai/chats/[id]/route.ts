import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

// GET /api/ai/chats/:id — get a single chat with messages
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const chat = await prisma.aiChat.findFirst({
    where: { id, userId: session.userId, organizationId: session.organizationId },
  });

  if (!chat) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    ...chat,
    messages: JSON.parse(chat.messages),
  });
}

// PUT /api/ai/chats/:id — update chat (title, messages)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const chat = await prisma.aiChat.findFirst({
    where: { id, userId: session.userId },
  });
  if (!chat) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const data: { title?: string; messages?: string } = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.messages !== undefined) data.messages = JSON.stringify(body.messages);

  const updated = await prisma.aiChat.update({
    where: { id },
    data,
  });

  return NextResponse.json(updated);
}

// DELETE /api/ai/chats/:id — delete a chat
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const chat = await prisma.aiChat.findFirst({
    where: { id, userId: session.userId },
  });
  if (!chat) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.aiChat.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
