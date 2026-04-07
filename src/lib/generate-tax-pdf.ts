import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { processArabicText, toArabicNumerals } from "./arabic-pdf";
import { amiriRegular } from "./fonts/amiri-regular";
import { amiriBold } from "./fonts/amiri-bold";

const translations: Record<string, Record<string, string>> = {
  en: {
    taxReport: "TAX REPORT", collected: "Tax Collected", pending: "Tax Pending",
    totalInvoices: "Total Invoices", generatedOn: "Generated on", invoice: "Invoice",
    client: "Client", date: "Date", status: "Status", subtotal: "Subtotal",
    taxRate: "Tax %", taxAmount: "Tax Amount", total: "Total", totals: "TOTALS",
  },
  fr: {
    taxReport: "RAPPORT FISCAL", collected: "Taxe Collectée", pending: "Taxe En Attente",
    totalInvoices: "Nombre Total de Factures", generatedOn: "Généré le", invoice: "Facture",
    client: "Client", date: "Date", status: "Statut", subtotal: "Sous-total",
    taxRate: "Taxe %", taxAmount: "Montant Taxe", total: "Total", totals: "TOTAUX",
  },
  ar: {
    taxReport: "تقرير ضريبي", collected: "الضريبة المجمعة", pending: "الضريبة المعلقة",
    totalInvoices: "إجمالي الفواتير", generatedOn: "تم إنشاؤه في", invoice: "الفاتورة",
    client: "العميل", date: "التاريخ", status: "الحالة", subtotal: "المجموع الفرعي",
    taxRate: "نسبة الضريبة", taxAmount: "مبلغ الضريبة", total: "الإجمالي", totals: "الإجماليات",
  },
};

interface TaxInvoice {
  id: string; number: string; date: string; status: string;
  subtotal: number; tax: number; taxRate: number; total: number;
  client: { name: string };
}

interface TaxData {
  invoices: TaxInvoice[]; paidTax: number; pendingTax: number;
  currencySymbol: string; language: string;
}

function registerArabicFonts(doc: jsPDF) {
  doc.addFileToVFS("Amiri-Regular.ttf", amiriRegular);
  doc.addFont("Amiri-Regular.ttf", "Amiri", "normal");
  doc.addFileToVFS("Amiri-Bold.ttf", amiriBold);
  doc.addFont("Amiri-Bold.ttf", "Amiri", "bold");
}

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function generateTaxPDF(data: TaxData): Buffer {
  const lang = data.language || "en";
  const t = translations[lang] || translations.en;
  const isRTL = lang === "ar";
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const sym = data.currencySymbol;

  const ar = (s: string) => (isRTL ? processArabicText(s) : s);
  const arNum = (s: string) => (isRTL ? toArabicNumerals(s).replace(/\./g, ",") : s);
  const arLine = (label: string, value: string) => {
    if (!isRTL) return `${label}: ${value}`;
    return `${ar(label)}: ${arNum(value)}`;
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
  doc.text(ar(t.taxReport), isRTL ? pageWidth - 20 : 20, 20, { align: isRTL ? "right" : "left" });

  // Company info
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  setFont("normal");
  const companyX = isRTL ? 20 : pageWidth - 20;
  const companyAlign: "left" | "right" = isRTL ? "left" : "right";
  doc.text("Cashent", companyX, 10, { align: companyAlign });
  doc.text("Business Management System", companyX, 14, { align: companyAlign });

  // Generated date
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  const generatedDate = new Date().toLocaleDateString();
  doc.text(arLine(t.generatedOn, generatedDate), isRTL ? pageWidth - 20 : 20, 35, { align: isRTL ? "right" : "left" });

  // Summary boxes
  const summaryY = 42;
  const boxWidth = (pageWidth - 60) / 3;

  // Collected tax box
  doc.setFillColor(240, 253, 244);
  doc.rect(20, summaryY, boxWidth, 15, "F");
  doc.setTextColor(34, 197, 94);
  doc.setFontSize(9);
  setFont("bold");
  doc.text(ar(t.collected), 20 + boxWidth / 2, summaryY + 5, { align: "center" });
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11);
  doc.text(arNum(`${sym}${fmt(data.paidTax)}`), 20 + boxWidth / 2, summaryY + 11, { align: "center" });

  // Pending tax box
  doc.setFillColor(254, 252, 232);
  doc.rect(20 + boxWidth + 10, summaryY, boxWidth, 15, "F");
  doc.setTextColor(202, 138, 4);
  doc.setFontSize(9);
  setFont("bold");
  doc.text(ar(t.pending), 20 + boxWidth + 10 + boxWidth / 2, summaryY + 5, { align: "center" });
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11);
  doc.text(arNum(`${sym}${fmt(data.pendingTax)}`), 20 + boxWidth + 10 + boxWidth / 2, summaryY + 11, { align: "center" });

  // Total invoices box
  doc.setFillColor(241, 245, 250);
  doc.rect(20 + (boxWidth + 10) * 2, summaryY, boxWidth, 15, "F");
  doc.setTextColor(37, 99, 235);
  doc.setFontSize(9);
  setFont("bold");
  doc.text(ar(t.totalInvoices), 20 + (boxWidth + 10) * 2 + boxWidth / 2, summaryY + 5, { align: "center" });
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11);
  doc.text(arNum(String(data.invoices.length)), 20 + (boxWidth + 10) * 2 + boxWidth / 2, summaryY + 11, { align: "center" });

  // Table
  const tableHead = [[ar(t.invoice), ar(t.client), ar(t.date), ar(t.status), ar(t.subtotal), ar(t.taxRate), ar(t.taxAmount), ar(t.total)]];
  const tableBody = data.invoices.map((inv) => [
    arNum(inv.number),
    ar(inv.client.name),
    arNum(new Date(inv.date).toLocaleDateString()),
    ar(inv.status.toUpperCase()),
    arNum(`${sym}${fmt(inv.subtotal)}`),
    arNum(`${inv.taxRate}%`),
    arNum(`${sym}${fmt(inv.tax)}`),
    arNum(`${sym}${fmt(inv.total)}`),
  ]);

  autoTable(doc, {
    startY: 62,
    head: tableHead,
    body: tableBody,
    theme: "striped",
    headStyles: {
      fillColor: [37, 99, 235], textColor: 255, fontSize: 8, fontStyle: "bold",
      ...(isRTL ? { font: "Amiri", halign: "right" as const } : {}),
    },
    bodyStyles: {
      fontSize: 8,
      ...(isRTL ? { font: "Amiri" } : {}),
    },
    columnStyles: {
      0: { cellWidth: 18 }, 1: { cellWidth: 25 }, 2: { cellWidth: 20 },
      3: { cellWidth: 18 }, 4: { halign: "right", cellWidth: 20 },
      5: { halign: "center", cellWidth: 12 }, 6: { halign: "right", cellWidth: 20 },
      7: { halign: "right", cellWidth: 20 },
    },
    margin: { left: 20, right: 20 },
  });

  // Totals
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY = (doc as any).lastAutoTable.finalY + 8;
  const totalSubtotal = data.invoices.reduce((s, i) => s + i.subtotal, 0);
  const totalTax = data.invoices.reduce((s, i) => s + i.tax, 0);
  const totalAmount = data.invoices.reduce((s, i) => s + i.total, 0);

  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  setFont("bold");

  doc.text(ar(t.totals), 20, finalY, {});
  doc.text(arLine(t.subtotal, `${sym}${fmt(totalSubtotal)}`), pageWidth - 20, finalY, { align: "right" });
  doc.text(arLine(t.taxAmount, `${sym}${fmt(totalTax)}`), pageWidth - 20, finalY + 6, { align: "right" });

  doc.setFontSize(11);
  doc.setTextColor(37, 99, 235);
  doc.text(arLine(t.total, `${sym}${fmt(totalAmount)}`), pageWidth - 20, finalY + 14, { align: "right" });

  return Buffer.from(doc.output("arraybuffer"));
}
