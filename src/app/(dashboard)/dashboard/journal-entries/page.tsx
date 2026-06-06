"use client";

import { redirect } from "next/navigation";
import { useEffect, useState } from "react";
import { BookOpen, ChevronDown, ChevronRight, Filter, Loader2 } from "lucide-react";
import { PermissionGuard } from "@/components/PermissionGuard";
import { useTranslation } from "@/components/LanguageProvider";
import { useOrgSettings } from "@/components/OrgSettingsProvider";

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$", EUR: "€", LBP: "ل.ل", XOF: "CFA", GNF: "FG", SLE: "Le", GHS: "₵", CDF: "FC", NGN: "₦",
};

interface JournalLine {
  id: string;
  debit: number;
  credit: number;
  description: string | null;
  account: { id: string; code: string; name: string; type: string };
}

interface JournalEntry {
  id: string;
  date: string;
  description: string;
  type: string;
  sourceId: string | null;
  lines: JournalLine[];
  createdAt: string;
}

const TYPE_LABELS: Record<string, string> = {
  invoice_payment: "Invoice Payment",
  invoice_created: "Invoice Issued",
  expense: "Expense",
  supplier_payment: "Supplier Payment",
  salary_advance: "Salary Advance",
  manual: "Manual",
};

const TYPE_COLORS: Record<string, string> = {
  invoice_payment: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  invoice_created: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  expense: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  supplier_payment: "bg-red-500/10 text-red-400 border-red-500/20",
  salary_advance: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  manual: "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

export default function JournalEntriesPage() {
  // Accounting module temporarily disabled — see Sidebar.tsx
  redirect("/dashboard");
  const t = useTranslation();
  const { orgSettings } = useOrgSettings();
  const sym = CURRENCY_SYMBOLS[orgSettings.defaultCurrency] ?? orgSettings.defaultCurrency;

  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterType) params.set("type", filterType);
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    const res = await fetch(`/api/journal-entries?${params}`);
    setEntries(res.ok ? await res.json() : []);
    setLoading(false);
  }

  function fmt(n: number) {
    return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Summary stats
  const totalEntries = entries.length;
  const totalDebits = entries.reduce((s, e) => s + e.lines.reduce((ls, l) => ls + l.debit, 0), 0);
  const totalCredits = entries.reduce((s, e) => s + e.lines.reduce((ls, l) => ls + l.credit, 0), 0);

  return (
    <PermissionGuard feature="accounts">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-text-primary flex items-center gap-2">
            <BookOpen size={22} className="text-accent" /> {t("journal.title")}
          </h1>
          <p className="text-sm text-text-muted mt-0.5">{t("journal.subtitle")}</p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-dark-card border border-dark-border rounded-xl p-3">
            <div className="text-xs text-text-muted mb-1">{t("journal.total_entries")}</div>
            <div className="text-xl font-bold text-text-primary">{totalEntries}</div>
          </div>
          <div className="bg-dark-card border border-dark-border rounded-xl p-3">
            <div className="text-xs text-text-muted mb-1">{t("journal.total_debits")}</div>
            <div className="text-xl font-bold text-emerald-400">{sym}{fmt(totalDebits)}</div>
          </div>
          <div className="bg-dark-card border border-dark-border rounded-xl p-3">
            <div className="text-xs text-text-muted mb-1">{t("journal.total_credits")}</div>
            <div className="text-xl font-bold text-blue-400">{sym}{fmt(totalCredits)}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-text-muted text-sm">
            <Filter size={14} />
          </div>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="px-3 py-1.5 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm"
          >
            <option value="">{t("journal.all_types")}</option>
            {Object.keys(TYPE_LABELS).map(type => (
              <option key={type} value={type}>{TYPE_LABELS[type]}</option>
            ))}
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="px-3 py-1.5 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm"
            placeholder="From"
          />
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="px-3 py-1.5 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm"
            placeholder="To"
          />
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded-lg text-sm hover:bg-accent-hover font-medium disabled:opacity-60"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {t("common.apply")}
          </button>
        </div>

        {/* Entries list */}
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-accent border-t-transparent" />
          </div>
        ) : entries.length === 0 ? (
          <p className="text-center text-text-muted py-8">{t("journal.empty")}</p>
        ) : (
          <div className="space-y-2">
            {entries.map(entry => {
              const isExpanded = expandedId === entry.id;
              const entryDebit = entry.lines.reduce((s, l) => s + l.debit, 0);
              const entryCredit = entry.lines.reduce((s, l) => s + l.credit, 0);
              return (
                <div key={entry.id} className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-dark-card-hover transition-colors"
                  >
                    {isExpanded ? <ChevronDown size={16} className="text-text-muted shrink-0" /> : <ChevronRight size={16} className="text-text-muted shrink-0" />}
                    <span className="text-xs text-text-muted w-20 shrink-0">
                      {new Date(entry.date).toLocaleDateString()}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium shrink-0 ${TYPE_COLORS[entry.type] || TYPE_COLORS.manual}`}>
                      {TYPE_LABELS[entry.type] || entry.type}
                    </span>
                    <span className="text-sm text-text-primary truncate flex-1">{entry.description}</span>
                    <span className="text-sm font-mono text-emerald-400 shrink-0">{sym}{fmt(entryDebit)}</span>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-dark-border">
                      <table className="w-full">
                        <thead className="bg-dark-bg/30">
                          <tr>
                            <th className="text-left px-4 py-2 text-xs font-medium text-text-muted">{t("journal.account")}</th>
                            <th className="text-right px-4 py-2 text-xs font-medium text-text-muted">{t("journal.debit")}</th>
                            <th className="text-right px-4 py-2 text-xs font-medium text-text-muted">{t("journal.credit")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-dark-border/30">
                          {entry.lines.map(line => (
                            <tr key={line.id}>
                              <td className="px-4 py-2 text-sm">
                                <span className="font-mono text-accent mr-2">{line.account.code}</span>
                                <span className="text-text-primary">{line.account.name}</span>
                              </td>
                              <td className="px-4 py-2 text-sm text-right font-mono">
                                {line.debit > 0 ? <span className="text-emerald-400">{sym}{fmt(line.debit)}</span> : <span className="text-text-muted">-</span>}
                              </td>
                              <td className="px-4 py-2 text-sm text-right font-mono">
                                {line.credit > 0 ? <span className="text-blue-400">{sym}{fmt(line.credit)}</span> : <span className="text-text-muted">-</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="border-t border-dark-border">
                          <tr>
                            <td className="px-4 py-2 text-xs font-bold text-text-muted">{t("journal.totals")}</td>
                            <td className="px-4 py-2 text-sm text-right font-mono font-bold text-emerald-400">{sym}{fmt(entryDebit)}</td>
                            <td className="px-4 py-2 text-sm text-right font-mono font-bold text-blue-400">{sym}{fmt(entryCredit)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PermissionGuard>
  );
}
