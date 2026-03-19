import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const translations = {
  en: {
    invoice: "INVOICE",
    invoiceNumber: "Invoice #",
    date: "Date",
    dueDate: "Due Date",
    billTo: "Bill To",
    description: "Description",
    quantity: "Quantity",
    unitPrice: "Unit Price",
    total: "Total",
    subtotal: "Subtotal",
    tax: "Tax",
    grandTotal: "Total Due",
    notes: "Notes",
    thankYou: "Thank you for your business!",
    page: "Page",
    status: "Status",
  },
  fr: {
    invoice: "FACTURE",
    invoiceNumber: "Facture N°",
    date: "Date",
    dueDate: "Date d'échéance",
    billTo: "Facturer à",
    description: "Description",
    quantity: "Quantité",
    unitPrice: "Prix unitaire",
    total: "Total",
    subtotal: "Sous-total",
    tax: "Taxe",
    grandTotal: "Total à payer",
    notes: "Notes",
    thankYou: "Merci pour votre confiance !",
    page: "Page",
    status: "Statut",
  },
  ar: {
    invoice: "فاتورة",
    invoiceNumber: "رقم الفاتورة",
    date: "التاريخ",
    dueDate: "تاريخ الاستحقاق",
    billTo: "فاتورة إلى",
    description: "الوصف",
    quantity: "الكمية",
    unitPrice: "سعر الوحدة",
    total: "المجموع",
    subtotal: "المجموع الفرعي",
    tax: "الضريبة",
    grandTotal: "المبلغ الإجمالي",
    notes: "ملاحظات",
    thankYou: "شكراً لتعاملكم معنا!",
    page: "صفحة",
    status: "الحالة",
  },
};

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { invoiceId, language = "fr" } = await req.json();
  const lang = translations[language as keyof typeof translations] || translations.fr;
  const isRTL = language === "ar";

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, organizationId: session.organizationId },
    include: { client: true, items: { include: { product: true } } },
  });

  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(24);
  doc.setTextColor(37, 99, 235);
  if (isRTL) {
    doc.text(lang.invoice, pageWidth - 20, 30, { align: "right" });
  } else {
    doc.text(lang.invoice, 20, 30);
  }

  // Company info
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  const companyX = isRTL ? 20 : pageWidth - 20;
  const companyAlign = isRTL ? "left" : "right";
  doc.text("Accountant", companyX, 20, { align: companyAlign });
  doc.text("Business Management System", companyX, 25, { align: companyAlign });

  // Invoice details
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  const detailsX = isRTL ? pageWidth - 20 : 20;
  const detailsAlign: "left" | "right" = isRTL ? "right" : "left";
  let y = 45;

  doc.setFont("helvetica", "bold");
  doc.text(`${lang.invoiceNumber}: ${invoice.number}`, detailsX, y, { align: detailsAlign });
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.text(`${lang.date}: ${new Date(invoice.date).toLocaleDateString()}`, detailsX, y, { align: detailsAlign });
  y += 6;
  if (invoice.dueDate) {
    doc.text(`${lang.dueDate}: ${new Date(invoice.dueDate).toLocaleDateString()}`, detailsX, y, { align: detailsAlign });
    y += 6;
  }
  doc.text(`${lang.status}: ${invoice.status.toUpperCase()}`, detailsX, y, { align: detailsAlign });

  // Client info
  y = 45;
  const clientX = isRTL ? 20 : pageWidth - 20;
  const clientAlign: "left" | "right" = isRTL ? "left" : "right";
  doc.setFont("helvetica", "bold");
  doc.text(lang.billTo, clientX, y, { align: clientAlign });
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.text(invoice.client.name, clientX, y, { align: clientAlign });

  // Items table
  const tableY = 85;
  const tableHead = [[lang.description, lang.quantity, lang.unitPrice, lang.total]];
  const tableBody = invoice.items.map(item => [
    item.description,
    String(item.quantity),
    `$${item.unitPrice.toFixed(2)}`,
    `$${item.total.toFixed(2)}`,
  ]);

  autoTable(doc, {
    startY: tableY,
    head: tableHead,
    body: tableBody,
    theme: "striped",
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontSize: 10, fontStyle: "bold" },
    bodyStyles: { fontSize: 9 },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 25, halign: "center" },
      2: { cellWidth: 30, halign: "right" },
      3: { cellWidth: 30, halign: "right" },
    },
    margin: { left: 20, right: 20 },
  });

  // Totals
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY = (doc as any).lastAutoTable.finalY + 10;
  const totalsX = isRTL ? 20 : pageWidth - 20;
  const totalsAlign: "left" | "right" = isRTL ? "left" : "right";

  doc.setFontSize(10);
  doc.text(`${lang.subtotal}: $${invoice.subtotal.toFixed(2)}`, totalsX, finalY, { align: totalsAlign });
  doc.text(`${lang.tax} (${invoice.taxRate}%): $${invoice.tax.toFixed(2)}`, totalsX, finalY + 7, { align: totalsAlign });

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(37, 99, 235);
  doc.text(`${lang.grandTotal}: $${invoice.total.toFixed(2)}`, totalsX, finalY + 18, { align: totalsAlign });

  // Notes
  if (invoice.notes) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(`${lang.notes}: ${invoice.notes}`, isRTL ? pageWidth - 20 : 20, finalY + 35, { align: detailsAlign });
  }

  // Footer
  doc.setFontSize(9);
  doc.setTextColor(150, 150, 150);
  doc.text(lang.thankYou, pageWidth / 2, doc.internal.pageSize.getHeight() - 20, { align: "center" });

  const pdfBuffer = Buffer.from(doc.output("arraybuffer"));

  return new NextResponse(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice.number}-${language}.pdf"`,
    },
  });
}
