"use client";

import { useMemo, useState } from "react";
import { Search, Plus, Minus, Trash2, Loader2, ShoppingCart, X } from "lucide-react";

export interface SimpleProduct {
  id: string;
  name: string;
  price: number;
  quantity: number;
  type: string;
  available?: boolean;
  components: { quantity: number; component: { quantity: number } }[];
  category?: { id: string; name: string } | null;
}
export interface SimpleClient {
  id: string;
  name: string;
}

interface Props {
  products: SimpleProduct[];
  clients: SimpleClient[];
  currencySymbol: string;
  fmtAmt: (n: number) => string;
  date: string;
  language: string;
  onClose: () => void;
  onSaved: (invoice: { id: string; total: number; amountPaid: number; status: string } & Record<string, unknown>) => void;
  onClientsRefresh: () => void;
}

// Effective sellable quantity: service → unlimited if available (else 0);
// simple → stored quantity; composite → bottleneck component.
function effectiveStock(p: SimpleProduct): number {
  if (p.type === "service") return p.available === false ? 0 : Infinity;
  if (p.type === "composite" && p.components.length > 0) {
    const ratios = p.components.filter(c => c.quantity > 0).map(c => c.component.quantity / c.quantity);
    return ratios.length > 0 ? Math.floor(Math.min(...ratios)) : 0;
  }
  return Math.floor(p.quantity);
}

export default function SimpleInvoiceForm({ products, clients, currencySymbol, fmtAmt, date, language, onClose, onSaved, onClientsRefresh }: Props) {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [clientId, setClientId] = useState("");
  const [clientQuery, setClientQuery] = useState("");
  const [clientOpen, setClientOpen] = useState(false);
  const [creatingClient, setCreatingClient] = useState(false);
  const [saving, setSaving] = useState<null | "save" | "pay">(null);
  const [error, setError] = useState("");

  const money = (n: number) => `${currencySymbol}${fmtAmt(n)}`;

  const categories = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of products) if (p.category) map.set(p.category.id, p.category.name);
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [products]);

  const stockById = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of products) m[p.id] = effectiveStock(p);
    return m;
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(p => {
      if (categoryId !== "all" && (p.category?.id ?? "") !== categoryId) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [products, search, categoryId]);

  const productById = useMemo(() => Object.fromEntries(products.map(p => [p.id, p])), [products]);
  const cartEntries = Object.entries(cart).filter(([, q]) => q > 0).map(([id, qty]) => ({ product: productById[id], qty }))
    .filter(e => e.product);
  const total = cartEntries.reduce((s, e) => s + e.product.price * e.qty, 0);
  const itemCount = cartEntries.reduce((s, e) => s + e.qty, 0);

  function addToCart(p: SimpleProduct) {
    const max = stockById[p.id] ?? 0;
    setCart(prev => {
      const cur = prev[p.id] ?? 0;
      if (cur >= max) return prev; // cannot exceed available stock
      return { ...prev, [p.id]: cur + 1 };
    });
  }
  function setQty(id: string, qty: number) {
    const max = stockById[id] ?? 0;
    const clamped = Math.max(0, Math.min(qty, max));
    setCart(prev => {
      const next = { ...prev };
      if (clamped <= 0) delete next[id]; else next[id] = clamped;
      return next;
    });
  }

  const clientMatches = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (!q) return clients.slice(0, 8);
    return clients.filter(c => c.name.toLowerCase().includes(q)).slice(0, 8);
  }, [clients, clientQuery]);
  const exactMatch = clients.some(c => c.name.toLowerCase() === clientQuery.trim().toLowerCase());

  function selectClient(c: SimpleClient) {
    setClientId(c.id);
    setClientQuery(c.name);
    setClientOpen(false);
  }
  async function createClient() {
    const name = clientQuery.trim();
    if (!name) return;
    setCreatingClient(true);
    setError("");
    try {
      const res = await fetch("/api/clients", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      if (!res.ok) { setError((await res.json().catch(() => ({})))?.error || "Failed to create customer"); return; }
      const c = await res.json();
      setClientId(c.id);
      setClientQuery(c.name);
      setClientOpen(false);
      onClientsRefresh();
    } finally {
      setCreatingClient(false);
    }
  }

  async function save(markPaid: boolean) {
    setError("");
    if (cartEntries.length === 0) { setError("Add at least one product."); return; }
    if (!clientId) { setError("Select or create a customer."); return; }
    setSaving(markPaid ? "pay" : "save");
    try {
      const payload = {
        clientId,
        date,
        taxRate: 0,
        discount: 0,
        language,
        status: "sent",
        items: cartEntries.map(e => ({ description: e.product.name, quantity: e.qty, unitPrice: e.product.price, productId: e.product.id })),
        fees: [],
      };
      const res = await fetch("/api/invoices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) { setError((await res.json().catch(() => ({})))?.error || "Failed to save invoice"); return; }
      const invoice = await res.json();
      let amountPaid = invoice.amountPaid || 0;
      let hasExcess = false;
      if (markPaid) {
        const remaining = invoice.total - amountPaid;
        if (remaining > 0) {
          const payRes = await fetch(`/api/invoices/${invoice.id}/payments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ amount: remaining, date, method: "cash" }),
          });
          if (payRes.ok) {
            const pr = await payRes.json();
            amountPaid += pr.amount;
            if (pr.excessAmount > 0) hasExcess = true;
          }
        }
      }
      const status = amountPaid >= invoice.total ? "paid" : amountPaid > 0 ? "partially_paid" : invoice.status;
      onSaved({ ...invoice, amountPaid, status });
      if (invoice.balanceApplied > 0 || hasExcess) onClientsRefresh();
      onClose();
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[78vh]">
      {/* LEFT 70% — product boxes */}
      <div className="lg:w-[70%] flex flex-col min-h-0">
        {/* search + categories */}
        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search products…"
              className="w-full pl-9 pr-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg text-sm focus:ring-1 focus:ring-accent focus:border-accent"
            />
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 mb-1">
          <button onClick={() => setCategoryId("all")} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border ${categoryId === "all" ? "bg-accent text-white border-accent" : "bg-dark-input text-text-secondary border-dark-border hover:text-text-primary"}`}>All</button>
          {categories.map(c => (
            <button key={c.id} onClick={() => setCategoryId(c.id)} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border ${categoryId === c.id ? "bg-accent text-white border-accent" : "bg-dark-input text-text-secondary border-dark-border hover:text-text-primary"}`}>{c.name}</button>
          ))}
        </div>

        {/* grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 overflow-y-auto pr-1 flex-1 content-start">
          {filteredProducts.length === 0 && (
            <p className="col-span-full text-center text-text-muted text-sm py-10">No products found.</p>
          )}
          {filteredProducts.map(p => {
            const stock = stockById[p.id] ?? 0;
            const inCart = cart[p.id] ?? 0;
            const out = stock <= 0;
            const maxed = inCart >= stock;
            return (
              <button
                key={p.id}
                onClick={() => addToCart(p)}
                disabled={out || maxed}
                className={`relative text-left p-3 rounded-xl border transition-colors min-h-[92px] flex flex-col justify-between ${
                  out || maxed
                    ? "bg-dark-input/40 border-dark-border opacity-55 cursor-not-allowed"
                    : "bg-dark-input border-dark-border hover:border-accent hover:bg-dark-card"
                }`}
              >
                {inCart > 0 && (
                  <span className="absolute -top-2 -right-2 bg-accent text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center shadow">{inCart}</span>
                )}
                <span className="text-sm font-semibold text-text-primary leading-tight line-clamp-2">{p.name}</span>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-sm font-bold text-accent">{money(p.price)}</span>
                  {p.type === "service" ? (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                      out ? "text-red-400 border-red-500/30 bg-red-500/10" : "text-sky-400 border-sky-500/30 bg-sky-500/10"
                    }`}>
                      {out ? "Unavailable" : "Service"}
                    </span>
                  ) : (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                      out ? "text-red-400 border-red-500/30 bg-red-500/10"
                      : stock <= 5 ? "text-yellow-400 border-yellow-500/30 bg-yellow-500/10"
                      : "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                    }`}>
                      {out ? "Out of stock" : `${stock} in stock`}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* RIGHT 30% — cart */}
      <div className="lg:w-[30%] flex flex-col min-h-0 bg-dark-bg/40 border border-dark-border rounded-xl p-3">
        {/* customer */}
        <div className="relative mb-3">
          <label className="block text-xs font-medium text-text-muted mb-1">Customer *</label>
          <input
            value={clientQuery}
            onChange={e => { setClientQuery(e.target.value); setClientId(""); setClientOpen(true); }}
            onFocus={() => setClientOpen(true)}
            placeholder="Search or add customer…"
            className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg text-sm focus:ring-1 focus:ring-accent focus:border-accent"
          />
          {clientOpen && (clientMatches.length > 0 || (clientQuery.trim() && !exactMatch)) && (
            <div className="absolute z-10 left-0 right-0 mt-1 bg-dark-card border border-dark-border rounded-lg shadow-lg max-h-52 overflow-y-auto">
              {clientMatches.map(c => (
                <button key={c.id} onClick={() => selectClient(c)} className="w-full text-left px-3 py-2 text-sm text-text-secondary hover:bg-dark-input hover:text-text-primary">{c.name}</button>
              ))}
              {clientQuery.trim() && !exactMatch && (
                <button onClick={createClient} disabled={creatingClient} className="w-full text-left px-3 py-2 text-sm text-accent hover:bg-dark-input flex items-center gap-2 border-t border-dark-border">
                  {creatingClient ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add &quot;{clientQuery.trim()}&quot;
                </button>
              )}
            </div>
          )}
          {clientId && <span className="inline-block mt-1 text-xs text-emerald-400">✓ {clientQuery}</span>}
        </div>

        {/* line items */}
        <div className="flex-1 overflow-y-auto min-h-0 -mx-1 px-1">
          {cartEntries.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-text-muted text-sm">
              <ShoppingCart size={28} className="mb-2 opacity-50" />
              Tap products to add them
            </div>
          ) : (
            <div className="space-y-2">
              {cartEntries.map(({ product, qty }) => (
                <div key={product.id} className="bg-dark-input border border-dark-border rounded-lg p-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-text-primary leading-tight">{product.name}</span>
                    <button onClick={() => setQty(product.id, 0)} className="text-text-muted hover:text-danger shrink-0"><Trash2 size={14} /></button>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setQty(product.id, qty - 1)} className="w-7 h-7 rounded-md bg-dark-card border border-dark-border text-text-secondary hover:text-text-primary flex items-center justify-center"><Minus size={13} /></button>
                      <span className="w-8 text-center text-sm font-semibold text-text-primary">{qty}</span>
                      <button onClick={() => setQty(product.id, qty + 1)} disabled={qty >= (stockById[product.id] ?? 0)} className="w-7 h-7 rounded-md bg-dark-card border border-dark-border text-text-secondary hover:text-text-primary flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"><Plus size={13} /></button>
                    </div>
                    <span className="text-sm font-semibold text-text-primary">{money(product.price * qty)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* total + actions */}
        <div className="border-t border-dark-border pt-3 mt-2">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-text-secondary">Total{itemCount > 0 ? ` (${itemCount} item${itemCount > 1 ? "s" : ""})` : ""}</span>
            <span className="text-2xl font-bold text-text-primary">{money(total)}</span>
          </div>
          {error && <p className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2 mb-2">{error}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => save(false)}
              disabled={saving !== null || cartEntries.length === 0 || !clientId}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-accent text-accent hover:bg-accent/10 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving === "save" ? <Loader2 size={16} className="animate-spin" /> : null} Save
            </button>
            <button
              onClick={() => save(true)}
              disabled={saving !== null || cartEntries.length === 0 || !clientId}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-accent text-white hover:bg-accent-hover text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving === "pay" ? <Loader2 size={16} className="animate-spin" /> : null} Save &amp; Pay
            </button>
          </div>
          <button onClick={onClose} className="w-full mt-2 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-text-muted hover:text-text-primary text-sm">
            <X size={14} /> Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
