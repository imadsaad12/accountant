"use client";

import { redirect } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import { Scale, Calendar, AlertTriangle, CheckCircle, Loader2 } from "lucide-react";
import { PermissionGuard } from "@/components/PermissionGuard";
import { useTranslation } from "@/components/LanguageProvider";
import { useOrgSettings } from "@/components/OrgSettingsProvider";

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$", EUR: "\u20ac", LBP: "\u0644.\u0644", XOF: "CFA", GNF: "FG", SLE: "Le", GHS: "\u20b5", CDF: "FC", NGN: "\u20a6",
};

const TYPE_COLORS: Record<string, string> = {
  asset: "text-blue-400",
  liability: "text-orange-400",
  equity: "text-purple-400",
  revenue: "text-emerald-400",
  expense: "text-red-400",
};

interface TrialRow {
  id: string;
  code: string;
  name: string;
  type: string;
  debitBalance: number;
  creditBalance: number;
}

export default function TrialBalancePage() {
  // Accounting module temporarily disabled — see Sidebar.tsx
  redirect("/dashboard");
  const t = useTranslation();
  const { orgSettings } = useOrgSettings();
  const sym = CURRENCY_SYMBOLS[orgSettings.defaultCurrency] ?? orgSettings.defaultCurrency;

  const [rows, setRows] = useState<TrialRow[]>([]);
  const [totalDebit, setTotalDebit] = useState(0);
  const [totalCredit, setTotalCredit] = useState(0);
  const [isBalanced, setIsBalanced] = useState(true);
  const [loading, setLoading] = useState(true);
  const [asOfDate, setAsOfDate] = useState("");

  useEffect(() => { loadData(); }, []);

  async function loadData(dateOverride?: string) {
    setLoading(true);
    const params = new URLSearchParams();
    const dateValue = dateOverride !== undefined ? dateOverride : asOfDate;
    if (dateValue) params.set("asOf", dateValue);
    const res = await fetch(`/api/trial-balance?${params}`);
    if (res.ok) {
      const data = await res.json();
      setRows(data.rows);
      setTotalDebit(data.totalDebit);
      setTotalCredit(data.totalCredit);
      setIsBalanced(data.isBalanced);
    }
    setLoading(false);
  }

  function fmt(n: number) {
    return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Group by type
  const grouped = ["asset", "liability", "equity", "revenue", "expense"].map((type) => ({
    type,
    accounts: rows.filter((r) => r.type === type),
  })).filter((g) => g.accounts.length > 0);

  return (
    <PermissionGuard feature="accounts">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-text-primary flex items-center gap-2">
            <Scale size={22} className="text-accent" /> {t("trial_balance.title")}
          </h1>
          <p className="text-sm text-text-muted mt-0.5">{t("trial_balance.subtitle")}</p>
        </div>

        {/* Date filter */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-text-muted text-sm">
            <Calendar size={14} />
            <span>{t("trial_balance.as_of")}</span>
          </div>
          <input
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            className="px-3 py-1.5 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm"
          />
          <button
            onClick={() => loadData()}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded-lg text-sm hover:bg-accent-hover font-medium disabled:opacity-60"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {t("common.apply")}
          </button>
          {asOfDate && (
            <button
              onClick={() => { setAsOfDate(""); loadData(""); }}
              className="px-3 py-1.5 text-text-muted hover:text-text-primary text-sm"
            >
              {t("common.clear")}
            </button>
          )}
        </div>

        {/* Balance status */}
        <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border ${
          isBalanced
            ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400"
            : "bg-red-500/5 border-red-500/20 text-red-400"
        }`}>
          {isBalanced ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
          <span className="text-sm font-medium">
            {isBalanced ? t("trial_balance.balanced") : t("trial_balance.unbalanced")}
          </span>
          {!isBalanced && (
            <span className="text-xs ml-2 opacity-70">
              ({t("trial_balance.difference")}: {sym}{fmt(Math.abs(totalDebit - totalCredit))})
            </span>
          )}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-dark-card border border-dark-border rounded-xl p-3">
            <div className="text-xs text-text-muted mb-1">{t("trial_balance.total_debits")}</div>
            <div className="text-xl font-bold text-emerald-400">{sym}{fmt(totalDebit)}</div>
          </div>
          <div className="bg-dark-card border border-dark-border rounded-xl p-3">
            <div className="text-xs text-text-muted mb-1">{t("trial_balance.total_credits")}</div>
            <div className="text-xl font-bold text-blue-400">{sym}{fmt(totalCredit)}</div>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-accent border-t-transparent" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-center text-text-muted py-8">{t("trial_balance.empty")}</p>
        ) : (
          <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-dark-bg/30">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted">{t("accounts.code")}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted">{t("trial_balance.account_name")}</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-text-muted">{t("journal.debit")}</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-text-muted">{t("journal.credit")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-border/30">
                {grouped.map((group) => (
                  <Fragment key={group.type}>
                    <tr className="bg-dark-bg/20">
                      <td colSpan={4} className="px-4 py-2">
                        <span className={`text-xs font-bold uppercase ${TYPE_COLORS[group.type] || "text-text-muted"}`}>
                          {t(`accounts.type.${group.type}`)}
                        </span>
                      </td>
                    </tr>
                    {group.accounts.map((row) => (
                      <tr key={row.id} className="hover:bg-dark-card-hover transition-colors">
                        <td className="px-4 py-2.5 text-sm font-mono text-accent">{row.code}</td>
                        <td className="px-4 py-2.5 text-sm text-text-primary">{row.name}</td>
                        <td className="px-4 py-2.5 text-sm text-right font-mono">
                          {row.debitBalance > 0 ? <span className="text-emerald-400">{sym}{fmt(row.debitBalance)}</span> : <span className="text-text-muted">-</span>}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-right font-mono">
                          {row.creditBalance > 0 ? <span className="text-blue-400">{sym}{fmt(row.creditBalance)}</span> : <span className="text-text-muted">-</span>}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-dark-border">
                <tr className="font-bold">
                  <td colSpan={2} className="px-4 py-3 text-sm text-text-primary">{t("journal.totals")}</td>
                  <td className="px-4 py-3 text-sm text-right font-mono text-emerald-400">{sym}{fmt(totalDebit)}</td>
                  <td className="px-4 py-3 text-sm text-right font-mono text-blue-400">{sym}{fmt(totalCredit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </PermissionGuard>
  );
}
