"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, X, Loader2, Banknote, CheckCircle2, Clock } from "lucide-react";
import { TablePageSkeleton } from "@/components/skeletons/TablePageSkeleton";
import { PermissionGuard, usePermissions } from "@/components/PermissionGuard";
import { useOrgSettings, useOrgTimezone, currencySymbol as getCurrencySymbol } from "@/components/OrgSettingsProvider";
import { todayInTz, formatDateInTz } from "@/lib/tz";
import { useTranslation } from "@/components/LanguageProvider";

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  position: string;
}

interface SalaryAdvance {
  id: string;
  employeeId: string;
  employee: { id: string; firstName: string; lastName: string; position: string };
  amount: number;
  date: string;
  status: "pending" | "returned";
  note: string | null;
  createdAt: string;
}

const fmtAmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtCompact = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return (n / 1_000_000_000).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + "B";
  if (abs >= 1_000_000)     return (n / 1_000_000).toLocaleString("en-US",     { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + "M";
  if (abs >= 1_000)         return (n / 1_000).toLocaleString("en-US",         { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + "K";
  return fmtAmt(n);
};

const emptyForm = {
  employeeId: "",
  amount: "",
  date: "", // set to todayInTz(tz) when opening form
  note: "",
};

export default function SalaryAdvancesPage() {
  const { canEditFeature } = usePermissions();
  const canEdit = canEditFeature("salary_advances");
  const t = useTranslation();
  const { orgSettings } = useOrgSettings();
  const tz = useOrgTimezone();
  const sym = getCurrencySymbol(orgSettings.defaultCurrency);

  const [advances, setAdvances] = useState<SalaryAdvance[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const loadData = useCallback(async () => {
    setLoading(true);
    const [advRes, empRes] = await Promise.all([
      fetch("/api/salary-advances"),
      fetch("/api/employees"),
    ]);
    setAdvances(advRes.ok ? await advRes.json() : []);
    setEmployees(empRes.ok ? await empRes.json() : []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch("/api/salary-advances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setShowForm(false);
      setForm({ ...emptyForm, date: todayInTz(tz) });
      loadData();
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(adv: SalaryAdvance) {
    setTogglingId(adv.id);
    const newStatus = adv.status === "pending" ? "returned" : "pending";
    await fetch(`/api/salary-advances/${adv.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    setTogglingId(null);
    loadData();
  }

  async function handleDelete(id: string) {
    if (!confirm(t("salary_advances.delete_confirm"))) return;
    await fetch(`/api/salary-advances/${id}`, { method: "DELETE" });
    loadData();
  }

  const totalAdvanced  = advances.reduce((s, a) => s + a.amount, 0);
  const totalReturned  = advances.filter(a => a.status === "returned").reduce((s, a) => s + a.amount, 0);
  const totalOutstanding = advances.filter(a => a.status === "pending").reduce((s, a) => s + a.amount, 0);

  if (loading) return <TablePageSkeleton rows={8} hasFilters cols={5} />;

  return (
    <PermissionGuard feature="salary_advances">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-text-primary">{t("salary_advances.title")}</h1>
            <p className="text-xs sm:text-sm text-text-muted mt-0.5">{t("salary_advances.subtitle")}</p>
          </div>
          {canEdit && (
            <button
              onClick={() => { setForm({ ...emptyForm, date: todayInTz(tz) }); setShowForm(true); }}
              className="flex items-center gap-1.5 px-3 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover text-sm font-medium"
            >
              <Plus size={16} /> {t("salary_advances.add")}
            </button>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="relative bg-dark-card border border-dark-border rounded-xl p-3 sm:p-4 group">
            <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-dark-bg border border-dark-border text-text-primary text-xs px-2.5 py-1.5 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20">
              {sym}{fmtAmt(totalAdvanced)}
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-dark-border" />
            </div>
            <div className="flex items-center gap-1.5 text-text-muted text-xs mb-1"><Banknote size={13} /> {t("salary_advances.total_advanced")}</div>
            <div className="text-lg sm:text-2xl font-bold text-text-primary">{sym}{fmtCompact(totalAdvanced)}</div>
          </div>
          <div className="relative bg-dark-card border border-dark-border rounded-xl p-3 sm:p-4 group">
            <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-dark-bg border border-dark-border text-text-primary text-xs px-2.5 py-1.5 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20">
              {sym}{fmtAmt(totalReturned)}
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-dark-border" />
            </div>
            <div className="flex items-center gap-1.5 text-text-muted text-xs mb-1"><CheckCircle2 size={13} /> {t("salary_advances.total_returned")}</div>
            <div className="text-lg sm:text-2xl font-bold text-emerald-400">{sym}{fmtCompact(totalReturned)}</div>
          </div>
          <div className="relative bg-dark-card border border-dark-border rounded-xl p-3 sm:p-4 group">
            <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-dark-bg border border-dark-border text-text-primary text-xs px-2.5 py-1.5 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20">
              {sym}{fmtAmt(totalOutstanding)}
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-dark-border" />
            </div>
            <div className="flex items-center gap-1.5 text-text-muted text-xs mb-1"><Clock size={13} /> {t("salary_advances.total_outstanding")}</div>
            <div className="text-lg sm:text-2xl font-bold text-amber-400">{sym}{fmtCompact(totalOutstanding)}</div>
          </div>
        </div>

        {/* Add Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-dark-card border border-dark-border rounded-2xl p-4 sm:p-6 w-full max-w-md">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-text-primary">{t("salary_advances.add")}</h2>
                <button onClick={() => setShowForm(false)} className="text-text-muted hover:text-text-primary"><X size={20} /></button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">{t("salary_advances.employee")} *</label>
                  <select
                    required
                    value={form.employeeId}
                    onChange={e => setForm({ ...form, employeeId: e.target.value })}
                    className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm"
                  >
                    <option value="">{t("salary_advances.select_employee")}</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName} — {emp.position}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">{t("payments.amount")} *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={form.amount}
                      onChange={e => setForm({ ...form, amount: e.target.value })}
                      placeholder="0.00"
                      className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">{t("field.date")} *</label>
                    <input
                      type="date"
                      required
                      value={form.date}
                      onChange={e => setForm({ ...form, date: e.target.value })}
                      className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">{t("field.notes")}</label>
                  <textarea
                    value={form.note}
                    onChange={e => setForm({ ...form, note: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg text-sm"
                    placeholder={t("salary_advances.note_placeholder")}
                  />
                </div>
                <div className="flex gap-3 justify-end pt-1">
                  <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-medium text-text-secondary bg-dark-card border border-dark-border rounded-lg hover:bg-dark-card-hover">
                    {t("common.cancel")}
                  </button>
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
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-accent border-t-transparent" />
            </div>
          ) : (
            <table className="w-full min-w-[600px]">
              <thead className="bg-dark-bg/50">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase">{t("salary_advances.employee")}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase">{t("field.date")}</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase">{t("payments.amount")}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase">{t("field.notes")}</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-text-muted uppercase">{t("field.status")}</th>
                  {canEdit && <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase">{t("common.actions")}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-border/50">
                {advances.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-text-muted">{t("salary_advances.empty")}</td></tr>
                ) : advances.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(adv => (
                  <tr key={adv.id} className="hover:bg-dark-card-hover">
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-text-primary">{adv.employee.firstName} {adv.employee.lastName}</p>
                      <p className="text-xs text-text-muted">{adv.employee.position}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{formatDateInTz(adv.date, tz)}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-right text-text-primary">{sym}{fmtAmt(adv.amount)}</td>
                    <td className="px-4 py-3 text-sm text-text-muted max-w-[160px] truncate">{adv.note || "—"}</td>
                    <td className="px-4 py-3 text-center">
                      {canEdit ? (
                        <button
                          onClick={() => toggleStatus(adv)}
                          disabled={togglingId === adv.id}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                            adv.status === "returned"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                              : "bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20"
                          } disabled:opacity-50`}
                        >
                          {togglingId === adv.id
                            ? <Loader2 size={11} className="animate-spin" />
                            : adv.status === "returned"
                              ? <CheckCircle2 size={11} />
                              : <Clock size={11} />
                          }
                          {t(`salary_advances.status.${adv.status}`)}
                        </button>
                      ) : (
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${
                          adv.status === "returned"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        }`}>
                          {adv.status === "returned" ? <CheckCircle2 size={11} /> : <Clock size={11} />}
                          {t(`salary_advances.status.${adv.status}`)}
                        </span>
                      )}
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => handleDelete(adv.id)} className="text-text-muted hover:text-danger p-1">
                          <Trash2 size={15} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {advances.length > PAGE_SIZE && (
          <div className="flex items-center justify-between px-2 py-3">
            <span className="text-xs text-text-muted">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, advances.length)} {t("common.of")} {advances.length}
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 text-xs rounded-lg border border-dark-border text-text-secondary hover:bg-dark-card-hover disabled:opacity-40">{t("common.prev")}</button>
              <span className="px-3 py-1.5 text-xs text-text-muted">{page} / {Math.ceil(advances.length / PAGE_SIZE)}</span>
              <button onClick={() => setPage(p => Math.min(Math.ceil(advances.length / PAGE_SIZE), p + 1))} disabled={page * PAGE_SIZE >= advances.length} className="px-3 py-1.5 text-xs rounded-lg border border-dark-border text-text-secondary hover:bg-dark-card-hover disabled:opacity-40">{t("common.next")}</button>
            </div>
          </div>
        )}
      </div>
    </PermissionGuard>
  );
}
