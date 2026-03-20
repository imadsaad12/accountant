"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, X, Download, Eye, CreditCard, AlertCircle } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Loader2 } from "lucide-react";
import { PermissionGuard, usePermissions } from "@/components/PermissionGuard";
import { useTranslation } from "@/components/LanguageProvider";

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

interface Invoice {
  id: string;
  number: string;
  date: string;
  dueDate: string | null;
  status: string;
  subtotal: number;
  tax: number;
  taxRate: number;
  total: number;
  language: string;
  notes: string | null;
  client: Client;
  clientId: string;
  items: InvoiceItem[];
}

const emptyItem = { description: "", quantity: 1, unitPrice: 0, total: 0, productId: "" };
const PAYMENT_METHODS = ["cash", "bank_transfer", "check", "card"];

function agingBadge(inv: Invoice) {
  if (inv.status === "paid" || !inv.dueDate) return null;
  const days = Math.floor((Date.now() - new Date(inv.dueDate).getTime()) / 86400000);
  if (days <= 0) return null;
  const color = days > 90 ? "text-red-400 border-red-500/30 bg-red-500/10" : days > 30 ? "text-orange-400 border-orange-500/30 bg-orange-500/10" : "text-yellow-400 border-yellow-500/30 bg-yellow-500/10";
  return <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${color}`}>{days}d overdue</span>;
}

export default function InvoicesPage() {
  const { canEditFeature } = usePermissions();
  const canEdit = canEditFeature("invoices");
  const t = useTranslation();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null);
  const [form, setForm] = useState({ clientId: "", date: new Date().toISOString().split("T")[0], dueDate: "", taxRate: "19", language: "fr", notes: "", status: "draft" });
  const [items, setItems] = useState<typeof emptyItem[]>([{ ...emptyItem }]);

  // Payment state
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ amount: "", date: new Date().toISOString().split("T")[0], method: "cash", reference: "", note: "" });
  const [savingPayment, setSavingPayment] = useState(false);

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
      setPaymentForm({ amount: "", date: new Date().toISOString().split("T")[0], method: "cash", reference: "", note: "" });
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
    const payload = {
      ...form,
      taxRate: parseFloat(form.taxRate),
      items: items.map(item => ({ description: item.description, quantity: item.quantity, unitPrice: item.unitPrice, productId: item.productId || undefined })),
    };
    await fetch("/api/invoices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setShowForm(false);
    setItems([{ ...emptyItem }]);
    loadData();
  }

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/invoices/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    loadData();
  }

  async function handleDelete(id: string) {
    if (!confirm(t("invoices.delete_confirm"))) return;
    await fetch(`/api/invoices/${id}`, { method: "DELETE" });
    loadData();
  }

  const pdfTranslations: Record<string, Record<string, string>> = {
    en: { invoice: "INVOICE", invoiceNumber: "Invoice #", date: "Date", dueDate: "Due Date", billTo: "Bill To", description: "Description", quantity: "Quantity", unitPrice: "Unit Price", total: "Total", subtotal: "Subtotal", tax: "Tax", grandTotal: "Total Due", notes: "Notes", thankYou: "Thank you for your business!", status: "Status" },
    fr: { invoice: "FACTURE", invoiceNumber: "Facture N°", date: "Date", dueDate: "Date d'échéance", billTo: "Facturer à", description: "Description", quantity: "Quantité", unitPrice: "Prix unitaire", total: "Total", subtotal: "Sous-total", tax: "Taxe", grandTotal: "Total à payer", notes: "Notes", thankYou: "Merci pour votre confiance !", status: "Statut" },
  };

  async function exportPDF(invoice: Invoice, lang: string) {
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`);
      if (!res.ok) throw new Error("Failed to fetch invoice");
      const fullInvoice = await res.json();
      const pdfT = pdfTranslations[lang] || pdfTranslations.en;
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      doc.setFontSize(24); doc.setTextColor(37, 99, 235); doc.text(pdfT.invoice, 20, 30);
      doc.setFontSize(10); doc.setTextColor(100, 100, 100); doc.setFont("helvetica", "normal");
      doc.text("Accountant", pageWidth - 20, 20, { align: "right" });
      doc.text("Business Management System", pageWidth - 20, 25, { align: "right" });
      doc.setFontSize(10); doc.setTextColor(60, 60, 60);
      let y = 45;
      doc.setFont("helvetica", "bold"); doc.text(`${pdfT.invoiceNumber}: ${fullInvoice.number}`, 20, y); y += 6;
      doc.setFont("helvetica", "normal"); doc.text(`${pdfT.date}: ${new Date(fullInvoice.date).toLocaleDateString()}`, 20, y); y += 6;
      if (fullInvoice.dueDate) { doc.text(`${pdfT.dueDate}: ${new Date(fullInvoice.dueDate).toLocaleDateString()}`, 20, y); y += 6; }
      doc.text(`${pdfT.status}: ${fullInvoice.status.toUpperCase()}`, 20, y);
      y = 45;
      doc.setFont("helvetica", "bold"); doc.text(pdfT.billTo, pageWidth - 20, y, { align: "right" }); y += 6;
      doc.setFont("helvetica", "normal"); doc.text(fullInvoice.client?.name || "N/A", pageWidth - 20, y, { align: "right" });
      const tableHead = [[pdfT.description, pdfT.quantity, pdfT.unitPrice, pdfT.total]];
      const tableBody = (fullInvoice.items || []).map((item: { description: string; quantity: number; unitPrice: number; total: number }) => [item.description, String(item.quantity), `$${Number(item.unitPrice).toFixed(2)}`, `$${Number(item.total).toFixed(2)}`]);
      autoTable(doc, { startY: 85, head: tableHead, body: tableBody, theme: "striped", headStyles: { fillColor: [37, 99, 235], textColor: 255, fontSize: 10, fontStyle: "bold" }, bodyStyles: { fontSize: 9 }, columnStyles: { 0: { cellWidth: "auto" }, 1: { cellWidth: 25, halign: "center" }, 2: { cellWidth: 30, halign: "right" }, 3: { cellWidth: 30, halign: "right" } }, margin: { left: 20, right: 20 } });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const finalY = (doc as any).lastAutoTable.finalY + 10;
      doc.setFontSize(10); doc.setTextColor(60, 60, 60);
      doc.text(`${pdfT.subtotal}: $${Number(fullInvoice.subtotal).toFixed(2)}`, pageWidth - 20, finalY, { align: "right" });
      doc.text(`${pdfT.tax} (${fullInvoice.taxRate}%): $${Number(fullInvoice.tax).toFixed(2)}`, pageWidth - 20, finalY + 7, { align: "right" });
      doc.setFontSize(14); doc.setFont("helvetica", "bold"); doc.setTextColor(37, 99, 235);
      doc.text(`${pdfT.grandTotal}: $${Number(fullInvoice.total).toFixed(2)}`, pageWidth - 20, finalY + 18, { align: "right" });
      if (fullInvoice.notes) { doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 100, 100); doc.text(`${pdfT.notes}: ${fullInvoice.notes}`, 20, finalY + 35); }
      doc.setFontSize(9); doc.setTextColor(150, 150, 150); doc.text(pdfT.thankYou, pageWidth / 2, doc.internal.pageSize.getHeight() - 20, { align: "center" });
      doc.save(`${fullInvoice.number}-${lang}.pdf`);
    } catch (err) {
      console.error("PDF export error:", err);
      alert(t("invoices.pdf_error"));
    }
  }

  const subtotal = Math.max(0, items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0));
  const tax = subtotal * (parseFloat(form.taxRate) / 100);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-2 border-accent border-t-transparent"></div></div>;

  return (
    <PermissionGuard feature="invoices">
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-text-primary">{t("invoices.title")}</h1>
        {canEdit && (
          <button onClick={() => { setForm({ clientId: "", date: new Date().toISOString().split("T")[0], dueDate: "", taxRate: "19", language: "fr", notes: "", status: "draft" }); setItems([{ ...emptyItem }]); setShowForm(true); }} className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover text-sm font-medium">
            <Plus size={18} /> {t("invoices.add")}
          </button>
        )}
      </div>

      {/* View Invoice Modal */}
      {viewInvoice && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-dark-card border border-dark-border rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-text-primary">{t("tax.invoice")} {viewInvoice.number}</h2>
              <button onClick={() => setViewInvoice(null)} className="text-text-muted hover:text-text-primary"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-text-muted">{t("invoices.client")}:</span> <span className="font-medium text-text-primary">{viewInvoice.client.name}</span></div>
                <div><span className="text-text-muted">{t("field.date")}:</span> <span className="font-medium text-text-primary">{new Date(viewInvoice.date).toLocaleDateString()}</span></div>
                <div><span className="text-text-muted">{t("field.status")}:</span> <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${viewInvoice.status === "paid" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : viewInvoice.status === "sent" ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" : "bg-slate-500/10 text-slate-400"}`}>{t(`status.${viewInvoice.status}`)}</span></div>
                <div><span className="text-text-muted">{t("invoices.due_date")}:</span> <span className="font-medium text-text-primary">{viewInvoice.dueDate ? new Date(viewInvoice.dueDate).toLocaleDateString() : "-"}</span></div>
              </div>

              <table className="w-full text-sm">
                <thead className="bg-dark-bg/50">
                  <tr>
                    <th className="text-left px-3 py-2 text-text-muted">{t("field.description")}</th>
                    <th className="text-right px-3 py-2 text-text-muted">{t("field.quantity")}</th>
                    <th className="text-right px-3 py-2 text-text-muted">{t("field.price")}</th>
                    <th className="text-right px-3 py-2 text-text-muted">{t("field.total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {viewInvoice.items.map((item, i) => (
                    <tr key={i} className="border-b border-dark-border/50">
                      <td className="px-3 py-2 text-text-primary">{item.description}</td>
                      <td className="px-3 py-2 text-right text-text-secondary">{item.quantity}</td>
                      <td className="px-3 py-2 text-right text-text-secondary">${item.unitPrice.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right text-text-primary">${item.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="text-right space-y-1 text-sm">
                <div className="text-text-secondary">{t("invoices.subtotal")}: <span className="font-medium text-text-primary">${viewInvoice.subtotal.toFixed(2)}</span></div>
                <div className="text-text-secondary">{t("invoices.tax")} ({viewInvoice.taxRate}%): <span className="font-medium text-text-primary">${viewInvoice.tax.toFixed(2)}</span></div>
                <div className="text-lg font-bold text-text-primary">{t("field.total")}: ${viewInvoice.total.toFixed(2)}</div>
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
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-text-secondary mb-1 block">{t("payments.amount")} *</label>
                        <input type="number" step="0.01" min="0.01" required value={paymentForm.amount} onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm" placeholder="0.00" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-text-secondary mb-1 block">{t("payments.date")}</label>
                        <input type="date" value={paymentForm.date} onChange={e => setPaymentForm({ ...paymentForm, date: e.target.value })} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
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
                      <button type="submit" disabled={savingPayment} className="px-3 py-1.5 text-xs font-medium text-white bg-accent rounded-lg hover:bg-accent-hover disabled:opacity-60">
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
                        <div className="font-semibold text-emerald-400">${totalPaid.toFixed(2)}</div>
                      </div>
                      <div className={`flex-1 border rounded-lg px-3 py-2 ${balance > 0 ? "bg-orange-500/5 border-orange-500/20" : "bg-emerald-500/5 border-emerald-500/20"}`}>
                        <div className="text-text-muted text-xs">{t("payments.balance")}</div>
                        <div className={`font-semibold ${balance > 0 ? "text-orange-400" : "text-emerald-400"}`}>${Math.abs(balance).toFixed(2)}{balance < 0 ? ` (${t("payments.overpaid")})` : ""}</div>
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
                          <span className="font-semibold text-text-primary">${p.amount.toFixed(2)}</span>
                          <span className="text-text-muted text-xs">{new Date(p.date).toLocaleDateString()}</span>
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
                <button onClick={() => exportPDF(viewInvoice, "fr")} className="px-3 py-1.5 text-xs bg-accent/10 text-accent rounded-lg hover:bg-accent/20 font-medium">Français</button>
                <button onClick={() => exportPDF(viewInvoice, "en")} className="px-3 py-1.5 text-xs bg-accent/10 text-accent rounded-lg hover:bg-accent/20 font-medium">English</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Invoice Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-dark-card border border-dark-border rounded-2xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-text-primary">{t("invoices.add")}</h2>
              <button onClick={() => setShowForm(false)} className="text-text-muted hover:text-text-primary"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
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
              <div className="grid grid-cols-3 gap-4">
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
              </div>

              {/* Line Items */}
              <div>
                <label className="text-sm font-medium text-text-secondary mb-2 block">{t("invoices.items")}</label>
                <div className="grid grid-cols-[160px_1fr_72px_96px_88px_30px] gap-2 px-1 mb-1">
                  <span className="text-xs font-medium text-text-muted uppercase">{t("invoices.product")}</span>
                  <span className="text-xs font-medium text-text-muted uppercase">{t("field.description")}</span>
                  <span className="text-xs font-medium text-text-muted uppercase">{t("field.quantity")}</span>
                  <span className="text-xs font-medium text-text-muted uppercase">{t("invoices.unit_price")}</span>
                  <span className="text-xs font-medium text-text-muted uppercase text-right">{t("field.total")}</span>
                  <span />
                </div>
                <div className="space-y-2">
                  {items.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-[160px_1fr_72px_96px_88px_30px] gap-2 items-center">
                      <select value={item.productId} onChange={e => updateItem(idx, "productId", e.target.value)} className="px-2 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm">
                        <option value="">{t("invoices.custom_item")}</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.name} (${p.price})</option>)}
                      </select>
                      <input placeholder={t("field.description")} required value={item.description} onChange={e => updateItem(idx, "description", e.target.value)} className="w-full px-2 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg text-sm" />
                      <input type="number" min="1" value={item.quantity} onChange={e => updateItem(idx, "quantity", parseInt(e.target.value) || 0)} onKeyDown={e => ["e", "E", "+", "-", "."].includes(e.key) && e.preventDefault()} className="w-full px-2 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm" />
                      <input type="number" step="0.01" min="0" value={item.unitPrice} onChange={e => updateItem(idx, "unitPrice", parseFloat(e.target.value) || 0)} onKeyDown={e => ["e", "E", "+", "-"].includes(e.key) && e.preventDefault()} className="w-full px-2 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm" />
                      <span className="text-sm text-right font-medium text-text-primary">${(item.quantity * item.unitPrice).toFixed(2)}</span>
                      <button type="button" onClick={() => removeItem(idx)} className={`text-text-muted hover:text-danger p-1 ${items.length <= 1 ? "invisible" : ""}`}><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addItem} className="mt-3 flex items-center gap-1.5 text-sm text-accent hover:text-accent-hover font-medium">
                  <Plus size={16} /> {t("invoices.add_item")}
                </button>
              </div>

              <div className="text-right space-y-1 text-sm border-t border-dark-border pt-3">
                <div className="text-text-secondary">{t("invoices.subtotal")}: <span className="font-medium text-text-primary">${subtotal.toFixed(2)}</span></div>
                <div className="text-text-secondary">{t("invoices.tax")} ({form.taxRate}%): <span className="font-medium text-text-primary">${tax.toFixed(2)}</span></div>
                <div className="text-lg font-bold text-text-primary">{t("field.total")}: ${(subtotal + tax).toFixed(2)}</div>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">{t("field.notes")}</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg focus:ring-accent focus:border-accent" />
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-medium text-text-secondary bg-dark-card border border-dark-border rounded-lg hover:bg-dark-card-hover">{t("common.cancel")}</button>
                <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent-hover">{t("invoices.add")}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invoice List */}
      <div className="bg-dark-card rounded-xl border border-dark-border overflow-hidden">
        <table className="w-full">
          <thead className="bg-dark-bg/50">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase">{t("invoices.number")}</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase">{t("invoices.client")}</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase">{t("field.date")}</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase">{t("invoices.due_date")}</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase">{t("field.total")}</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-text-muted uppercase">{t("field.status")}</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dark-border/50">
            {invoices.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-text-muted">{t("invoices.empty")}</td></tr>
            ) : invoices.map(inv => (
              <tr key={inv.id} className="hover:bg-dark-card-hover">
                <td className="px-4 py-3 text-sm font-mono font-medium text-text-primary">{inv.number}</td>
                <td className="px-4 py-3 text-sm text-text-secondary">{inv.client.name}</td>
                <td className="px-4 py-3 text-sm text-text-secondary">{new Date(inv.date).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-sm text-text-secondary">
                  <div className="flex items-center gap-1.5">
                    {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : "-"}
                    {agingBadge(inv)}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-text-primary text-right font-medium">${inv.total.toFixed(2)}</td>
                <td className="px-4 py-3 text-center">
                  {!canEdit ? (
                    <span className={`text-xs px-2 py-1 rounded-full font-medium border ${
                      inv.status === "paid" ? "text-emerald-400 border-emerald-500/20" :
                      inv.status === "partially_paid" ? "text-amber-400 border-amber-500/20" :
                      inv.status === "sent" ? "text-blue-400 border-blue-500/20" :
                      inv.status === "overdue" ? "text-red-400 border-red-500/20" :
                      "text-slate-400 border-dark-border"
                    }`}>{inv.status === "partially_paid" ? "Partially Paid" : t(`status.${inv.status}`)}</span>
                  ) : (
                    <select value={inv.status} onChange={e => updateStatus(inv.id, e.target.value)} className={`text-xs px-2 py-1 rounded-full font-medium border cursor-pointer bg-dark-input ${
                      inv.status === "paid" ? "text-emerald-400 border-emerald-500/20" :
                      inv.status === "partially_paid" ? "text-amber-400 border-amber-500/20" :
                      inv.status === "sent" ? "text-blue-400 border-blue-500/20" :
                      inv.status === "overdue" ? "text-red-400 border-red-500/20" :
                      "text-slate-400 border-dark-border"
                    } disabled:opacity-50`}>
                      <option value="draft">{t("status.draft")}</option>
                      <option value="sent" disabled={!inv.client.email}>{t("status.sent")}{!inv.client.email ? ` ${t("invoices.no_email")}` : ""}</option>
                      <option value="partially_paid">Partially Paid</option>
                      <option value="paid">{t("status.paid")}</option>
                      <option value="overdue">{t("status.overdue")}</option>
                    </select>
                  )}
                </td>
                <td className="px-4 py-3 text-right space-x-1">
                  <button onClick={() => openViewInvoice(inv)} className="text-text-muted hover:text-accent p-1" title="View"><Eye size={16} /></button>
                  <button onClick={() => exportPDF(inv, inv.language || "fr")} className="text-text-muted hover:text-success p-1" title="Download PDF"><Download size={16} /></button>
                  {canEdit && <button onClick={() => handleDelete(inv.id)} className="text-text-muted hover:text-danger p-1" title="Delete"><Trash2 size={16} /></button>}
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
