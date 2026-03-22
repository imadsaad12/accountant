"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { Plus, Trash2, X, Edit2, TrendingDown, ChevronUp, ChevronDown, Loader2 } from "lucide-react";
import { PermissionGuard, usePermissions } from "@/components/PermissionGuard";
import { useTranslation } from "@/components/LanguageProvider";
import { useOrgSettings, currencySymbol as getCurrencySymbol } from "@/components/OrgSettingsProvider";

interface Expense {
  id: string;
  date: string;
  amount: number;
  description: string;
  category: string;
  recurrence: string;
  vendor: string | null;
  reference: string | null;
  note: string | null;
  createdBy: { name: string } | null;
  account: { name: string; code: string } | null;
}

const RECURRENCE_OPTIONS = [
  { value: "none", label: "One-time" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

type ExpSortField = "date" | "description" | "category" | "vendor" | "amount" | "";
type SortDir = "asc" | "desc";

const CATEGORIES = ["rent", "utilities", "salaries", "office", "travel", "marketing", "insurance", "maintenance", "other"];

const emptyForm = {
  date: new Date().toISOString().split("T")[0],
  amount: "",
  description: "",
  category: "other",
  recurrence: "none",
  vendor: "",
  reference: "",
  note: "",
};

const CATEGORY_COLORS: Record<string, string> = {
  rent: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  utilities: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  salaries: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  office: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  travel: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  marketing: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  insurance: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  maintenance: "bg-red-500/10 text-red-400 border-red-500/20",
  other: "bg-slate-500/10 text-slate-400 border-slate-500/20",
};

export default function ExpensesPage() {
  const { canEditFeature } = usePermissions();
  const canEdit = canEditFeature("expenses");
  const t = useTranslation();
  const { orgSettings } = useOrgSettings();
  const currencySymbol = getCurrencySymbol(orgSettings.defaultCurrency);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [filterCategory, setFilterCategory] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [sortField, setSortField] = useState<ExpSortField>("");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterCategory) params.set("category", filterCategory);
    if (filterFrom) params.set("from", filterFrom);
    if (filterTo) params.set("to", filterTo);
    const [filteredRes, allRes] = await Promise.all([
      fetch(`/api/expenses?${params}`),
      fetch("/api/expenses"),
    ]);
    setExpenses(filteredRes.ok ? await filteredRes.json() : []);
    setAllExpenses(allRes.ok ? await allRes.json() : []);
    setLoading(false);
  }, [filterCategory, filterFrom, filterTo]);

  useEffect(() => { loadData(); }, [loadData]);

  function openAdd() {
    setEditId(null);
    setForm({ ...emptyForm });
    setShowForm(true);
  }

  function openEdit(exp: Expense) {
    setEditId(exp.id);
    setForm({
      date: exp.date.split("T")[0],
      amount: String(exp.amount),
      description: exp.description,
      category: exp.category,
      recurrence: exp.recurrence || "none",
      vendor: exp.vendor || "",
      reference: exp.reference || "",
      note: exp.note || "",
    });
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const method = editId ? "PUT" : "POST";
      const url = editId ? `/api/expenses/${editId}` : "/api/expenses";
      await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false);
      loadData();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t("expenses.delete_confirm"))) return;
    await fetch(`/api/expenses/${id}`, { method: "DELETE" });
    loadData();
  }

  function toggleSort(field: ExpSortField) {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  }

  function SortIcon({ field }: { field: ExpSortField }) {
    if (sortField !== field) return <ChevronUp size={12} className="opacity-30" />;
    return sortDir === "asc" ? <ChevronUp size={12} className="text-accent" /> : <ChevronDown size={12} className="text-accent" />;
  }

  const sortedExpenses = useMemo(() => {
    if (!sortField) return expenses;
    return [...expenses].sort((a, b) => {
      let va: string | number = "";
      let vb: string | number = "";
      if (sortField === "date") { va = a.date; vb = b.date; }
      else if (sortField === "description") { va = a.description.toLowerCase(); vb = b.description.toLowerCase(); }
      else if (sortField === "category") { va = a.category.toLowerCase(); vb = b.category.toLowerCase(); }
      else if (sortField === "vendor") { va = (a.vendor || "").toLowerCase(); vb = (b.vendor || "").toLowerCase(); }
      else if (sortField === "amount") { va = a.amount; vb = b.amount; }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [expenses, sortField, sortDir]);

  // Stat cards always reflect global totals (not affected by active filters)
  const totalAmount = allExpenses.reduce((s, e) => s + e.amount, 0);
  const byCategory: Record<string, number> = {};
  for (const exp of allExpenses) {
    byCategory[exp.category] = (byCategory[exp.category] ?? 0) + exp.amount;
  }

  // This month (always global, not filtered)
  const now = new Date();
  const thisMonth = allExpenses.filter(e => {
    const d = new Date(e.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).reduce((s, e) => s + e.amount, 0);

  return (
    <PermissionGuard feature="expenses">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-text-primary">{t("expenses.title")}</h1>
            <p className="text-xs sm:text-sm text-text-muted mt-0.5">{t("expenses.subtitle")}</p>
          </div>
          {canEdit && (
            <button onClick={openAdd} className="flex items-center gap-1.5 px-3 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover text-sm font-medium">
              <Plus size={16} /> {t("expenses.add")}
            </button>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="bg-dark-card border border-dark-border rounded-xl p-3 sm:p-4">
            <div className="flex items-center gap-1.5 text-text-muted text-xs mb-1"><TrendingDown size={13} /> {t("expenses.total")}</div>
            <div className="text-lg sm:text-2xl font-bold text-danger">{currencySymbol}{totalAmount.toFixed(2)}</div>
          </div>
          <div className="bg-dark-card border border-dark-border rounded-xl p-3 sm:p-4">
            <div className="text-text-muted text-xs mb-1">{t("expenses.this_month")}</div>
            <div className="text-lg sm:text-2xl font-bold text-text-primary">{currencySymbol}{thisMonth.toFixed(2)}</div>
          </div>
          <div className="col-span-2 sm:col-span-1 bg-dark-card border border-dark-border rounded-xl p-3 sm:p-4">
            <div className="text-text-muted text-xs mb-2">{t("expenses.by_category")}</div>
            <div className="space-y-1">
              {Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([cat, amt]) => (
                <div key={cat} className="flex items-center justify-between text-xs">
                  <span className={`px-2 py-0.5 rounded border text-[10px] font-medium ${CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.other}`}>{t(`expenses.cat.${cat}`)}</span>
                  <span className="text-text-secondary font-medium">{currencySymbol}{amt.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="flex-1 min-w-[140px] sm:flex-none px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm">
            <option value="">{t("common.all_categories")}</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{t(`expenses.cat.${c}`)}</option>)}
          </select>
          <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="flex-1 min-w-[130px] sm:flex-none px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm" />
          <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} className="flex-1 min-w-[130px] sm:flex-none px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm" />
          <button onClick={loadData} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover">{t("common.search")}</button>
          {(filterCategory || filterFrom || filterTo) && (
            <button onClick={() => { setFilterCategory(""); setFilterFrom(""); setFilterTo(""); }} className="px-3 py-2 text-sm text-text-muted hover:text-text-primary border border-dark-border rounded-lg">
              {t("common.clear")}
            </button>
          )}
        </div>

        {/* Add/Edit Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-dark-card border border-dark-border rounded-2xl p-4 sm:p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-text-primary">{editId ? t("expenses.edit") : t("expenses.add")}</h2>
                <button onClick={() => setShowForm(false)} className="text-text-muted hover:text-text-primary"><X size={20} /></button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">{t("field.date")} *</label>
                    <input type="date" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">{t("payments.amount")} *</label>
                    <input type="number" step="0.01" min="0.01" required value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm" placeholder="0.00" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">{t("field.description")} *</label>
                  <input required value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg text-sm" placeholder="e.g. Monthly rent payment" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">{t("expenses.category")} *</label>
                    <select required value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm">
                      {CATEGORIES.map(c => <option key={c} value={c}>{t(`expenses.cat.${c}`)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">Paid Every</label>
                    <select value={form.recurrence} onChange={e => setForm({ ...form, recurrence: e.target.value })} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm">
                      {RECURRENCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">{t("expenses.vendor")}</label>
                  <input value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg text-sm" placeholder="Vendor name" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">{t("expenses.reference")}</label>
                  <input value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg text-sm" placeholder="Invoice / receipt number" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">{t("field.notes")}</label>
                  <textarea value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} rows={2} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg text-sm" />
                </div>
                <div className="flex gap-3 justify-end">
                  <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-medium text-text-secondary bg-dark-card border border-dark-border rounded-lg hover:bg-dark-card-hover">{t("common.cancel")}</button>
                  <button type="submit" disabled={saving} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent-hover disabled:opacity-60">
                    {saving && <Loader2 size={14} className="animate-spin" />}
                    {t("common.save")}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-dark-card rounded-xl border border-dark-border overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32"><div className="animate-spin rounded-full h-6 w-6 border-2 border-accent border-t-transparent" /></div>
          ) : (
            <table className="w-full min-w-[560px]">
              <thead className="bg-dark-bg/50">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase cursor-pointer select-none" onClick={() => toggleSort("date")}><span className="inline-flex items-center gap-1">{t("field.date")} <SortIcon field="date" /></span></th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase cursor-pointer select-none" onClick={() => toggleSort("description")}><span className="inline-flex items-center gap-1">{t("field.description")} <SortIcon field="description" /></span></th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase cursor-pointer select-none" onClick={() => toggleSort("category")}><span className="inline-flex items-center gap-1">{t("expenses.category")} <SortIcon field="category" /></span></th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase cursor-pointer select-none" onClick={() => toggleSort("vendor")}><span className="inline-flex items-center gap-1">{t("expenses.vendor")} <SortIcon field="vendor" /></span></th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase cursor-pointer select-none" onClick={() => toggleSort("amount")}><span className="inline-flex items-center gap-1 justify-end">{t("payments.amount")} <SortIcon field="amount" /></span></th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase">{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-border/50">
                {sortedExpenses.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-text-muted">{t("expenses.empty")}</td></tr>
                ) : sortedExpenses.map(exp => (
                  <tr key={exp.id} className="hover:bg-dark-card-hover">
                    <td className="px-4 py-3 text-sm text-text-secondary">{new Date(exp.date).toLocaleDateString("en-GB")}</td>
                    <td className="px-4 py-3 text-sm text-text-primary font-medium">
                      <div className="flex items-center gap-2 flex-wrap">
                        {exp.description}
                        {exp.recurrence && exp.recurrence !== "none" && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/20 font-medium">
                            ↻ {RECURRENCE_OPTIONS.find(o => o.value === exp.recurrence)?.label ?? exp.recurrence}
                          </span>
                        )}
                        {exp.reference && <span className="text-xs text-text-muted">#{exp.reference}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded border font-medium ${CATEGORY_COLORS[exp.category] ?? CATEGORY_COLORS.other}`}>
                        {t(`expenses.cat.${exp.category}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{exp.vendor || "-"}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-danger text-right">{currencySymbol}{exp.amount.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right space-x-1">
                      {canEdit && (
                        <>
                          <button onClick={() => openEdit(exp)} className="text-text-muted hover:text-accent p-1"><Edit2 size={15} /></button>
                          <button onClick={() => handleDelete(exp.id)} className="text-text-muted hover:text-danger p-1"><Trash2 size={15} /></button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </PermissionGuard>
  );
}
