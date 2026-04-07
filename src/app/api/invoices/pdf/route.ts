import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { parseOrgSettings } from "@/lib/settings";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { processArabicText, toArabicNumerals } from "@/lib/arabic-pdf";
import { amiriRegular } from "@/lib/fonts/amiri-regular";
import { amiriBold } from "@/lib/fonts/amiri-bold";

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$", EUR: "€", LBP: "ل.ل", XOF: "CFA", GNF: "FG", SLE: "Le", GHS: "₵", CDF: "FC", NGN: "₦",
};

const translations = {
  en: {
    invoice: "INVOICE", invoiceNumber: "Invoice #", date: "Date", dueDate: "Due Date",
    billTo: "Bill To", description: "Description", quantity: "Quantity", unitPrice: "Unit Price",
    total: "Total", subtotal: "Subtotal", tax: "Tax", grandTotal: "Total Due",
    notes: "Notes", thankYou: "Thank you for your business!", page: "Page", status: "Status",
    discount: "Discount",
  },
  fr: {
    invoice: "FACTURE", invoiceNumber: "Facture N°", date: "Date", dueDate: "Date d'échéance",
    billTo: "Facturer à", description: "Description", quantity: "Quantité", unitPrice: "Prix unitaire",
    total: "Total", subtotal: "Sous-total", tax: "Taxe", grandTotal: "Total à payer",
    notes: "Notes", thankYou: "Merci pour votre confiance !", page: "Page", status: "Statut",
    discount: "Remise",
  },
  ar: {
    invoice: "فاتورة", invoiceNumber: "رقم الفاتورة", date: "التاريخ", dueDate: "تاريخ الاستحقاق",
    billTo: "فاتورة إلى", description: "الوصف", quantity: "الكمية", unitPrice: "سعر الوحدة",
    total: "المجموع", subtotal: "المجموع الفرعي", tax: "الضريبة", grandTotal: "المبلغ الإجمالي",
    notes: "ملاحظات", thankYou: "شكراً لتعاملكم معنا!", page: "صفحة", status: "الحالة",
    discount: "خصم",
  },
};

const statusTranslations: Record<string, Record<string, string>> = {
  en: { draft: "DRAFT", sent: "SENT", paid: "PAID", partially_paid: "PARTIALLY PAID", overdue: "OVERDUE", cancelled: "CANCELLED" },
  fr: { draft: "BROUILLON", sent: "ENVOYÉE", paid: "PAYÉE", partially_paid: "PARTIELLEMENT PAYÉE", overdue: "EN RETARD", cancelled: "ANNULÉE" },
  ar: { draft: "مسودة", sent: "مرسلة", paid: "مدفوعة", partially_paid: "مدفوعة جزئياً", overdue: "متأخرة", cancelled: "ملغاة" },
};

function registerArabicFonts(doc: jsPDF) {
  doc.addFileToVFS("Amiri-Regular.ttf", amiriRegular);
  doc.addFont("Amiri-Regular.ttf", "Amiri", "normal");
  doc.addFileToVFS("Amiri-Bold.ttf", amiriBold);
  doc.addFont("Amiri-Bold.ttf", "Amiri", "bold");
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { invoiceId, language = "fr" } = await req.json();
  const lang = translations[language as keyof typeof translations] || translations.fr;
  const isRTL = language === "ar";

  const [invoice, org] = await Promise.all([
    prisma.invoice.findFirst({
      where: { id: invoiceId, organizationId: session.organizationId },
      include: { client: true, items: { include: { product: true } }, fees: true },
    }),
    prisma.organization.findUnique({ where: { id: session.organizationId }, select: { settings: true } }),
  ]);

  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const orgSettings = parseOrgSettings(org?.settings);
  const sym = CURRENCY_SYMBOLS[orgSettings.defaultCurrency] ?? orgSettings.defaultCurrency;

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // ar() reshapes pure Arabic text for visual RTL in jsPDF's LTR engine
  const ar = (s: string) => (isRTL ? processArabicText(s) : s);
  // arNum() converts digits to Arabic-Indic
  const arNum = (s: string) => (isRTL ? toArabicNumerals(s).replace(/\./g, ",") : s);

  // For mixed lines: "arabicLabel: value" — logical order, PDF viewer handles bidi
  const arLine = (label: string, value: string) => {
    if (!isRTL) return `${label}: ${value}`;
    return `${ar(label)}: ${arNum(value)}`;
  };

  // For lines with parenthetical: "label (detail): value"
  const arLineP = (label: string, detail: string, value: string) => {
    if (!isRTL) return `${label} (${detail}): ${value}`;
    return `${ar(label)} )${arNum(detail)}(: ${arNum(value)}`;
  };

  const setFont = (style: "normal" | "bold") => {
    if (isRTL) doc.setFont("Amiri", style);
    else doc.setFont("helvetica", style);
  };

  if (isRTL) {
    registerArabicFonts(doc);
    doc.setFont("Amiri", "normal");
  }

  // Header
  doc.setFontSize(24);
  doc.setTextColor(37, 99, 235);
  setFont("bold");
  doc.text(ar(lang.invoice), isRTL ? pageWidth - 20 : 20, 30, { align: isRTL ? "right" : "left" });

  // Company info
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  setFont("normal");
  const companyX = isRTL ? 20 : pageWidth - 20;
  const companyAlign: "left" | "right" = isRTL ? "left" : "right";
  doc.text("Cashent", companyX, 20, { align: companyAlign });
  doc.text("Business Management System", companyX, 25, { align: companyAlign });

  // Invoice details
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  const detailsX = isRTL ? pageWidth - 20 : 20;
  const detailsAlign: "left" | "right" = isRTL ? "right" : "left";
  let y = 45;

  setFont("bold");
  doc.text(arLine(lang.invoiceNumber, invoice.number), detailsX, y, { align: detailsAlign });
  y += 6;
  setFont("normal");
  doc.text(arLine(lang.date, new Date(invoice.date).toLocaleDateString()), detailsX, y, { align: detailsAlign });
  y += 6;
  if (invoice.dueDate) {
    doc.text(arLine(lang.dueDate, new Date(invoice.dueDate).toLocaleDateString()), detailsX, y, { align: detailsAlign });
    y += 6;
  }
  const statusText = statusTranslations[language]?.[invoice.status] || invoice.status.toUpperCase();
  doc.text(arLine(lang.status, statusText), detailsX, y, { align: detailsAlign });

  // Client info
  y = 45;
  const clientX = isRTL ? 20 : pageWidth - 20;
  const clientAlign: "left" | "right" = isRTL ? "left" : "right";
  setFont("bold");
  doc.text(ar(lang.billTo), clientX, y, { align: clientAlign });
  y += 6;
  setFont("normal");
  doc.text(ar(invoice.client.name), clientX, y, { align: clientAlign });

  // Items table
  const tableY = 85;
  const tableHead = [[ar(lang.description), ar(lang.quantity), ar(lang.unitPrice), ar(lang.total)]];
  const tableBody = invoice.items.map(item => [
    ar(item.description),
    arNum(String(item.quantity)),
    arNum(`${sym}${item.unitPrice.toFixed(2)}`),
    arNum(`${sym}${item.total.toFixed(2)}`),
  ]);

  autoTable(doc, {
    startY: tableY,
    head: tableHead,
    body: tableBody,
    theme: "striped",
    headStyles: {
      fillColor: [37, 99, 235], textColor: 255, fontSize: 10, fontStyle: "bold",
      ...(isRTL ? { font: "Amiri", halign: "right" as const } : {}),
    },
    bodyStyles: {
      fontSize: 9,
      ...(isRTL ? { font: "Amiri" } : {}),
    },
    columnStyles: isRTL ? {
      0: { cellWidth: "auto", halign: "right" },
      1: { cellWidth: 25, halign: "center" },
      2: { cellWidth: 30, halign: "right" },
      3: { cellWidth: 30, halign: "right" },
    } : {
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
  doc.setTextColor(60, 60, 60);
  let totalsY = finalY;
  doc.text(arLine(lang.subtotal, `${sym}${invoice.subtotal.toFixed(2)}`), totalsX, totalsY, { align: totalsAlign });
  totalsY += 7;
  if (invoice.discount > 0) {
    doc.setTextColor(34, 197, 94);
    doc.text(
      arLineP(lang.discount, `${invoice.discount}%`, `-${sym}${(invoice.subtotal * invoice.discount / 100).toFixed(2)}`),
      totalsX, totalsY, { align: totalsAlign },
    );
    doc.setTextColor(60, 60, 60);
    totalsY += 7;
  }
  doc.text(
    arLineP(lang.tax, `${invoice.taxRate}%`, `${sym}${invoice.tax.toFixed(2)}`),
    totalsX, totalsY, { align: totalsAlign },
  );
  totalsY += 7;
  for (const fee of invoice.fees) {
    doc.setTextColor(60, 60, 60);
    doc.text(arLine(fee.label, `${sym}${fee.amount.toFixed(2)}`), totalsX, totalsY, { align: totalsAlign });
    totalsY += 7;
  }
  totalsY += 4;

  doc.setFontSize(14);
  setFont("bold");
  doc.setTextColor(37, 99, 235);
  doc.text(arLine(lang.grandTotal, `${sym}${invoice.total.toFixed(2)}`), totalsX, totalsY, { align: totalsAlign });

  // Notes
  if (invoice.notes) {
    doc.setFontSize(9);
    setFont("normal");
    doc.setTextColor(100, 100, 100);
    doc.text(arLine(lang.notes, invoice.notes), isRTL ? pageWidth - 20 : 20, totalsY + 18, { align: detailsAlign });
  }

  // Footer
  doc.setFontSize(9);
  doc.setTextColor(150, 150, 150);
  doc.text(ar(lang.thankYou), pageWidth / 2, doc.internal.pageSize.getHeight() - 20, { align: "center" });

  const pdfBuffer = Buffer.from(doc.output("arraybuffer"));

  return new NextResponse(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice.number}-${language}.pdf"`,
    },
  });
}
