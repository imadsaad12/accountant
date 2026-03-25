"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Plus, Trash2, X, Download, Eye, CreditCard, AlertCircle, ChevronUp, ChevronDown, Edit2 } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Loader2 } from "lucide-react";
import { TablePageSkeleton } from "@/components/skeletons/TablePageSkeleton";
import { PermissionGuard, usePermissions } from "@/components/PermissionGuard";
import { useTranslation } from "@/components/LanguageProvider";
import { useOrgSettings, useOrgTimezone, currencySymbol as getCurrencySymbol } from "@/components/OrgSettingsProvider";
import { todayInTz, formatDateInTz } from "@/lib/tz";

interface Client {
  id: string;
  name: string;
  email: string | null;
}

interface Product {
  id: string;
  name: string;
  price: number;
  quantity: number;
  type: string;
  components: { componentId: string; quantity: number; component: { id: string; name: string; quantity: number } }[];
}

interface InvoiceItem {
  id?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  productId?: string;
  product?: Product | null;
}

interface Payment {
  id: string;
  amount: number;
  date: string;
  method: string;
  reference: string | null;
  note: string | null;
}

interface InvoiceFee {
  id?: string;
  label: string;
  amount: number;
}

interface Invoice {
  id: string;
  number: string;
  date: string;
  dueDate: string | null;
  status: string;
  subtotal: number;
  discount: number;
  tax: number;
  taxRate: number;
  total: number;
  language: string;
  notes: string | null;
  client: Client;
  clientId: string;
  items: InvoiceItem[];
  fees: InvoiceFee[];
}

type InvSortField = "number" | "client" | "date" | "dueDate" | "total" | "status" | "";
type SortDir = "asc" | "desc";

const emptyItem = { description: "", quantity: 1, unitPrice: 0, total: 0, productId: "" };
const emptyFee = { label: "", amount: 0 };
const PAYMENT_METHODS = ["cash", "bank_transfer", "check", "card"];

function agingBadge(inv: Invoice) {
  if (inv.status === "paid" || !inv.dueDate) return null;
  const days = Math.floor((Date.now() - new Date(inv.dueDate).getTime()) / 86400000);
  if (days <= 0) return null;
  const color = days > 90 ? "text-red-400 border-red-500/30 bg-red-500/10" : days > 30 ? "text-orange-400 border-orange-500/30 bg-orange-500/10" : "text-yellow-400 border-yellow-500/30 bg-yellow-500/10";
  return <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${color}`}>{days}d overdue</span>;
}

const fmtAmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtCompact = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return (n / 1_000_000_000).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + "B";
  if (abs >= 1_000_000)     return (n / 1_000_000).toLocaleString("en-US",     { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + "M";
  if (abs >= 1_000)         return (n / 1_000).toLocaleString("en-US",         { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + "K";
  return fmtAmt(n);
};

export default function InvoicesPage() {
  const { canEditFeature } = usePermissions();
  const canEdit = canEditFeature("invoices");
  const t = useTranslation();
  const { orgSettings } = useOrgSettings();
  const tz = useOrgTimezone();
  const currencySymbol = getCurrencySymbol(orgSettings.defaultCurrency);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<InvSortField>("");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null);
  const [form, setForm] = useState({ clientId: "", date: todayInTz(tz), dueDate: "", taxRate: "19", discount: "0", language: "fr", notes: "", status: "draft" });
  const [items, setItems] = useState<typeof emptyItem[]>([{ ...emptyItem }]);
  const [fees, setFees] = useState<InvoiceFee[]>([]);

  // Payment state
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ amount: "", date: todayInTz(tz), method: "cash", reference: "", note: "" });
  const [savingPayment, setSavingPayment] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [invRes, cliRes, prodRes] = await Promise.all([
      fetch("/api/invoices"),
      fetch("/api/clients"),
      fetch("/api/products"),
    ]);
    setInvoices(await invRes.json());
    setClients(await cliRes.json());
    setProducts(await prodRes.json());
    setLoading(false);
  }

  async function openViewInvoice(inv: Invoice) {
    setViewInvoice(inv);
    setShowPaymentForm(false);
    setPaymentsLoading(true);
    const res = await fetch(`/api/invoices/${inv.id}/payments`);
    setPayments(res.ok ? await res.json() : []);
    setPaymentsLoading(false);
  }

  async function handleAddPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!viewInvoice) return;
    setSavingPayment(true);
    try {
      await fetch(`/api/invoices/${viewInvoice.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paymentForm),
      });
      setPaymentForm({ amount: "", date: todayInTz(tz), method: "cash", reference: "", note: "" });
      setShowPaymentForm(false);
      // Reload payments + invoice list
      const [paymentsRes] = await Promise.all([
        fetch(`/api/invoices/${viewInvoice.id}/payments`),
        loadData(),
      ]);
      setPayments(paymentsRes.ok ? await paymentsRes.json() : []);
      // Refresh viewInvoice status
      const invRes = await fetch(`/api/invoices/${viewInvoice.id}`);
      if (invRes.ok) setViewInvoice(await invRes.json());
    } finally {
      setSavingPayment(false);
    }
  }

  async function deletePayment(paymentId: string) {
    if (!viewInvoice || !confirm("Delete this payment?")) return;
    await fetch(`/api/invoices/${viewInvoice.id}/payments?paymentId=${paymentId}`, { method: "DELETE" });
    const [paymentsRes, invRes] = await Promise.all([
      fetch(`/api/invoices/${viewInvoice.id}/payments`),
      fetch(`/api/invoices/${viewInvoice.id}`),
      loadData(),
    ]);
    setPayments(paymentsRes.ok ? await paymentsRes.json() : []);
    if (invRes.ok) setViewInvoice(await invRes.json());
  }

  function addItem() { setItems([...items, { ...emptyItem }]); }
  function removeItem(idx: number) { setItems(items.filter((_, i) => i !== idx)); }

  function updateItem(idx: number, field: string, value: string | number) {
    const updated = [...items];
    (updated[idx] as Record<string, unknown>)[field] = value;
    if (field === "productId" && value) {
      const prod = products.find(p => p.id === value);
      if (prod) { updated[idx].description = prod.name; updated[idx].unitPrice = prod.price; }
    }
    updated[idx].total = updated[idx].quantity * updated[idx].unitPrice;
    setItems(updated);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        taxRate: parseFloat(form.taxRate),
        discount: parseFloat(form.discount) || 0,
        items: items.map(item => ({ description: item.description, quantity: item.quantity, unitPrice: item.unitPrice, productId: item.productId || undefined })),
        fees: fees.filter(f => f.label.trim() && f.amount > 0),
      };
      if (editId) {
        await fetch(`/api/invoices/${editId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      } else {
        await fetch("/api/invoices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      }
      setShowForm(false);
      setEditId(null);
      setItems([{ ...emptyItem }]);
      setFees([]);
      loadData();
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    setUpdatingStatusId(id);
    await fetch(`/api/invoices/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    await loadData();
    setUpdatingStatusId(null);
  }

  async function handleDelete(id: string) {
    if (!confirm(t("invoices.delete_confirm"))) return;
    setDeletingId(id);
    await fetch(`/api/invoices/${id}`, { method: "DELETE" });
    setDeletingId(null);
    loadData();
  }

  function openEdit(inv: Invoice) {
    setEditId(inv.id);
    setForm({
      clientId: inv.clientId,
      date: inv.date.split("T")[0],
      dueDate: inv.dueDate ? inv.dueDate.split("T")[0] : "",
      taxRate: String(inv.taxRate),
      discount: String(inv.discount),
      language: inv.language || "fr",
      notes: inv.notes || "",
      status: inv.status,
    });
    setItems(inv.items.map(item => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.total,
      productId: item.productId || "",
    })));
    setFees(inv.fees.map(f => ({ id: f.id, label: f.label, amount: f.amount })));
    setShowForm(true);
  }

  const pdfTranslations: Record<string, Record<string, string>> = {
    en: { invoice: "INVOICE", invoiceNumber: "Invoice #", date: "Date", dueDate: "Due Date", billTo: "Bill To", description: "Description", quantity: "Quantity", unitPrice: "Unit Price", total: "Total", subtotal: "Subtotal", tax: "Tax", grandTotal: "Total Due", notes: "Notes", thankYou: "Thank you for your business!", status: "Status" },
    fr: { invoice: "FACTURE", invoiceNumber: "Facture N°", date: "Date", dueDate: "Date d'échéance", billTo: "Facturer à", description: "Description", quantity: "Quantité", unitPrice: "Prix unitaire", total: "Total", subtotal: "Sous-total", tax: "Taxe", grandTotal: "Total à payer", notes: "Notes", thankYou: "Merci pour votre confiance !", status: "Statut" },
  };

  async function exportPDF(invoice: Invoice, lang: string) {
    setDownloadingId(invoice.id);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`);
      if (!res.ok) throw new Error("Failed to fetch invoice");
      const fullInvoice = await res.json();
      const pdfT = pdfTranslations[lang] || pdfTranslations.en;
      const sym = currencySymbol;
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      doc.setFontSize(24); doc.setTextColor(37, 99, 235); doc.text(fullInvoice.orgName || pdfT.invoice, 20, 30);
      doc.setFontSize(10); doc.setTextColor(100, 100, 100); doc.setFont("helvetica", "normal");
      doc.text(fullInvoice.orgName || "", pageWidth - 20, 20, { align: "right" });
      doc.setFontSize(10); doc.setTextColor(60, 60, 60);
      let y = 45;
      doc.setFont("helvetica", "bold"); doc.text(`${pdfT.invoiceNumber}: ${fullInvoice.number}`, 20, y); y += 6;
      doc.setFont("helvetica", "normal"); doc.text(`${pdfT.date}: ${formatDateInTz(fullInvoice.date, tz)}`, 20, y); y += 6;
      if (fullInvoice.dueDate) { doc.text(`${pdfT.dueDate}: ${formatDateInTz(fullInvoice.dueDate, tz)}`, 20, y); y += 6; }
      doc.text(`${pdfT.status}: ${fullInvoice.status.toUpperCase()}`, 20, y);
      y = 45;
      doc.setFont("helvetica", "bold"); doc.text(pdfT.billTo, pageWidth - 20, y, { align: "right" }); y += 6;
      doc.setFont("helvetica", "normal"); doc.text(fullInvoice.client?.name || "N/A", pageWidth - 20, y, { align: "right" });
      const tableHead = [[pdfT.description, pdfT.quantity, pdfT.unitPrice, pdfT.total]];
      const tableBody = (fullInvoice.items || []).map((item: { description: string; quantity: number; unitPrice: number; total: number }) => [item.description, String(item.quantity), `${sym}${fmtAmt(Number(item.unitPrice))}`, `${sym}${fmtAmt(Number(item.total))}`]);
      autoTable(doc, { startY: 85, head: tableHead, body: tableBody, theme: "striped", headStyles: { fillColor: [37, 99, 235], textColor: 255, fontSize: 10, fontStyle: "bold" }, bodyStyles: { fontSize: 9 }, columnStyles: { 0: { cellWidth: "auto" }, 1: { cellWidth: 25, halign: "center" }, 2: { cellWidth: 30, halign: "right" }, 3: { cellWidth: 30, halign: "right" } }, margin: { left: 20, right: 20 } });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const finalY = (doc as any).lastAutoTable.finalY + 10;
      doc.setFontSize(10); doc.setTextColor(60, 60, 60);
      let pdfTotalsY = finalY;
      doc.text(`${pdfT.subtotal}: ${sym}${fmtAmt(Number(fullInvoice.subtotal))}`, pageWidth - 20, pdfTotalsY, { align: "right" });
      pdfTotalsY += 7;
      if (fullInvoice.discount > 0) {
        doc.setTextColor(34, 197, 94);
        doc.text(`Discount (${fullInvoice.discount}%): -${sym}${fmtAmt(Number(fullInvoice.subtotal) * fullInvoice.discount / 100)}`, pageWidth - 20, pdfTotalsY, { align: "right" });
        doc.setTextColor(60, 60, 60);
        pdfTotalsY += 7;
      }
      doc.text(`${pdfT.tax} (${fullInvoice.taxRate}%): ${sym}${fmtAmt(Number(fullInvoice.tax))}`, pageWidth - 20, pdfTotalsY, { align: "right" });
      pdfTotalsY += 7;
      if (Array.isArray(fullInvoice.fees)) {
        for (const fee of fullInvoice.fees as { label: string; amount: number }[]) {
          doc.setTextColor(60, 60, 60);
          doc.text(`${fee.label}: ${sym}${fmtAmt(Number(fee.amount))}`, pageWidth - 20, pdfTotalsY, { align: "right" });
          pdfTotalsY += 7;
        }
      }
      pdfTotalsY += 4;
      doc.setFontSize(14); doc.setFont("helvetica", "bold"); doc.setTextColor(37, 99, 235);
      doc.text(`${pdfT.grandTotal}: ${sym}${fmtAmt(Number(fullInvoice.total))}`, pageWidth - 20, pdfTotalsY, { align: "right" });
      if (fullInvoice.notes) { doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 100, 100); doc.text(`${pdfT.notes}: ${fullInvoice.notes}`, 20, pdfTotalsY + 18); }
      doc.setFontSize(9); doc.setTextColor(150, 150, 150); doc.text(pdfT.thankYou, pageWidth / 2, doc.internal.pageSize.getHeight() - 20, { align: "center" });
      doc.save(`${fullInvoice.number}-${lang}.pdf`);
    } catch (err) {
      console.error("PDF export error:", err);
      alert(t("invoices.pdf_error"));
    } finally {
      setDownloadingId(null);
    }
  }

  function toggleSort(field: InvSortField) {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  }

  function SortIcon({ field }: { field: InvSortField }) {
    if (sortField !== field) return <ChevronUp size={12} className="opacity-30" />;
    return sortDir === "asc" ? <ChevronUp size={12} className="text-accent" /> : <ChevronDown size={12} className="text-accent" />;
  }

  const sortedInvoices = useMemo(() => {
    if (!sortField) return invoices;
    return [...invoices].sort((a, b) => {
      let va: string | number = "";
      let vb: string | number = "";
      if (sortField === "number") { va = a.number.toLowerCase(); vb = b.number.toLowerCase(); }
      else if (sortField === "client") { va = a.client.name.toLowerCase(); vb = b.client.name.toLowerCase(); }
      else if (sortField === "date") { va = a.date; vb = b.date; }
      else if (sortField === "dueDate") { va = a.dueDate || ""; vb = b.dueDate || ""; }
      else if (sortField === "total") { va = a.total; vb = b.total; }
      else if (sortField === "status") { va = a.status; vb = b.status; }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [invoices, sortField, sortDir]);

  const subtotal = Math.max(0, items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0));
  const discountPct = parseFloat(form.discount) || 0;
  const discountAmount = subtotal * (discountPct / 100);
  const afterDiscount = subtotal - discountAmount;
  const tax = afterDiscount * (parseFloat(form.taxRate) / 100);
  const feesTotal = fees.reduce((s, f) => s + (f.amount || 0), 0);

  if (loading) return <TablePageSkeleton rows={10} hasFilters cols={6} />;

  return (
    <PermissionGuard feature="invoices">
    <div>
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-text-primary">{t("invoices.title")}</h1>
        {canEdit && (
          <button onClick={() => { setForm({ clientId: "", date: todayInTz(tz), dueDate: "", taxRate: "19", discount: "0", language: "fr", notes: "", status: "draft" }); setItems([{ ...emptyItem }]); setFees([]); setShowForm(true); }} className="flex items-center gap-1.5 px-3 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover text-sm font-medium">
            <Plus size={16} /> {t("invoices.add")}
          </button>
        )}
      </div>

      {/* Stats */}
      {invoices.length > 0 && (() => {
        const totalValue   = invoices.reduce((s, i) => s + i.total, 0);
        const paidValue    = invoices.filter(i => i.status === "paid").reduce((s, i) => s + i.total, 0);
        const pendingValue = invoices.filter(i => i.status === "sent" || i.status === "overdue" || i.status === "partially_paid").reduce((s, i) => s + i.total, 0);
        return (
          <div className="grid grid-cols-3 gap-3 mb-4 sm:mb-6">
            <div className="relative bg-dark-card border border-dark-border rounded-xl p-3 sm:p-4 group">
              <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-dark-bg border border-dark-border text-text-primary text-xs px-2.5 py-1.5 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20">
                {currencySymbol}{fmtAmt(totalValue)}
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-dark-border" />
              </div>
              <p className="text-xs text-text-muted uppercase font-medium mb-1">{t("field.total")}</p>
              <p className="text-lg sm:text-2xl font-bold text-text-primary">{currencySymbol}{fmtCompact(totalValue)}</p>
            </div>
            <div className="relative bg-dark-card border border-dark-border rounded-xl p-3 sm:p-4 group">
              <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-dark-bg border border-dark-border text-text-primary text-xs px-2.5 py-1.5 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20">
                {currencySymbol}{fmtAmt(paidValue)}
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-dark-border" />
              </div>
              <p className="text-xs text-text-muted uppercase font-medium mb-1">{t("status.paid")}</p>
              <p className="text-lg sm:text-2xl font-bold text-emerald-400">{currencySymbol}{fmtCompact(paidValue)}</p>
            </div>
            <div className="relative bg-dark-card border border-dark-border rounded-xl p-3 sm:p-4 group">
              <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-dark-bg border border-dark-border text-text-primary text-xs px-2.5 py-1.5 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20">
                {currencySymbol}{fmtAmt(pendingValue)}
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-dark-border" />
              </div>
              <p className="text-xs text-text-muted uppercase font-medium mb-1">{t("dashboard.pending")}</p>
              <p className="text-lg sm:text-2xl font-bold text-amber-400">{currencySymbol}{fmtCompact(pendingValue)}</p>
            </div>
          </div>
        );
      })()}

      {/* View Invoice Modal */}
      {viewInvoice && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-dark-card border border-dark-border rounded-2xl p-4 sm:p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">{t("tax.invoice")} <span className="text-accent font-mono">{viewInvoice.number}</span></h2>
              </div>
              <button onClick={() => setViewInvoice(null)} className="text-text-muted hover:text-text-primary"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              {/* Invoice meta */}
              <div className="grid grid-cols-2 gap-2 bg-dark-bg/40 rounded-xl p-3 border border-dark-border/50">
                <div>
                  <p className="text-xs text-text-muted mb-0.5">{t("invoices.client")}</p>
                  <p className="text-sm font-medium text-text-primary">{viewInvoice.client.name}</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted mb-0.5">{t("field.status")}</p>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${viewInvoice.status === "paid" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : viewInvoice.status === "sent" ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" : viewInvoice.status === "overdue" ? "bg-red-500/10 text-red-400 border border-red-500/20" : viewInvoice.status === "partially_paid" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : "bg-slate-500/10 text-slate-400 border border-slate-500/20"}`}>{t(`status.${viewInvoice.status}`)}</span>
                </div>
                <div>
                  <p className="text-xs text-text-muted mb-0.5">{t("field.date")}</p>
                  <p className="text-sm text-text-primary">{formatDateInTz(viewInvoice.date, tz)}</p>
                </div>
                <div>
                  <p className="text-xs text-text-muted mb-0.5">{t("invoices.due_date")}</p>
                  <p className="text-sm text-text-primary">{viewInvoice.dueDate ? formatDateInTz(viewInvoice.dueDate, tz) : "-"}</p>
                </div>
              </div>

              {/* Items table */}
              <div className="rounded-xl border border-dark-border overflow-x-auto">
                <table className="w-full text-sm min-w-[380px]">
                  <thead className="bg-dark-bg/60">
                    <tr>
                      <th className="text-left px-3 py-2.5 text-xs font-medium text-text-muted uppercase">{t("field.description")}</th>
                      <th className="text-right px-3 py-2.5 text-xs font-medium text-text-muted uppercase">{t("field.quantity")}</th>
                      <th className="text-right px-3 py-2.5 text-xs font-medium text-text-muted uppercase">{t("field.price")}</th>
                      <th className="text-right px-3 py-2.5 text-xs font-medium text-text-muted uppercase">{t("field.total")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark-border/50">
                    {viewInvoice.items.map((item, i) => (
                      <tr key={i} className="hover:bg-dark-bg/30">
                        <td className="px-3 py-2.5 text-text-primary">{item.description}</td>
                        <td className="px-3 py-2.5 text-right text-text-secondary">{item.quantity}</td>
                        <td className="px-3 py-2.5 text-right text-text-secondary">{currencySymbol}{fmtAmt(item.unitPrice)}</td>
                        <td className="px-3 py-2.5 text-right font-medium text-text-primary">{currencySymbol}{fmtAmt(item.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="bg-dark-bg/40 rounded-xl border border-dark-border/50 p-3 space-y-1.5 text-sm">
                <div className="flex justify-between text-text-secondary">
                  <span>{t("invoices.subtotal")}</span>
                  <span className="font-medium text-text-primary">{currencySymbol}{fmtAmt(viewInvoice.subtotal)}</span>
                </div>
                {viewInvoice.discount > 0 && (
                  <div className="flex justify-between text-text-secondary">
                    <span>Discount ({viewInvoice.discount}%)</span>
                    <span className="font-medium text-emerald-400">-{currencySymbol}{fmtAmt(viewInvoice.subtotal * viewInvoice.discount / 100)}</span>
                  </div>
                )}
                <div className="flex justify-between text-text-secondary">
                  <span>{t("invoices.tax")} ({viewInvoice.taxRate}%)</span>
                  <span className="font-medium text-text-primary">{currencySymbol}{fmtAmt(viewInvoice.tax)}</span>
                </div>
                {(viewInvoice.fees || []).map((fee, idx) => (
                  <div key={idx} className="flex justify-between text-text-secondary">
                    <span>{fee.label}</span>
                    <span className="font-medium text-text-primary">{currencySymbol}{fmtAmt(fee.amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-dark-border pt-1.5">
                  <span className="font-semibold text-text-primary">{t("field.total")}</span>
                  <span className="text-base font-bold text-accent">{currencySymbol}{fmtAmt(viewInvoice.total)}</span>
                </div>
              </div>

              {/* Payments Panel */}
              <div className="border-t border-dark-border pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                    <CreditCard size={15} className="text-accent" /> {t("payments.history")}
                  </h3>
                  {canEdit && viewInvoice.status !== "paid" && (
                    <button onClick={() => setShowPaymentForm(!showPaymentForm)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-accent text-white rounded-lg hover:bg-accent-hover font-medium">
                      <Plus size={13} /> {t("payments.add")}
                    </button>
                  )}
                </div>

                {/* Payment Form */}
                {showPaymentForm && (
                  <form onSubmit={handleAddPayment} className="bg-dark-bg/50 border border-dark-border rounded-xl p-4 mb-3 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-text-secondary mb-1 block">{t("payments.amount")} *</label>
                        {(() => {
                          const remaining = parseFloat((viewInvoice.total - payments.reduce((s, p) => s + p.amount, 0)).toFixed(2));
                          const enteredAmount = parseFloat(paymentForm.amount);
                          const exceedsBalance = !isNaN(enteredAmount) && enteredAmount > remaining;
                          return (
                            <>
                              <input type="number" step="0.01" min="0.01" required value={paymentForm.amount} onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })} className={`w-full px-3 py-2 bg-dark-input border text-text-primary rounded-lg text-sm ${exceedsBalance ? "border-danger" : "border-dark-border"}`} placeholder="0.00" />
                              {exceedsBalance
                                ? <p className="text-[11px] text-danger mt-1">Exceeds remaining balance of {currencySymbol}{fmtAmt(remaining)}</p>
                                : <p className="text-[11px] text-text-muted mt-1">Remaining: {currencySymbol}{fmtAmt(remaining)}</p>
                              }
                            </>
                          );
                        })()}
                      </div>
                      <div>
                        <label className="text-xs font-medium text-text-secondary mb-1 block">{t("payments.date")}</label>
                        <input type="date" value={paymentForm.date} onChange={e => setPaymentForm({ ...paymentForm, date: e.target.value })} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm" />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-text-secondary mb-1 block">{t("payments.method")}</label>
                        <select value={paymentForm.method} onChange={e => setPaymentForm({ ...paymentForm, method: e.target.value })} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm">
                          {PAYMENT_METHODS.map(m => <option key={m} value={m}>{t(`payments.method.${m}`)}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-text-secondary mb-1 block">{t("payments.reference")}</label>
                        <input type="text" value={paymentForm.reference} onChange={e => setPaymentForm({ ...paymentForm, reference: e.target.value })} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg text-sm" placeholder="Ref #..." />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button type="button" onClick={() => setShowPaymentForm(false)} className="px-3 py-1.5 text-xs font-medium text-text-secondary bg-dark-card border border-dark-border rounded-lg hover:bg-dark-card-hover">{t("common.cancel")}</button>
                      <button type="submit" disabled={savingPayment || (() => { const r = viewInvoice.total - payments.reduce((s,p)=>s+p.amount,0); return !isNaN(parseFloat(paymentForm.amount)) && parseFloat(paymentForm.amount) > r; })()} className="px-3 py-1.5 text-xs font-medium text-white bg-accent rounded-lg hover:bg-accent-hover disabled:opacity-60">
                        {savingPayment ? <Loader2 size={13} className="animate-spin inline" /> : t("payments.save")}
                      </button>
                    </div>
                  </form>
                )}

                {/* Payment Summary */}
                {(() => {
                  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
                  const balance = viewInvoice.total - totalPaid;
                  return (
                    <div className="flex gap-4 text-sm mb-3">
                      <div className="flex-1 bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-3 py-2">
                        <div className="text-text-muted text-xs">{t("payments.paid")}</div>
                        <div className="font-semibold text-emerald-400">{currencySymbol}{fmtAmt(totalPaid)}</div>
                      </div>
                      <div className={`flex-1 border rounded-lg px-3 py-2 ${balance > 0 ? "bg-orange-500/5 border-orange-500/20" : "bg-emerald-500/5 border-emerald-500/20"}`}>
                        <div className="text-text-muted text-xs">{t("payments.balance")}</div>
                        <div className={`font-semibold ${balance > 0 ? "text-orange-400" : "text-emerald-400"}`}>{currencySymbol}{fmtAmt(Math.abs(balance))}{balance < 0 ? ` (${t("payments.overpaid")})` : ""}</div>
                      </div>
                    </div>
                  );
                })()}

                {/* Payment List */}
                {paymentsLoading ? (
                  <div className="flex justify-center py-4"><Loader2 size={18} className="animate-spin text-text-muted" /></div>
                ) : payments.length === 0 ? (
                  <p className="text-sm text-text-muted text-center py-3">{t("payments.no_payments")}</p>
                ) : (
                  <div className="space-y-1.5">
                    {payments.map(p => (
                      <div key={p.id} className="flex items-center justify-between bg-dark-bg/50 border border-dark-border rounded-lg px-3 py-2 text-sm">
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-text-primary">{currencySymbol}{fmtAmt(p.amount)}</span>
                          <span className="text-text-muted text-xs">{formatDateInTz(p.date, tz)}</span>
                          <span className="text-xs px-2 py-0.5 rounded bg-accent/10 text-accent font-medium">{t(`payments.method.${p.method}`)}</span>
                          {p.reference && <span className="text-text-muted text-xs">#{p.reference}</span>}
                        </div>
                        {canEdit && (
                          <button onClick={() => deletePayment(p.id)} className="text-text-muted hover:text-danger p-1"><Trash2 size={13} /></button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex gap-2 justify-end pt-4 border-t border-dark-border">
                <span className="text-sm text-text-muted mr-2 self-center">{t("invoices.download_pdf")}:</span>
                <button onClick={() => exportPDF(viewInvoice, "fr")} disabled={!!downloadingId} className="px-3 py-1.5 text-xs bg-accent/10 text-accent rounded-lg hover:bg-accent/20 font-medium flex items-center gap-1">
                  {downloadingId === viewInvoice.id ? <Loader2 size={12} className="animate-spin" /> : null}Français
                </button>
                <button onClick={() => exportPDF(viewInvoice, "en")} disabled={!!downloadingId} className="px-3 py-1.5 text-xs bg-accent/10 text-accent rounded-lg hover:bg-accent/20 font-medium flex items-center gap-1">
                  {downloadingId === viewInvoice.id ? <Loader2 size={12} className="animate-spin" /> : null}English
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Invoice Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-dark-card border border-dark-border rounded-2xl p-4 sm:p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-text-primary">{editId ? t("invoices.edit") : t("invoices.add")}</h2>
              <button onClick={() => { setShowForm(false); setEditId(null); setItems([{ ...emptyItem }]); setFees([]); }} className="text-text-muted hover:text-text-primary"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">{t("invoices.client")} *</label>
                  <select required value={form.clientId} onChange={e => setForm({ ...form, clientId: e.target.value })} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg focus:ring-accent focus:border-accent">
                    <option value="">{t("invoices.select_client")}</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">{t("invoices.language")}</label>
                  <select value={form.language} onChange={e => setForm({ ...form, language: e.target.value })} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg focus:ring-accent focus:border-accent">
                    <option value="fr">Français</option>
                    <option value="en">English</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">{t("field.date")}</label>
                  <input type="date" value={form.date} onChange={e => { const newDate = e.target.value; setForm({ ...form, date: newDate, dueDate: form.dueDate && form.dueDate < newDate ? "" : form.dueDate }); }} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg focus:ring-accent focus:border-accent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">{t("invoices.due_date")}</label>
                  <input type="date" min={form.date} value={form.dueDate} onChange={e => { if (form.date && e.target.value < form.date) return; setForm({ ...form, dueDate: e.target.value }); }} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg focus:ring-accent focus:border-accent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">{t("invoices.tax_rate")}</label>
                  <input type="number" step="0.1" min="0" max="100" value={form.taxRate} onChange={e => setForm({ ...form, taxRate: e.target.value })} onKeyDown={e => ["e", "E", "+", "-"].includes(e.key) && e.preventDefault()} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg focus:ring-accent focus:border-accent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Discount (%)</label>
                  <input type="number" step="0.1" min="0" max="100" value={form.discount} onChange={e => setForm({ ...form, discount: e.target.value })} onKeyDown={e => ["e", "E", "+", "-"].includes(e.key) && e.preventDefault()} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg focus:ring-accent focus:border-accent" />
                </div>
              </div>

              {/* Line Items */}
              <div>
                <label className="text-sm font-medium text-text-secondary mb-2 block">{t("invoices.items")}</label>
                <div className="overflow-x-auto rounded-lg border border-dark-border">
                  <div className="min-w-[520px]">
                    <div className="grid grid-cols-[150px_1fr_68px_90px_80px_28px] gap-2 px-2 py-1.5 bg-dark-bg/50 border-b border-dark-border">
                      <span className="text-xs font-medium text-text-muted uppercase">{t("invoices.product")}</span>
                      <span className="text-xs font-medium text-text-muted uppercase">{t("field.description")}</span>
                      <span className="text-xs font-medium text-text-muted uppercase">{t("field.quantity")}</span>
                      <span className="text-xs font-medium text-text-muted uppercase">{t("invoices.unit_price")}</span>
                      <span className="text-xs font-medium text-text-muted uppercase text-right">{t("field.total")}</span>
                      <span />
                    </div>
                    <div className="divide-y divide-dark-border/50">
                      {items.map((item, idx) => (
                        <div key={idx} className="grid grid-cols-[150px_1fr_68px_90px_80px_28px] gap-2 items-center px-2 py-1.5">
                          <select value={item.productId} onChange={e => updateItem(idx, "productId", e.target.value)} className="px-2 py-1.5 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm">
                            <option value="">{t("invoices.custom_item")}</option>
                            {products.map(p => {
                              if (p.type === "composite" && p.components.length) {
                                const canMake = Math.floor(Math.min(...p.components.map(c => c.component.quantity / c.quantity)));
                                const missing = canMake === 0
                                  ? p.components.filter(c => c.component.quantity < c.quantity).map(c => c.component.name).join(", ")
                                  : null;
                                return (
                                  <option key={p.id} value={p.id} disabled={canMake === 0}>
                                    {canMake === 0
                                      ? `⚠ ${p.name} — no stock (missing: ${missing})`
                                      : `${p.name} — ${currencySymbol}${p.price} (can make ${canMake})`}
                                  </option>
                                );
                              }
                              const avail = p.quantity;
                              return (
                                <option key={p.id} value={p.id} disabled={avail === 0}>
                                  {avail === 0
                                    ? `⚠ ${p.name} — out of stock`
                                    : `${p.name} — ${currencySymbol}${p.price} (${avail} avail.)`}
                                </option>
                              );
                            })}
                          </select>
                          <input placeholder={t("field.description")} required value={item.description} onChange={e => updateItem(idx, "description", e.target.value)} className="w-full px-2 py-1.5 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg text-sm" />
                          <input type="number" min="1" value={item.quantity} onChange={e => updateItem(idx, "quantity", parseInt(e.target.value) || 0)} onKeyDown={e => ["e", "E", "+", "-", "."].includes(e.key) && e.preventDefault()} className="w-full px-2 py-1.5 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm" />
                          <input type="number" step="0.01" min="0" value={item.unitPrice} onChange={e => updateItem(idx, "unitPrice", parseFloat(e.target.value) || 0)} onKeyDown={e => ["e", "E", "+", "-"].includes(e.key) && e.preventDefault()} className="w-full px-2 py-1.5 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm" />
                          <span className="text-sm text-right font-medium text-text-primary">{currencySymbol}{fmtAmt(item.quantity * item.unitPrice)}</span>
                          <button type="button" onClick={() => removeItem(idx)} className={`text-text-muted hover:text-danger p-1 ${items.length <= 1 ? "invisible" : ""}`}><Trash2 size={14} /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <button type="button" onClick={addItem} className="mt-3 flex items-center gap-1.5 text-sm text-accent hover:text-accent-hover font-medium">
                  <Plus size={16} /> {t("invoices.add_item")}
                </button>
              </div>

              {/* Fees */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-text-secondary">Additional Fees</label>
                  <button type="button" onClick={() => setFees([...fees, { ...emptyFee }])} className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover font-medium">
                    <Plus size={13} /> Add Fee
                  </button>
                </div>
                {fees.length > 0 && (
                  <div className="space-y-2">
                    {fees.map((fee, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="e.g. Delivery fee"
                          value={fee.label}
                          onChange={e => { const f = [...fees]; f[idx] = { ...f[idx], label: e.target.value }; setFees(f); }}
                          className="flex-1 px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg text-sm"
                        />
                        <input
                          type="number" step="0.01" min="0"
                          value={fee.amount}
                          onChange={e => { const f = [...fees]; f[idx] = { ...f[idx], amount: parseFloat(e.target.value) || 0 }; setFees(f); }}
                          onKeyDown={e => ["e", "E", "+", "-"].includes(e.key) && e.preventDefault()}
                          className="w-28 px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm"
                          placeholder="0.00"
                        />
                        <button type="button" onClick={() => setFees(fees.filter((_, i) => i !== idx))} className="text-text-muted hover:text-danger p-1"><Trash2 size={14} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-dark-bg/40 rounded-xl border border-dark-border/50 p-3 space-y-1.5 text-sm">
                <div className="flex justify-between text-text-secondary">
                  <span>{t("invoices.subtotal")}</span>
                  <span className="font-medium text-text-primary">{currencySymbol}{fmtAmt(subtotal)}</span>
                </div>
                {discountPct > 0 && (
                  <div className="flex justify-between text-text-secondary">
                    <span>Discount ({form.discount}%)</span>
                    <span className="font-medium text-emerald-400">-{currencySymbol}{fmtAmt(discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-text-secondary">
                  <span>{t("invoices.tax")} ({form.taxRate}%)</span>
                  <span className="font-medium text-text-primary">{currencySymbol}{fmtAmt(tax)}</span>
                </div>
                {fees.filter(f => f.label && f.amount > 0).map((fee, idx) => (
                  <div key={idx} className="flex justify-between text-text-secondary">
                    <span>{fee.label}</span>
                    <span className="font-medium text-text-primary">{currencySymbol}{fmtAmt(fee.amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t border-dark-border pt-1.5">
                  <span className="font-semibold text-text-primary">{t("field.total")}</span>
                  <span className="text-base font-bold text-accent">{currencySymbol}{fmtAmt(afterDiscount + tax + feesTotal)}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">{t("field.notes")}</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg focus:ring-accent focus:border-accent" />
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => { setShowForm(false); setEditId(null); setItems([{ ...emptyItem }]); setFees([]); }} className="px-4 py-2 text-sm font-medium text-text-secondary bg-dark-card border border-dark-border rounded-lg hover:bg-dark-card-hover">{t("common.cancel")}</button>
                <button type="submit" disabled={saving} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent-hover disabled:opacity-60">
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {editId ? t("common.save") : t("invoices.add")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invoice List */}
      <div className="bg-dark-card rounded-xl border border-dark-border overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead className="bg-dark-bg/50">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase cursor-pointer select-none" onClick={() => toggleSort("number")}><span className="inline-flex items-center gap-1">{t("invoices.number")} <SortIcon field="number" /></span></th>
              <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase cursor-pointer select-none" onClick={() => toggleSort("client")}><span className="inline-flex items-center gap-1">{t("invoices.client")} <SortIcon field="client" /></span></th>
              <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase cursor-pointer select-none" onClick={() => toggleSort("date")}><span className="inline-flex items-center gap-1">{t("field.date")} <SortIcon field="date" /></span></th>
              <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase cursor-pointer select-none" onClick={() => toggleSort("dueDate")}><span className="inline-flex items-center gap-1">{t("invoices.due_date")} <SortIcon field="dueDate" /></span></th>
              <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase cursor-pointer select-none" onClick={() => toggleSort("total")}><span className="inline-flex items-center gap-1 justify-end">{t("field.total")} <SortIcon field="total" /></span></th>
              <th className="text-center px-4 py-3 text-xs font-medium text-text-muted uppercase cursor-pointer select-none" onClick={() => toggleSort("status")}><span className="inline-flex items-center gap-1 justify-center">{t("field.status")} <SortIcon field="status" /></span></th>
              <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dark-border/50">
            {sortedInvoices.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-text-muted">{t("invoices.empty")}</td></tr>
            ) : sortedInvoices.map(inv => (
              <tr key={inv.id} className="hover:bg-dark-card-hover">
                <td className="px-4 py-3 text-sm font-mono font-medium text-text-primary">{inv.number}</td>
                <td className="px-4 py-3 text-sm text-text-secondary">{inv.client.name}</td>
                <td className="px-4 py-3 text-sm text-text-secondary">{formatDateInTz(inv.date, tz)}</td>
                <td className="px-4 py-3 text-sm text-text-secondary">
                  <div className="flex items-center gap-1.5">
                    {inv.dueDate ? formatDateInTz(inv.dueDate, tz) : "-"}
                    {agingBadge(inv)}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-text-primary text-right font-medium">{currencySymbol}{fmtAmt(inv.total)}</td>
                <td className="px-4 py-3 text-center">
                  {!canEdit ? (
                    <span className={`text-xs px-2 py-1 rounded-full font-medium border ${
                      inv.status === "paid" ? "text-emerald-400 border-emerald-500/20" :
                      inv.status === "partially_paid" ? "text-amber-400 border-amber-500/20" :
                      inv.status === "sent" ? "text-blue-400 border-blue-500/20" :
                      inv.status === "overdue" ? "text-red-400 border-red-500/20" :
                      "text-slate-400 border-dark-border"
                    }`}>{inv.status === "partially_paid" ? "Partially Paid" : t(`status.${inv.status}`)}</span>
                  ) : updatingStatusId === inv.id ? (
                    <span className="inline-flex items-center gap-1 text-xs text-text-muted px-2 py-1">
                      <Loader2 size={12} className="animate-spin" />
                    </span>
                  ) : (
                    <select value={inv.status} onChange={e => updateStatus(inv.id, e.target.value)} className={`text-xs px-2 py-1 rounded-full font-medium border cursor-pointer bg-dark-input ${
                      inv.status === "paid" ? "text-emerald-400 border-emerald-500/20" :
                      inv.status === "partially_paid" ? "text-amber-400 border-amber-500/20" :
                      inv.status === "sent" ? "text-blue-400 border-blue-500/20" :
                      inv.status === "overdue" ? "text-red-400 border-red-500/20" :
                      "text-slate-400 border-dark-border"
                    }`}>
                      <option value="draft">{t("status.draft")}</option>
                      <option value="sent">{t("status.sent")}</option>
                      <option value="partially_paid">Partially Paid</option>
                      <option value="paid">{t("status.paid")}</option>
                      <option value="overdue">{t("status.overdue")}</option>
                    </select>
                  )}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => openViewInvoice(inv)} className="text-text-muted hover:text-accent p-1" title="View"><Eye size={16} /></button>
                  <button onClick={() => exportPDF(inv, inv.language || "fr")} disabled={downloadingId === inv.id} className="text-text-muted hover:text-success p-1" title="Download PDF">
                    {downloadingId === inv.id ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                  </button>
                  {canEdit && (
                    <button onClick={() => openEdit(inv)} className="text-text-muted hover:text-accent p-1" title="Edit"><Edit2 size={16} /></button>
                  )}
                  {canEdit && (
                    <button onClick={() => handleDelete(inv.id)} disabled={deletingId === inv.id} className="text-text-muted hover:text-danger p-1" title="Delete">
                      {deletingId === inv.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
    </PermissionGuard>
  );
}
