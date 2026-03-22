"use client";

import { useEffect, useState, useMemo } from "react";
import { Plus, Pencil, Trash2, X, Search, ChevronUp, ChevronDown, Loader2 } from "lucide-react";
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
  _count?: { invoices: number };
}

type SortField = "name" | "email" | "city" | "invoices" | "";
type SortDir = "asc" | "desc";

const emptyClient = { name: "", email: "", phone: "", address: "", city: "", country: "", notes: "" };

export default function ClientsPage() {
  const { canEditFeature } = usePermissions();
  const canEdit = canEditFeature("clients");
  const { orgSettings } = useOrgSettings();
  const t = useTranslation();
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

  useEffect(() => { loadClients(); }, []);

  async function loadClients() {
    setLoading(true);
    const res = await fetch("/api/clients");
    setClients(await res.json());
    setLoading(false);
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
      setShowForm(false);
      loadClients();
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
    loadClients();
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
        if (va < vb) return sortDir === "asc" ? -1 : 1;
        if (va > vb) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
  }, [clients, search, filterCity, sortField, sortDir]);

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ChevronUp size={12} className="opacity-30" />;
    return sortDir === "asc" ? <ChevronUp size={12} className="text-accent" /> : <ChevronDown size={12} className="text-accent" />;
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-2 border-accent border-t-transparent"></div></div>;

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
              <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase cursor-pointer select-none" onClick={() => toggleSort("invoices")}>
                <span className="inline-flex items-center gap-1">{t("clients.invoices")} <SortIcon field="invoices" /></span>
              </th>
              {canEdit && <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase">{t("common.actions")}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-dark-border/50">
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-text-muted">{search || filterCity ? t("common.no_results") : t("clients.empty")}</td></tr>
            ) : filtered.map(client => (
              <tr key={client.id} className="hover:bg-dark-card-hover">
                <td className="px-4 py-3 text-sm font-medium text-text-primary">{client.name}</td>
                <td className="px-4 py-3 text-sm text-text-secondary">{client.email || "-"}</td>
                <td className="px-4 py-3 text-sm text-text-secondary">{client.phone || "-"}</td>
                <td className="px-4 py-3 text-sm text-text-secondary">{client.city || "-"}</td>
                <td className="px-4 py-3 text-sm text-text-muted">{client._count?.invoices || 0}</td>
                {canEdit && (
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openEdit(client)} className="text-text-muted hover:text-accent p-1"><Pencil size={16} /></button>
                    <button onClick={() => handleDelete(client.id)} className="text-text-muted hover:text-danger p-1 ml-1"><Trash2 size={16} /></button>
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
