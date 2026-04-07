import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { processArabicText, toArabicNumerals } from "./arabic-pdf";
import { amiriRegular } from "./fonts/amiri-regular";
import { amiriBold } from "./fonts/amiri-bold";

const translations: Record<string, Record<string, string>> = {
  en: { invoice: "INVOICE", invoiceNumber: "Invoice #", date: "Date", dueDate: "Due Date", billTo: "Bill To", description: "Description", quantity: "Quantity", unitPrice: "Unit Price", total: "Total", subtotal: "Subtotal", tax: "Tax", grandTotal: "Total Due", notes: "Notes", thankYou: "Thank you for your business!", status: "Status" },
  fr: { invoice: "FACTURE", invoiceNumber: "Facture N°", date: "Date", dueDate: "Date d'échéance", billTo: "Facturer à", description: "Description", quantity: "Quantité", unitPrice: "Prix unitaire", total: "Total", subtotal: "Sous-total", tax: "Taxe", grandTotal: "Total à payer", notes: "Notes", thankYou: "Merci pour votre confiance !", status: "Statut" },
  ar: { invoice: "فاتورة", invoiceNumber: "رقم الفاتورة", date: "التاريخ", dueDate: "تاريخ الاستحقاق", billTo: "فاتورة إلى", description: "الوصف", quantity: "الكمية", unitPrice: "سعر الوحدة", total: "المجموع", subtotal: "المجموع الفرعي", tax: "الضريبة", grandTotal: "المبلغ الإجمالي", notes: "ملاحظات", thankYou: "شكراً لتعاملكم معنا!", status: "الحالة" },
};

interface InvoiceData {
  number: string;
  date: Date | string;
  dueDate: Date | string | null;
  status: string;
  subtotal: number;
  tax: number;
  taxRate: number;
  total: number;
  notes: string | null;
  language: string | null;
  currencySymbol?: string;
  client: { name: string; email?: string | null };
  items: Array<{ description: string; quantity: number; unitPrice: number; total: number }>;
}

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

export function generateInvoicePDF(invoice: InvoiceData, language?: string): Buffer {
  const lang = language || invoice.language || "fr";
  const t = translations[lang] || translations.fr;
  const isRTL = lang === "ar";
  const sym = invoice.currencySymbol || "$";
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  const ar = (s: string) => (isRTL ? processArabicText(s) : s);
  const arNum = (s: string) => (isRTL ? toArabicNumerals(s).replace(/\./g, ",") : s);
  const arLine = (label: string, value: string) => {
    if (!isRTL) return `${label}: ${value}`;
    return `${ar(label)}: ${arNum(value)}`;
  };
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
  doc.text(ar(t.invoice), isRTL ? pageWidth - 20 : 20, 30, { align: isRTL ? "right" : "left" });

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
  doc.text(arLine(t.invoiceNumber, invoice.number), detailsX, y, { align: detailsAlign });
  y += 6;

  setFont("normal");
  doc.text(arLine(t.date, new Date(invoice.date).toLocaleDateString()), detailsX, y, { align: detailsAlign });
  y += 6;
  if (invoice.dueDate) {
    doc.text(arLine(t.dueDate, new Date(invoice.dueDate).toLocaleDateString()), detailsX, y, { align: detailsAlign });
    y += 6;
  }
  const statusText = statusTranslations[lang]?.[invoice.status] || invoice.status.toUpperCase();
  doc.text(arLine(t.status, statusText), detailsX, y, { align: detailsAlign });

  // Client info
  y = 45;
  const clientX = isRTL ? 20 : pageWidth - 20;
  const clientAlign: "left" | "right" = isRTL ? "left" : "right";
  setFont("bold");
  doc.text(ar(t.billTo), clientX, y, { align: clientAlign });
  y += 6;
  setFont("normal");
  doc.text(ar(invoice.client.name), clientX, y, { align: clientAlign });

  // Items table
  const tableHead = [[ar(t.description), ar(t.quantity), ar(t.unitPrice), ar(t.total)]];
  const tableBody = invoice.items.map((item) => [
    ar(item.description),
    arNum(String(item.quantity)),
    arNum(`${sym}${Number(item.unitPrice).toFixed(2)}`),
    arNum(`${sym}${Number(item.total).toFixed(2)}`),
  ]);

  autoTable(doc, {
    startY: 85,
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
  doc.text(arLine(t.subtotal, `${sym}${Number(invoice.subtotal).toFixed(2)}`), totalsX, finalY, { align: totalsAlign });
  doc.text(arLineP(t.tax, `${invoice.taxRate}%`, `${sym}${Number(invoice.tax).toFixed(2)}`), totalsX, finalY + 7, { align: totalsAlign });

  doc.setFontSize(14);
  setFont("bold");
  doc.setTextColor(37, 99, 235);
  doc.text(arLine(t.grandTotal, `${sym}${Number(invoice.total).toFixed(2)}`), totalsX, finalY + 18, { align: totalsAlign });

  // Notes
  if (invoice.notes) {
    doc.setFontSize(9);
    setFont("normal");
    doc.setTextColor(100, 100, 100);
    doc.text(arLine(t.notes, invoice.notes), isRTL ? pageWidth - 20 : 20, finalY + 35, { align: detailsAlign });
  }

  // Footer
  doc.setFontSize(9);
  doc.setTextColor(150, 150, 150);
  doc.text(ar(t.thankYou), pageWidth / 2, doc.internal.pageSize.getHeight() - 20, { align: "center" });

  return Buffer.from(doc.output("arraybuffer"));
}
