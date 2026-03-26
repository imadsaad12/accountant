import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/email";

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, email: true } });

  // Always return success to prevent email enumeration
  if (!user) return NextResponse.json({ success: true });

  const code = generateCode();
  const resetCodeExp = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  await prisma.user.update({
    where: { id: user.id },
    data: { resetCode: code, resetCodeExp },
  });

  try {
    await sendPasswordResetEmail(user.email, code, user.name);
  } catch {
    return NextResponse.json({ error: "Failed to send email. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
