"use client";

import { useEffect, useState, useMemo } from "react";
import { Plus, Pencil, Trash2, X, AlertTriangle, Search, ChevronUp, ChevronDown } from "lucide-react";
import { PermissionGuard, usePermissions } from "@/components/PermissionGuard";
import { useOrgSettings, currencySymbol } from "@/components/OrgSettingsProvider";
import { useTranslation } from "@/components/LanguageProvider";

interface Product {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  price: number;
  cost: number;
  quantity: number;
  minStock: number;
  unit: string;
  categoryId: string | null;
  category: { id: string; name: string } | null;
}

interface Category {
  id: string;
  name: string;
}

type SortField = "name" | "sku" | "category" | "price" | "quantity";
type SortDir = "asc" | "desc";

const emptyProduct = { name: "", sku: "", description: "", price: "", cost: "", quantity: "", minStock: "5", unit: "piece", categoryId: "" };

function generateSKU(categoryName: string, existingProducts: { sku: string }[]): string {
  if (!categoryName.trim()) return "";
  const words = categoryName.trim().split(/\s+/);
  let prefix: string;
  if (words.length === 1) {
    prefix = words[0].replace(/[^A-Za-z0-9]/g, "").slice(0, 4).toUpperCase();
  } else {
    prefix = words.slice(0, 3).map(w => w.replace(/[^A-Za-z0-9]/g, "")[0] ?? "").join("").toUpperCase();
  }
  if (!prefix) prefix = "PRD";

  const taken = existingProducts
    .map(p => p.sku)
    .filter(s => s.startsWith(prefix + "-"))
    .map(s => parseInt(s.slice(prefix.length + 1)))
    .filter(n => !isNaN(n));

  const next = taken.length > 0 ? Math.max(...taken) + 1 : 1;
  return `${prefix}-${String(next).padStart(3, "0")}`;
}

export default function StockPage() {
  const { canEditFeature } = usePermissions();
  const canEdit = canEditFeature("products");
  const { orgSettings } = useOrgSettings();
  const currSym = currencySymbol(orgSettings.defaultCurrency);
  const t = useTranslation();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyProduct);
  const [formError, setFormError] = useState<string | null>(null);
  const [skuAuto, setSkuAuto] = useState(true);
  const [newCategory, setNewCategory] = useState("");
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterStock, setFilterStock] = useState<"all" | "low" | "ok">("all");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [prodRes, catRes] = await Promise.all([fetch("/api/products"), fetch("/api/categories")]);
    if (prodRes.ok) setProducts(await prodRes.json());
    if (catRes.ok) setCategories(await catRes.json());
    setLoading(false);
  }

  function openCreate() {
    setForm(emptyProduct);
    setEditing(null);
    setSkuAuto(true);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(product: Product) {
    setSkuAuto(false);
    setFormError(null);
    setForm({
      name: product.name,
      sku: product.sku,
      description: product.description || "",
      price: String(product.price),
      cost: String(product.cost),
      quantity: String(product.quantity),
      minStock: String(product.minStock),
      unit: product.unit,
      categoryId: product.categoryId || "",
    });
    setEditing(product);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const price = parseFloat(form.price);
    const cost = parseFloat(form.cost) || 0;
    if (cost > 0 && price <= cost) {
      setFormError(t("stock.price_greater_than_cost"));
      return;
    }
    const payload = {
      ...form,
      price,
      cost,
      quantity: parseInt(form.quantity) || 0,
      minStock: parseInt(form.minStock) || 0,
      categoryId: form.categoryId || null,
    };
    const url = editing ? `/api/products/${editing.id}` : "/api/products";
    const method = editing ? "PUT" : "POST";
    await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setShowForm(false);
    loadData();
  }

  async function handleDelete(id: string) {
    if (!confirm(t("stock.delete_confirm"))) return;
    await fetch(`/api/products/${id}`, { method: "DELETE" });
    loadData();
  }

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newCategory }) });
    if (!res.ok) return;
    setNewCategory("");
    setShowCategoryForm(false);
    const [prodRes, catRes] = await Promise.all([fetch("/api/products"), fetch("/api/categories")]);
    setProducts(await prodRes.json());
    setCategories(await catRes.json());
  }

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products
      .filter(p =>
        (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.category?.name || "").toLowerCase().includes(q)) &&
        (!filterCategory || p.categoryId === filterCategory) &&
        (filterStock === "all" || (filterStock === "low" ? p.quantity <= p.minStock : p.quantity > p.minStock))
      )
      .sort((a, b) => {
        let va: string | number = "";
        let vb: string | number = "";
        if (sortField === "name") { va = a.name.toLowerCase(); vb = b.name.toLowerCase(); }
        else if (sortField === "sku") { va = a.sku.toLowerCase(); vb = b.sku.toLowerCase(); }
        else if (sortField === "category") { va = (a.category?.name || "").toLowerCase(); vb = (b.category?.name || "").toLowerCase(); }
        else if (sortField === "price") { va = a.price; vb = b.price; }
        else if (sortField === "quantity") { va = a.quantity; vb = b.quantity; }
        if (va < vb) return sortDir === "asc" ? -1 : 1;
        if (va > vb) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
  }, [products, search, filterCategory, filterStock, sortField, sortDir]);

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ChevronUp size={12} className="opacity-30" />;
    return sortDir === "asc" ? <ChevronUp size={12} className="text-accent" /> : <ChevronDown size={12} className="text-accent" />;
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-2 border-accent border-t-transparent"></div></div>;

  return (
    <PermissionGuard feature="products">
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-text-primary">{t("stock.title")}</h1>
        {canEdit && (
          <div className="flex gap-2">
            <button onClick={() => setShowCategoryForm(true)} className="flex items-center gap-2 px-4 py-2 bg-dark-card text-text-secondary border border-dark-border rounded-lg hover:bg-dark-card-hover text-sm font-medium">
              <Plus size={18} /> {t("stock.add_category")}
            </button>
            <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover text-sm font-medium">
              <Plus size={18} /> {t("stock.add")}
            </button>
          </div>
        )}
      </div>

      {/* Search & Filter Bar */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t("common.search")}
            className="w-full pl-9 pr-3 py-2 bg-dark-card border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg text-sm focus:ring-accent focus:border-accent"
          />
        </div>
        {categories.length > 0 && (
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="px-3 py-2 bg-dark-card border border-dark-border text-text-primary rounded-lg text-sm focus:ring-accent focus:border-accent">
            <option value="">{t("common.all_categories")}</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <select value={filterStock} onChange={e => setFilterStock(e.target.value as "all" | "low" | "ok")} className="px-3 py-2 bg-dark-card border border-dark-border text-text-primary rounded-lg text-sm focus:ring-accent focus:border-accent">
          <option value="all">{t("stock.filter.all")}</option>
          <option value="low">{t("stock.filter.low")}</option>
          <option value="ok">{t("stock.filter.ok")}</option>
        </select>
      </div>

      {showCategoryForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-dark-card border border-dark-border rounded-2xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-text-primary">{t("stock.new_category")}</h2>
              <button onClick={() => setShowCategoryForm(false)} className="text-text-muted hover:text-text-primary"><X size={20} /></button>
            </div>
            <form onSubmit={handleAddCategory} className="space-y-4">
              <input required value={newCategory} onChange={e => setNewCategory(e.target.value)} placeholder={t("stock.category_placeholder")} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg focus:ring-accent focus:border-accent" />
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowCategoryForm(false)} className="px-4 py-2 text-sm font-medium text-text-secondary bg-dark-card border border-dark-border rounded-lg hover:bg-dark-card-hover">{t("common.cancel")}</button>
                <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent-hover">{t("stock.add_category")}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-dark-card border border-dark-border rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-text-primary">{editing ? t("stock.edit") : t("stock.add")}</h2>
              <button onClick={() => setShowForm(false)} className="text-text-muted hover:text-text-primary"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              {editing ? (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">{t("field.name")} *</label>
                    <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg focus:ring-accent focus:border-accent" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">{t("stock.sku")}</label>
                    <input readOnly value={form.sku} className="w-full px-3 py-2 bg-dark-bg border border-dark-border text-text-muted rounded-lg font-mono text-sm cursor-not-allowed" />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">{t("field.name")} *</label>
                  <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg focus:ring-accent focus:border-accent" />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">{t("field.description")}</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg focus:ring-accent focus:border-accent" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">{t("stock.unit_price")} *</label>
                  <input required type="number" step="0.01" min="0" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} onKeyDown={e => ["e", "E", "+", "-"].includes(e.key) && e.preventDefault()} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg focus:ring-accent focus:border-accent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">{t("stock.cost_price")}</label>
                  <input type="number" step="0.01" min="0" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} onKeyDown={e => ["e", "E", "+", "-"].includes(e.key) && e.preventDefault()} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg focus:ring-accent focus:border-accent" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">{t("field.quantity")}</label>
                  <input type="number" min="0" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} onKeyDown={e => ["e", "E", "+", "-", "."].includes(e.key) && e.preventDefault()} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg focus:ring-accent focus:border-accent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">{t("stock.min_stock")}</label>
                  <input type="number" min="0" value={form.minStock} onChange={e => setForm({ ...form, minStock: e.target.value })} onKeyDown={e => ["e", "E", "+", "-", "."].includes(e.key) && e.preventDefault()} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg focus:ring-accent focus:border-accent" />
                  <p className="mt-1 text-xs text-text-muted">{t("stock.low_stock_hint")}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">{t("stock.unit")}</label>
                  <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg focus:ring-accent focus:border-accent">
                    <option value="piece">{t("stock.unit.piece")}</option>
                    <option value="kg">{t("stock.unit.kg")}</option>
                    <option value="liter">{t("stock.unit.liter")}</option>
                    <option value="meter">{t("stock.unit.meter")}</option>
                    <option value="box">{t("stock.unit.box")}</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">{t("stock.category")}</label>
                <select
                  value={form.categoryId}
                  onChange={e => {
                    const catId = e.target.value;
                    const cat = categories.find(c => c.id === catId);
                    setForm(f => ({
                      ...f,
                      categoryId: catId,
                      sku: skuAuto && !editing ? (cat ? generateSKU(cat.name, products) : "") : f.sku,
                    }));
                  }}
                  className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg focus:ring-accent focus:border-accent"
                >
                  <option value="">{t("stock.no_category")}</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              {formError && (
                <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">{formError}</p>
              )}
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-medium text-text-secondary bg-dark-card border border-dark-border rounded-lg hover:bg-dark-card-hover">{t("common.cancel")}</button>
                <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent-hover">{editing ? t("common.save") : t("stock.add")}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-dark-card rounded-xl border border-dark-border overflow-hidden">
        <table className="w-full">
          <thead className="bg-dark-bg/50">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase cursor-pointer select-none" onClick={() => toggleSort("name")}>
                <span className="inline-flex items-center gap-1">{t("invoices.product")} <SortIcon field="name" /></span>
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase cursor-pointer select-none" onClick={() => toggleSort("sku")}>
                <span className="inline-flex items-center gap-1">{t("stock.sku")} <SortIcon field="sku" /></span>
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase cursor-pointer select-none" onClick={() => toggleSort("category")}>
                <span className="inline-flex items-center gap-1">{t("stock.category")} <SortIcon field="category" /></span>
              </th>
              <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase cursor-pointer select-none" onClick={() => toggleSort("price")}>
                <span className="inline-flex items-center gap-1 justify-end">{t("field.price")} <SortIcon field="price" /></span>
              </th>
              <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase cursor-pointer select-none" onClick={() => toggleSort("quantity")}>
                <span className="inline-flex items-center gap-1 justify-end">{t("stock.in_stock")} <SortIcon field="quantity" /></span>
              </th>
              {canEdit && <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase">{t("common.actions")}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-dark-border/50">
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-text-muted">{search || filterCategory || filterStock !== "all" ? t("common.no_results") : t("stock.empty")}</td></tr>
            ) : filtered.map(product => (
              <tr key={product.id} className="hover:bg-dark-card-hover">
                <td className="px-4 py-3">
                  <div className="text-sm font-medium text-text-primary">{product.name}</div>
                  {product.description && <div className="text-xs text-text-muted">{product.description}</div>}
                </td>
                <td className="px-4 py-3 text-sm text-text-secondary font-mono">{product.sku}</td>
                <td className="px-4 py-3 text-sm text-text-secondary">{product.category?.name || "-"}</td>
                <td className="px-4 py-3 text-sm text-text-primary text-right font-medium">{currSym}{product.price.toFixed(2)}</td>
                <td className="px-4 py-3 text-right">
                  <span className={`inline-flex items-center gap-1 text-sm font-medium ${product.quantity <= product.minStock ? "text-danger" : "text-success"}`}>
                    {product.quantity <= product.minStock && <AlertTriangle size={14} />}
                    {product.quantity} {product.unit}
                  </span>
                </td>
                {canEdit && (
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openEdit(product)} className="text-text-muted hover:text-accent p-1"><Pencil size={16} /></button>
                    <button onClick={() => handleDelete(product.id)} className="text-text-muted hover:text-danger p-1 ml-1"><Trash2 size={16} /></button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
    </PermissionGuard>
  );
}
