import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { processArabicText } from "./arabic-pdf";
import { amiriRegular } from "./fonts/amiri-regular";
import { amiriBold } from "./fonts/amiri-bold";

const translations: Record<string, Record<string, string>> = {
  en: { invoice: "INVOICE", invoiceNumber: "Invoice #", date: "Date", dueDate: "Due Date", billTo: "Bill To", description: "Description", quantity: "Quantity", unitPrice: "Unit Price", total: "Total", subtotal: "Subtotal", tax: "Tax", grandTotal: "Total Due", notes: "Notes", thankYou: "Thank you for your business!", status: "Status" },
  fr: { invoice: "FACTURE", invoiceNumber: "Facture N°", date: "Date", dueDate: "Date d'échéance", billTo: "Facturer à", description: "Description", quantity: "Quantité", unitPrice: "Prix unitaire", total: "Total", subtotal: "Sous-total", tax: "Taxe", grandTotal: "Total à payer", notes: "Notes", thankYou: "Merci pour votre confiance !", status: "Statut" },
  ar: { invoice: "\u0641\u0627\u062a\u0648\u0631\u0629", invoiceNumber: "\u0631\u0642\u0645 \u0627\u0644\u0641\u0627\u062a\u0648\u0631\u0629", date: "\u0627\u0644\u062a\u0627\u0631\u064a\u062e", dueDate: "\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u0627\u0633\u062a\u062d\u0642\u0627\u0642", billTo: "\u0641\u0627\u062a\u0648\u0631\u0629 \u0625\u0644\u0649", description: "\u0627\u0644\u0648\u0635\u0641", quantity: "\u0627\u0644\u0643\u0645\u064a\u0629", unitPrice: "\u0633\u0639\u0631 \u0627\u0644\u0648\u062d\u062f\u0629", total: "\u0627\u0644\u0645\u062c\u0645\u0648\u0639", subtotal: "\u0627\u0644\u0645\u062c\u0645\u0648\u0639 \u0627\u0644\u0641\u0631\u0639\u064a", tax: "\u0627\u0644\u0636\u0631\u064a\u0628\u0629", grandTotal: "\u0627\u0644\u0645\u0628\u0644\u063a \u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a", notes: "\u0645\u0644\u0627\u062d\u0638\u0627\u062a", thankYou: "\u0634\u0643\u0631\u0627\u064b \u0644\u062a\u0639\u0627\u0645\u0644\u0643\u0645 \u0645\u0639\u0646\u0627!", status: "\u0627\u0644\u062d\u0627\u0644\u0629" },
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
  client: { name: string; email?: string | null };
  items: Array<{ description: string; quantity: number; unitPrice: number; total: number }>;
}

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
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Helper to process text for Arabic
  const txt = (s: string) => (isRTL ? processArabicText(s) : s);

  if (isRTL) {
    registerArabicFonts(doc);
    doc.setFont("Amiri", "normal");
  }

  // Header
  doc.setFontSize(24);
  doc.setTextColor(37, 99, 235);
  if (isRTL) doc.setFont("Amiri", "bold");
  doc.text(txt(t.invoice), isRTL ? pageWidth - 20 : 20, 30, { align: isRTL ? "right" : "left" });

  // Company info
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  if (isRTL) doc.setFont("Amiri", "normal");
  else doc.setFont("helvetica", "normal");
  const companyX = isRTL ? 20 : pageWidth - 20;
  const companyAlign: "left" | "right" = isRTL ? "left" : "right";
  doc.text("Accountant", companyX, 20, { align: companyAlign });
  doc.text("Business Management System", companyX, 25, { align: companyAlign });

  // Invoice details
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  const detailsX = isRTL ? pageWidth - 20 : 20;
  const detailsAlign: "left" | "right" = isRTL ? "right" : "left";
  let y = 45;

  if (isRTL) doc.setFont("Amiri", "bold");
  else doc.setFont("helvetica", "bold");
  doc.text(txt(`${t.invoiceNumber}: ${invoice.number}`), detailsX, y, { align: detailsAlign });
  y += 6;

  if (isRTL) doc.setFont("Amiri", "normal");
  else doc.setFont("helvetica", "normal");
  doc.text(txt(`${t.date}: ${new Date(invoice.date).toLocaleDateString()}`), detailsX, y, { align: detailsAlign });
  y += 6;
  if (invoice.dueDate) {
    doc.text(txt(`${t.dueDate}: ${new Date(invoice.dueDate).toLocaleDateString()}`), detailsX, y, { align: detailsAlign });
    y += 6;
  }
  doc.text(txt(`${t.status}: ${invoice.status.toUpperCase()}`), detailsX, y, { align: detailsAlign });

  // Client info
  y = 45;
  const clientX = isRTL ? 20 : pageWidth - 20;
  const clientAlign: "left" | "right" = isRTL ? "left" : "right";
  if (isRTL) doc.setFont("Amiri", "bold");
  else doc.setFont("helvetica", "bold");
  doc.text(txt(t.billTo), clientX, y, { align: clientAlign });
  y += 6;
  if (isRTL) doc.setFont("Amiri", "normal");
  else doc.setFont("helvetica", "normal");
  doc.text(invoice.client.name, clientX, y, { align: clientAlign });

  // Items table
  const tableHead = [[txt(t.description), txt(t.quantity), txt(t.unitPrice), txt(t.total)]];
  const tableBody = invoice.items.map((item) => [
    txt(item.description),
    String(item.quantity),
    `$${Number(item.unitPrice).toFixed(2)}`,
    `$${Number(item.total).toFixed(2)}`,
  ]);

  autoTable(doc, {
    startY: 85,
    head: tableHead,
    body: tableBody,
    theme: "striped",
    headStyles: {
      fillColor: [37, 99, 235],
      textColor: 255,
      fontSize: 10,
      fontStyle: "bold",
      ...(isRTL ? { font: "Amiri" } : {}),
    },
    bodyStyles: {
      fontSize: 9,
      ...(isRTL ? { font: "Amiri" } : {}),
    },
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
  doc.setTextColor(60, 60, 60);
  doc.text(txt(`${t.subtotal}: $${Number(invoice.subtotal).toFixed(2)}`), totalsX, finalY, { align: totalsAlign });
  doc.text(txt(`${t.tax} (${invoice.taxRate}%): $${Number(invoice.tax).toFixed(2)}`), totalsX, finalY + 7, { align: totalsAlign });

  doc.setFontSize(14);
  if (isRTL) doc.setFont("Amiri", "bold");
  else doc.setFont("helvetica", "bold");
  doc.setTextColor(37, 99, 235);
  doc.text(txt(`${t.grandTotal}: $${Number(invoice.total).toFixed(2)}`), totalsX, finalY + 18, { align: totalsAlign });

  // Notes
  if (invoice.notes) {
    doc.setFontSize(9);
    if (isRTL) doc.setFont("Amiri", "normal");
    else doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 100, 100);
    doc.text(txt(`${t.notes}: ${invoice.notes}`), isRTL ? pageWidth - 20 : 20, finalY + 35, { align: detailsAlign });
  }

  // Footer
  doc.setFontSize(9);
  doc.setTextColor(150, 150, 150);
  doc.text(txt(t.thankYou), pageWidth / 2, doc.internal.pageSize.getHeight() - 20, { align: "center" });

  return Buffer.from(doc.output("arraybuffer"));
}
