import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, sections } = await req.json();
  if (!title || !sections) {
    return NextResponse.json({ error: "Missing title or sections" }, { status: 400 });
  }

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = 20;

  // Header background
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, pageWidth, 45, "F");

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text(title, margin, 28);

  // Date
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Generated: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`, margin, 38);

  y = 55;

  // Sections
  for (const section of sections) {
    // Check if we need a new page
    if (y > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage();
      y = 20;
    }

    // Section heading
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(37, 99, 235);
    doc.text(section.heading || "", margin, y);
    y += 2;

    // Underline
    doc.setDrawColor(37, 99, 235);
    doc.setLineWidth(0.5);
    doc.line(margin, y, margin + contentWidth, y);
    y += 8;

    // Section content
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(50, 50, 50);

    const lines = (section.text || "").split("\n");
    for (const line of lines) {
      if (y > doc.internal.pageSize.getHeight() - 25) {
        doc.addPage();
        y = 20;
      }

      const trimmed = line.trim();

      // Detect table-like data (lines with | separators or key: value patterns)
      if (trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
        // Bullet point
        doc.setFont("helvetica", "normal");
        const bulletText = trimmed.replace(/^[-•]\s*/, "");
        const wrapped = doc.splitTextToSize(`  •  ${bulletText}`, contentWidth);
        doc.text(wrapped, margin, y);
        y += wrapped.length * 5;
      } else if (trimmed.includes(":") && trimmed.indexOf(":") < 35) {
        // Key-value pair - bold the key
        const colonIndex = trimmed.indexOf(":");
        const key = trimmed.substring(0, colonIndex + 1);
        const value = trimmed.substring(colonIndex + 1);

        doc.setFont("helvetica", "bold");
        doc.text(key, margin, y);
        const keyWidth = doc.getTextWidth(key);
        doc.setFont("helvetica", "normal");
        const wrapped = doc.splitTextToSize(value.trim(), contentWidth - keyWidth - 2);
        doc.text(wrapped, margin + keyWidth + 2, y);
        y += Math.max(wrapped.length, 1) * 5;
      } else if (trimmed === "") {
        y += 3;
      } else {
        const wrapped = doc.splitTextToSize(trimmed, contentWidth);
        doc.text(wrapped, margin, y);
        y += wrapped.length * 5;
      }
    }

    // Check if section has tabular data
    if (section.table) {
      autoTable(doc, {
        startY: y,
        head: [section.table.headers],
        body: section.table.rows,
        theme: "striped",
        headStyles: { fillColor: [37, 99, 235], textColor: 255, fontSize: 9, fontStyle: "bold" },
        bodyStyles: { fontSize: 8 },
        margin: { left: margin, right: margin },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      y = (doc as any).lastAutoTable.finalY + 10;
    }

    y += 8;
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Accountant - AI Report | Page ${i} of ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: "center" }
    );
  }

  const pdfBuffer = Buffer.from(doc.output("arraybuffer"));

  return new NextResponse(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="report-${Date.now()}.pdf"`,
    },
  });
}
