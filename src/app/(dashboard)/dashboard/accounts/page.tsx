"use client";

import { redirect } from "next/navigation";
import { useEffect, useState } from "react";
import { Plus, Trash2, X, Edit2, BookOpen, Calendar, ArrowLeft, Loader2 } from "lucide-react";
import { PermissionGuard, usePermissions } from "@/components/PermissionGuard";
import { useTranslation } from "@/components/LanguageProvider";
import { useOrgSettings } from "@/components/OrgSettingsProvider";

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$", EUR: "€", LBP: "ل.ل", XOF: "CFA", GNF: "FG", SLE: "Le", GHS: "₵", CDF: "FC", NGN: "₦",
};

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
  subtype: string | null;
  description: string | null;
  isDefault: boolean;
  parentId: string | null;
  children?: { id: string }[];
  totalDebit?: number;
  totalCredit?: number;
  balance?: number;
}

const ACCOUNT_TYPES = ["asset", "liability", "equity", "revenue", "expense"];

const TYPE_COLORS: Record<string, string> = {
  asset: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  liability: "bg-red-500/10 text-red-400 border-red-500/20",
  equity: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  revenue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  expense: "bg-orange-500/10 text-orange-400 border-orange-500/20",
};

const emptyForm = { code: "", name: "", type: "asset", subtype: "", description: "", parentId: "" };

export default function AccountsPage() {
  // Accounting module temporarily disabled — see Sidebar.tsx
  redirect("/dashboard");
  const { canEditFeature } = usePermissions();
  const canEdit = canEditFeature("accounts");
  const t = useTranslation();
  const { orgSettings } = useOrgSettings();
  const sym = CURRENCY_SYMBOLS[orgSettings.defaultCurrency] ?? orgSettings.defaultCurrency;
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [filterType, setFilterType] = useState("");
  const [error, setError] = useState("");
  const [asOfDate, setAsOfDate] = useState("");
  const [ledger, setLedger] = useState<{ account: { id: string; code: string; name: string; type: string }; entries: { id: string; date: string; description: string; type: string; reference: string | null; debit: number; credit: number; balance: number }[] } | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => { loadData(); }, []);

  async function loadData(dateOverride?: string) {
    setLoading(true);
    const params = new URLSearchParams();
    const dateValue = dateOverride !== undefined ? dateOverride : asOfDate;
    if (dateValue) params.set("asOf", dateValue);
    const res = await fetch(`/api/accounts/balances?${params}`);
    setAccounts(res.ok ? await res.json() : []);
    setLoading(false);
  }

  async function openLedger(acc: Account) {
    setLedgerLoading(true);
    setLedger(null);
    const res = await fetch(`/api/accounts/${acc.id}/ledger`);
    if (res.ok) setLedger(await res.json());
    setLedgerLoading(false);
  }

  function fmt(n: number) {
    return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function openAdd() {
    setEditId(null);
    setForm({ ...emptyForm });
    setError("");
    setShowForm(true);
  }

  function openEdit(acc: Account) {
    setEditId(acc.id);
    setForm({ code: acc.code, name: acc.name, type: acc.type, subtype: acc.subtype || "", description: acc.description || "", parentId: acc.parentId || "" });
    setError("");
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    const method = editId ? "PUT" : "POST";
    const url = editId ? `/api/accounts/${editId}` : "/api/accounts";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || t("common.error"));
      setSaving(false);
      return;
    }
    setSaving(false);
    setShowForm(false);
    loadData();
  }

  async function handleDelete(id: string) {
    if (!confirm(t("accounts.delete_confirm"))) return;
    setDeleting(id);
    const res = await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || t("common.error"));
    } else {
      await loadData();
    }
    setDeleting(null);
  }

  const filtered = filterType ? accounts.filter(a => a.type === filterType) : accounts;

  // Build hierarchical list: parents first, then children indented
  function buildTree(accs: Account[]): (Account & { depth: number })[] {
    const result: (Account & { depth: number })[] = [];
    const roots = accs.filter(a => !a.parentId || !accs.find(p => p.id === a.parentId));
    const childrenOf = (pid: string) => accs.filter(a => a.parentId === pid);
    function addWithChildren(acc: Account, depth: number) {
      result.push({ ...acc, depth });
      for (const child of childrenOf(acc.id)) {
        addWithChildren(child, depth + 1);
      }
    }
    for (const root of roots) addWithChildren(root, 0);
    return result;
  }

  // Group by type for display
  const grouped: Record<string, (Account & { depth: number })[]> = {};
  for (const type of ACCOUNT_TYPES) {
    const typeAccounts = filtered.filter(a => a.type === type);
    if (typeAccounts.length) grouped[type] = buildTree(typeAccounts);
  }

  return (
    <PermissionGuard feature="accounts">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-text-primary flex items-center gap-2">
              <BookOpen size={22} className="text-accent" /> {t("accounts.title")}
            </h1>
            <p className="text-sm text-text-muted mt-0.5">{t("accounts.subtitle")}</p>
          </div>
          {canEdit && (
            <button onClick={openAdd} className="flex items-center gap-1.5 px-3 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover text-sm font-medium">
              <Plus size={16} /> {t("accounts.add")}
            </button>
          )}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-5 gap-3">
          {ACCOUNT_TYPES.map(type => {
            const typeAccounts = accounts.filter(a => a.type === type);
            const totalBalance = typeAccounts.reduce((s, a) => s + (a.balance || 0), 0);
            return (
              <button key={type} onClick={() => setFilterType(filterType === type ? "" : type)}
                className={`rounded-xl border p-3 text-left transition-all ${filterType === type ? TYPE_COLORS[type] + " border-current" : "bg-dark-card border-dark-border hover:border-dark-border-hover"}`}>
                <div className="text-xs text-text-muted mb-1">{t(`accounts.type.${type}`)}</div>
                <div className="text-lg font-bold text-text-primary">{sym}{fmt(totalBalance)}</div>
                <div className="text-xs text-text-muted">{typeAccounts.length} accounts</div>
              </button>
            );
          })}
        </div>

        {/* Date filter */}
        <div className="flex items-center gap-3">
          <Calendar size={14} className="text-text-muted" />
          <span className="text-sm text-text-muted">{t("accounts.as_of")}</span>
          <input
            type="date"
            value={asOfDate}
            onChange={e => setAsOfDate(e.target.value)}
            className="px-3 py-1.5 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm"
          />
          <button onClick={() => loadData()} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded-lg text-sm hover:bg-accent-hover font-medium disabled:opacity-60">
            {loading && <Loader2 size={14} className="animate-spin" />}
            {t("common.apply")}
          </button>
          {asOfDate && (
            <button onClick={() => { setAsOfDate(""); loadData(""); }} className="text-xs text-text-muted hover:text-text-primary">
              {t("common.clear")}
            </button>
          )}
        </div>

        {/* Ledger Modal */}
        {(ledger || ledgerLoading) && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-dark-card border border-dark-border rounded-2xl p-4 sm:p-6 w-full max-w-3xl max-h-[80vh] flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <button onClick={() => setLedger(null)} className="text-text-muted hover:text-text-primary"><ArrowLeft size={18} /></button>
                  <h2 className="text-lg font-semibold text-text-primary">
                    {ledger ? `${ledger.account.code} - ${ledger.account.name}` : t("common.loading")}
                  </h2>
                </div>
                <button onClick={() => setLedger(null)} className="text-text-muted hover:text-text-primary"><X size={20} /></button>
              </div>
              {ledgerLoading ? (
                <div className="flex items-center justify-center h-32"><div className="animate-spin rounded-full h-6 w-6 border-2 border-accent border-t-transparent" /></div>
              ) : ledger && ledger.entries.length === 0 ? (
                <p className="text-center text-text-muted py-8">{t("accounts.ledger_empty")}</p>
              ) : ledger && (
                <div className="overflow-auto flex-1">
                  <table className="w-full">
                    <thead className="bg-dark-bg/30 sticky top-0">
                      <tr>
                        <th className="text-left px-4 py-2 text-xs font-medium text-text-muted">{t("field.date")}</th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-text-muted">{t("field.description")}</th>
                        <th className="text-right px-4 py-2 text-xs font-medium text-text-muted">{t("journal.debit")}</th>
                        <th className="text-right px-4 py-2 text-xs font-medium text-text-muted">{t("journal.credit")}</th>
                        <th className="text-right px-4 py-2 text-xs font-medium text-text-muted">{t("accounts.balance")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-dark-border/30">
                      {ledger.entries.map(entry => (
                        <tr key={entry.id} className="hover:bg-dark-card-hover">
                          <td className="px-4 py-2 text-sm text-text-muted whitespace-nowrap">{new Date(entry.date).toLocaleDateString()}</td>
                          <td className="px-4 py-2 text-sm text-text-primary">{entry.description}</td>
                          <td className="px-4 py-2 text-sm text-right font-mono">
                            {entry.debit > 0 ? <span className="text-emerald-400">{sym}{fmt(entry.debit)}</span> : <span className="text-text-muted">-</span>}
                          </td>
                          <td className="px-4 py-2 text-sm text-right font-mono">
                            {entry.credit > 0 ? <span className="text-blue-400">{sym}{fmt(entry.credit)}</span> : <span className="text-text-muted">-</span>}
                          </td>
                          <td className="px-4 py-2 text-sm text-right font-mono font-medium">
                            <span className={entry.balance >= 0 ? "text-emerald-400" : "text-red-400"}>
                              {sym}{fmt(Math.abs(entry.balance))}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Add/Edit Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-dark-card border border-dark-border rounded-2xl p-4 sm:p-6 w-full max-w-md">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-text-primary">{editId ? t("accounts.edit") : t("accounts.add")}</h2>
                <button onClick={() => setShowForm(false)} className="text-text-muted hover:text-text-primary"><X size={20} /></button>
              </div>
              {error && <div className="mb-3 p-3 bg-danger/10 border border-danger/20 text-danger text-sm rounded-lg">{error}</div>}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">{t("accounts.code")} *</label>
                    <input required value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm" placeholder="e.g. 1000" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">{t("accounts.type")} *</label>
                    <select required value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm">
                      {ACCOUNT_TYPES.map(type => <option key={type} value={type}>{t(`accounts.type.${type}`)}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">{t("field.name")} *</label>
                  <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg text-sm" placeholder="Account name" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">{t("accounts.parent")}</label>
                  <select value={form.parentId} onChange={e => setForm({ ...form, parentId: e.target.value })} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm">
                    <option value="">{t("accounts.no_parent")}</option>
                    {accounts.filter(a => a.type === form.type && a.id !== editId).map(a => (
                      <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">{t("accounts.subtype")}</label>
                  <input value={form.subtype} onChange={e => setForm({ ...form, subtype: e.target.value })} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg text-sm" placeholder="e.g. current_asset" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">{t("field.description")}</label>
                  <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg text-sm" />
                </div>
                <div className="flex gap-3 justify-end">
                  <button type="button" onClick={() => setShowForm(false)} disabled={saving} className="px-4 py-2 text-sm font-medium text-text-secondary bg-dark-card border border-dark-border rounded-lg hover:bg-dark-card-hover disabled:opacity-50">{t("common.cancel")}</button>
                  <button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent-hover disabled:opacity-60">
                    {saving && <Loader2 size={14} className="animate-spin" />}
                    {t("common.save")}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Account list grouped by type */}
        {loading ? (
          <div className="flex items-center justify-center h-32"><div className="animate-spin rounded-full h-6 w-6 border-2 border-accent border-t-transparent" /></div>
        ) : (
          <div className="space-y-4">
            {ACCOUNT_TYPES.filter(type => (filterType ? type === filterType : true) && grouped[type]?.length).map(type => (
              <div key={type} className="bg-dark-card border border-dark-border rounded-xl overflow-x-auto">
                <div className={`px-4 py-2 border-b border-dark-border flex items-center gap-2`}>
                  <span className={`text-xs px-2 py-0.5 rounded border font-semibold uppercase ${TYPE_COLORS[type]}`}>{t(`accounts.type.${type}`)}</span>
                  <span className="text-xs text-text-muted">{grouped[type].length} accounts</span>
                </div>
                <table className="w-full min-w-[480px]">
                  <thead className="bg-dark-bg/30">
                    <tr>
                      <th className="text-left px-4 py-2 text-xs font-medium text-text-muted">{t("accounts.code")}</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-text-muted">{t("field.name")}</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-text-muted">{t("accounts.subtype")}</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-text-muted">{t("accounts.balance")}</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-text-muted">{t("common.actions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark-border/30">
                    {grouped[type].map(acc => (
                      <tr key={acc.id} className="hover:bg-dark-card-hover">
                        <td className="px-4 py-2.5 text-sm font-mono text-accent" style={{ paddingLeft: `${16 + acc.depth * 20}px` }}>
                          {acc.depth > 0 && <span className="text-text-muted mr-1">└</span>}
                          {acc.code}
                        </td>
                        <td className="px-4 py-2.5 text-sm font-medium text-text-primary">
                          {acc.name}
                          {acc.isDefault && <span className="ml-2 text-[10px] text-text-muted border border-dark-border rounded px-1">default</span>}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-text-muted">{acc.subtype || "-"}</td>
                        <td className="px-4 py-2.5 text-right text-sm font-mono">
                          <button onClick={() => openLedger(acc)} className="hover:underline cursor-pointer">
                            {(acc.balance ?? 0) !== 0 ? (
                              <span className={(acc.balance ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}>
                                {sym}{fmt(Math.abs(acc.balance ?? 0))}
                              </span>
                            ) : (
                              <span className="text-text-muted">-</span>
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-2.5 text-right space-x-1">
                          {canEdit && (
                            <>
                              <button onClick={() => openEdit(acc)} className="text-text-muted hover:text-accent p-1"><Edit2 size={14} /></button>
                              {!acc.isDefault && (
                                <button onClick={() => handleDelete(acc.id)} disabled={deleting === acc.id} className="text-text-muted hover:text-danger p-1 disabled:opacity-50">
                                  {deleting === acc.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                </button>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            {Object.keys(grouped).length === 0 && (
              <p className="text-center text-text-muted py-8">{t("accounts.empty")}</p>
            )}
          </div>
        )}
      </div>
    </PermissionGuard>
  );
}
