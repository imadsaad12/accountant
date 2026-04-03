import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
import { canView } from "@/lib/permissions";

export async function GET() {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canView(session.permissions, "tax")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const [invoices, taxAgg] = await Promise.all([
    prisma.invoice.findMany({
      where: { organizationId: session.organizationId },
      select: {
        id: true,
        number: true,
        date: true,
        status: true,
        subtotal: true,
        tax: true,
        taxRate: true,
        total: true,
        client: { select: { name: true } },
      },
      orderBy: { date: "desc" },
    }),
    prisma.invoice.aggregate({
      where: { organizationId: session.organizationId },
      _sum: { tax: true },
    }),
  ]);

  const totalTaxCollected = taxAgg._sum.tax ?? 0;

  return NextResponse.json({ invoices, totalTaxCollected });
}
