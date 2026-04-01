"use client";

import { useEffect, useState, useMemo } from "react";
import { Plus, Pencil, Trash2, X, Search, ChevronUp, ChevronDown, Loader2, Eye } from "lucide-react";
import { TablePageSkeleton } from "@/components/skeletons/TablePageSkeleton";
import { PermissionGuard, usePermissions } from "@/components/PermissionGuard";
import { PhoneInput } from "@/components/PhoneInput";
import { useOrgSettings } from "@/components/OrgSettingsProvider";
import { useTranslation } from "@/components/LanguageProvider";

interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  taxId: string | null;
  notes: string | null;
  balance: number;
  _count?: { invoices: number };
  totalInvoiced: number;
  totalPaid: number;
  totalPending: number;
}

interface ClientPaymentRecord {
  id: string;
  amount: number;
  applied: number;
  date: string;
  method: string;
  reference: string | null;
  note: string | null;
  invoices: { invoiceId: string; invoiceNumber: string; amount: number; newStatus: string }[];
  createdAt: string;
}

interface ClientDetail extends Client {
  invoices: ClientInvoice[];
  invoiceCount: number;
  paymentHistory: ClientPaymentRecord[];
}

interface ClientInvoice {
  id: string;
  number: string;
  date: string;
  dueDate: string | null;
  status: string;
  total: number;
  paid: number;
  pending: number;
}

type SortField = "name" | "email" | "city" | "invoices" | "totalInvoiced" | "totalPaid" | "totalPending" | "";
type SortDir = "asc" | "desc";

const emptyClient = { name: "", email: "", phone: "", address: "", city: "", country: "", notes: "" };
const PAYMENT_METHODS = ["cash", "bank_transfer", "check", "card"];

export default function ClientsPage() {
  const { canEditFeature } = usePermissions();
  const canEdit = canEditFeature("clients");
  const { orgSettings } = useOrgSettings();
  const t = useTranslation();
  const currency = orgSettings.defaultCurrency || "USD";

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState(emptyClient);
  const [formError, setFormError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [sortField, setSortField] = useState<SortField>("");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  // Detail modal state
  const [detailClient, setDetailClient] = useState<ClientDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailFromDate, setDetailFromDate] = useState("");
  const [detailToDate, setDetailToDate] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentResult, setPaymentResult] = useState<{ applied: number; remaining: number; payments: any[] } | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  useEffect(() => { loadClients(); }, []);
  useEffect(() => { setPage(1); }, [search, filterCity, sortField, sortDir]);

  async function loadClients() {
    setLoading(true);
    const res = await fetch("/api/clients");
    const data = await res.json();
    setClients(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  async function openDetailModal(client: Client) {
    // Show modal immediately with skeleton, then load full data
    setDetailClient({ ...client, invoices: [], invoiceCount: 0, paymentHistory: [] });
    setDetailLoading(true);
    setDetailFromDate("");
    setDetailToDate("");
    setPaymentAmount("");
    setPaymentDate(new Date().toISOString().split("T")[0]);
    setPaymentMethod("cash");
    setPaymentReference("");
    setPaymentNote("");
    setPaymentResult(null);
    setPaymentError(null);
    setShowPaymentForm(false);

    const res = await fetch(`/api/clients/${client.id}`);
    const data = await res.json();
    setDetailClient(data);
    setDetailLoading(false);
  }

  async function reloadDetailClient() {
    if (!detailClient) return;
    const params = new URLSearchParams();
    if (detailFromDate) params.set("from", detailFromDate);
    if (detailToDate) params.set("to", detailToDate);
    setDetailLoading(true);
    const res = await fetch(`/api/clients/${detailClient.id}?${params.toString()}`);
    const data = await res.json();
    setDetailClient(data);
    setDetailLoading(false);
  }

  function closeDetailModal() {
    setDetailClient(null);
  }

  function openCreate() {
    setForm(emptyClient);
    setEditing(null);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(client: Client) {
    setFormError(null);
    setForm({
      name: client.name,
      email: client.email || "",
      phone: client.phone || "",
      address: client.address || "",
      city: client.city || "",
      country: client.country || "",
      notes: client.notes || "",
    });
    setEditing(client);
    setShowForm(true);
  }

  function patchClient(updated: Partial<Client> & { id: string }) {
    setClients(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c));
    if (detailClient?.id === updated.id) setDetailClient(d => d ? { ...d, ...updated } : d);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      const url = editing ? `/api/clients/${editing.id}` : "/api/clients";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) {
        const data = await res.json();
        setFormError(data.error || t("common.error"));
        return;
      }
      const data = await res.json();
      if (editing) {
        patchClient({ id: editing.id, ...form });
      } else {
        setClients(prev => [{ ...data, balance: 0, totalInvoiced: 0, totalPaid: 0, totalPending: 0, _count: { invoices: 0 } }, ...prev]);
      }
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t("clients.delete_confirm"))) return;
    const res = await fetch(`/api/clients/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      alert(data.error || t("common.error"));
      return;
    }
    setClients(prev => prev.filter(c => c.id !== id));
    if (detailClient?.id === id) setDetailClient(null);
  }

  async function handleBulkPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!detailClient) return;
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) return;
    setPaymentLoading(true);
    setPaymentError(null);
    setPaymentResult(null);
    try {
      const res = await fetch(`/api/clients/${detailClient.id}/bulk-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, date: paymentDate, method: paymentMethod, reference: paymentReference || null, note: paymentNote || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPaymentError(data.error || t("common.error"));
        return;
      }
      setPaymentResult(data);
      // Patch client totals in place without full reload
      const applied = data.applied as number;
      const addedToBalance = data.addedToBalance as number || 0;
      const patch: Partial<Client> & { id: string } = { id: detailClient.id };
      if (applied > 0) {
        patch.totalPaid = parseFloat((detailClient.totalPaid + applied).toFixed(2));
        patch.totalPending = parseFloat((detailClient.totalPending - applied).toFixed(2));
      }
      if (addedToBalance > 0) {
        patch.balance = parseFloat(((detailClient.balance || 0) + addedToBalance).toFixed(2));
      }
      patchClient(patch);
      // Reload only the detail modal invoices list (scoped fetch, no full page reload)
      reloadDetailClient();
      setPaymentAmount("");
    } finally {
      setPaymentLoading(false);
    }
  }

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  }

  const cities = useMemo(() => [...new Set(clients.map(c => c.city).filter(Boolean))] as string[], [clients]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return clients
      .filter(c =>
        (!q || c.name.toLowerCase().includes(q) || (c.email || "").toLowerCase().includes(q) || (c.city || "").toLowerCase().includes(q) || (c.phone || "").includes(q)) &&
        (!filterCity || c.city === filterCity)
      )
      .sort((a, b) => {
        if (!sortField) return 0;
        let va: string | number = "";
        let vb: string | number = "";
        if (sortField === "name") { va = a.name.toLowerCase(); vb = b.name.toLowerCase(); }
        else if (sortField === "email") { va = (a.email || "").toLowerCase(); vb = (b.email || "").toLowerCase(); }
        else if (sortField === "city") { va = (a.city || "").toLowerCase(); vb = (b.city || "").toLowerCase(); }
        else if (sortField === "invoices") { va = a._count?.invoices || 0; vb = b._count?.invoices || 0; }
        else if (sortField === "totalInvoiced") { va = a.totalInvoiced; vb = b.totalInvoiced; }
        else if (sortField === "totalPaid") { va = a.totalPaid; vb = b.totalPaid; }
        else if (sortField === "totalPending") { va = a.totalPending; vb = b.totalPending; }
        if (va < vb) return sortDir === "asc" ? -1 : 1;
        if (va > vb) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
  }, [clients, search, filterCity, sortField, sortDir]);

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ChevronUp size={12} className="opacity-30" />;
    return sortDir === "asc" ? <ChevronUp size={12} className="text-accent" /> : <ChevronDown size={12} className="text-accent" />;
  }

  function fmt(n: number) {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  }

  async function exportDetailPDF() {
    if (!detailClient) return;
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ orientation: "landscape" });

    // Header
    doc.setFontSize(14);
    doc.text(`${detailClient.name} - ${t("clients.title")}`, 14, 16);
    doc.setFontSize(9);
    doc.setTextColor(120);
    const period = detailFromDate || detailToDate ? `${detailFromDate || ""} – ${detailToDate || ""}` : `${t("common.all")}`;
    doc.text(`${t("field.date")}: ${period}`, 14, 23);
    doc.setTextColor(0);

    // Summary stats
    doc.setFontSize(10);
    doc.text(`${t("clients.invoices")}: ${detailClient.invoiceCount}`, 14, 30);
    doc.text(`${t("clients.total_invoiced")}: ${fmt(detailClient.totalInvoiced)}`, 80, 30);
    doc.text(`${t("clients.total_paid")}: ${fmt(detailClient.totalPaid)}`, 160, 30);
    doc.text(`${t("clients.total_pending")}: ${fmt(detailClient.totalPending)}`, 220, 30);
    if (detailClient.balance > 0) {
      doc.setTextColor(0, 100, 200);
      doc.text(`${t("clients.balance")}: ${fmt(detailClient.balance)}`, 14, 36);
      doc.setTextColor(0);
    }

    // Invoices table
    autoTable(doc, {
      startY: detailClient.balance > 0 ? 42 : 36,
      head: [[
        t("field.number"),
        t("field.date"),
        t("field.due_date"),
        t("field.status"),
        t("field.total"),
        t("clients.total_paid"),
        t("clients.total_pending"),
      ]],
      body: detailClient.invoices.map(inv => [
        inv.number,
        new Date(inv.date).toLocaleDateString("en-GB"),
        inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("en-GB") : "-",
        inv.status,
        fmt(inv.total),
        fmt(inv.paid),
        fmt(inv.pending),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 30, 50] },
    });

    // Payment History table
    if (detailClient.paymentHistory && detailClient.paymentHistory.length > 0) {
      const lastY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? 36;
      doc.setFontSize(11);
      doc.text(t("clients.payment_history"), 14, lastY + 10);

      autoTable(doc, {
        startY: lastY + 14,
        head: [[
          t("field.date"),
          t("field.amount"),
          t("clients.bulk_payment.method"),
          t("clients.payment_history.applied_to"),
          t("clients.bulk_payment.reference"),
        ]],
        body: detailClient.paymentHistory.map(p => [
          new Date(p.date).toLocaleDateString("en-GB"),
          fmt(p.applied),
          p.method,
          p.invoices.map(inv => `#${inv.invoiceNumber} (${fmt(inv.amount)})`).join(", "),
          p.reference || p.note || "-",
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [30, 80, 50] },
      });
    }

    doc.save(`${detailClient.name}-invoices.pdf`);
  }

  if (loading) return <TablePageSkeleton rows={8} hasFilters cols={8} />;

  return (
    <PermissionGuard feature="clients">
    <div>
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-text-primary">{t("clients.title")}</h1>
        {canEdit && (
          <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover text-sm font-medium">
            <Plus size={16} /> {t("clients.add")}
          </button>
        )}
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col gap-2 mb-4">
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t("common.search")}
              className="w-full pl-9 pr-3 py-2 bg-dark-card border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg text-sm focus:ring-accent focus:border-accent"
            />
          </div>
          {cities.length > 0 && (
            <select value={filterCity} onChange={e => setFilterCity(e.target.value)} className="px-3 py-2 bg-dark-card border border-dark-border text-text-primary rounded-lg text-sm focus:ring-accent focus:border-accent w-auto min-w-[140px]">
              <option value="">{t("common.all_cities")}</option>
              {cities.map(city => <option key={city} value={city}>{city}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-dark-card border border-dark-border rounded-2xl p-4 sm:p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-text-primary">{editing ? t("clients.edit") : t("clients.add")}</h2>
              <button onClick={() => setShowForm(false)} className="text-text-muted hover:text-text-primary"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">{t("field.name")} *</label>
                <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg focus:ring-accent focus:border-accent" />
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
                  {editing ? t("common.save") : t("clients.add")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailClient && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-dark-card border border-dark-border rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-dark-border">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">{detailClient.name}</h2>
                <p className="text-xs text-text-muted mt-1">{detailClient.email} • {detailClient.phone}</p>
              </div>
              <button onClick={closeDetailModal} className="text-text-muted hover:text-text-primary"><X size={24} /></button>
            </div>

            {/* Content */}
            <div className="overflow-y-auto flex-1 p-4 sm:p-6 space-y-4">
              {/* Date Range Filter */}
              <div className="flex gap-2 items-end flex-wrap">
                <div className="flex-1 min-w-[140px]">
                  <label className="block text-xs font-medium text-text-secondary mb-1">{t("reports.from")}</label>
                  <input type="date" value={detailFromDate} onChange={e => setDetailFromDate(e.target.value)} className="w-full px-2 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm focus:ring-accent focus:border-accent" />
                </div>
                <div className="flex-1 min-w-[140px]">
                  <label className="block text-xs font-medium text-text-secondary mb-1">{t("reports.to")}</label>
                  <input type="date" value={detailToDate} onChange={e => setDetailToDate(e.target.value)} className="w-full px-2 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm focus:ring-accent focus:border-accent" />
                </div>
                <button onClick={reloadDetailClient} disabled={detailLoading} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-60">
                  {detailLoading ? <Loader2 size={14} className="animate-spin inline" /> : t("common.apply")}
                </button>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <div className="bg-dark-bg rounded-lg p-3">
                  <div className="text-xs text-text-muted">{t("clients.invoices")}</div>
                  <div className="text-lg font-semibold text-text-primary mt-1">{detailClient.invoiceCount}</div>
                </div>
                <div className="bg-dark-bg rounded-lg p-3">
                  <div className="text-xs text-text-muted">{t("clients.total_invoiced")}</div>
                  <div className="text-lg font-semibold text-text-primary mt-1">{fmt(detailClient.totalInvoiced)}</div>
                </div>
                <div className="bg-dark-bg rounded-lg p-3">
                  <div className="text-xs text-text-muted">{t("clients.total_paid")}</div>
                  <div className="text-lg font-semibold text-green-400 mt-1">{fmt(detailClient.totalPaid)}</div>
                </div>
                <div className="bg-dark-bg rounded-lg p-3">
                  <div className="text-xs text-text-muted">{t("clients.total_pending")}</div>
                  <div className={`text-lg font-semibold mt-1 ${detailClient.totalPending > 0 ? "text-amber-400" : "text-text-muted"}`}>{fmt(detailClient.totalPending)}</div>
                </div>
                <div className="bg-dark-bg rounded-lg p-3">
                  <div className="text-xs text-text-muted">{t("clients.balance")}</div>
                  <div className={`text-lg font-semibold mt-1 ${detailClient.balance > 0 ? "text-blue-400" : "text-text-muted"}`}>{fmt(detailClient.balance)}</div>
                </div>
              </div>


              {/* Payment Result */}
              {paymentResult && (
                <div className="bg-green-400/10 border border-green-400/20 rounded-lg p-4">
                  <p className="text-sm font-semibold text-green-400 mb-3">{t("clients.bulk_payment.success")}</p>
                  {paymentResult.payments.filter(p => p.newStatus === "paid").length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs font-medium text-text-muted mb-1">{t("clients.bulk_payment.invoices_closed")}</p>
                      <div className="space-y-1">
                        {paymentResult.payments.filter(p => p.newStatus === "paid").map(p => (
                          <div key={p.invoiceId} className="flex justify-between text-xs bg-green-400/10 border border-green-400/20 rounded px-2 py-1">
                            <span className="text-text-secondary">#{p.invoiceNumber}</span>
                            <span className="text-green-400 font-medium">{fmt(p.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {paymentResult.payments.filter(p => p.newStatus === "partially_paid").length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs font-medium text-text-muted mb-1">{t("clients.bulk_payment.partial_invoice")}</p>
                      <div className="space-y-1">
                        {paymentResult.payments.filter(p => p.newStatus === "partially_paid").map(p => (
                          <div key={p.invoiceId} className="flex justify-between text-xs bg-amber-400/10 border border-amber-400/20 rounded px-2 py-1">
                            <span className="text-text-secondary">#{p.invoiceNumber}</span>
                            <span className="text-amber-400 font-medium">{fmt(p.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {paymentResult.remaining > 0 && (
                    <p className="text-xs text-blue-400 mt-2">
                      {t("clients.balance.added", { amount: fmt(paymentResult.remaining) })}
                    </p>
                  )}
                  <button onClick={() => setPaymentResult(null)} className="mt-3 w-full px-3 py-2 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent-hover">
                    {t("common.close")}
                  </button>
                </div>
              )}

              {/* Invoices Table */}
              {detailLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 size={20} className="animate-spin text-accent" />
                </div>
              ) : detailClient.invoices.length === 0 ? (
                <p className="text-sm text-text-muted text-center py-6">{t("clients.bulk_payment.no_pending")}</p>
              ) : (
                <div className="overflow-x-auto border border-dark-border rounded-lg">
                  <table className="w-full min-w-[600px]">
                    <thead className="bg-dark-bg/50">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs font-medium text-text-muted uppercase">{t("field.number")}</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-text-muted uppercase">{t("field.date")}</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-text-muted uppercase">{t("field.due_date")}</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-text-muted uppercase">{t("field.status")}</th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-text-muted uppercase">{t("field.total")}</th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-text-muted uppercase">{t("clients.total_paid")}</th>
                        <th className="text-right px-3 py-2 text-xs font-medium text-text-muted uppercase">{t("clients.total_pending")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-dark-border/50">
                      {detailClient.invoices.map(inv => (
                        <tr key={inv.id} className="hover:bg-dark-card-hover">
                          <td className="px-3 py-2 text-sm font-medium text-text-primary">{inv.number}</td>
                          <td className="px-3 py-2 text-sm text-text-secondary">{new Date(inv.date).toLocaleDateString("en-GB")}</td>
                          <td className="px-3 py-2 text-sm text-text-secondary">{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString("en-GB") : "-"}</td>
                          <td className="px-3 py-2 text-sm"><span className={`px-2 py-1 rounded text-xs font-medium ${inv.status === "paid" ? "bg-green-400/10 text-green-400" : inv.status === "partially_paid" ? "bg-amber-400/10 text-amber-400" : "bg-blue-400/10 text-blue-400"}`}>{inv.status}</span></td>
                          <td className="px-3 py-2 text-sm text-right text-text-secondary">{fmt(inv.total)}</td>
                          <td className="px-3 py-2 text-sm text-right text-green-400 font-medium">{fmt(inv.paid)}</td>
                          <td className="px-3 py-2 text-sm text-right font-medium" style={{ color: inv.pending > 0 ? "var(--color-amber-400)" : "var(--color-text-muted)" }}>{fmt(inv.pending)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Payment History */}
              {detailClient.paymentHistory && detailClient.paymentHistory.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-text-primary mb-2">{t("clients.payment_history")}</h3>
                  <div className="overflow-x-auto border border-dark-border rounded-lg">
                    <table className="w-full min-w-[500px]">
                      <thead className="bg-dark-bg/50">
                        <tr>
                          <th className="text-left px-3 py-2 text-xs font-medium text-text-muted uppercase">{t("field.date")}</th>
                          <th className="text-right px-3 py-2 text-xs font-medium text-text-muted uppercase">{t("field.amount")}</th>
                          <th className="text-right px-3 py-2 text-xs font-medium text-text-muted uppercase">{t("clients.bulk_payment.method")}</th>
                          <th className="text-left px-3 py-2 text-xs font-medium text-text-muted uppercase">{t("clients.payment_history.applied_to")}</th>
                          <th className="text-left px-3 py-2 text-xs font-medium text-text-muted uppercase">{t("clients.bulk_payment.note")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-dark-border/50">
                        {detailClient.paymentHistory.map(p => (
                          <tr key={p.id} className="hover:bg-dark-card-hover">
                            <td className="px-3 py-2 text-sm text-text-secondary">{new Date(p.date).toLocaleDateString("en-GB")}</td>
                            <td className="px-3 py-2 text-sm text-right text-green-400 font-medium">{fmt(p.applied)}</td>
                            <td className="px-3 py-2 text-sm text-right text-text-secondary">{t(`payments.method.${p.method}` as Parameters<typeof t>[0])}</td>
                            <td className="px-3 py-2 text-sm text-text-secondary">
                              {p.invoices.map(inv => (
                                <span key={inv.invoiceId} className="inline-block mr-1.5 mb-0.5 px-1.5 py-0.5 rounded text-xs bg-dark-bg border border-dark-border">
                                  #{inv.invoiceNumber} <span className="text-green-400">{fmt(inv.amount)}</span>
                                </span>
                              ))}
                            </td>
                            <td className="px-3 py-2 text-sm text-text-muted max-w-[150px] truncate">{p.reference || p.note || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Collapsable Record Payment Form */}
              {detailClient.totalPending > 0 && (
                <div className="bg-dark-bg border border-dark-border/50 rounded-lg">
                  <button
                    onClick={() => setShowPaymentForm(!showPaymentForm)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-dark-card-hover"
                  >
                    <h3 className="text-sm font-semibold text-text-primary">{t("clients.bulk_payment.title")}</h3>
                    <ChevronDown size={16} className={`text-text-muted transition-transform ${showPaymentForm ? "rotate-180" : ""}`} />
                  </button>

                  {showPaymentForm && (
                    <div className="border-t border-dark-border/50 p-4 space-y-3">
                      {!paymentResult ? (
                        <form onSubmit={handleBulkPayment} className="space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-text-secondary mb-1">{t("clients.bulk_payment.amount")} *</label>
                              <input
                                required
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={paymentAmount}
                                onChange={e => setPaymentAmount(e.target.value)}
                                className="w-full px-2 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm focus:ring-accent focus:border-accent"
                              />
                              {(() => {
                                const amt = parseFloat(paymentAmount);
                                if (!amt || amt <= 0) return null;
                                const excess = parseFloat((amt - detailClient.totalPending).toFixed(2));
                                if (excess > 0) {
                                  return (
                                    <p className="text-xs text-blue-400 mt-1">
                                      {t("clients.balance.excess_info", { amount: fmt(excess) })}
                                    </p>
                                  );
                                }
                                return null;
                              })()}
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-text-secondary mb-1">{t("field.date")}</label>
                              <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} className="w-full px-2 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm focus:ring-accent focus:border-accent" />
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-text-secondary mb-1">{t("clients.bulk_payment.method")}</label>
                              <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="w-full px-2 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm focus:ring-accent focus:border-accent">
                                {PAYMENT_METHODS.map(m => (
                                  <option key={m} value={m}>{t(`payments.method.${m}` as Parameters<typeof t>[0])}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-text-secondary mb-1">{t("clients.bulk_payment.reference")}</label>
                              <input value={paymentReference} onChange={e => setPaymentReference(e.target.value)} className="w-full px-2 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm focus:ring-accent focus:border-accent" />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-text-secondary mb-1">{t("clients.bulk_payment.note")}</label>
                            <textarea value={paymentNote} onChange={e => setPaymentNote(e.target.value)} rows={2} className="w-full px-2 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm focus:ring-accent focus:border-accent" />
                          </div>
                          {paymentError && (
                            <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">{paymentError}</p>
                          )}
                          <button type="submit" disabled={paymentLoading} className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent-hover disabled:opacity-60">
                            {paymentLoading && <Loader2 size={14} className="animate-spin" />}
                            {t("common.confirm")}
                          </button>
                        </form>
                      ) : (
                        <div>
                          <p className="text-sm font-semibold text-green-400 mb-3">{t("clients.bulk_payment.success")}</p>
                          {paymentResult.payments.filter(p => p.newStatus === "paid").length > 0 && (
                            <div className="mb-3">
                              <p className="text-xs font-medium text-text-muted mb-1">{t("clients.bulk_payment.invoices_closed")}</p>
                              <div className="space-y-1">
                                {paymentResult.payments.filter(p => p.newStatus === "paid").map(p => (
                                  <div key={p.invoiceId} className="flex justify-between text-xs bg-green-400/10 border border-green-400/20 rounded px-2 py-1">
                                    <span className="text-text-secondary">#{p.invoiceNumber}</span>
                                    <span className="text-green-400 font-medium">{fmt(p.amount)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {paymentResult.payments.filter(p => p.newStatus === "partially_paid").length > 0 && (
                            <div className="mb-3">
                              <p className="text-xs font-medium text-text-muted mb-1">{t("clients.bulk_payment.partial_invoice")}</p>
                              <div className="space-y-1">
                                {paymentResult.payments.filter(p => p.newStatus === "partially_paid").map(p => (
                                  <div key={p.invoiceId} className="flex justify-between text-xs bg-amber-400/10 border border-amber-400/20 rounded px-2 py-1">
                                    <span className="text-text-secondary">#{p.invoiceNumber}</span>
                                    <span className="text-amber-400 font-medium">{fmt(p.amount)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {paymentResult.remaining > 0 && (
                            <p className="text-xs text-amber-400 mt-2">
                              {t("clients.bulk_payment.remaining")}: {fmt(paymentResult.remaining)}
                            </p>
                          )}
                          <button onClick={() => setPaymentResult(null)} className="mt-3 w-full px-3 py-2 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent-hover">
                            {t("common.close")}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between p-4 sm:p-6 border-t border-dark-border bg-dark-bg/50">
              <button onClick={exportDetailPDF} className="flex items-center gap-1.5 px-3 py-2 bg-dark-card border border-dark-border text-text-secondary rounded-lg hover:bg-dark-card-hover text-sm">
                📄 {t("clients.export_pdf")}
              </button>
              <button onClick={closeDetailModal} className="px-4 py-2 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent-hover">
                {t("common.close")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clients Table */}
      <div className="bg-dark-card rounded-xl border border-dark-border overflow-x-auto">
        <table className="w-full min-w-[560px]">
          <thead className="bg-dark-bg/50">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase cursor-pointer select-none" onClick={() => toggleSort("name")}>
                <span className="inline-flex items-center gap-1">{t("field.name")} <SortIcon field="name" /></span>
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase cursor-pointer select-none" onClick={() => toggleSort("email")}>
                <span className="inline-flex items-center gap-1">{t("field.email")} <SortIcon field="email" /></span>
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase">{t("field.phone")}</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase cursor-pointer select-none" onClick={() => toggleSort("city")}>
                <span className="inline-flex items-center gap-1">{t("field.city")} <SortIcon field="city" /></span>
              </th>
              <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase cursor-pointer select-none" onClick={() => toggleSort("totalPending")}>
                <span className="inline-flex items-center justify-end gap-1">{t("clients.total_pending")} <SortIcon field="totalPending" /></span>
              </th>
              {canEdit && <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase">{t("common.actions")}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-dark-border/50">
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-text-muted">{search || filterCity ? t("common.no_results") : t("clients.empty")}</td></tr>
            ) : filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(client => (
              <tr key={client.id} className="hover:bg-dark-card-hover">
                <td className="px-4 py-3 text-sm font-medium text-text-primary">{client.name}</td>
                <td className="px-4 py-3 text-sm text-text-secondary">{client.email || "-"}</td>
                <td className="px-4 py-3 text-sm text-text-secondary">{client.phone || "-"}</td>
                <td className="px-4 py-3 text-sm text-text-secondary">{client.city || "-"}</td>
                <td className="px-4 py-3 text-sm text-right">
                  <span className={client.totalPending > 0 ? "text-amber-400 font-medium" : "text-text-muted"}>{fmt(client.totalPending)}</span>
                </td>
                {canEdit && (
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openDetailModal(client)} className="text-text-muted hover:text-accent p-1" title={t("clients.record_payment")}>
                      <Eye size={16} />
                    </button>
                    <button onClick={() => openEdit(client)} className="text-text-muted hover:text-accent p-1"><Pencil size={16} /></button>
                    <button onClick={() => handleDelete(client.id)} className="text-text-muted hover:text-danger p-1"><Trash2 size={16} /></button>
                  </td>
                )}
              </tr>
            ))}
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
    </div>
    </PermissionGuard>
  );
}
