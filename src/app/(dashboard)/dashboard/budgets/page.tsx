"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
import { Wallet, Plus, Trash2, Copy, BarChart3, Save, Archive, ChevronDown, X, Loader2 } from "lucide-react";
import { PermissionGuard } from "@/components/PermissionGuard";
import { useTranslation } from "@/components/LanguageProvider";
import { useOrgSettings } from "@/components/OrgSettingsProvider";
import { usePermissions } from "@/components/PermissionGuard";

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$", EUR: "\u20ac", LBP: "\u0644.\u0644", XOF: "CFA", GNF: "FG", SLE: "Le", GHS: "\u20b5", CDF: "FC", NGN: "\u20a6",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const TYPE_COLORS: Record<string, string> = {
  asset: "text-blue-400",
  liability: "text-orange-400",
  equity: "text-purple-400",
  revenue: "text-emerald-400",
  expense: "text-red-400",
};

interface Account { id: string; code: string; name: string; type: string }
interface BudgetLine {
  id?: string;
  accountId: string;
  account: Account;
  month1: number; month2: number; month3: number; month4: number;
  month5: number; month6: number; month7: number; month8: number;
  month9: number; month10: number; month11: number; month12: number;
}
interface Budget {
  id: string;
  name: string;
  fiscalYear: number;
  status: string;
  lines: BudgetLine[];
}
interface VsActualRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  months: { month: number; budgeted: number; actual: number; variance: number; variancePct: number }[];
  totalBudgeted: number;
  totalActual: number;
  totalVariance: number;
  totalVariancePct: number;
}

export default function BudgetsPage() {
  const t = useTranslation();
  const { orgSettings } = useOrgSettings();
  const { canEditFeature } = usePermissions();
  const canEdit = canEditFeature("budgets");
  const sym = CURRENCY_SYMBOLS[orgSettings.defaultCurrency] ?? orgSettings.defaultCurrency;

  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createYear, setCreateYear] = useState(new Date().getFullYear());
  const [copyFromId, setCopyFromId] = useState("");
  const [saving, setSaving] = useState(false);

  // Spreadsheet editing state
  const [editLines, setEditLines] = useState<Record<string, number[]>>({});
  const [dirty, setDirty] = useState(false);

  // Budget vs Actual
  const [vsActual, setVsActual] = useState<{ rows: VsActualRow[]; grandBudgeted: number; grandActual: number; grandVariance: number } | null>(null);
  const [showVsActual, setShowVsActual] = useState(false);
  const [loadingVsActual, setLoadingVsActual] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [deletingBudget, setDeletingBudget] = useState(false);

  // Add account row
  const [showAddAccount, setShowAddAccount] = useState(false);

  const loadBudgets = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/budgets");
    if (res.ok) setBudgets(await res.json());
    setLoading(false);
  }, []);

  const loadAccounts = useCallback(async () => {
    const res = await fetch("/api/accounts");
    if (res.ok) {
      const data = await res.json();
      setAccounts(data.sort((a: Account, b: Account) => a.code.localeCompare(b.code)));
    }
  }, []);

  useEffect(() => { loadBudgets(); loadAccounts(); }, [loadBudgets, loadAccounts]);

  const selectedBudget = budgets.find((b) => b.id === selectedBudgetId) ?? null;

  // Init edit lines from selected budget
  useEffect(() => {
    if (!selectedBudget) { setEditLines({}); setDirty(false); return; }
    const lines: Record<string, number[]> = {};
    selectedBudget.lines.forEach((l) => {
      lines[l.accountId] = [l.month1, l.month2, l.month3, l.month4, l.month5, l.month6, l.month7, l.month8, l.month9, l.month10, l.month11, l.month12];
    });
    setEditLines(lines);
    setDirty(false);
    setShowVsActual(false);
    setVsActual(null);
  }, [selectedBudgetId, budgets]); // eslint-disable-line react-hooks/exhaustive-deps

  function updateCell(accountId: string, monthIdx: number, value: number) {
    setEditLines((prev) => {
      const row = [...(prev[accountId] || new Array(12).fill(0))];
      row[monthIdx] = value;
      return { ...prev, [accountId]: row };
    });
    setDirty(true);
  }

  function addAccountRow(accountId: string) {
    if (editLines[accountId]) return;
    setEditLines((prev) => ({ ...prev, [accountId]: new Array(12).fill(0) }));
    setDirty(true);
    setShowAddAccount(false);
  }

  function removeAccountRow(accountId: string) {
    setEditLines((prev) => {
      const next = { ...prev };
      delete next[accountId];
      return next;
    });
    setDirty(true);
  }

  function applyToAll(accountId: string, monthIdx: number) {
    const value = editLines[accountId]?.[monthIdx] || 0;
    setEditLines((prev) => {
      const row = [...(prev[accountId] || new Array(12).fill(0))];
      for (let i = 0; i < 12; i++) row[i] = value;
      return { ...prev, [accountId]: row };
    });
    setDirty(true);
  }

  async function handleSave() {
    if (!selectedBudget) return;
    setSaving(true);
    const lines = Object.entries(editLines).map(([accountId, months]) => ({
      accountId,
      month1: months[0], month2: months[1], month3: months[2], month4: months[3],
      month5: months[4], month6: months[5], month7: months[6], month8: months[7],
      month9: months[8], month10: months[9], month11: months[10], month12: months[11],
    }));
    await fetch(`/api/budgets/${selectedBudget.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines }),
    });
    await loadBudgets();
    setDirty(false);
    setSaving(false);
  }

  async function handleCreate() {
    if (!createName.trim()) return;
    setSaving(true);
    const body: Record<string, unknown> = { name: createName, fiscalYear: createYear };
    if (copyFromId) body.copyFromBudgetId = copyFromId;
    const res = await fetch("/api/budgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const newBudget = await res.json();
      await loadBudgets();
      setSelectedBudgetId(newBudget.id);
      setShowCreate(false);
      setCreateName("");
      setCopyFromId("");
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!selectedBudget) return;
    if (!confirm(t("budgets.delete_confirm"))) return;
    setDeletingBudget(true);
    await fetch(`/api/budgets/${selectedBudget.id}`, { method: "DELETE" });
    setSelectedBudgetId(null);
    await loadBudgets();
    setDeletingBudget(false);
  }

  async function handleArchive() {
    if (!selectedBudget) return;
    setArchiving(true);
    const newStatus = selectedBudget.status === "active" ? "archived" : "active";
    await fetch(`/api/budgets/${selectedBudget.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    await loadBudgets();
    setArchiving(false);
  }

  async function loadVsActual() {
    if (!selectedBudget) return;
    setShowVsActual(true);
    setLoadingVsActual(true);
    const res = await fetch(`/api/budgets/${selectedBudget.id}/vs-actual`);
    if (res.ok) setVsActual(await res.json());
    setLoadingVsActual(false);
  }

  function fmt(n: number) { return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
  function fmtDec(n: number) { return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  function rowTotal(accountId: string) {
    return (editLines[accountId] || []).reduce((s, v) => s + v, 0);
  }

  // Available accounts not yet in the budget
  const usedAccountIds = new Set(Object.keys(editLines));
  const availableAccounts = accounts.filter((a) => !usedAccountIds.has(a.id));

  // Build rows grouped by type
  const accountMap = new Map(accounts.map((a) => [a.id, a]));
  const editRows = Object.entries(editLines).map(([accId, months]) => ({
    accountId: accId,
    account: accountMap.get(accId) || selectedBudget?.lines.find((l) => l.accountId === accId)?.account || { id: accId, code: "?", name: "Unknown", type: "expense" },
    months,
  }));
  editRows.sort((a, b) => a.account.code.localeCompare(b.account.code));

  const groupedRows = ["revenue", "expense", "asset", "liability", "equity"]
    .map((type) => ({ type, rows: editRows.filter((r) => r.account.type === type) }))
    .filter((g) => g.rows.length > 0);

  return (
    <PermissionGuard feature="budgets">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-text-primary flex items-center gap-2">
              <Wallet size={22} className="text-accent" /> {t("budgets.title")}
            </h1>
            <p className="text-sm text-text-muted mt-0.5">{t("budgets.subtitle")}</p>
          </div>
          {canEdit && (
            <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover">
              <Plus size={15} /> {t("budgets.create")}
            </button>
          )}
        </div>

        {/* Budget selector */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <select
              value={selectedBudgetId || ""}
              onChange={(e) => setSelectedBudgetId(e.target.value || null)}
              className="appearance-none px-4 py-2 pr-8 bg-dark-card border border-dark-border text-text-primary rounded-lg text-sm min-w-[200px]"
            >
              <option value="">{t("budgets.select")}</option>
              {budgets.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.fiscalYear}) {b.status === "archived" ? "[archived]" : ""}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          </div>

          {selectedBudget && (
            <>
              <button onClick={loadVsActual} disabled={loadingVsActual} className="flex items-center gap-1.5 px-3 py-2 bg-dark-card border border-dark-border text-text-primary rounded-lg text-sm hover:bg-dark-card-hover disabled:opacity-60">
                {loadingVsActual ? <Loader2 size={14} className="animate-spin" /> : <BarChart3 size={14} />} {t("budgets.vs_actual")}
              </button>
              {canEdit && (
                <>
                  <button onClick={handleArchive} disabled={archiving} className="flex items-center gap-1.5 px-3 py-2 bg-dark-card border border-dark-border text-text-muted rounded-lg text-sm hover:text-text-primary disabled:opacity-60">
                    {archiving ? <Loader2 size={14} className="animate-spin" /> : <Archive size={14} />} {selectedBudget.status === "active" ? t("budgets.archive") : t("budgets.activate")}
                  </button>
                  <button onClick={handleDelete} disabled={deletingBudget} className="flex items-center gap-1.5 px-3 py-2 text-red-400 hover:text-red-300 text-sm disabled:opacity-60">
                    {deletingBudget ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} {t("common.delete")}
                  </button>
                </>
              )}
            </>
          )}
        </div>

        {/* Create modal */}
        {showCreate && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
            <div className="bg-dark-card border border-dark-border rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-bold text-text-primary mb-4">{t("budgets.create")}</h2>
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-text-muted block mb-1">{t("budgets.name")}</label>
                  <input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder={t("budgets.name_placeholder")}
                    className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm" />
                </div>
                <div>
                  <label className="text-sm text-text-muted block mb-1">{t("budgets.fiscal_year")}</label>
                  <input type="number" value={createYear} onChange={(e) => setCreateYear(parseInt(e.target.value))}
                    className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm" />
                </div>
                <div>
                  <label className="text-sm text-text-muted block mb-1">{t("budgets.copy_from")}</label>
                  <select value={copyFromId} onChange={(e) => setCopyFromId(e.target.value)}
                    className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm">
                    <option value="">{t("budgets.start_blank")}</option>
                    {budgets.map((b) => (
                      <option key={b.id} value={b.id}>{b.name} ({b.fiscalYear})</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-text-muted text-sm hover:text-text-primary">{t("common.cancel")}</button>
                <button onClick={handleCreate} disabled={!createName.trim() || saving}
                  className="flex items-center gap-1.5 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-60">
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {t("budgets.create")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Loading / Empty */}
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-accent border-t-transparent" />
          </div>
        ) : !selectedBudget ? (
          <div className="bg-dark-card border border-dark-border rounded-xl p-12 text-center text-text-muted">
            <Wallet size={40} className="mx-auto mb-3 opacity-30" />
            <p>{budgets.length === 0 ? t("budgets.empty") : t("budgets.select_prompt")}</p>
          </div>
        ) : showVsActual && loadingVsActual ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-accent border-t-transparent" />
          </div>
        ) : showVsActual && vsActual ? (
          /* Budget vs Actual view */
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-text-primary">{t("budgets.vs_actual")}</h2>
                <p className="text-sm text-text-muted mt-0.5">{selectedBudget.name} — {selectedBudget.fiscalYear}</p>
              </div>
              <button onClick={() => setShowVsActual(false)} className="px-3 py-1.5 bg-dark-card border border-dark-border text-text-muted hover:text-text-primary rounded-lg text-sm"><X size={16} /></button>
            </div>
            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-dark-card border border-dark-border rounded-xl p-5">
                <div className="text-sm text-text-muted mb-2">{t("budgets.total_budgeted")}</div>
                <div className="text-2xl font-bold text-blue-400">{sym}{fmtDec(vsActual.grandBudgeted)}</div>
              </div>
              <div className="bg-dark-card border border-dark-border rounded-xl p-5">
                <div className="text-sm text-text-muted mb-2">{t("budgets.total_actual")}</div>
                <div className="text-2xl font-bold text-text-primary">{sym}{fmtDec(vsActual.grandActual)}</div>
              </div>
              <div className={`bg-dark-card border rounded-xl p-5 ${vsActual.grandVariance >= 0 ? "border-emerald-500/20" : "border-red-500/20"}`}>
                <div className="text-sm text-text-muted mb-2">{t("budgets.variance")}</div>
                <div className={`text-2xl font-bold ${vsActual.grandVariance >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {vsActual.grandVariance >= 0 ? "+" : ""}{sym}{fmtDec(Math.abs(vsActual.grandVariance))}
                </div>
                <div className={`text-sm mt-1 ${vsActual.grandVariance >= 0 ? "text-emerald-400/70" : "text-red-400/70"}`}>
                  {vsActual.grandBudgeted > 0 ? `${((vsActual.grandVariance / vsActual.grandBudgeted) * 100).toFixed(1)}%` : ""}
                </div>
              </div>
            </div>
            {/* Per-account cards */}
            <div className="space-y-3">
              {vsActual.rows.map((row) => {
                const pct = row.totalBudgeted > 0 ? (row.totalActual / row.totalBudgeted) * 100 : 0;
                const barWidth = Math.min(pct, 100);
                return (
                  <div key={row.accountId} className="bg-dark-card border border-dark-border rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-accent text-sm">{row.accountCode}</span>
                        <span className="text-text-primary text-sm font-medium">{row.accountName}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${TYPE_COLORS[row.accountType] || "text-text-muted"}`}>{row.accountType}</span>
                      </div>
                      <div className={`text-sm font-bold ${row.totalVariance >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {row.totalVariance >= 0 ? "+" : ""}{sym}{fmt(row.totalVariance)} ({row.totalVariancePct >= 0 ? "+" : ""}{row.totalVariancePct.toFixed(0)}%)
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="h-2.5 bg-dark-bg rounded-full overflow-hidden mb-3">
                      <div
                        className={`h-full rounded-full transition-all ${pct > 100 ? "bg-red-500" : pct > 80 ? "bg-amber-500" : "bg-emerald-500"}`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <div>
                        <span className="text-text-muted">{t("budgets.bud")}:</span>{" "}
                        <span className="font-mono text-blue-400">{sym}{fmt(row.totalBudgeted)}</span>
                      </div>
                      <div>
                        <span className="text-text-muted">{t("budgets.act")}:</span>{" "}
                        <span className="font-mono text-text-primary">{sym}{fmt(row.totalActual)}</span>
                      </div>
                      <div className="text-text-muted text-xs">
                        {pct.toFixed(0)}% used
                      </div>
                    </div>
                    {/* Monthly breakdown - compact */}
                    <div className="mt-3 grid grid-cols-6 sm:grid-cols-12 gap-1.5">
                      {row.months.map((md) => {
                        const mPct = md.budgeted > 0 ? (md.actual / md.budgeted) * 100 : 0;
                        return (
                          <div key={md.month} className="text-center" title={`${MONTHS[md.month - 1]}: Budget ${sym}${fmt(md.budgeted)}, Actual ${sym}${fmt(md.actual)}`}>
                            <div className="text-[10px] text-text-muted mb-1">{MONTHS[md.month - 1]}</div>
                            <div className={`h-8 bg-dark-bg rounded relative overflow-hidden`}>
                              <div
                                className={`absolute bottom-0 w-full rounded ${mPct > 100 ? "bg-red-500/60" : mPct > 80 ? "bg-amber-500/60" : "bg-emerald-500/60"}`}
                                style={{ height: `${Math.min(mPct, 100)}%` }}
                              />
                            </div>
                            <div className="text-[10px] font-mono text-text-muted mt-0.5">{md.actual > 0 ? fmt(md.actual) : "-"}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Spreadsheet grid editor */
          <div className="space-y-4">
            {/* Save bar */}
            {canEdit && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {canEdit && (
                    <div className="relative">
                      <button onClick={() => setShowAddAccount(!showAddAccount)} className="flex items-center gap-1.5 px-3 py-2 bg-dark-card border border-dark-border text-text-primary rounded-lg text-sm hover:bg-dark-card-hover">
                        <Plus size={14} /> {t("budgets.add_account")}
                      </button>
                      {showAddAccount && (
                        <div className="absolute z-50 mt-1 w-72 bg-dark-card border border-dark-border rounded-xl shadow-xl overflow-hidden">
                          <div className="max-h-60 overflow-y-auto py-1">
                            {availableAccounts.length === 0 ? (
                              <div className="px-3 py-2 text-sm text-text-muted">{t("budgets.all_accounts_added")}</div>
                            ) : (
                              availableAccounts.map((acc) => (
                                <button key={acc.id} onClick={() => addAccountRow(acc.id)}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-dark-card-hover">
                                  <span className="font-mono text-accent mr-2">{acc.code}</span>
                                  <span className="text-text-primary">{acc.name}</span>
                                  <span className={`ml-2 text-xs ${TYPE_COLORS[acc.type] || ""}`}>({acc.type})</span>
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {dirty && (
                  <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-60">
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {saving ? t("budgets.saving") : t("budgets.save")}
                  </button>
                )}
              </div>
            )}

            {/* Grid */}
            <div className="bg-dark-card border border-dark-border rounded-xl overflow-x-auto">
              <table className="w-full min-w-[1000px]">
                <thead className="bg-dark-bg/30">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted sticky left-0 bg-dark-bg/30 z-10 min-w-[200px]">{t("budgets.account")}</th>
                    {MONTHS.map((m) => (
                      <th key={m} className="text-center px-2 py-3 text-xs font-semibold text-text-muted w-[85px]">{m}</th>
                    ))}
                    <th className="text-right px-4 py-3 text-xs font-bold text-text-primary border-l border-dark-border min-w-[100px]">{t("budgets.annual")}</th>
                    {canEdit && <th className="w-10"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-border/30">
                  {groupedRows.map((group) => (
                    <Fragment key={group.type}>
                      <tr className="bg-dark-bg/20">
                        <td colSpan={14 + (canEdit ? 1 : 0)} className="px-4 py-2">
                          <span className={`text-xs font-bold uppercase tracking-wide ${TYPE_COLORS[group.type] || "text-text-muted"}`}>
                            {t(`accounts.type.${group.type}`)}
                          </span>
                        </td>
                      </tr>
                      {group.rows.map((row) => (
                        <tr key={row.accountId} className="hover:bg-dark-card-hover group">
                          <td className="px-4 py-2 sticky left-0 bg-dark-card z-10 group-hover:bg-dark-card-hover">
                            <span className="font-mono text-accent text-sm mr-1.5">{row.account.code}</span>
                            <span className="text-text-primary text-sm">{row.account.name}</span>
                          </td>
                          {row.months.map((val, idx) => (
                            <td key={idx} className="px-1 py-1.5">
                              {canEdit ? (
                                <input
                                  type="number"
                                  value={val || ""}
                                  onChange={(e) => updateCell(row.accountId, idx, parseFloat(e.target.value) || 0)}
                                  onDoubleClick={() => applyToAll(row.accountId, idx)}
                                  className="w-full px-2 py-1.5 bg-transparent border border-transparent hover:border-dark-border focus:border-accent focus:bg-dark-input text-right text-sm font-mono text-text-primary rounded-md outline-none"
                                  title={t("budgets.dblclick_fill")}
                                />
                              ) : (
                                <span className="text-sm font-mono text-text-primary">{val > 0 ? fmt(val) : <span className="text-text-muted">-</span>}</span>
                              )}
                            </td>
                          ))}
                          <td className="px-4 py-2 text-right font-mono text-sm font-bold text-text-primary border-l border-dark-border">
                            {sym}{fmt(rowTotal(row.accountId))}
                          </td>
                          {canEdit && (
                            <td className="px-2 py-2 text-center">
                              <button onClick={() => removeAccountRow(row.accountId)} className="text-text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1">
                                <X size={14} />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                  {editRows.length === 0 && (
                    <tr><td colSpan={14 + (canEdit ? 1 : 0)} className="px-4 py-12 text-center text-text-muted">{t("budgets.no_lines")}</td></tr>
                  )}
                </tbody>
                {editRows.length > 0 && (
                  <tfoot className="border-t-2 border-dark-border">
                    <tr className="font-bold">
                      <td className="px-4 py-3 text-sm text-text-primary sticky left-0 bg-dark-card z-10">{t("journal.totals")}</td>
                      {MONTHS.map((_, idx) => {
                        const monthTotal = Object.values(editLines).reduce((s, months) => s + (months[idx] || 0), 0);
                        return <td key={idx} className="px-2 py-3 text-center text-sm font-mono text-text-primary">{fmt(monthTotal)}</td>;
                      })}
                      <td className="px-4 py-3 text-right font-mono text-sm text-accent border-l border-dark-border">
                        {sym}{fmtDec(Object.keys(editLines).reduce((s, id) => s + rowTotal(id), 0))}
                      </td>
                      {canEdit && <td></td>}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <p className="text-xs text-text-muted">{t("budgets.dblclick_hint")}</p>
          </div>
        )}
      </div>
    </PermissionGuard>
  );
}
