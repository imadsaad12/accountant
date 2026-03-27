"use client";

import { useEffect, useState, useMemo } from "react";
import { Plus, Pencil, Trash2, X, Search, ChevronUp, ChevronDown, Loader2, Receipt, CheckCircle2, Clock } from "lucide-react";
import { TablePageSkeleton } from "@/components/skeletons/TablePageSkeleton";
import { PermissionGuard, usePermissions } from "@/components/PermissionGuard";
import { PhoneInput } from "@/components/PhoneInput";
import { useOrgSettings, currencySymbol as getCurrencySymbol } from "@/components/OrgSettingsProvider";
import { useTranslation } from "@/components/LanguageProvider";

interface Supplier {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  paymentTerms: number | null;
  notes: string | null;
}

interface SupplierBill {
  id: string;
  supplierId: string;
  amount: number;
  description: string;
  reference: string | null;
  date: string;
  dueDate: string | null;
  status: "pending" | "paid";
  note: string | null;
  supplier?: { id: string; name: string };
}

type SortField = "name" | "email" | "city" | "paymentTerms" | "";
type SortDir = "asc" | "desc";

const emptySupplier = {
  name: "", contactName: "", email: "", phone: "",
  address: "", city: "", country: "", paymentTerms: "", notes: "",
};

const emptyBill = {
  description: "", amount: "", date: "", dueDate: "", reference: "", note: "", status: "pending",
};

const fmtAmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtCompact = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (abs >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return fmtAmt(n);
};

export default function SuppliersPage() {
  const { canEditFeature } = usePermissions();
  const canEdit = canEditFeature("suppliers");
  const { orgSettings } = useOrgSettings();
  const currencySymbol = getCurrencySymbol(orgSettings.defaultCurrency);
  const t = useTranslation();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [bills, setBills] = useState<SupplierBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState(emptySupplier);
  const [formError, setFormError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [sortField, setSortField] = useState<SortField>("");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  // Bills modal state
  const [billsSupplier, setBillsSupplier] = useState<Supplier | null>(null);
  const [supplierBills, setSupplierBills] = useState<SupplierBill[]>([]);
  const [billsLoading, setBillsLoading] = useState(false);
  const [showBillForm, setShowBillForm] = useState(false);
  const [editingBill, setEditingBill] = useState<SupplierBill | null>(null);
  const [billForm, setBillForm] = useState(emptyBill);
  const [billSaving, setBillSaving] = useState(false);

  useEffect(() => { loadAll(); }, []);
  useEffect(() => { setPage(1); }, [search, filterCity, sortField, sortDir]);

  async function loadAll() {
    setLoading(true);
    const [suppRes, billsRes] = await Promise.all([
      fetch("/api/suppliers"),
      fetch("/api/supplier-bills"),
    ]);
    setSuppliers(suppRes.ok ? await suppRes.json() : []);
    setBills(billsRes.ok ? await billsRes.json() : []);
    setLoading(false);
  }

  function openCreate() {
    setForm(emptySupplier);
    setEditing(null);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(supplier: Supplier) {
    setFormError(null);
    setForm({
      name: supplier.name,
      contactName: supplier.contactName || "",
      email: supplier.email || "",
      phone: supplier.phone || "",
      address: supplier.address || "",
      city: supplier.city || "",
      country: supplier.country || "",
      paymentTerms: supplier.paymentTerms != null ? String(supplier.paymentTerms) : "",
      notes: supplier.notes || "",
    });
    setEditing(supplier);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      const payload = {
        ...form,
        paymentTerms: form.paymentTerms !== "" ? Number(form.paymentTerms) : null,
      };
      const url = editing ? `/api/suppliers/${editing.id}` : "/api/suppliers";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) {
        const data = await res.json();
        setFormError(data.error || t("common.error"));
        return;
      }
      setShowForm(false);
      loadAll();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t("suppliers.delete_confirm"))) return;
    const res = await fetch(`/api/suppliers/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || t("common.error"));
      return;
    }
    loadAll();
  }

  // Bills panel
  async function openBills(supplier: Supplier) {
    setBillsSupplier(supplier);
    setBillsLoading(true);
    setShowBillForm(false);
    const res = await fetch(`/api/supplier-bills?supplierId=${supplier.id}`);
    setSupplierBills(res.ok ? await res.json() : []);
    setBillsLoading(false);
  }

  function openAddBill() {
    setEditingBill(null);
    setBillForm({ ...emptyBill, date: new Date().toISOString().split("T")[0] });
    setShowBillForm(true);
  }

  function openEditBill(bill: SupplierBill) {
    setEditingBill(bill);
    setBillForm({
      description: bill.description,
      amount: String(bill.amount),
      date: bill.date.split("T")[0],
      dueDate: bill.dueDate ? bill.dueDate.split("T")[0] : "",
      reference: bill.reference || "",
      note: bill.note || "",
      status: bill.status,
    });
    setShowBillForm(true);
  }

  async function handleBillSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBillSaving(true);
    try {
      const payload = { ...billForm, supplierId: billsSupplier!.id };
      const url = editingBill ? `/api/supplier-bills/${editingBill.id}` : "/api/supplier-bills";
      const method = editingBill ? "PUT" : "POST";
      await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      setShowBillForm(false);
      const res = await fetch(`/api/supplier-bills?supplierId=${billsSupplier!.id}`);
      setSupplierBills(res.ok ? await res.json() : []);
      // Refresh aggregate bills too
      const allRes = await fetch("/api/supplier-bills");
      setBills(allRes.ok ? await allRes.json() : []);
    } finally {
      setBillSaving(false);
    }
  }

  async function toggleBillStatus(bill: SupplierBill) {
    const newStatus = bill.status === "paid" ? "pending" : "paid";
    await fetch(`/api/supplier-bills/${bill.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    setSupplierBills(prev => prev.map(b => b.id === bill.id ? { ...b, status: newStatus } : b));
    setBills(prev => prev.map(b => b.id === bill.id ? { ...b, status: newStatus } : b));
  }

  async function handleDeleteBill(id: string) {
    if (!confirm("Delete this bill?")) return;
    await fetch(`/api/supplier-bills/${id}`, { method: "DELETE" });
    setSupplierBills(prev => prev.filter(b => b.id !== id));
    setBills(prev => prev.filter(b => b.id !== id));
  }

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  }

  const cities = useMemo(() => [...new Set(suppliers.map(s => s.city).filter(Boolean))] as string[], [suppliers]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return suppliers
      .filter(s =>
        (!q || s.name.toLowerCase().includes(q) || (s.email || "").toLowerCase().includes(q) || (s.city || "").toLowerCase().includes(q) || (s.phone || "").includes(q) || (s.contactName || "").toLowerCase().includes(q)) &&
        (!filterCity || s.city === filterCity)
      )
      .sort((a, b) => {
        if (!sortField) return 0;
        let va: string | number = "";
        let vb: string | number = "";
        if (sortField === "name") { va = a.name.toLowerCase(); vb = b.name.toLowerCase(); }
        else if (sortField === "email") { va = (a.email || "").toLowerCase(); vb = (b.email || "").toLowerCase(); }
        else if (sortField === "city") { va = (a.city || "").toLowerCase(); vb = (b.city || "").toLowerCase(); }
        else if (sortField === "paymentTerms") { va = a.paymentTerms ?? 0; vb = b.paymentTerms ?? 0; }
        if (va < vb) return sortDir === "asc" ? -1 : 1;
        if (va > vb) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
  }, [suppliers, search, filterCity, sortField, sortDir]);

  // Stat aggregates
  const totalBilled = bills.reduce((s, b) => s + b.amount, 0);
  const totalPaid = bills.filter(b => b.status === "paid").reduce((s, b) => s + b.amount, 0);
  const totalPending = bills.filter(b => b.status === "pending").reduce((s, b) => s + b.amount, 0);

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ChevronUp size={12} className="opacity-30" />;
    return sortDir === "asc" ? <ChevronUp size={12} className="text-accent" /> : <ChevronDown size={12} className="text-accent" />;
  }

  if (loading) return <TablePageSkeleton rows={8} hasFilters cols={6} statCards={3} />;

  return (
    <PermissionGuard feature="suppliers">
    <div>
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-text-primary">{t("suppliers.title")}</h1>
        {canEdit && (
          <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover text-sm font-medium">
            <Plus size={16} /> {t("suppliers.add")}
          </button>
        )}
      </div>

      {/* Stat boxes */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-dark-card border border-dark-border rounded-xl p-3 sm:p-4">
          <div className="flex items-center gap-1.5 text-text-muted text-xs mb-1"><Receipt size={13} /> Total Billed</div>
          <div className="text-lg sm:text-2xl font-bold text-text-primary">{currencySymbol}{fmtCompact(totalBilled)}</div>
          <div className="text-[10px] text-text-muted mt-0.5">{bills.length} bill{bills.length !== 1 ? "s" : ""}</div>
        </div>
        <div className="bg-dark-card border border-dark-border rounded-xl p-3 sm:p-4">
          <div className="flex items-center gap-1.5 text-text-muted text-xs mb-1"><CheckCircle2 size={13} /> Paid</div>
          <div className="text-lg sm:text-2xl font-bold text-emerald-400">{currencySymbol}{fmtCompact(totalPaid)}</div>
          <div className="text-[10px] text-text-muted mt-0.5">{bills.filter(b => b.status === "paid").length} bill{bills.filter(b => b.status === "paid").length !== 1 ? "s" : ""}</div>
        </div>
        <div className="bg-dark-card border border-dark-border rounded-xl p-3 sm:p-4">
          <div className="flex items-center gap-1.5 text-text-muted text-xs mb-1"><Clock size={13} /> Pending</div>
          <div className="text-lg sm:text-2xl font-bold text-amber-400">{currencySymbol}{fmtCompact(totalPending)}</div>
          <div className="text-[10px] text-text-muted mt-0.5">{bills.filter(b => b.status === "pending").length} bill{bills.filter(b => b.status === "pending").length !== 1 ? "s" : ""}</div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col gap-2 mb-4">
        <div className="relative w-full">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t("common.search")}
            className="w-full pl-9 pr-3 py-2 bg-dark-card border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg text-sm focus:ring-accent focus:border-accent"
          />
        </div>
        {cities.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <select value={filterCity} onChange={e => setFilterCity(e.target.value)} className="flex-1 min-w-[140px] sm:flex-none px-3 py-2 bg-dark-card border border-dark-border text-text-primary rounded-lg text-sm focus:ring-accent focus:border-accent">
              <option value="">{t("common.all_cities")}</option>
              {cities.map(city => <option key={city} value={city}>{city}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Supplier form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-dark-card border border-dark-border rounded-2xl p-4 sm:p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-text-primary">{editing ? t("suppliers.edit") : t("suppliers.add")}</h2>
              <button onClick={() => setShowForm(false)} className="text-text-muted hover:text-text-primary"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">{t("field.name")} *</label>
                <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg focus:ring-accent focus:border-accent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">{t("suppliers.contact_name")}</label>
                <input value={form.contactName} onChange={e => setForm({ ...form, contactName: e.target.value })} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg focus:ring-accent focus:border-accent" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">{t("field.email")}</label>
                  <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg focus:ring-accent focus:border-accent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">{t("field.phone")}</label>
                  <PhoneInput value={form.phone} onChange={v => setForm({ ...form, phone: v })} className="w-full" defaultCountry={orgSettings.defaultPhoneCountry} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">{t("field.address")}</label>
                <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg focus:ring-accent focus:border-accent" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">{t("field.city")}</label>
                  <input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg focus:ring-accent focus:border-accent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">{t("field.country")}</label>
                  <input value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg focus:ring-accent focus:border-accent" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">{t("field.notes")}</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg focus:ring-accent focus:border-accent" />
              </div>
              {formError && (
                <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">{formError}</p>
              )}
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-medium text-text-secondary bg-dark-card border border-dark-border rounded-lg hover:bg-dark-card-hover">{t("common.cancel")}</button>
                <button type="submit" disabled={saving} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent-hover disabled:opacity-60">
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {editing ? t("common.save") : t("suppliers.add")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Suppliers table */}
      <div className="bg-dark-card rounded-xl border border-dark-border overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead className="bg-dark-bg/50">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase cursor-pointer select-none" onClick={() => toggleSort("name")}>
                <span className="inline-flex items-center gap-1">{t("field.name")} <SortIcon field="name" /></span>
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase">{t("suppliers.contact_name")}</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase cursor-pointer select-none" onClick={() => toggleSort("email")}>
                <span className="inline-flex items-center gap-1">{t("field.email")} <SortIcon field="email" /></span>
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase">{t("field.phone")}</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase cursor-pointer select-none" onClick={() => toggleSort("city")}>
                <span className="inline-flex items-center gap-1">{t("field.city")} <SortIcon field="city" /></span>
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase">Bills</th>
              {canEdit && <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase">{t("common.actions")}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-dark-border/50">
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-text-muted">{search || filterCity ? t("common.no_results") : t("suppliers.empty")}</td></tr>
            ) : filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(supplier => {
              const supplierBillsForRow = bills.filter(b => b.supplierId === supplier.id);
              const pendingCount = supplierBillsForRow.filter(b => b.status === "pending").length;
              const pendingAmt = supplierBillsForRow.filter(b => b.status === "pending").reduce((s, b) => s + b.amount, 0);
              return (
                <tr key={supplier.id} className="hover:bg-dark-card-hover">
                  <td className="px-4 py-3 text-sm font-medium text-text-primary">{supplier.name}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{supplier.contactName || "-"}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{supplier.email || "-"}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{supplier.phone || "-"}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{supplier.city || "-"}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => openBills(supplier)}
                      className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-accent transition-colors"
                    >
                      <Receipt size={13} />
                      {supplierBillsForRow.length > 0 ? (
                        <span>
                          {supplierBillsForRow.length} bill{supplierBillsForRow.length !== 1 ? "s" : ""}
                          {pendingCount > 0 && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20 text-[10px] font-medium">
                              {currencySymbol}{fmtCompact(pendingAmt)} due
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-text-muted">No bills</span>
                      )}
                    </button>
                  </td>
                  {canEdit && (
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => openEdit(supplier)} className="text-text-muted hover:text-accent p-1"><Pencil size={16} /></button>
                      <button onClick={() => handleDelete(supplier.id)} className="text-text-muted hover:text-danger p-1 ml-1"><Trash2 size={16} /></button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between px-2 py-3">
          <span className="text-xs text-text-muted">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} {t("common.of")} {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 text-xs rounded-lg border border-dark-border text-text-secondary hover:bg-dark-card-hover disabled:opacity-40">{t("common.prev")}</button>
            <span className="px-3 py-1.5 text-xs text-text-muted">{page} / {Math.ceil(filtered.length / PAGE_SIZE)}</span>
            <button onClick={() => setPage(p => Math.min(Math.ceil(filtered.length / PAGE_SIZE), p + 1))} disabled={page * PAGE_SIZE >= filtered.length} className="px-3 py-1.5 text-xs rounded-lg border border-dark-border text-text-secondary hover:bg-dark-card-hover disabled:opacity-40">{t("common.next")}</button>
          </div>
        </div>
      )}

      {/* Bills panel modal */}
      {billsSupplier && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-dark-card border border-dark-border rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-dark-border shrink-0">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">{billsSupplier.name} — Bills</h2>
                {(() => {
                  const paid = supplierBills.filter(b => b.status === "paid").reduce((s, b) => s + b.amount, 0);
                  const pending = supplierBills.filter(b => b.status === "pending").reduce((s, b) => s + b.amount, 0);
                  return (
                    <p className="text-xs text-text-muted mt-0.5">
                      <span className="text-emerald-400">{currencySymbol}{fmtAmt(paid)} paid</span>
                      {pending > 0 && <span className="text-amber-400 ml-2">{currencySymbol}{fmtAmt(pending)} pending</span>}
                    </p>
                  );
                })()}
              </div>
              <div className="flex items-center gap-2">
                {canEdit && !showBillForm && (
                  <button onClick={openAddBill} className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded-lg hover:bg-accent-hover text-xs font-medium">
                    <Plus size={13} /> Add Bill
                  </button>
                )}
                <button onClick={() => { setBillsSupplier(null); setShowBillForm(false); }} className="text-text-muted hover:text-text-primary"><X size={20} /></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5">
              {/* Add/Edit bill form */}
              {showBillForm && (
                <form onSubmit={handleBillSubmit} className="bg-dark-bg border border-dark-border rounded-xl p-4 mb-4 space-y-3">
                  <h3 className="text-sm font-medium text-text-primary">{editingBill ? "Edit Bill" : "New Bill"}</h3>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">{t("field.description")} *</label>
                    <input required value={billForm.description} onChange={e => setBillForm({ ...billForm, description: e.target.value })} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg text-sm" placeholder="e.g. Office supplies invoice" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-text-secondary mb-1">Amount *</label>
                      <input type="number" step="0.01" min="0.01" required value={billForm.amount} onChange={e => setBillForm({ ...billForm, amount: e.target.value })} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm" placeholder="0.00" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-text-secondary mb-1">Reference</label>
                      <input value={billForm.reference} onChange={e => setBillForm({ ...billForm, reference: e.target.value })} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg text-sm" placeholder="Invoice #" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-text-secondary mb-1">Bill Date *</label>
                      <input type="date" required value={billForm.date} onChange={e => setBillForm({ ...billForm, date: e.target.value })} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-text-secondary mb-1">Due Date</label>
                      <input type="date" value={billForm.dueDate} onChange={e => setBillForm({ ...billForm, dueDate: e.target.value })} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-secondary mb-1">Status</label>
                    <select value={billForm.status} onChange={e => setBillForm({ ...billForm, status: e.target.value })} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm">
                      <option value="pending">Pending</option>
                      <option value="paid">Paid</option>
                    </select>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={() => setShowBillForm(false)} className="px-3 py-1.5 text-xs text-text-secondary border border-dark-border rounded-lg hover:bg-dark-card-hover">{t("common.cancel")}</button>
                    <button type="submit" disabled={billSaving} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white bg-accent rounded-lg hover:bg-accent-hover disabled:opacity-60">
                      {billSaving && <Loader2 size={12} className="animate-spin" />}
                      {t("common.save")}
                    </button>
                  </div>
                </form>
              )}

              {/* Bills list */}
              {billsLoading ? (
                <div className="flex items-center justify-center h-24"><Loader2 size={20} className="animate-spin text-text-muted" /></div>
              ) : supplierBills.length === 0 ? (
                <p className="text-center text-text-muted text-sm py-8">No bills yet. Add the first bill.</p>
              ) : (
                <div className="space-y-2">
                  {supplierBills.map(bill => (
                    <div key={bill.id} className="flex items-center justify-between bg-dark-bg border border-dark-border rounded-lg px-3 py-2.5 gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-primary truncate">{bill.description}</p>
                        <p className="text-xs text-text-muted">
                          {new Date(bill.date).toLocaleDateString()}
                          {bill.dueDate && <span className="ml-1.5">· due {new Date(bill.dueDate).toLocaleDateString()}</span>}
                          {bill.reference && <span className="ml-1.5">· #{bill.reference}</span>}
                        </p>
                      </div>
                      <div className="text-sm font-semibold text-text-primary shrink-0">{currencySymbol}{fmtAmt(bill.amount)}</div>
                      <button
                        onClick={() => toggleBillStatus(bill)}
                        className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                          bill.status === "paid"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                            : "bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20"
                        }`}
                        title="Click to toggle status"
                      >
                        {bill.status === "paid" ? "Paid" : "Pending"}
                      </button>
                      {canEdit && (
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button onClick={() => openEditBill(bill)} className="text-text-muted hover:text-accent p-1"><Pencil size={13} /></button>
                          <button onClick={() => handleDeleteBill(bill.id)} className="text-text-muted hover:text-danger p-1"><Trash2 size={13} /></button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
    </PermissionGuard>
  );
}
