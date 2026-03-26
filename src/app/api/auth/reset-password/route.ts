import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  const { email, code, password } = await req.json();

  if (!email || !code || !password) {
    return NextResponse.json({ error: "All fields are required" }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, resetCode: true, resetCodeExp: true },
  });

  if (!user || !user.resetCode || !user.resetCodeExp) {
    return NextResponse.json({ error: "Invalid or expired reset code" }, { status: 400 });
  }

  if (user.resetCode !== code) {
    return NextResponse.json({ error: "Invalid reset code" }, { status: 400 });
  }

  if (new Date() > user.resetCodeExp) {
    return NextResponse.json({ error: "Reset code has expired. Please request a new one." }, { status: 400 });
  }

  const hashed = await bcrypt.hash(password, 12);

  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashed, resetCode: null, resetCodeExp: null },
  });

  return NextResponse.json({ success: true });
}
