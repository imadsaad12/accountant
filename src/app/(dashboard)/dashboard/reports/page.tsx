"use client";

import { useState } from "react";
import { BarChart2, TrendingUp, TrendingDown, FileText, Loader2, Download, Scale } from "lucide-react";
import { PermissionGuard } from "@/components/PermissionGuard";
import { useTranslation } from "@/components/LanguageProvider";
import { useOrgSettings, currencySymbol as getCurrencySymbol } from "@/components/OrgSettingsProvider";
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
}

interface BSReport {
  type: "bs";
  asOf: string;
  assets: { cash: number; ar: number; inventory: number; total: number };
  liabilities: { taxPayable: number; total: number };
  equity: number;
}

interface AgingReport {
  type: "aging";
  buckets: { current: number; days1_30: number; days31_60: number; days61_90: number; days90plus: number };
  rows: { invoiceId: string; number: string; client: string; total: number; paid: number; balance: number; daysOverdue: number; bucket: string }[];
}

type Report = PLReport | BSReport | AgingReport | null;

const EXPENSE_CATEGORIES: Record<string, string> = {
  rent: "Rent", utilities: "Utilities", salaries: "Salaries", office: "Office Supplies",
  travel: "Travel", marketing: "Marketing", insurance: "Insurance", maintenance: "Maintenance", other: "Other",
};

function getDefaultRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return { from: `${year}-01-01`, to: `${year}-${month}-${day}` };
}

export default function ReportsPage() {
  const t = useTranslation();
  const { orgSettings } = useOrgSettings();
  const currencySymbol = getCurrencySymbol(orgSettings.defaultCurrency);
  const defaultRange = getDefaultRange();
  const [activeTab, setActiveTab] = useState<"pl" | "bs" | "aging">("pl");
  const [from, setFrom] = useState(defaultRange.from);
  const [to, setTo] = useState(defaultRange.to);
  const [report, setReport] = useState<Report>(null);
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    const params = new URLSearchParams({ type: activeTab, from, to });
    const res = await fetch(`/api/reports?${params}`);
    setReport(res.ok ? await res.json() : null);
    setLoading(false);
  }

  function fmt(n: number) { return `${currencySymbol}${n.toFixed(2)}`; }
  function pct(n: number, total: number) { return total > 0 ? `${((n / total) * 100).toFixed(1)}%` : "0%"; }

  function exportPDF() {
    if (!report) return;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const now = new Date().toLocaleDateString("en-GB");

    // Header
    doc.setFontSize(18); doc.setTextColor(37, 99, 235);
    doc.text(report.type === "pl" ? "Profit & Loss Report" : report.type === "aging" ? "Accounts Receivable Aging" : "Balance Sheet", 14, 20);
    doc.setFontSize(9); doc.setTextColor(120, 120, 120);
    if (report.type === "pl") {
      const pl = report as PLReport;
      doc.text(`Period: ${new Date(pl.period.from).toLocaleDateString("en-GB")} – ${new Date(pl.period.to).toLocaleDateString("en-GB")}`, 14, 28);
    }
    doc.text(`Generated: ${now}`, pageWidth - 14, 28, { align: "right" });

    if (report.type === "pl") {
      const pl = report as PLReport;
      // Summary table
      autoTable(doc, {
        startY: 35,
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
    } else if (report.type === "aging") {
      const aging = report as AgingReport;
      // Bucket summary
      autoTable(doc, {
        startY: 35,
        head: [["Bucket", "Amount"]],
        body: [
          ["Current", fmt(aging.buckets.current)],
          ["1–30 Days", fmt(aging.buckets.days1_30)],
          ["31–60 Days", fmt(aging.buckets.days31_60)],
          ["61–90 Days", fmt(aging.buckets.days61_90)],
          ["90+ Days", fmt(aging.buckets.days90plus)],
          ["Total Outstanding", fmt(Object.values(aging.buckets).reduce((s, v) => s + v, 0))],
        ],
        theme: "striped",
        headStyles: { fillColor: [37, 99, 235] },
        styles: { fontSize: 10 },
      });
      // Invoice detail table
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const startY = (doc as any).lastAutoTable.finalY + 10;
      autoTable(doc, {
        startY,
        head: [["Invoice #", "Client", "Total", "Paid", "Balance", "Days Overdue"]],
        body: aging.rows.sort((a, b) => b.daysOverdue - a.daysOverdue).map(row => [
          row.number, row.client, fmt(row.total), fmt(row.paid), fmt(row.balance),
          row.daysOverdue <= 0 ? "Current" : `${row.daysOverdue}d`,
        ]),
        theme: "striped",
        headStyles: { fillColor: [37, 99, 235] },
        styles: { fontSize: 9 },
      });
    }

    const filename = report.type === "pl" ? `pl-report-${from}-to-${to}.pdf` : `aging-report-${now}.pdf`;
    doc.save(filename);
  }

  const tabs = [
    { id: "pl" as const, label: t("reports.pl"), icon: BarChart2 },
    // { id: "bs" as const, label: t("reports.bs"), icon: Scale },
    { id: "aging" as const, label: t("aging.title"), icon: FileText },
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

        {/* Aging Report */}
        {!loading && report?.type === "aging" && (() => {
          const aging = report as AgingReport;
          const total = Object.values(aging.buckets).reduce((s, v) => s + v, 0);
          const bucketLabels = [
            { key: "current", label: t("aging.current"), color: "text-emerald-400" },
            { key: "days1_30", label: t("aging.days_1_30"), color: "text-yellow-400" },
            { key: "days31_60", label: t("aging.days_31_60"), color: "text-orange-400" },
            { key: "days61_90", label: t("aging.days_61_90"), color: "text-red-400" },
            { key: "days90plus", label: t("aging.days_90_plus"), color: "text-red-600" },
          ] as const;

          return (
            <div className="space-y-4">
              {/* Bucket Summary */}
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                {bucketLabels.map(b => (
                  <div key={b.key} className="bg-dark-card border border-dark-border rounded-xl p-3 sm:p-4">
                    <div className="text-text-muted text-xs mb-1">{b.label}</div>
                    <div className={`text-base sm:text-lg font-bold ${b.color}`}>{fmt(aging.buckets[b.key as keyof typeof aging.buckets])}</div>
                    <div className="text-xs text-text-muted">{pct(aging.buckets[b.key as keyof typeof aging.buckets], total)}</div>
                  </div>
                ))}
              </div>

              <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-dark-border flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-text-primary">{t("aging.title")}</h3>
                  <span className="text-xs text-text-muted">Total AR: <strong className="text-text-primary">{fmt(total)}</strong></span>
                </div>
                <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead className="bg-dark-bg/50">
                    <tr>
                      <th className="text-left px-4 py-2 text-xs text-text-muted">Invoice #</th>
                      <th className="text-left px-4 py-2 text-xs text-text-muted">Client</th>
                      <th className="text-right px-4 py-2 text-xs text-text-muted">Total</th>
                      <th className="text-right px-4 py-2 text-xs text-text-muted">Paid</th>
                      <th className="text-right px-4 py-2 text-xs text-text-muted">Balance</th>
                      <th className="text-center px-4 py-2 text-xs text-text-muted">Age</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark-border/50">
                    {aging.rows.length === 0 ? (
                      <tr><td colSpan={6} className="px-4 py-6 text-center text-text-muted">No outstanding receivables</td></tr>
                    ) : aging.rows.sort((a, b) => b.daysOverdue - a.daysOverdue).map(row => {
                      const color = row.daysOverdue > 90 ? "text-red-400" : row.daysOverdue > 60 ? "text-red-400" : row.daysOverdue > 30 ? "text-orange-400" : row.daysOverdue > 0 ? "text-yellow-400" : "text-emerald-400";
                      return (
                        <tr key={row.invoiceId} className="hover:bg-dark-card-hover">
                          <td className="px-4 py-2.5 font-mono text-sm text-text-primary">{row.number}</td>
                          <td className="px-4 py-2.5 text-text-secondary">{row.client}</td>
                          <td className="px-4 py-2.5 text-right text-text-secondary">{fmt(row.total)}</td>
                          <td className="px-4 py-2.5 text-right text-emerald-400">{fmt(row.paid)}</td>
                          <td className="px-4 py-2.5 text-right font-bold text-text-primary">{fmt(row.balance)}</td>
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
              </div>
            </div>
          );
        })()}
      </div>
    </PermissionGuard>
  );
}
