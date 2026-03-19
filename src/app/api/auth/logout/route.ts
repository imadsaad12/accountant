import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function POST() {
  const session = await getSession();

  if (session) {
    await logAudit({
      session,
      action: "delete",
      entity: "auth",
      entityId: session.userId,
      description: `User "${session.name}" logged out`,
    });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set("token", "", { maxAge: 0 });
  return response;
}
