import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionWithPermissions } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canEdit } from "@/lib/permissions";
import * as XLSX from "xlsx";

export async function POST(req: NextRequest) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.permissions, "suppliers")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  const { organizationId } = session;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return NextResponse.json({ error: "Empty workbook" }, { status: 400 });

    const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
    if (rows.length === 0) return NextResponse.json({ error: "No data rows found" }, { status: 400 });

    const normalize = (key: string) => key.trim().toLowerCase().replace(/\s+/g, "_");

    const created: string[] = [];
    const skipped: { row: number; name: string; reason: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i];
      const row: Record<string, string> = {};
      for (const [k, v] of Object.entries(raw)) {
        row[normalize(k)] = String(v ?? "").trim();
      }

      const name = row.name || row.supplier_name || row.supplier || "";
      if (!name) {
        skipped.push({ row: i + 2, name: "(empty)", reason: "Missing name" });
        continue;
      }

      const email = row.email || row.e_mail || "";

      if (email) {
        const exists = await prisma.supplier.findFirst({ where: { email, organizationId } });
        if (exists) {
          skipped.push({ row: i + 2, name, reason: `Email "${email}" already exists` });
          continue;
        }
      }

      const paymentTerms = parseInt(row.payment_terms || row.paymentterms || row.terms || "") || null;

      await prisma.supplier.create({
        data: {
          name,
          contactName: row.contact_name || row.contactname || row.contact || null,
          email: email || null,
          phone: row.phone || row.telephone || row.mobile || null,
          address: row.address || null,
          city: row.city || null,
          country: row.country || null,
          taxId: null,
          paymentTerms,
          notes: row.notes || row.note || null,
          organizationId,
        },
      });

      created.push(name);
    }

    await logAudit({
      session,
      action: "create",
      entity: "supplier",
      entityId: "bulk-import",
      description: `Imported ${created.length} supplier(s) from Excel. ${skipped.length} skipped.`,
    });

    return NextResponse.json({
      imported: created.length,
      skipped: skipped.length,
      skippedDetails: skipped,
      importedNames: created,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to parse file";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
