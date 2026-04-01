"use client";

import { useEffect, useState, useMemo } from "react";
import { Plus, Pencil, Trash2, X, Search, ChevronUp, ChevronDown, Loader2, Receipt, CheckCircle2, Clock } from "lucide-react";
import { TablePageSkeleton } from "@/components/skeletons/TablePageSkeleton";
import { PermissionGuard, usePermissions } from "@/components/PermissionGuard";
import { PhoneInput } from "@/components/PhoneInput";
import { useOrgSettings, useOrgTimezone, currencySymbol as getCurrencySymbol } from "@/components/OrgSettingsProvider";
import { useTranslation } from "@/components/LanguageProvider";
import { todayInTz } from "@/lib/tz";

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

interface BillPayment {
  id: string;
  amount: number;
  date: string;
  method: string;
  note: string | null;
}

interface SupplierBill {
  id: string;
  supplierId: string;
  amount: number;
  amountPaid: number;
  description: string;
  reference: string | null;
  date: string;
  dueDate: string | null;
  status: "pending" | "partially_paid" | "paid";
  note: string | null;
  supplier?: { id: string; name: string };
  payments?: BillPayment[];
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
  const tz = useOrgTimezone();
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
  const [payingBill, setPayingBill] = useState<SupplierBill | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState("");
  const [payRecording, setPayRecording] = useState(false);
  // Initial payment when creating a bill
  const [showInitBillPayment, setShowInitBillPayment] = useState(false);
  const [initBillPayment, setInitBillPayment] = useState({ amount: "", date: "", method: "cash" });

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
      const data = await res.json();
      if (editing) {
        setSuppliers(prev => prev.map(s => s.id === editing.id ? { ...s, ...data } : s));
      } else {
        setSuppliers(prev => [data, ...prev]);
      }
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t("suppliers.delete_confirm"))) return;
    setDeletingId(id);
    const res = await fetch(`/api/suppliers/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || t("common.error"));
      setDeletingId(null);
      return;
    }
    setDeletingId(null);
    setSuppliers(prev => prev.filter(s => s.id !== id));
  }

  // Bills panel
  async function openBills(supplier: Supplier) {
    setBillsSupplier(supplier);
    setSupplierBills([]);
    setBillsLoading(true);
    setShowBillForm(false);
    const res = await fetch(`/api/supplier-bills?supplierId=${supplier.id}`);
    setSupplierBills(res.ok ? await res.json() : []);
    setBillsLoading(false);
  }

  function openAddBill() {
    setEditingBill(null);
    setBillForm({ ...emptyBill, date: new Date().toISOString().split("T")[0] });
    setShowInitBillPayment(false);
    setInitBillPayment({ amount: "", date: new Date().toISOString().split("T")[0], method: "cash" });
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
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!editingBill && res.ok && showInitBillPayment && parseFloat(initBillPayment.amount) > 0) {
        const bill = await res.json();
        await fetch(`/api/supplier-bills/${bill.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "pay", amount: parseFloat(initBillPayment.amount), date: initBillPayment.date || undefined, method: initBillPayment.method }),
        });
      }
      setShowBillForm(false);
      setShowInitBillPayment(false);
      setInitBillPayment({ amount: "", date: new Date().toISOString().split("T")[0], method: "cash" });
      const refreshed = await fetch(`/api/supplier-bills?supplierId=${billsSupplier!.id}`);
      setSupplierBills(refreshed.ok ? await refreshed.json() : []);
      const allRes = await fetch("/api/supplier-bills");
      setBills(allRes.ok ? await allRes.json() : []);
    } finally {
      setBillSaving(false);
    }
  }


  async function recordPayment(bill: SupplierBill, amount: number) {
    setPayRecording(true);
    const res = await fetch(`/api/supplier-bills/${bill.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pay", amount, date: payDate || undefined }),
    });
    if (res.ok) {
      const updated = await res.json();
      setSupplierBills(prev => prev.map(b => b.id === bill.id ? updated : b));
      setBills(prev => prev.map(b => b.id === bill.id ? updated : b));
    }
    setPayRecording(false);
    setPayingBill(null);
    setPayAmount("");
    setPayDate("");
  }

  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingBillId, setDeletingBillId] = useState<string | null>(null);

  async function deletePaymentRecord(paymentId: string) {
    setDeletingPaymentId(paymentId);
    const res = await fetch(`/api/supplier-bill-payments/${paymentId}`, { method: "DELETE" });
    if (res.ok) {
      const updatedBill = await res.json();
      setSupplierBills(prev => prev.map(b => b.id === updatedBill.id ? updatedBill : b));
      setBills(prev => prev.map(b => b.id === updatedBill.id ? updatedBill : b));
    }
    setDeletingPaymentId(null);
  }

  async function handleDeleteBill(id: string) {
    if (!confirm("Delete this bill?")) return;
    setDeletingBillId(id);
    await fetch(`/api/supplier-bills/${id}`, { method: "DELETE" });
    setDeletingBillId(null);
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
  const totalPaid = bills.reduce((s, b) => s + (b.amountPaid ?? 0), 0);
  const totalPending = bills.filter(b => b.status !== "paid").reduce((s, b) => s + (b.amount - (b.amountPaid ?? 0)), 0);

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
          <div className="flex items-center gap-1.5 text-text-muted text-xs mb-1"><CheckCircle2 size={13} /> Amount Paid</div>
          <div className="text-lg sm:text-2xl font-bold text-emerald-400">{currencySymbol}{fmtCompact(totalPaid)}</div>
          <div className="text-[10px] text-text-muted mt-0.5">{bills.filter(b => b.status === "paid").length} fully · {bills.filter(b => b.status === "partially_paid").length} partial</div>
        </div>
        <div className="bg-dark-card border border-dark-border rounded-xl p-3 sm:p-4">
          <div className="flex items-center gap-1.5 text-text-muted text-xs mb-1"><Clock size={13} /> Remaining</div>
          <div className="text-lg sm:text-2xl font-bold text-amber-400">{currencySymbol}{fmtCompact(totalPending)}</div>
          <div className="text-[10px] text-text-muted mt-0.5">{bills.filter(b => b.status !== "paid").length} unpaid bill{bills.filter(b => b.status !== "paid").length !== 1 ? "s" : ""}</div>
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
                      <button onClick={() => handleDelete(supplier.id)} disabled={deletingId === supplier.id} className="text-text-muted hover:text-danger p-1 ml-1 disabled:opacity-40">
                        {deletingId === supplier.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                      </button>
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
          <div className="bg-dark-card border border-dark-border rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between p-6 sm:p-8 border-b border-dark-border shrink-0">
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-text-primary">{billsSupplier.name}</h2>
                <p className="text-sm text-text-muted mt-1">Bills & Payment History</p>
                {billsLoading ? (
                  <div className="flex gap-6 mt-4">
                    <div className="bg-dark-bg/50 rounded-lg px-4 py-3 border border-dark-border">
                      <p className="text-xs text-text-muted mb-1">Amount Paid</p>
                      <div className="h-7 w-24 bg-dark-border/50 rounded animate-pulse mt-1" />
                    </div>
                    <div className="bg-dark-bg/50 rounded-lg px-4 py-3 border border-dark-border">
                      <p className="text-xs text-text-muted mb-1">Remaining Due</p>
                      <div className="h-7 w-24 bg-dark-border/50 rounded animate-pulse mt-1" />
                    </div>
                  </div>
                ) : (() => {
                  const paid = supplierBills.reduce((s, b) => s + (b.amountPaid ?? (b.status === "paid" ? b.amount : 0)), 0);
                  const pending = supplierBills.reduce((s, b) => s + (b.amount - (b.amountPaid ?? (b.status === "paid" ? b.amount : 0))), 0);
                  return (
                    <div className="flex gap-6 mt-4">
                      <div className="bg-dark-bg/50 rounded-lg px-4 py-3 border border-dark-border">
                        <p className="text-xs text-text-muted mb-1">Amount Paid</p>
                        <p className="text-xl font-bold text-emerald-400">{currencySymbol}{fmtAmt(paid)}</p>
                      </div>
                      {pending > 0 && (
                        <div className="bg-dark-bg/50 rounded-lg px-4 py-3 border border-dark-border">
                          <p className="text-xs text-text-muted mb-1">Remaining Due</p>
                          <p className="text-xl font-bold text-amber-400">{currencySymbol}{fmtAmt(pending)}</p>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                {canEdit && !showBillForm && (
                  <button onClick={openAddBill} className="flex items-center gap-1.5 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover text-sm font-medium whitespace-nowrap">
                    <Plus size={16} /> Add Bill
                  </button>
                )}
                <button onClick={() => { setBillsSupplier(null); setShowBillForm(false); }} className="text-text-muted hover:text-text-primary p-1"><X size={24} /></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 sm:p-8">
              {/* Add/Edit bill form */}
              {showBillForm && (
                <form onSubmit={handleBillSubmit} className="bg-dark-bg border border-dark-border rounded-xl p-6 mb-6 space-y-4">
                  <h3 className="text-lg font-semibold text-text-primary">{editingBill ? "Edit Bill" : "New Bill"}</h3>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">{t("field.description")} *</label>
                    <input required value={billForm.description} onChange={e => setBillForm({ ...billForm, description: e.target.value })} className="w-full px-4 py-2.5 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg text-sm focus:ring-2 focus:ring-accent focus:border-accent" placeholder="e.g. Office supplies invoice" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-2">Amount *</label>
                      <input type="number" step="0.01" min="0.01" required value={billForm.amount} onChange={e => setBillForm({ ...billForm, amount: e.target.value })} className="w-full px-4 py-2.5 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm focus:ring-2 focus:ring-accent focus:border-accent" placeholder="0.00" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-2">Reference</label>
                      <input value={billForm.reference} onChange={e => setBillForm({ ...billForm, reference: e.target.value })} className="w-full px-4 py-2.5 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg text-sm focus:ring-2 focus:ring-accent focus:border-accent" placeholder="Invoice #" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-2">Bill Date *</label>
                      <input type="date" required value={billForm.date} onChange={e => setBillForm({ ...billForm, date: e.target.value })} className="w-full px-4 py-2.5 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm focus:ring-2 focus:ring-accent focus:border-accent" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-2">Due Date</label>
                      <input type="date" value={billForm.dueDate} onChange={e => setBillForm({ ...billForm, dueDate: e.target.value })} className="w-full px-4 py-2.5 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm focus:ring-2 focus:ring-accent focus:border-accent" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">Status</label>
                    <select value={billForm.status} onChange={e => setBillForm({ ...billForm, status: e.target.value })} className="w-full px-4 py-2.5 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm focus:ring-2 focus:ring-accent focus:border-accent">
                      <option value="pending">Pending</option>
                      <option value="paid">Paid</option>
                    </select>
                  </div>
                  {/* Initial Payment (create only) */}
                  {!editingBill && (
                    <div className="border border-dark-border rounded-lg overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setShowInitBillPayment(!showInitBillPayment)}
                        className="w-full flex items-center justify-between px-4 py-3 bg-dark-input/30 hover:bg-dark-card-hover text-sm font-medium text-text-primary"
                      >
                        <span className="flex items-center gap-2">
                          <CheckCircle2 size={15} className="text-emerald-400" />
                          Record Payment Now
                          {showInitBillPayment && parseFloat(initBillPayment.amount) > 0 && (
                            <span className="text-xs text-green-400 font-semibold ml-1">{currencySymbol}{initBillPayment.amount}</span>
                          )}
                        </span>
                        <ChevronDown size={15} className={`text-text-muted transition-transform ${showInitBillPayment ? "rotate-180" : ""}`} />
                      </button>
                      {showInitBillPayment && (
                        <div className="p-4 border-t border-dark-border space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-text-secondary mb-1">Amount</label>
                              <input
                                type="number" min="0.01" step="0.01"
                                value={initBillPayment.amount}
                                onChange={e => setInitBillPayment({ ...initBillPayment, amount: e.target.value })}
                                className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm focus:ring-accent focus:border-accent"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-text-secondary mb-1">Payment Date</label>
                              <input type="date" value={initBillPayment.date} onChange={e => setInitBillPayment({ ...initBillPayment, date: e.target.value })} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm focus:ring-accent focus:border-accent" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-text-secondary mb-1">Method</label>
                              <select value={initBillPayment.method} onChange={e => setInitBillPayment({ ...initBillPayment, method: e.target.value })} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm focus:ring-accent focus:border-accent">
                                {["cash", "bank_transfer", "check", "card"].map(m => (
                                  <option key={m} value={m}>{t(`payments.method.${m}` as Parameters<typeof t>[0])}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex gap-3 justify-end pt-4">
                    <button type="button" onClick={() => setShowBillForm(false)} className="px-5 py-2 text-sm font-medium text-text-secondary bg-dark-bg border border-dark-border rounded-lg hover:bg-dark-card-hover transition-colors">{t("common.cancel")}</button>
                    <button type="submit" disabled={billSaving} className="flex items-center gap-1.5 px-5 py-2 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent-hover disabled:opacity-60 transition-colors">
                      {billSaving && <Loader2 size={14} className="animate-spin" />}
                      {t("common.save")}
                    </button>
                  </div>
                </form>
              )}

              {/* Bills list */}
              {billsLoading ? (
                <div className="flex items-center justify-center h-40"><Loader2 size={28} className="animate-spin text-text-muted" /></div>
              ) : supplierBills.length === 0 ? (
                <p className="text-center text-text-muted text-base py-16">No bills yet. Add the first bill.</p>
              ) : (
                <div className="space-y-4">
                  {supplierBills.map(bill => {
                    const remaining = bill.amount - (bill.amountPaid ?? 0);
                    const paidPct = bill.amount > 0 ? Math.min(100, ((bill.amountPaid ?? 0) / bill.amount) * 100) : 0;
                    return (
                      <div key={bill.id} className="bg-dark-bg border border-dark-border rounded-lg px-5 py-4">
                        {/* Payment inline form */}
                        {payingBill?.id === bill.id && (
                          <div className="mb-4 p-4 bg-dark-input/30 rounded-lg border border-dark-border flex flex-col sm:flex-row flex-wrap items-center gap-3">
                            <div className="flex-1 min-w-[120px]">
                              <label className="block text-xs font-medium text-text-muted mb-1">Payment Date</label>
                              <input
                                type="date"
                                value={payDate}
                                onChange={e => setPayDate(e.target.value)}
                                className="w-full px-3 py-2.5 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm focus:ring-2 focus:ring-accent focus:border-accent"
                              />
                            </div>
                            <div className="flex-1 min-w-[120px]">
                              <label className="block text-xs font-medium text-text-muted mb-1">Amount</label>
                              <input
                                type="number" step="0.01" min="0.01" max={remaining}
                                value={payAmount}
                                onChange={e => setPayAmount(e.target.value)}
                                placeholder={`Max ${fmtAmt(remaining)}`}
                                className="w-full px-3 py-2.5 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm focus:ring-2 focus:ring-accent focus:border-accent"
                                autoFocus
                              />
                            </div>
                            <div className="flex gap-2 items-end">
                              <button
                                onClick={() => { const a = parseFloat(payAmount); if (a > 0) recordPayment(bill, a); }}
                                disabled={payRecording || !payAmount || parseFloat(payAmount) <= 0 || parseFloat(payAmount) > remaining + 0.01}
                                className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent-hover disabled:opacity-40 transition-colors"
                              >
                                {payRecording ? <Loader2 size={14} className="animate-spin" /> : null}
                                Record Payment
                              </button>
                              <button onClick={() => { setPayingBill(null); setPayAmount(""); setPayDate(""); }} className="text-text-muted hover:text-text-primary text-sm font-medium px-4 py-2.5">Cancel</button>
                            </div>
                          </div>
                        )}
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <p className="text-base font-semibold text-text-primary">{bill.description}</p>
                                <div className="flex flex-wrap gap-3 mt-2 text-sm text-text-muted">
                                  <span className="flex items-center gap-1">
                                    📅 {new Date(bill.date).toLocaleDateString("en-GB")}
                                  </span>
                                  {bill.dueDate && (
                                    <span className="flex items-center gap-1">
                                      ⏰ Due {new Date(bill.dueDate).toLocaleDateString("en-GB")}
                                    </span>
                                  )}
                                  {bill.reference && (
                                    <span className="flex items-center gap-1">
                                      🏷️ {bill.reference}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-2xl font-bold text-text-primary">{currencySymbol}{fmtAmt(bill.amount)}</p>
                              </div>
                            </div>

                            {(bill.status === "partially_paid" || bill.status === "paid") && (
                              <div className="mt-4 pt-4 border-t border-dark-border">
                                <div className="flex justify-between items-center mb-2">
                                  <div>
                                    <span className="text-sm text-text-muted">Progress: </span>
                                    <span className="text-sm font-semibold text-emerald-400">{currencySymbol}{fmtAmt(bill.amountPaid ?? 0)} paid</span>
                                    {remaining > 0 && <span className="text-sm text-text-muted ml-2">({paidPct.toFixed(1)}%)</span>}
                                  </div>
                                  {remaining > 0 && <span className="text-sm font-semibold text-amber-400">{currencySymbol}{fmtAmt(remaining)} remaining</span>}
                                </div>
                                <div className="h-2 bg-dark-input rounded-full overflow-hidden">
                                  <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${paidPct}%` }} />
                                </div>
                                {bill.payments && bill.payments.length > 0 && (
                                  <div className="mt-3 space-y-1.5">
                                    <p className="text-xs font-semibold text-text-secondary uppercase">Payment Records:</p>
                                    {bill.payments.map(p => (
                                      <div key={p.id} className="flex items-center justify-between text-sm bg-dark-input/30 rounded-lg px-3 py-2">
                                        <span className="text-text-muted">{new Date(p.date).toLocaleDateString("en-GB")} · {p.method}</span>
                                        <div className="flex items-center gap-2">
                                          <span className="text-emerald-400 font-semibold">{currencySymbol}{fmtAmt(p.amount)}</span>
                                          {canEdit && (
                                            <button
                                              onClick={() => deletePaymentRecord(p.id)}
                                              disabled={deletingPaymentId === p.id}
                                              className="text-text-muted hover:text-danger p-1 disabled:opacity-40 transition-colors"
                                              title="Delete payment"
                                            >
                                              {deletingPaymentId === p.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Bill footer with status and actions */}
                        <div className="mt-4 pt-4 border-t border-dark-border flex items-center justify-between">
                          <span className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${
                            bill.status === "paid" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                            bill.status === "partially_paid" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                            "bg-slate-500/10 text-slate-400 border-dark-border"
                          }`}>
                            {bill.status === "paid" ? "✓ Paid" : bill.status === "partially_paid" ? "◐ Partially Paid" : "⏳ Pending"}
                          </span>
                          {canEdit && (
                            <div className="flex items-center gap-2">
                              {bill.status !== "paid" && (
                                <button
                                  onClick={() => { setPayingBill(bill); setPayAmount(""); setPayDate(todayInTz(tz)); setShowBillForm(false); }}
                                  title="Record payment"
                                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition-colors border border-emerald-400/20"
                                ><CheckCircle2 size={16} /> Record Payment</button>
                              )}
                              <button onClick={() => openEditBill(bill)} className="p-2 text-text-muted hover:text-accent hover:bg-dark-input rounded-lg transition-colors" title="Edit bill"><Pencil size={18} /></button>
                              <button
                                onClick={() => handleDeleteBill(bill.id)}
                                disabled={deletingBillId === bill.id}
                                className="p-2 text-text-muted hover:text-danger hover:bg-dark-input rounded-lg transition-colors disabled:opacity-40"
                                title="Delete bill"
                              >
                                {deletingBillId === bill.id ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
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
