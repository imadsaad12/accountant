"use client";

import { useState, useRef, useEffect } from "react";
import { BarChart2, TrendingUp, TrendingDown, FileText, Loader2, Download, Scale, Filter, ChevronDown, Check, BookOpen, Info } from "lucide-react";
import { PermissionGuard } from "@/components/PermissionGuard";
import { useTranslation, useLang } from "@/components/LanguageProvider";
import { fmtAmt as _fmtAmt } from "@/lib/format-number";
import { useOrgSettings, useOrgTimezone, currencySymbol as getCurrencySymbol } from "@/components/OrgSettingsProvider";
import { formatDateInTz, todayInTz, currentYearInTz } from "@/lib/tz";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface PLReport {
  type: "pl";
  period: { from: string; to: string };
  revenue: number;
  taxCollected: number;
  cogs: number;
  grossProfit: number;
  expensesByCategory: Record<string, number>;
  totalExpenses: number;
  netProfit: number;
  invoiceCount: number;
  totalSalesInPeriod: { revenue: number; cogs: number; grossProfit: number; invoiceCount: number; totalPaid: number; totalPending: number; paidCount: number; partialCount: number };
  mostSoldProducts: { description: string; quantity: number; unitPrice: number; total: number }[];
}

interface BSReport {
  type: "bs";
  asOf: string;
  assets: { cash: number; ar: number; inventory: number; total: number };
  liabilities: { taxPayable: number; total: number };
  equity: number;
}


interface ComprehensiveReport {
  type: "comprehensive";
  period: { from: string; to: string };
  summary: {
    periodInvoiceRevenue: number; oldInvoiceRevenue: number;
    totalRevenue: number; totalCogs: number; grossProfit: number;
    totalExpenses: number; netProfit: number; invoiceCount: number;
    cogsMargin: number; grossMargin: number; netMargin: number;
  };
  revenue: {
    invoices: { id: string; number: string; client: string; date: string; dueDate: string | null; status: string; total: number; totalPaid: number; balance: number; cogs: number; grossProfit: number; daysOverdue: number }[];
    byStatus: Record<string, number>;
  };
  cogs: { total: number; explanation: string; byInvoice: { number: string; client: string; total: number; periodPayment: number; totalPaidToDate: number; cogs: number; grossProfit: number }[] };
  expenses: { rows: { category: string; description: string; amount: number; date: string; salary?: number; salaryAdvance?: number; amountPaid?: number }[]; byCategory: Record<string, number>; total: number };
  receivableAging: { rows: { invoiceId: string; number: string; client: string; total: number; paid: number; balance: number; daysOverdue: number; bucket: string; status: string; dueDate: string | null }[]; totals: Record<string, number>; totalOutstanding: number };
  payableAging: { rows: { billId: string; supplier: string; description: string; amount: number; amountPaid: number; remaining: number; daysOverdue: number; bucket: string; status: string; dueDate: string | null; periodPayment: number; totalPaidToDate: number }[]; total: number };
  receivedPayments: { rows: { id: string; date: string; amount: number; method: string; reference: string | null; invoiceNumber: string; invoiceTotal: number; client: string; periodPayment: number; totalPaidToDate: number }[]; total: number };
  totalSalesInPeriod: { revenue: number; cogs: number; grossProfit: number; invoiceCount: number; totalPaid: number; totalPending: number; paidCount: number; partialCount: number };
  mostSoldProducts: { description: string; quantity: number; unitPrice: number; total: number }[];
}

type Report = PLReport | BSReport | ComprehensiveReport | null;

const EXPENSE_CATEGORIES: Record<string, string> = {
  rent: "Rent", utilities: "Utilities", salaries: "Salaries", office: "Office Supplies",
  travel: "Travel", marketing: "Marketing", insurance: "Insurance", maintenance: "Maintenance",
  supplier_bill: "Supplier Bill", other: "Other",
};

export default function ReportsPage() {
  const t = useTranslation();
  const lang = useLang();
  const { orgSettings } = useOrgSettings();
  const tz = useOrgTimezone();
  const currencySymbol = getCurrencySymbol(orgSettings.defaultCurrency);
  const [activeTab, setActiveTab] = useState<"pl" | "bs" | "comprehensive">("pl");
  const [from, setFrom] = useState(() => `${currentYearInTz(tz)}-01-01`);
  const [to, setTo] = useState(() => todayInTz(tz));
  const [report, setReport] = useState<Report>(null);
  const [loading, setLoading] = useState(false);
  const [excludedCategories, setExcludedCategories] = useState<Set<string>>(new Set());
  const [excludeOpen, setExcludeOpen] = useState(false);
  const excludeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (excludeRef.current && !excludeRef.current.contains(e.target as Node)) setExcludeOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function toggleCategory(cat: string) {
    setExcludedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  }

  async function generate() {
    setLoading(true);
    if (activeTab === "comprehensive") {
      const params = new URLSearchParams({ from, to });
      if (excludedCategories.size > 0) params.set("exclude", Array.from(excludedCategories).join(","));
      const res = await fetch(`/api/reports/comprehensive?${params}`);
      const data = res.ok ? await res.json() : null;
      setReport(data ? { ...data, type: "comprehensive" } : null);
    } else {
      const params = new URLSearchParams({ type: activeTab, from, to });
      if (excludedCategories.size > 0) params.set("exclude", Array.from(excludedCategories).join(","));
      const res = await fetch(`/api/reports?${params}`);
      setReport(res.ok ? await res.json() : null);
    }
    setLoading(false);
  }

  function fmt(n: number) { return `${currencySymbol}${_fmtAmt(n, lang)}`; }
  function pct(n: number, total: number) { return total > 0 ? `${((n / total) * 100).toFixed(1)}%` : "0%"; }

  function exportPDF() {
    if (!report) return;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const now = formatDateInTz(new Date(), tz);

    // Header
    doc.setFontSize(18); doc.setTextColor(37, 99, 235);
    doc.text(report.type === "pl" ? "Profit & Loss Report" : report.type === "aging" ? "Accounts Receivable Aging" : report.type === "comprehensive" ? "Comprehensive Report" : "Balance Sheet", 14, 20);
    doc.setFontSize(9); doc.setTextColor(120, 120, 120);
    let headerY = 28;
    if (report.type === "pl") {
      const pl = report as PLReport;
      doc.text(`Period: ${formatDateInTz(pl.period.from, tz)} – ${formatDateInTz(pl.period.to, tz)}`, 14, 28);
      if (excludedCategories.size > 0) {
        headerY += 6;
        doc.setTextColor(200, 100, 0);
        doc.text(`Excluded: ${Array.from(excludedCategories).map(c => EXPENSE_CATEGORIES[c] || c).join(", ")}`, 14, headerY);
        doc.setTextColor(120, 120, 120);
      }
    } else if (report.type === "comprehensive") {
      const cr = report as ComprehensiveReport;
      doc.text(`Period: ${formatDateInTz(cr.period.from, tz)} – ${formatDateInTz(cr.period.to, tz)}`, 14, 28);
      if (excludedCategories.size > 0) {
        headerY += 6;
        doc.setTextColor(200, 100, 0);
        doc.text(`Excluded: ${Array.from(excludedCategories).map(c => EXPENSE_CATEGORIES[c] || c).join(", ")}`, 14, headerY);
        doc.setTextColor(120, 120, 120);
      }
    }
    doc.text(`Generated: ${now}`, pageWidth - 14, 28, { align: "right" });

    if (report.type === "pl") {
      const pl = report as PLReport;
      // Summary table
      autoTable(doc, {
        startY: headerY + 7,
        head: [["", "Amount"]],
        body: [
          ["Revenue", fmt(pl.revenue)],
          ["Cost of Goods Sold (COGS)", `(${fmt(pl.cogs)})`],
          ["Gross Profit", fmt(pl.grossProfit)],
          ["", ""],
          ...Object.entries(pl.expensesByCategory).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => [
            `  ${EXPENSE_CATEGORIES[cat] || cat}`, fmt(amt)
          ]),
          ["Total Operating Expenses", fmt(pl.totalExpenses)],
          ["", ""],
          ["Net Profit", fmt(pl.netProfit)],
        ],
        theme: "striped",
        headStyles: { fillColor: [37, 99, 235] },
        styles: { fontSize: 10 },
        didParseCell: (data) => {
          const label = data.row.raw as string[];
          if (label[0] === "Net Profit" || label[0] === "Gross Profit" || label[0] === "Total Operating Expenses") {
            data.cell.styles.fontStyle = "bold";
          }
        },
      });
      // Total Sales in Period
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const salesY = (doc as any).lastAutoTable.finalY + 8;
      doc.setFontSize(11); doc.setTextColor(51, 200, 102);
      doc.text("Total Sales in Period", 14, salesY);
      autoTable(doc, {
        startY: salesY + 4,
        head: [["Metric", "Amount"]],
        body: [
          ["Total Revenue (All Invoices)", fmt(pl.totalSalesInPeriod.revenue)],
          ["Total Paid", fmt(pl.totalSalesInPeriod.totalPaid)],
          ["Total Pending", fmt(pl.totalSalesInPeriod.totalPending)],
          ["Cost of Goods Sold (COGS)", `(${fmt(pl.totalSalesInPeriod.cogs)})`],
          ["Gross Profit", fmt(pl.totalSalesInPeriod.grossProfit)],
          ["Net Profit (Gross − Expenses)", fmt(pl.totalSalesInPeriod.grossProfit - pl.totalExpenses)],
          ["Invoice Count", `${pl.totalSalesInPeriod.invoiceCount} (${pl.totalSalesInPeriod.paidCount} paid, ${pl.totalSalesInPeriod.partialCount} partial)`],
        ],
        theme: "striped", headStyles: { fillColor: [51, 200, 102] }, styles: { fontSize: 9 },
      });
    } else if (report.type === "comprehensive") {
      const cr = report as ComprehensiveReport;
      // 1. P&L Summary
      autoTable(doc, {
        startY: headerY + 7,
        head: [["Profit & Loss", "Amount"]],
        body: [
          ["Total Revenue (Collected)", fmt(cr.summary.totalRevenue)],
          ["  Invoices Issued in Period", fmt(cr.summary.periodInvoiceRevenue)],
          ["  Payments from Older Invoices", fmt(cr.summary.oldInvoiceRevenue)],
          ["Cost of Goods Sold (COGS)", `(${fmt(cr.summary.totalCogs)})`],
          ["Gross Profit", fmt(cr.summary.grossProfit)],
          ["", ""],
          ...Object.entries(cr.expenses.byCategory).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => [`  ${cat.replace(/_/g, " ")}`, `(${fmt(amt)})`]),
          ["Total Operating Expenses", `(${fmt(cr.summary.totalExpenses)})`],
          ["", ""],
          ["Net Profit", fmt(cr.summary.netProfit)],
        ],
        theme: "striped",
        headStyles: { fillColor: [37, 99, 235] },
        styles: { fontSize: 9 },
        didParseCell: (data) => {
          const label = (data.row.raw as string[])[0];
          if (["Net Profit", "Gross Profit", "Total Operating Expenses"].includes(label)) data.cell.styles.fontStyle = "bold";
        },
      });
      // 2. COGS breakdown
      if (cr.cogs.byInvoice.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cogsY = (doc as any).lastAutoTable.finalY + 8;
        doc.setFontSize(11); doc.setTextColor(37, 99, 235);
        doc.text("COGS by Invoice", 14, cogsY);
        autoTable(doc, {
          startY: cogsY + 4,
          head: [["Invoice #", "Client", "Invoice Total", "Period Payment", "Total Paid to Date", "COGS", "Gross Profit"]],
          body: cr.cogs.byInvoice.map(r => [r.number, r.client, fmt(r.total), fmt(r.periodPayment), fmt(r.totalPaidToDate), fmt(r.cogs), fmt(r.grossProfit)]),
          theme: "striped", headStyles: { fillColor: [37, 99, 235] }, styles: { fontSize: 8 },
        });
      }
      // 3. Receivable Aging
      // Received Payments
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rpY = (doc as any).lastAutoTable.finalY + 8;
      doc.setFontSize(11); doc.setTextColor(5, 150, 105);
      doc.text(`Received Payments — Total Collected: ${fmt(cr.receivedPayments.total)}`, 14, rpY);
      // Get unique invoices to avoid duplicate period payment rows
      const uniqueInvoices = new Map<string, typeof cr.receivedPayments.rows[0]>();
      cr.receivedPayments.rows.forEach(p => {
        if (!uniqueInvoices.has(p.invoiceNumber)) {
          uniqueInvoices.set(p.invoiceNumber, p);
        }
      });
      autoTable(doc, {
        startY: rpY + 4,
        head: [["Client", "Invoice #", "Invoice Total", "Period Payment", "Total Paid to Date"]],
        body: Array.from(uniqueInvoices.values()).map(p => [p.client, p.invoiceNumber, fmt(p.invoiceTotal), fmt(p.periodPayment), fmt(p.totalPaidToDate)]),
        theme: "striped", headStyles: { fillColor: [5, 150, 105] }, styles: { fontSize: 8 },
      });
      // 4. Payable Aging
      if (cr.payableAging.rows.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const apY = (doc as any).lastAutoTable.finalY + 8;
        doc.setFontSize(11); doc.setTextColor(220, 38, 38);
        doc.text(`Accounts Payable (Unpaid Bills) — Total Owed: ${fmt(cr.payableAging.total)}`, 14, apY);
        autoTable(doc, {
          startY: apY + 4,
          head: [["Supplier", "Description", "Total", "Period Payment", "Total Paid to Date", "Remaining", "Due Date", "Age"]],
          body: cr.payableAging.rows.sort((a, b) => b.daysOverdue - a.daysOverdue).map(r => [
            r.supplier, r.description, fmt(r.amount), fmt(r.periodPayment), fmt(r.totalPaidToDate), fmt(r.remaining), r.dueDate ?? "—",
            r.daysOverdue <= 0 ? "Current" : `${r.daysOverdue}d`,
          ]),
          theme: "striped", headStyles: { fillColor: [220, 38, 38] }, styles: { fontSize: 8 },
        });
      }
      // 5. Expenses Detail
      if (cr.expenses.rows.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const expY = (doc as any).lastAutoTable?.finalY ?? 220;
        doc.setFontSize(11); doc.setTextColor(37, 99, 235);
        doc.text(`Expenses Detail — Total: ${fmt(cr.expenses.total)}`, 14, expY + 8);
        const hasSalaries = cr.expenses.rows.some(r => r.category === "salaries");
        autoTable(doc, {
          startY: expY + 12,
          head: hasSalaries
            ? [["Category", "Description", "Date", "Salary", "Advance Deduction", "Amount Paid"]]
            : [["Category", "Description", "Date", "Amount"]],
          body: cr.expenses.rows.map(r =>
            r.category === "salaries" && r.salary !== undefined && hasSalaries
              ? [r.category.replace(/_/g, " "), r.description, r.date, fmt(r.salary), fmt(r.salaryAdvance ?? 0), fmt(r.amountPaid ?? r.amount)]
              : [r.category.replace(/_/g, " "), r.description, r.date, fmt(r.amount)]
          ),
          theme: "striped", headStyles: { fillColor: [37, 99, 235] }, styles: { fontSize: 8 },
        });
      }
      // 6. Total Sales in Period
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const totalSalesY = (doc as any).lastAutoTable?.finalY ?? 220;
      doc.setFontSize(11); doc.setTextColor(51, 200, 102);
      doc.text(`Total Sales in Period — Revenue: ${fmt(cr.totalSalesInPeriod.revenue)}, COGS: ${fmt(cr.totalSalesInPeriod.cogs)}, Gross Profit: ${fmt(cr.totalSalesInPeriod.grossProfit)}`, 14, totalSalesY + 8);
      autoTable(doc, {
        startY: totalSalesY + 12,
        head: [["Metric", "Amount"]],
        body: [
          ["Total Revenue (All Invoices)", fmt(cr.totalSalesInPeriod.revenue)],
          ["Total Paid", fmt(cr.totalSalesInPeriod.totalPaid)],
          ["Total Pending", fmt(cr.totalSalesInPeriod.totalPending)],
          ["Cost of Goods Sold (COGS)", `(${fmt(cr.totalSalesInPeriod.cogs)})`],
          ["Gross Profit", fmt(cr.totalSalesInPeriod.grossProfit)],
          ["Net Profit (Gross − Expenses)", fmt(cr.totalSalesInPeriod.grossProfit - cr.summary.totalExpenses)],
          ["Invoice Count", `${cr.totalSalesInPeriod.invoiceCount} (${cr.totalSalesInPeriod.paidCount} paid, ${cr.totalSalesInPeriod.partialCount} partial)`],
        ],
        theme: "striped", headStyles: { fillColor: [51, 200, 102] }, styles: { fontSize: 8 },
      });
      // 7. Most Sold Products
      if (cr.mostSoldProducts.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const productsY = (doc as any).lastAutoTable.finalY + 8;
        doc.setFontSize(11); doc.setTextColor(37, 99, 235);
        doc.text("Most Sold Products", 14, productsY);
        autoTable(doc, {
          startY: productsY + 4,
          head: [["Product", "Quantity", "Unit Price", "Total"]],
          body: cr.mostSoldProducts.map(p => [p.description, p.quantity.toString(), fmt(p.unitPrice), fmt(p.total)]),
          theme: "striped", headStyles: { fillColor: [37, 99, 235] }, styles: { fontSize: 8 },
        });
      }
    }

    const filename = report.type === "pl" ? `pl-report-${from}-to-${to}.pdf` : `comprehensive-report-${from}-to-${to}.pdf`;
    doc.save(filename);
  }

  const tabs = [
    { id: "pl" as const, label: t("reports.pl"), icon: BarChart2 },
    // { id: "bs" as const, label: t("reports.bs"), icon: Scale },
    { id: "comprehensive" as const, label: "Comprehensive", icon: BookOpen },
  ];

  return (
    <PermissionGuard feature="reports">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-text-primary">{t("reports.title")}</h1>
          <p className="text-sm text-text-muted mt-0.5">{t("reports.subtitle")}</p>
        </div>

        {/* Tabs */}
        <div className="overflow-x-auto">
          <div className="flex gap-1 bg-dark-bg/50 p-1 rounded-xl border border-dark-border w-fit min-w-max">
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => { setActiveTab(tab.id); setReport(null); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab.id ? "bg-accent text-white" : "text-text-muted hover:text-text-primary"}`}>
                <tab.icon size={15} /> {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-text-muted whitespace-nowrap">{t("reports.from")}</span>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-full sm:w-auto px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-text-muted whitespace-nowrap">{t("reports.to")}</span>
              <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} className="w-full sm:w-auto px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm" />
            </div>
          </div>
          {(activeTab === "pl" || activeTab === "comprehensive") && (
            <div className="relative" ref={excludeRef}>
              <button onClick={() => setExcludeOpen(!excludeOpen)}
                className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium transition-all ${excludedCategories.size > 0 ? "bg-orange-500/10 border-orange-500/30 text-orange-400" : "bg-dark-card border-dark-border text-text-muted hover:text-text-primary"}`}>
                <Filter size={14} />
                Exclude{excludedCategories.size > 0 && ` (${excludedCategories.size})`}
                <ChevronDown size={14} className={`transition-transform ${excludeOpen ? "rotate-180" : ""}`} />
              </button>
              {excludeOpen && (
                <div className="absolute z-50 mt-1 w-56 bg-dark-card border border-dark-border rounded-xl shadow-xl overflow-hidden">
                  <div className="px-3 py-2 border-b border-dark-border text-xs text-text-muted font-medium">Exclude categories from report</div>
                  <div className="max-h-60 overflow-y-auto py-1">
                    {Object.entries(EXPENSE_CATEGORIES).map(([key, label]) => (
                      <button key={key} onClick={() => toggleCategory(key)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-dark-card-hover text-left transition-colors">
                        <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${excludedCategories.has(key) ? "bg-orange-500 border-orange-500" : "border-dark-border"}`}>
                          {excludedCategories.has(key) && <Check size={10} className="text-white" />}
                        </div>
                        <span className={excludedCategories.has(key) ? "text-orange-400 line-through" : "text-text-primary"}>{label}</span>
                      </button>
                    ))}
                  </div>
                  {excludedCategories.size > 0 && (
                    <div className="px-3 py-2 border-t border-dark-border">
                      <button onClick={() => setExcludedCategories(new Set())} className="text-xs text-accent hover:underline">Clear all</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={generate} disabled={loading} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-60">
              {loading ? <Loader2 size={15} className="animate-spin" /> : <BarChart2 size={15} />}
              {t("reports.generate")}
            </button>
            {report && !loading && (
              <button onClick={exportPDF} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-dark-card border border-dark-border text-text-primary rounded-lg text-sm font-medium hover:bg-dark-card-hover">
                <Download size={15} /> Export PDF
              </button>
            )}
          </div>
        </div>

        {/* Report Output */}
        {loading && (
          <div className="flex items-center justify-center h-40"><Loader2 size={24} className="animate-spin text-accent" /></div>
        )}

        {!loading && report === null && (
          <div className="bg-dark-card border border-dark-border rounded-xl p-12 text-center text-text-muted">
            <BarChart2 size={40} className="mx-auto mb-3 opacity-30" />
            <p>Select a period and click Generate</p>
          </div>
        )}

        {/* P&L Report */}
        {!loading && report?.type === "pl" && (() => {
          const pl = report as PLReport;
          const isProfit = pl.netProfit >= 0;
          return (
            <div className="space-y-4">
              {excludedCategories.size > 0 && (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-orange-500/10 border border-orange-500/20 rounded-lg text-sm text-orange-400">
                  <Filter size={14} />
                  <span>Excluding: {Array.from(excludedCategories).map(c => EXPENSE_CATEGORIES[c] || c).join(", ")}</span>
                </div>
              )}
              {/* Summary KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-dark-card border border-dark-border rounded-xl p-3 sm:p-4">
                  <div className="text-text-muted text-xs mb-1">{t("reports.revenue")}</div>
                  <div className="text-base sm:text-xl font-bold text-emerald-400">{fmt(pl.revenue)}</div>
                  <div className="text-xs text-text-muted mt-0.5">{pl.invoiceCount} invoices</div>
                </div>
                <div className="bg-dark-card border border-dark-border rounded-xl p-3 sm:p-4">
                  <div className="text-text-muted text-xs mb-1">{t("reports.gross_profit")}</div>
                  <div className="text-base sm:text-xl font-bold text-blue-400">{fmt(pl.grossProfit)}</div>
                  <div className="text-xs text-text-muted mt-0.5">{pct(pl.grossProfit, pl.revenue)} margin</div>
                </div>
                <div className="bg-dark-card border border-dark-border rounded-xl p-3 sm:p-4">
                  <div className="text-text-muted text-xs mb-1">{t("reports.operating_expenses")}</div>
                  <div className="text-base sm:text-xl font-bold text-orange-400">{fmt(pl.totalExpenses)}</div>
                </div>
                <div className={`rounded-xl p-3 sm:p-4 border ${isProfit ? "bg-emerald-500/5 border-emerald-500/20" : "bg-red-500/5 border-red-500/20"}`}>
                  <div className="text-text-muted text-xs mb-1">{t("reports.net_profit")}</div>
                  <div className={`text-base sm:text-xl font-bold flex items-center gap-1 ${isProfit ? "text-emerald-400" : "text-red-400"}`}>
                    {isProfit ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                    {fmt(Math.abs(pl.netProfit))}
                  </div>
                  <div className="text-xs text-text-muted mt-0.5">{pct(pl.netProfit, pl.revenue)} net margin</div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Income Section */}
                <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-dark-border bg-emerald-500/5">
                    <h3 className="text-sm font-semibold text-emerald-400">{t("reports.revenue")}</h3>
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      <tr className="border-b border-dark-border/50">
                        <td className="px-4 py-3 text-text-secondary">{t("reports.invoice_revenue")}</td>
                        <td className="px-4 py-3 text-right font-medium text-text-primary">{fmt(pl.revenue)}</td>
                      </tr>
                      <tr className="border-b border-dark-border/50">
                        <td className="px-4 py-3 text-text-secondary">{t("reports.cogs")}</td>
                        <td className="px-4 py-3 text-right font-medium text-red-400">({fmt(pl.cogs)})</td>
                      </tr>
                      <tr className="bg-dark-bg/30">
                        <td className="px-4 py-3 font-semibold text-text-primary">{t("reports.gross_profit")}</td>
                        <td className="px-4 py-3 text-right font-bold text-emerald-400">{fmt(pl.grossProfit)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Expenses Section */}
                <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-dark-border bg-orange-500/5">
                    <h3 className="text-sm font-semibold text-orange-400">{t("reports.operating_expenses")}</h3>
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      {Object.entries(pl.expensesByCategory).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => (
                        <tr key={cat} className="border-b border-dark-border/50">
                          <td className="px-4 py-2.5 text-text-secondary">{EXPENSE_CATEGORIES[cat] || cat}</td>
                          <td className="px-4 py-2.5 text-right font-medium text-text-primary">{fmt(amt)}</td>
                        </tr>
                      ))}
                      {Object.keys(pl.expensesByCategory).length === 0 && (
                        <tr><td colSpan={2} className="px-4 py-6 text-center text-text-muted text-xs">No expenses recorded</td></tr>
                      )}
                      <tr className="bg-dark-bg/30">
                        <td className="px-4 py-3 font-semibold text-text-primary">Total</td>
                        <td className="px-4 py-3 text-right font-bold text-orange-400">{fmt(pl.totalExpenses)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Net Profit bar */}
              <div className={`rounded-xl border p-5 ${isProfit ? "bg-emerald-500/5 border-emerald-500/20" : "bg-red-500/5 border-red-500/20"}`}>
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold text-text-primary">{t("reports.net_profit")}</span>
                  <span className={`text-2xl font-bold ${isProfit ? "text-emerald-400" : "text-red-400"}`}>
                    {isProfit ? "+" : "-"}{fmt(Math.abs(pl.netProfit))}
                  </span>
                </div>
                <div className="mt-2 text-xs text-text-muted">
                  Revenue {fmt(pl.revenue)} − COGS {fmt(pl.cogs)} − Expenses {fmt(pl.totalExpenses)} = {fmt(pl.netProfit)}
                </div>
              </div>

              {/* Total Sales in Period */}
              <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-dark-border bg-emerald-500/5">
                  <h3 className="text-sm font-semibold text-emerald-400">Total Sales in Period</h3>
                  <p className="text-xs text-text-muted mt-0.5">Includes all invoices (all statuses) created in this period. COGS deducted to show gross profit.</p>
                </div>
                <div className="px-4 py-4">
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
                    <div className="bg-dark-bg/50 rounded-lg p-3">
                      <div className="text-xs text-text-muted mb-1">Revenue</div>
                      <div className="text-lg font-bold text-emerald-400">{fmt(pl.totalSalesInPeriod.revenue)}</div>
                      <div className="text-xs text-text-muted mt-1">{pl.totalSalesInPeriod.invoiceCount} invoices</div>
                    </div>
                    <div className="bg-dark-bg/50 rounded-lg p-3">
                      <div className="text-xs text-text-muted mb-1">Paid</div>
                      <div className="text-lg font-bold text-green-400">{fmt(pl.totalSalesInPeriod.totalPaid)}</div>
                      <div className="text-xs text-text-muted mt-1">{pl.totalSalesInPeriod.paidCount} paid · {pl.totalSalesInPeriod.partialCount} partial</div>
                    </div>
                    <div className="bg-dark-bg/50 rounded-lg p-3">
                      <div className="text-xs text-text-muted mb-1">Pending</div>
                      <div className={`text-lg font-bold ${pl.totalSalesInPeriod.totalPending > 0 ? "text-amber-400" : "text-text-muted"}`}>{fmt(pl.totalSalesInPeriod.totalPending)}</div>
                    </div>
                    <div className="bg-dark-bg/50 rounded-lg p-3">
                      <div className="text-xs text-text-muted mb-1">COGS</div>
                      <div className="text-lg font-bold text-red-400">{fmt(pl.totalSalesInPeriod.cogs)}</div>
                    </div>
                    <div className="bg-dark-bg/50 rounded-lg p-3">
                      <div className="text-xs text-text-muted mb-1">Gross Profit</div>
                      <div className={`text-lg font-bold ${pl.totalSalesInPeriod.grossProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmt(pl.totalSalesInPeriod.grossProfit)}</div>
                      <div className="text-xs text-text-muted mt-1">{pl.totalSalesInPeriod.revenue > 0 ? pct(pl.totalSalesInPeriod.grossProfit, pl.totalSalesInPeriod.revenue) : "—"} margin</div>
                    </div>
                    <div className="bg-dark-bg/50 rounded-lg p-3 border border-blue-500/20">
                      <div className="text-xs text-text-muted mb-1">Net Profit (Gross − Expenses)</div>
                      <div className={`text-lg font-bold ${pl.totalSalesInPeriod.grossProfit - pl.totalExpenses >= 0 ? "text-blue-400" : "text-red-400"}`}>{fmt(pl.totalSalesInPeriod.grossProfit - pl.totalExpenses)}</div>
                      <div className="text-xs text-text-muted mt-1">{pl.totalSalesInPeriod.revenue > 0 ? pct(pl.totalSalesInPeriod.grossProfit - pl.totalExpenses, pl.totalSalesInPeriod.revenue) : "—"} margin</div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          );
        })()}

        {/* Balance Sheet */}
        {!loading && report?.type === "bs" && (() => {
          const bs = report as BSReport;
          return (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Assets */}
              <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-dark-border bg-emerald-500/5">
                  <h3 className="text-sm font-bold text-emerald-400">{t("reports.assets")}</h3>
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b border-dark-border/50">
                      <td className="px-4 py-3 text-text-secondary">{t("reports.cash")}</td>
                      <td className="px-4 py-3 text-right font-medium text-text-primary">{fmt(bs.assets.cash)}</td>
                    </tr>
                    <tr className="border-b border-dark-border/50">
                      <td className="px-4 py-3 text-text-secondary">{t("reports.ar")}</td>
                      <td className="px-4 py-3 text-right font-medium text-text-primary">{fmt(bs.assets.ar)}</td>
                    </tr>
                    <tr className="border-b border-dark-border/50">
                      <td className="px-4 py-3 text-text-secondary">{t("reports.inventory")}</td>
                      <td className="px-4 py-3 text-right font-medium text-text-primary">{fmt(bs.assets.inventory)}</td>
                    </tr>
                    <tr className="bg-dark-bg/30">
                      <td className="px-4 py-3 font-bold text-text-primary">{t("reports.total_assets")}</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-400">{fmt(bs.assets.total)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Liabilities + Equity */}
              <div className="space-y-4">
                <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-dark-border bg-red-500/5">
                    <h3 className="text-sm font-bold text-red-400">{t("reports.liabilities")}</h3>
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      <tr className="border-b border-dark-border/50">
                        <td className="px-4 py-3 text-text-secondary">Tax Payable</td>
                        <td className="px-4 py-3 text-right font-medium text-text-primary">{fmt(bs.liabilities.taxPayable)}</td>
                      </tr>
                      <tr className="bg-dark-bg/30">
                        <td className="px-4 py-3 font-bold text-text-primary">{t("reports.total_liabilities")}</td>
                        <td className="px-4 py-3 text-right font-bold text-red-400">{fmt(bs.liabilities.total)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="bg-dark-card border border-purple-500/20 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-dark-border bg-purple-500/5">
                    <h3 className="text-sm font-bold text-purple-400">{t("reports.equity")}</h3>
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      <tr className="bg-dark-bg/30">
                        <td className="px-4 py-4 font-bold text-text-primary">{t("reports.net_assets")}</td>
                        <td className="px-4 py-4 text-right text-2xl font-bold text-purple-400">{fmt(bs.equity)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="text-xs text-text-muted text-center">
                  Assets ({fmt(bs.assets.total)}) = Liabilities ({fmt(bs.liabilities.total)}) + Equity ({fmt(bs.equity)})
                </div>
              </div>
            </div>
          );
        })()}

        {/* Comprehensive Report */}
        {!loading && report?.type === "comprehensive" && (() => {
          const cr = report as ComprehensiveReport;
          const isProfit = cr.summary.netProfit >= 0;
          function Eg({ text }: { text: string }) {
            return (
              <div className="mt-2 px-3 py-2 bg-dark-bg/60 border border-dark-border/50 rounded-lg text-xs text-text-muted leading-relaxed">
                <span className="font-medium text-text-secondary">Example: </span>{text}
              </div>
            );
          }
          const agingBuckets = [
            { key: "current", label: "Current", color: "text-emerald-400" },
            { key: "1-30", label: "1–30 Days", color: "text-yellow-400" },
            { key: "31-60", label: "31–60 Days", color: "text-orange-400" },
            { key: "61-90", label: "61–90 Days", color: "text-red-400" },
            { key: "90+", label: "90+ Days", color: "text-red-600" },
          ];
          return (
            <div className="space-y-6">
              {excludedCategories.size > 0 && (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-orange-500/10 border border-orange-500/20 rounded-lg text-sm text-orange-400">
                  <Filter size={14} />
                  <span>Excluding: {Array.from(excludedCategories).map(c => EXPENSE_CATEGORIES[c] || c).join(", ")}</span>
                </div>
              )}
              {/* Executive Summary */}
              <div>
                <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-2">Executive Summary</h2>
                <Eg text="Revenue comes from two sources: payments on invoices issued this period ($3,000 collected from new invoices) plus payments received on older invoices ($1,000 from last month's invoice) = $4,000 total. Products cost $800 to source (COGS, full cost even if invoice is only partially paid). Gross Profit = $4,000 − $800 = $3,200. After $1,200 in salaries (minus any advances) and rent, Net Profit = $2,000." />
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  <div className="bg-dark-card border border-dark-border rounded-xl p-4">
                    <div className="text-xs text-text-muted mb-1">Revenue</div>
                    <div className="text-lg font-bold text-emerald-400">{fmt(cr.summary.totalRevenue)}</div>
                    <div className="text-xs text-text-muted mt-0.5">{cr.summary.invoiceCount} invoices</div>
                  </div>
                  <div className="bg-dark-card border border-dark-border rounded-xl p-4">
                    <div className="text-xs text-text-muted mb-1">COGS</div>
                    <div className="text-lg font-bold text-red-400">{fmt(cr.summary.totalCogs)}</div>
                    <div className="text-xs text-text-muted mt-0.5">{cr.summary.cogsMargin}% of revenue</div>
                  </div>
                  <div className="bg-dark-card border border-dark-border rounded-xl p-4">
                    <div className="text-xs text-text-muted mb-1">Gross Profit</div>
                    <div className="text-lg font-bold text-blue-400">{fmt(cr.summary.grossProfit)}</div>
                    <div className="text-xs text-text-muted mt-0.5">{cr.summary.grossMargin}% margin</div>
                  </div>
                  <div className="bg-dark-card border border-dark-border rounded-xl p-4">
                    <div className="text-xs text-text-muted mb-1">Expenses</div>
                    <div className="text-lg font-bold text-orange-400">{fmt(cr.summary.totalExpenses)}</div>
                  </div>
                  <div className={`rounded-xl border p-4 col-span-2 sm:col-span-1 ${isProfit ? "bg-emerald-500/5 border-emerald-500/20" : "bg-red-500/5 border-red-500/20"}`}>
                    <div className="text-xs text-text-muted mb-1">Net Profit</div>
                    <div className={`text-lg font-bold flex items-center gap-1 ${isProfit ? "text-emerald-400" : "text-red-400"}`}>
                      {isProfit ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                      {fmt(cr.summary.netProfit)}
                    </div>
                    <div className="text-xs text-text-muted mt-0.5">{cr.summary.netMargin}% net margin</div>
                  </div>
                </div>
              </div>

              {/* P&L Waterfall */}
              <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-dark-border bg-blue-500/5">
                  <h2 className="text-sm font-semibold text-blue-400">Profit & Loss Statement</h2>
                  <Eg text="Revenue has two parts: $3,000 from invoices issued in this period (paid or partial) + $1,000 from payments on older invoices = $4,000 total. COGS $800 (full product cost, even for partially paid invoices). Gross Profit = $4,000 − $800 = $3,200. Salaries are shown after deducting any salary advances. Net Profit = Gross Profit − Total Expenses." />
                </div>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-dark-border/50">
                    <tr><td className="px-4 py-2.5 text-text-secondary">Total Revenue (Collected)</td><td className="px-4 py-2.5 text-right font-medium text-emerald-400">{fmt(cr.summary.totalRevenue)}</td></tr>
                    <tr><td className="px-4 py-2 text-text-muted pl-8 text-xs">Invoices Issued in Period</td><td className="px-4 py-2 text-right text-xs text-emerald-400/70">{fmt(cr.summary.periodInvoiceRevenue)}</td></tr>
                    <tr><td className="px-4 py-2 text-text-muted pl-8 text-xs">Payments from Older Invoices</td><td className="px-4 py-2 text-right text-xs text-emerald-400/70">{fmt(cr.summary.oldInvoiceRevenue)}</td></tr>
                    <tr><td className="px-4 py-2.5 text-text-secondary pl-8">Cost of Goods Sold (COGS)</td><td className="px-4 py-2.5 text-right text-red-400">({fmt(cr.summary.totalCogs)})</td></tr>
                    <tr className="bg-dark-bg/30"><td className="px-4 py-2.5 font-semibold text-text-primary">Gross Profit</td><td className="px-4 py-2.5 text-right font-bold text-blue-400">{fmt(cr.summary.grossProfit)}</td></tr>
                    {Object.entries(cr.expenses.byCategory).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => (
                      <tr key={cat}><td className="px-4 py-2 text-text-muted pl-8 text-xs capitalize">{cat.replace(/_/g, " ")}</td><td className="px-4 py-2 text-right text-xs text-text-secondary">({fmt(amt)})</td></tr>
                    ))}
                    <tr><td className="px-4 py-2.5 text-text-secondary pl-8">Total Operating Expenses</td><td className="px-4 py-2.5 text-right text-orange-400">({fmt(cr.summary.totalExpenses)})</td></tr>
                    <tr className={`${isProfit ? "bg-emerald-500/5" : "bg-red-500/5"}`}><td className="px-4 py-3 font-bold text-text-primary text-base">Net Profit</td><td className={`px-4 py-3 text-right font-bold text-base ${isProfit ? "text-emerald-400" : "text-red-400"}`}>{fmt(cr.summary.netProfit)}</td></tr>
                  </tbody>
                </table>
              </div>

              {/* Received Payments */}
              <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-dark-border bg-emerald-500/5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-emerald-400">Received Payments</h2>
                    <span className="text-xs text-text-muted">Total Collected: <strong className="text-emerald-400">{fmt(cr.receivedPayments.total)}</strong></span>
                  </div>
                  <Eg text="Client paid $500 on Jan 15 against Invoice #007 ($1,200 total). That $500 appears here on Jan 15. Payments from any invoice — even ones issued before the period — are included as long as the payment date falls within the selected range." />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[750px]">
                    <thead className="bg-dark-bg/50">
                      <tr>
                        <th className="text-left px-4 py-2 text-xs text-text-muted">Date</th>
                        <th className="text-left px-4 py-2 text-xs text-text-muted">Client</th>
                        <th className="text-left px-4 py-2 text-xs text-text-muted">Invoice #</th>
                        <th className="text-right px-4 py-2 text-xs text-text-muted">Invoice Total</th>
                        <th className="text-left px-4 py-2 text-xs text-text-muted">Method</th>
                        <th className="text-left px-4 py-2 text-xs text-text-muted">Reference</th>
                        <th className="text-right px-4 py-2 text-xs text-text-muted">Period Payment</th>
                        <th className="text-right px-4 py-2 text-xs text-text-muted">Total Paid to Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-dark-border/50">
                      {cr.receivedPayments.rows.length === 0 ? (
                        <tr><td colSpan={8} className="px-4 py-6 text-center text-text-muted text-xs">No payments received in this period</td></tr>
                      ) : cr.receivedPayments.rows.map(p => (
                        <tr key={p.id} className="hover:bg-dark-card-hover">
                          <td className="px-4 py-2.5 text-xs text-text-muted">{p.date}</td>
                          <td className="px-4 py-2.5 text-xs text-text-secondary">{p.client}</td>
                          <td className="px-4 py-2.5 font-mono text-xs text-text-primary">{p.invoiceNumber}</td>
                          <td className="px-4 py-2.5 text-right text-xs text-text-secondary">{fmt(p.invoiceTotal)}</td>
                          <td className="px-4 py-2.5 text-xs text-text-muted capitalize">{p.method}</td>
                          <td className="px-4 py-2.5 text-xs text-text-muted">{p.reference ?? "—"}</td>
                          <td className="px-4 py-2.5 text-right text-xs font-bold text-emerald-400">{fmt(p.periodPayment)}</td>
                          <td className="px-4 py-2.5 text-right text-xs font-bold text-emerald-300">{fmt(p.totalPaidToDate)}</td>
                        </tr>
                      ))}
                    </tbody>
                    {cr.receivedPayments.rows.length > 0 && (
                      <tfoot>
                        <tr className="bg-dark-bg/30 border-t border-dark-border">
                          <td colSpan={6} className="px-4 py-2.5 text-xs font-semibold text-text-primary">Total Period Payments</td>
                          <td className="px-4 py-2.5 text-right text-xs font-bold text-emerald-400">{fmt(cr.receivedPayments.total)}</td>
                          <td className="px-4 py-2.5 text-right text-xs text-text-muted">—</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>

              {/* COGS Explanation */}
              <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-dark-border flex items-start gap-2">
                  <Info size={15} className="text-blue-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <h2 className="text-sm font-semibold text-text-primary">COGS Explanation</h2>
                    <p className="text-xs text-text-muted mt-0.5">{cr.cogs.explanation}</p>
                    <Eg text="Invoice $1,000 · product unit cost $300 · client paid $500 (partially paid). Full COGS = $300 is recognised regardless of how much has been paid. Gross Profit = Amount Paid − COGS = $500 − $300 = $200." />
                  </div>
                </div>
                {cr.cogs.byInvoice.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[650px]">
                      <thead className="bg-dark-bg/50">
                        <tr>
                          <th className="text-left px-4 py-2 text-xs text-text-muted">Invoice #</th>
                          <th className="text-left px-4 py-2 text-xs text-text-muted">Client</th>
                          <th className="text-right px-4 py-2 text-xs text-text-muted">Invoice Total</th>
                          <th className="text-right px-4 py-2 text-xs text-text-muted">Period Payment</th>
                          <th className="text-right px-4 py-2 text-xs text-text-muted">Total Paid to Date</th>
                          <th className="text-right px-4 py-2 text-xs text-text-muted">COGS</th>
                          <th className="text-right px-4 py-2 text-xs text-text-muted">Gross Profit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-dark-border/50">
                        {cr.cogs.byInvoice.map(row => (
                          <tr key={row.number} className="hover:bg-dark-card-hover">
                            <td className="px-4 py-2.5 font-mono text-xs text-text-primary">{row.number}</td>
                            <td className="px-4 py-2.5 text-text-secondary text-xs">{row.client}</td>
                            <td className="px-4 py-2.5 text-right text-xs text-text-secondary">{fmt(row.total)}</td>
                            <td className="px-4 py-2.5 text-right text-xs text-emerald-400">{fmt(row.periodPayment)}</td>
                            <td className="px-4 py-2.5 text-right text-xs text-emerald-300">{fmt(row.totalPaidToDate)}</td>
                            <td className="px-4 py-2.5 text-right text-xs text-red-400">{fmt(row.cogs)}</td>
                            <td className={`px-4 py-2.5 text-right text-xs font-medium ${row.grossProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmt(row.grossProfit)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Expense Breakdown */}
              <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-dark-border bg-orange-500/5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-orange-400">Expense Breakdown</h2>
                    <span className="text-xs text-text-muted">Total: <strong className="text-text-primary">{fmt(cr.expenses.total)}</strong></span>
                  </div>
                  <Eg text="One-time rent $600 appears once. Recurring rent of $1,000/month is pro-rated using calendar-accurate months with rounding (e.g. Jan 1–Jan 31 = 1 month = $1,000; Jan 1–Feb 15 rounds to 1 month = $1,000). A monthly salary of $1,000 with a $200 advance = $800 shown. Supplier bill expenses reflect only actual payments made in the period." />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[700px]">
                    <thead className="bg-dark-bg/50">
                      <tr>
                        <th className="text-left px-4 py-2 text-xs text-text-muted">Category</th>
                        <th className="text-left px-4 py-2 text-xs text-text-muted">Description</th>
                        <th className="text-right px-4 py-2 text-xs text-text-muted">Date</th>
                        {cr.expenses.rows.some(r => r.category === "salaries") ? (
                          <>
                            <th className="text-right px-4 py-2 text-xs text-text-muted">Salary</th>
                            <th className="text-right px-4 py-2 text-xs text-text-muted">Advance Deduction</th>
                            <th className="text-right px-4 py-2 text-xs text-text-muted">Amount Paid</th>
                          </>
                        ) : (
                          <th className="text-right px-4 py-2 text-xs text-text-muted">Amount</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-dark-border/50">
                      {cr.expenses.rows.map((row, i) => (
                        <tr key={i} className="hover:bg-dark-card-hover">
                          <td className="px-4 py-2 text-xs">
                            <span className="px-1.5 py-0.5 rounded bg-dark-bg text-text-muted capitalize">{row.category.replace(/_/g, " ")}</span>
                          </td>
                          <td className="px-4 py-2 text-xs text-text-secondary">{row.description}</td>
                          <td className="px-4 py-2 text-right text-xs text-text-muted">{row.date}</td>
                          {row.category === "salaries" && row.salary !== undefined ? (
                            <>
                              <td className="px-4 py-2 text-right text-xs font-medium text-text-primary">{fmt(row.salary)}</td>
                              <td className="px-4 py-2 text-right text-xs font-medium text-orange-400">{fmt(row.salaryAdvance ?? 0)}</td>
                              <td className="px-4 py-2 text-right text-xs font-medium text-text-primary">{fmt(row.amountPaid ?? row.amount)}</td>
                            </>
                          ) : (
                            <td className="px-4 py-2 text-right text-xs font-medium text-text-primary">{fmt(row.amount)}</td>
                          )}
                        </tr>
                      ))}
                      {cr.expenses.rows.length === 0 && (
                        <tr><td colSpan={cr.expenses.rows.some(r => r.category === "salaries") ? 6 : 4} className="px-4 py-6 text-center text-text-muted text-xs">No expenses in this period</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Payable Aging */}
              <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-dark-border">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-text-primary">Accounts Payable (Unpaid Bills)</h2>
                    <span className="text-xs text-text-muted">Total Owed: <strong className="text-red-400">{fmt(cr.payableAging.total)}</strong></span>
                  </div>
                  <Eg text="Shows bills created in this period OR that received a payment in this period. Example: Bill for $1,000, paid $300, remaining $700. Due 20 days ago → 1–30 days bucket. Fully paid bills excluded." />
                </div>
                {cr.payableAging.rows.length === 0 ? (
                  <div className="px-4 py-6 text-center text-text-muted text-xs">No outstanding payables</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[750px]">
                      <thead className="bg-dark-bg/50">
                        <tr>
                          <th className="text-left px-4 py-2 text-xs text-text-muted">Supplier</th>
                          <th className="text-left px-4 py-2 text-xs text-text-muted">Description</th>
                          <th className="text-right px-4 py-2 text-xs text-text-muted">Total</th>
                          <th className="text-right px-4 py-2 text-xs text-text-muted">Period Payment</th>
                          <th className="text-right px-4 py-2 text-xs text-text-muted">Total Paid to Date</th>
                          <th className="text-right px-4 py-2 text-xs text-text-muted">Remaining</th>
                          <th className="text-center px-4 py-2 text-xs text-text-muted">Due Date</th>
                          <th className="text-center px-4 py-2 text-xs text-text-muted">Age</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-dark-border/50">
                        {cr.payableAging.rows.sort((a, b) => b.daysOverdue - a.daysOverdue).map(row => {
                          const color = row.daysOverdue > 90 ? "text-red-600" : row.daysOverdue > 60 ? "text-red-400" : row.daysOverdue > 30 ? "text-orange-400" : row.daysOverdue > 0 ? "text-yellow-400" : "text-text-muted";
                          return (
                            <tr key={row.billId} className="hover:bg-dark-card-hover">
                              <td className="px-4 py-2.5 text-xs font-medium text-text-primary">{row.supplier}</td>
                              <td className="px-4 py-2.5 text-xs text-text-secondary">{row.description}</td>
                              <td className="px-4 py-2.5 text-right text-xs text-text-secondary">{fmt(row.amount)}</td>
                              <td className="px-4 py-2.5 text-right text-xs font-medium text-emerald-400">{fmt(row.periodPayment)}</td>
                              <td className="px-4 py-2.5 text-right text-xs font-medium text-emerald-300">{fmt(row.totalPaidToDate)}</td>
                              <td className="px-4 py-2.5 text-right text-xs font-bold text-red-400">{fmt(row.remaining)}</td>
                              <td className="px-4 py-2.5 text-center text-xs text-text-muted">{row.dueDate ?? "—"}</td>
                              <td className="px-4 py-2.5 text-center">
                                <span className={`text-xs font-medium ${color}`}>
                                  {row.daysOverdue <= 0 ? "Current" : `${row.daysOverdue}d`}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Total Sales in Period */}
              <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-dark-border bg-emerald-500/5">
                  <h2 className="text-sm font-semibold text-emerald-400">Total Sales in Period</h2>
                  <Eg text="Includes all invoices (draft, sent, partially paid, paid) created in this period. COGS is deducted to show gross profit. For example: 5 invoices totaling $5,000 with COGS of $2,000 = $3,000 gross profit." />
                </div>
                <div className="px-4 py-4">
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
                    <div className="bg-dark-bg/50 rounded-lg p-3">
                      <div className="text-xs text-text-muted mb-1">Revenue</div>
                      <div className="text-lg font-bold text-emerald-400">{fmt(cr.totalSalesInPeriod.revenue)}</div>
                      <div className="text-xs text-text-muted mt-1">{cr.totalSalesInPeriod.invoiceCount} invoices</div>
                    </div>
                    <div className="bg-dark-bg/50 rounded-lg p-3">
                      <div className="text-xs text-text-muted mb-1">Paid</div>
                      <div className="text-lg font-bold text-green-400">{fmt(cr.totalSalesInPeriod.totalPaid)}</div>
                      <div className="text-xs text-text-muted mt-1">{cr.totalSalesInPeriod.paidCount} paid · {cr.totalSalesInPeriod.partialCount} partial</div>
                    </div>
                    <div className="bg-dark-bg/50 rounded-lg p-3">
                      <div className="text-xs text-text-muted mb-1">Pending</div>
                      <div className={`text-lg font-bold ${cr.totalSalesInPeriod.totalPending > 0 ? "text-amber-400" : "text-text-muted"}`}>{fmt(cr.totalSalesInPeriod.totalPending)}</div>
                    </div>
                    <div className="bg-dark-bg/50 rounded-lg p-3">
                      <div className="text-xs text-text-muted mb-1">COGS</div>
                      <div className="text-lg font-bold text-red-400">{fmt(cr.totalSalesInPeriod.cogs)}</div>
                    </div>
                    <div className="bg-dark-bg/50 rounded-lg p-3">
                      <div className="text-xs text-text-muted mb-1">Gross Profit</div>
                      <div className={`text-lg font-bold ${cr.totalSalesInPeriod.grossProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmt(cr.totalSalesInPeriod.grossProfit)}</div>
                      <div className="text-xs text-text-muted mt-1">{cr.totalSalesInPeriod.revenue > 0 ? pct(cr.totalSalesInPeriod.grossProfit, cr.totalSalesInPeriod.revenue) : "—"} margin</div>
                    </div>
                    <div className="bg-dark-bg/50 rounded-lg p-3 border border-blue-500/20">
                      <div className="text-xs text-text-muted mb-1">Net Profit (Gross − Expenses)</div>
                      <div className={`text-lg font-bold ${cr.totalSalesInPeriod.grossProfit - cr.summary.totalExpenses >= 0 ? "text-blue-400" : "text-red-400"}`}>{fmt(cr.totalSalesInPeriod.grossProfit - cr.summary.totalExpenses)}</div>
                      <div className="text-xs text-text-muted mt-1">{cr.totalSalesInPeriod.revenue > 0 ? pct(cr.totalSalesInPeriod.grossProfit - cr.summary.totalExpenses, cr.totalSalesInPeriod.revenue) : "—"} margin</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Most Sold Products */}
              {cr.mostSoldProducts.length > 0 && (
                <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-dark-border bg-blue-500/5">
                    <h2 className="text-sm font-semibold text-blue-400">Most Sold Products</h2>
                    <Eg text="Top 10 products by quantity sold in this period. Includes products from all invoice statuses." />
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[600px]">
                      <thead className="bg-dark-bg/50">
                        <tr>
                          <th className="text-left px-4 py-2 text-xs text-text-muted">Product</th>
                          <th className="text-right px-4 py-2 text-xs text-text-muted">Quantity</th>
                          <th className="text-right px-4 py-2 text-xs text-text-muted">Unit Price</th>
                          <th className="text-right px-4 py-2 text-xs text-text-muted">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-dark-border/50">
                        {cr.mostSoldProducts.map((product, i) => (
                          <tr key={i} className="hover:bg-dark-card-hover">
                            <td className="px-4 py-2.5 text-xs text-text-secondary">{product.description}</td>
                            <td className="px-4 py-2.5 text-right text-xs font-medium text-text-primary">{product.quantity}</td>
                            <td className="px-4 py-2.5 text-right text-xs text-text-secondary">{fmt(product.unitPrice)}</td>
                            <td className="px-4 py-2.5 text-right text-xs font-bold text-emerald-400">{fmt(product.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

      </div>
    </PermissionGuard>
  );
}
