"use client";

import { useEffect, useState, useMemo } from "react";
import { Plus, Pencil, Trash2, X, AlertTriangle, Search, ChevronUp, ChevronDown, Loader2, Layers, Package } from "lucide-react";
import { TablePageSkeleton } from "@/components/skeletons/TablePageSkeleton";
import { PermissionGuard, usePermissions } from "@/components/PermissionGuard";
import { useOrgSettings, currencySymbol } from "@/components/OrgSettingsProvider";
import { useTranslation } from "@/components/LanguageProvider";

interface ComponentInfo {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  cost: number;
}

interface ProductComponent {
  id: string;
  componentId: string;
  quantity: number;
  component: ComponentInfo;
}

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
  type: string;
  categoryId: string | null;
  category: { id: string; name: string } | null;
  components: ProductComponent[];
}

interface Category {
  id: string;
  name: string;
}

interface ComponentRow {
  componentId: string;
  quantity: string;
}

type SortField = "name" | "sku" | "category" | "price" | "quantity" | "";
type SortDir = "asc" | "desc";

const emptySimpleProduct = { name: "", sku: "", description: "", price: "", cost: "", quantity: "", minStock: "5", unit: "piece", categoryId: "" };

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

const fmtAmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function canMakeQty(product: Product): number {
  if (product.type !== "composite" || !product.components.length) return 0;
  return Math.floor(Math.min(...product.components.map(c => c.component.quantity / c.quantity)));
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
  const [productType, setProductType] = useState<"simple" | "composite">("simple");
  const [form, setForm] = useState(emptySimpleProduct);
  const [formComponents, setFormComponents] = useState<ComponentRow[]>([{ componentId: "", quantity: "1" }]);
  const [formError, setFormError] = useState<string | null>(null);
  const [skuAuto, setSkuAuto] = useState(true);
  const [newCategory, setNewCategory] = useState("");
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterStock, setFilterStock] = useState<"all" | "low" | "ok">("all");
  const [filterType, setFilterType] = useState<"all" | "simple" | "composite">("all");
  const [sortField, setSortField] = useState<SortField>("");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [prodRes, catRes] = await Promise.all([fetch("/api/products"), fetch("/api/categories")]);
    if (prodRes.ok) setProducts(await prodRes.json());
    if (catRes.ok) setCategories(await catRes.json());
    setLoading(false);
  }

  function openCreate() {
    setForm(emptySimpleProduct);
    setProductType("simple");
    setFormComponents([{ componentId: "", quantity: "1" }]);
    setEditing(null);
    setSkuAuto(true);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(product: Product) {
    setSkuAuto(false);
    setFormError(null);
    setProductType(product.type === "composite" ? "composite" : "simple");
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
    setFormComponents(
      product.components.length > 0
        ? product.components.map(c => ({ componentId: c.componentId, quantity: String(c.quantity) }))
        : [{ componentId: "", quantity: "1" }]
    );
    setEditing(product);
    setShowForm(true);
  }

  // Auto-compute cost for composite from components
  const computedCost = useMemo(() => {
    if (productType !== "composite") return 0;
    return formComponents.reduce((sum, row) => {
      const prod = products.find(p => p.id === row.componentId);
      if (!prod) return sum;
      return sum + prod.cost * (parseFloat(row.quantity) || 0);
    }, 0);
  }, [productType, formComponents, products]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (productType === "simple") {
      const price = parseFloat(form.price);
      const cost = parseFloat(form.cost) || 0;
      if (cost > 0 && price < cost) {
        setFormError(t("stock.price_greater_than_cost"));
        return;
      }
    }

    if (productType === "composite") {
      const valid = formComponents.filter(c => c.componentId && parseFloat(c.quantity) > 0);
      if (valid.length === 0) {
        setFormError(t("stock.composite_needs_components"));
        return;
      }
      // Check for duplicate components
      const ids = valid.map(c => c.componentId);
      if (new Set(ids).size !== ids.length) {
        setFormError(t("stock.composite_duplicate_component"));
        return;
      }
    }

    setSaving(true);
    try {
      const validComponents = formComponents.filter(c => c.componentId && parseFloat(c.quantity) > 0);
      const payload = productType === "composite"
        ? {
            name: form.name,
            sku: form.sku,
            description: form.description,
            price: parseFloat(form.price),
            cost: computedCost,
            quantity: 0,
            minStock: parseInt(form.minStock) || 0,
            unit: form.unit,
            type: "composite",
            categoryId: form.categoryId || null,
            components: validComponents.map(c => ({ componentId: c.componentId, quantity: parseFloat(c.quantity) })),
          }
        : {
            name: form.name,
            sku: form.sku,
            description: form.description,
            price: parseFloat(form.price),
            cost: parseFloat(form.cost) || 0,
            quantity: parseFloat(form.quantity) || 0,
            minStock: parseInt(form.minStock) || 0,
            unit: form.unit,
            type: "simple",
            categoryId: form.categoryId || null,
          };

      const url = editing ? `/api/products/${editing.id}` : "/api/products";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) {
        const d = await res.json();
        setFormError(d.error || t("common.error"));
        return;
      }
      setShowForm(false);
      loadData();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(t("stock.delete_confirm"))) return;
    const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
    if (!res.ok) { const d = await res.json(); alert(d.error || t("common.error")); return; }
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

  // Simple products only — composites can't be components of composites
  const simpleProducts = useMemo(() => products.filter(p => p.type === "simple"), [products]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products
      .filter(p =>
        (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.category?.name || "").toLowerCase().includes(q)) &&
        (!filterCategory || p.categoryId === filterCategory) &&
        (filterType === "all" || p.type === filterType) &&
        (filterStock === "all" ||
          (filterStock === "low"
            ? (p.type === "composite" ? canMakeQty(p) <= p.minStock : p.quantity <= p.minStock)
            : (p.type === "composite" ? canMakeQty(p) > p.minStock : p.quantity > p.minStock)))
      )
      .sort((a, b) => {
        if (!sortField) return 0;
        let va: string | number = "";
        let vb: string | number = "";
        if (sortField === "name") { va = a.name.toLowerCase(); vb = b.name.toLowerCase(); }
        else if (sortField === "sku") { va = a.sku.toLowerCase(); vb = b.sku.toLowerCase(); }
        else if (sortField === "category") { va = (a.category?.name || "").toLowerCase(); vb = (b.category?.name || "").toLowerCase(); }
        else if (sortField === "price") { va = a.price; vb = b.price; }
        else if (sortField === "quantity") {
          va = a.type === "composite" ? canMakeQty(a) : a.quantity;
          vb = b.type === "composite" ? canMakeQty(b) : b.quantity;
        }
        if (va < vb) return sortDir === "asc" ? -1 : 1;
        if (va > vb) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
  }, [products, search, filterCategory, filterStock, filterType, sortField, sortDir]);

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ChevronUp size={12} className="opacity-30" />;
    return sortDir === "asc" ? <ChevronUp size={12} className="text-accent" /> : <ChevronDown size={12} className="text-accent" />;
  }

  if (loading) return <TablePageSkeleton rows={8} hasFilters cols={6} />;

  return (
    <PermissionGuard feature="products">
    <div>
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-text-primary">{t("stock.title")}</h1>
        {canEdit && (
          <div className="flex gap-2">
            <button onClick={() => setShowCategoryForm(true)} className="flex items-center gap-1 px-2 py-1.5 sm:gap-1.5 sm:px-3 sm:py-2 bg-dark-card text-text-secondary border border-dark-border rounded-lg hover:bg-dark-card-hover text-xs sm:text-sm font-medium">
              <Plus size={14} /> {t("stock.add_category")}
            </button>
            <button onClick={openCreate} className="flex items-center gap-1 px-2 py-1.5 sm:gap-1.5 sm:px-3 sm:py-2 bg-accent text-white rounded-lg hover:bg-accent-hover text-xs sm:text-sm font-medium">
              <Plus size={14} /> {t("stock.add")}
            </button>
          </div>
        )}
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
        <div className="flex flex-wrap gap-2">
          {categories.length > 0 && (
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="flex-1 min-w-[130px] sm:flex-none px-3 py-2 bg-dark-card border border-dark-border text-text-primary rounded-lg text-sm focus:ring-accent focus:border-accent">
              <option value="">{t("common.all_categories")}</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <select value={filterType} onChange={e => setFilterType(e.target.value as "all" | "simple" | "composite")} className="flex-1 min-w-[120px] sm:flex-none px-3 py-2 bg-dark-card border border-dark-border text-text-primary rounded-lg text-sm focus:ring-accent focus:border-accent">
            <option value="all">{t("stock.filter.all_types")}</option>
            <option value="simple">{t("stock.filter.simple")}</option>
            <option value="composite">{t("stock.filter.composite")}</option>
          </select>
          <select value={filterStock} onChange={e => setFilterStock(e.target.value as "all" | "low" | "ok")} className="flex-1 min-w-[120px] sm:flex-none px-3 py-2 bg-dark-card border border-dark-border text-text-primary rounded-lg text-sm focus:ring-accent focus:border-accent">
            <option value="all">{t("stock.filter.all")}</option>
            <option value="low">{t("stock.filter.low")}</option>
            <option value="ok">{t("stock.filter.ok")}</option>
          </select>
        </div>
      </div>

      {/* Category Modal */}
      {showCategoryForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-dark-card border border-dark-border rounded-2xl p-4 sm:p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-text-primary">{t("stock.new_category")}</h2>
              <button onClick={() => setShowCategoryForm(false)} className="text-text-muted hover:text-text-primary"><X size={20} /></button>
            </div>
            <form onSubmit={handleAddCategory} className="space-y-4">
              <input required value={newCategory} onChange={e => setNewCategory(e.target.value)} placeholder={t("stock.category_placeholder")} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg focus:ring-accent focus:border-accent" />
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowCategoryForm(false)} className="px-4 py-2 text-sm font-medium text-text-secondary bg-dark-card border border-dark-border rounded-lg hover:bg-dark-card-hover">{t("common.cancel")}</button>
                <button type="submit" className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent-hover">
                  {t("stock.add_category")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add/Edit Product Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-dark-card border border-dark-border rounded-2xl p-4 sm:p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-text-primary">{editing ? t("stock.edit") : t("stock.add")}</h2>
              <button onClick={() => setShowForm(false)} className="text-text-muted hover:text-text-primary"><X size={20} /></button>
            </div>

            {/* Type Toggle — only when creating */}
            {!editing && (
              <div className="flex gap-2 mb-5 p-1 bg-dark-bg rounded-xl border border-dark-border">
                <button
                  type="button"
                  onClick={() => setProductType("simple")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${productType === "simple" ? "bg-accent text-white" : "text-text-muted hover:text-text-primary"}`}
                >
                  <Package size={15} /> {t("stock.type.simple")}
                </button>
                <button
                  type="button"
                  onClick={() => setProductType("composite")}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${productType === "composite" ? "bg-accent text-white" : "text-text-muted hover:text-text-primary"}`}
                >
                  <Layers size={15} /> {t("stock.type.composite")}
                </button>
              </div>
            )}

            {/* Composite type badge when editing */}
            {editing && editing.type === "composite" && (
              <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-purple-500/10 border border-purple-500/20 rounded-lg">
                <Layers size={14} className="text-purple-400" />
                <span className="text-sm text-purple-400 font-medium">{t("stock.type.composite")}</span>
                <span className="text-xs text-text-muted ml-1">{t("stock.composite_type_fixed")}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name + SKU */}
              {editing ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

              {/* Price + Cost */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">{t("stock.unit_price")} *</label>
                  <input required type="number" step="0.01" min="0" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} onKeyDown={e => ["e", "E", "+", "-"].includes(e.key) && e.preventDefault()} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg focus:ring-accent focus:border-accent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    {t("stock.cost_price")}
                    {productType === "composite" && <span className="text-xs text-text-muted ml-1">({t("stock.auto_computed")})</span>}
                  </label>
                  {productType === "composite" ? (
                    <div className="w-full px-3 py-2 bg-dark-bg border border-dark-border text-text-muted rounded-lg text-sm cursor-not-allowed">
                      {currSym}{fmtAmt(computedCost)}
                    </div>
                  ) : (
                    <input type="number" step="0.01" min="0" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} onKeyDown={e => ["e", "E", "+", "-"].includes(e.key) && e.preventDefault()} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg focus:ring-accent focus:border-accent" />
                  )}
                </div>
              </div>

              {/* Quantity + Min Stock + Unit (simple only shows qty, composite hides qty) */}
              <div className={`grid gap-4 ${productType === "simple" ? "grid-cols-3" : "grid-cols-2"}`}>
                {productType === "simple" && (
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-1">{t("field.quantity")}</label>
                    <input type="number" min="0" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} onKeyDown={e => ["e", "E", "+", "-", "."].includes(e.key) && e.preventDefault()} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg focus:ring-accent focus:border-accent" />
                  </div>
                )}
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
                    <option value="set">Set</option>
                  </select>
                </div>
              </div>

              {/* Category */}
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

              {/* Components — composite only */}
              {productType === "composite" && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-text-secondary">{t("stock.components")} *</label>
                    <button
                      type="button"
                      onClick={() => setFormComponents(prev => [...prev, { componentId: "", quantity: "1" }])}
                      className="flex items-center gap-1 text-xs text-accent hover:text-accent-hover font-medium"
                    >
                      <Plus size={13} /> {t("stock.add_component")}
                    </button>
                  </div>
                  <div className="space-y-2">
                    {formComponents.map((row, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <select
                          value={row.componentId}
                          onChange={e => {
                            const updated = [...formComponents];
                            updated[idx] = { ...updated[idx], componentId: e.target.value };
                            setFormComponents(updated);
                          }}
                          className="flex-1 px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm focus:ring-accent focus:border-accent"
                        >
                          <option value="">{t("stock.select_component")}</option>
                          {simpleProducts
                            .filter(p => !editing || p.id !== editing.id)
                            .map(p => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({p.quantity} {p.unit} {t("stock.in_stock_short")})
                              </option>
                            ))}
                        </select>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={row.quantity}
                          onChange={e => {
                            const updated = [...formComponents];
                            updated[idx] = { ...updated[idx], quantity: e.target.value };
                            setFormComponents(updated);
                          }}
                          onKeyDown={e => ["e", "E", "+", "-"].includes(e.key) && e.preventDefault()}
                          placeholder="Qty"
                          className="w-20 px-2 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg text-sm focus:ring-accent focus:border-accent"
                        />
                        {row.componentId && (
                          <span className="text-xs text-text-muted w-10 text-center shrink-0">
                            {simpleProducts.find(p => p.id === row.componentId)?.unit ?? ""}
                          </span>
                        )}
                        {formComponents.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setFormComponents(prev => prev.filter((_, i) => i !== idx))}
                            className="text-text-muted hover:text-danger p-1"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-text-muted">{t("stock.composite_hint")}</p>
                </div>
              )}

              {formError && (
                <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">{formError}</p>
              )}
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-medium text-text-secondary bg-dark-card border border-dark-border rounded-lg hover:bg-dark-card-hover">{t("common.cancel")}</button>
                <button type="submit" disabled={saving} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent-hover disabled:opacity-60">
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {editing ? t("common.save") : t("stock.add")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-dark-card rounded-xl border border-dark-border overflow-x-auto">
        <table className="w-full min-w-[580px]">
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
            ) : filtered.map(product => {
              const isComposite = product.type === "composite";
              const effectiveQty = isComposite ? canMakeQty(product) : product.quantity;
              const isLow = effectiveQty <= product.minStock;
              return (
                <tr key={product.id} className="hover:bg-dark-card-hover">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {isComposite && (
                        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 font-medium shrink-0">
                          <Layers size={9} /> {t("stock.composite_badge")}
                        </span>
                      )}
                      <div>
                        <div className="text-sm font-medium text-text-primary">{product.name}</div>
                        {product.description && <div className="text-xs text-text-muted">{product.description}</div>}
                        {isComposite && product.components.length > 0 && (
                          <div className="text-xs text-text-muted mt-0.5">
                            {product.components.map(c => `${c.quantity}× ${c.component.name}`).join(", ")}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary font-mono">{product.sku}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{product.category?.name || "-"}</td>
                  <td className="px-4 py-3 text-sm text-text-primary text-right font-medium">{currSym}{fmtAmt(product.price)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`inline-flex items-center gap-1 text-sm font-medium ${isLow ? "text-danger" : "text-success"}`}>
                      {isLow && <AlertTriangle size={14} />}
                      {effectiveQty} {product.unit}
                      {isComposite && <span className="text-xs text-text-muted font-normal ml-1">({t("stock.can_make")})</span>}
                    </span>
                  </td>
                  {canEdit && (
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => openEdit(product)} className="text-text-muted hover:text-accent p-1"><Pencil size={16} /></button>
                      <button onClick={() => handleDelete(product.id)} className="text-text-muted hover:text-danger p-1 ml-1"><Trash2 size={16} /></button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
    </PermissionGuard>
  );
}
