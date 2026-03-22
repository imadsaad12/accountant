"use client";

import { useEffect, useState, useMemo } from "react";
import { Plus, Pencil, Trash2, X, Search, ChevronUp, ChevronDown } from "lucide-react";
import { PermissionGuard, usePermissions } from "@/components/PermissionGuard";
import { PhoneInput } from "@/components/PhoneInput";
import { useOrgSettings } from "@/components/OrgSettingsProvider";
import { useTranslation } from "@/components/LanguageProvider";

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  position: string;
  department: string | null;
  salary: number;
  salaryPeriod: string;
  currency: string;
  hireDate: string;
  status: string;
  address: string | null;
  notes: string | null;
}

type SortField = "name" | "position" | "department" | "salary" | "hireDate" | "";
type SortDir = "asc" | "desc";

const CURRENCIES = [
  { code: "USD", name: "US Dollar" },
  { code: "EUR", name: "Euro" },
  { code: "XOF", name: "CFA Franc (Senegal, Ivory Coast / Abidjan)" },
  { code: "GNF", name: "Guinean Franc (Guinea)" },
  { code: "SLE", name: "Leone (Sierra Leone)" },
  { code: "GHS", name: "Cedi (Ghana)" },
  { code: "CDF", name: "Congolese Franc (Kinshasa / DRC)" },
  { code: "NGN", name: "Naira (Nigeria)" },
];

const SALARY_PERIODS = [
  { value: "day", label: "Per Day" },
  { value: "week", label: "Per Week" },
  { value: "month", label: "Per Month" },
];

const emptyForm = { firstName: "", lastName: "", email: "", phone: "", position: "", department: "", salary: "", salaryPeriod: "month", currency: "USD", hireDate: "", status: "active", address: "", notes: "" };

export default function EmployeesPage() {
  const { canEditFeature } = usePermissions();
  const canEdit = canEditFeature("employees");
  const { orgSettings } = useOrgSettings();
  const t = useTranslation();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [sortField, setSortField] = useState<SortField>("");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => { loadEmployees(); }, []);

  async function loadEmployees() {
    setLoading(true);
    const res = await fetch("/api/employees");
    if (res.ok) setEmployees(await res.json());
    setLoading(false);
  }

  function openCreate() {
    setForm({ ...emptyForm, currency: orgSettings.defaultCurrency });
    setEditing(null);
    setShowForm(true);
  }

  function openEdit(emp: Employee) {
    setForm({
      firstName: emp.firstName,
      lastName: emp.lastName,
      email: emp.email,
      phone: emp.phone || "",
      position: emp.position,
      department: emp.department || "",
      salary: String(emp.salary),
      salaryPeriod: emp.salaryPeriod || "month",
      currency: orgSettings.defaultCurrency,
      hireDate: emp.hireDate ? emp.hireDate.split("T")[0] : "",
      status: emp.status,
      address: emp.address || "",
      notes: emp.notes || "",
    });
    setEditing(emp);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const url = editing ? `/api/employees/${editing.id}` : "/api/employees";
    const method = editing ? "PUT" : "POST";
    await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setShowForm(false);
    loadEmployees();
  }

  async function handleDelete(id: string) {
    if (!confirm(t("employees.delete_confirm"))) return;
    await fetch(`/api/employees/${id}`, { method: "DELETE" });
    loadEmployees();
  }

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  }

  const departments = useMemo(() => [...new Set(employees.map(e => e.department).filter(Boolean))] as string[], [employees]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return employees
      .filter(e =>
        (!q || `${e.firstName} ${e.lastName}`.toLowerCase().includes(q) || e.position.toLowerCase().includes(q) || (e.department || "").toLowerCase().includes(q) || (e.email || "").toLowerCase().includes(q)) &&
        (!filterStatus || e.status === filterStatus) &&
        (!filterDept || e.department === filterDept)
      )
      .sort((a, b) => {
        if (!sortField) return 0;
        let va: string | number = "";
        let vb: string | number = "";
        if (sortField === "name") { va = `${a.firstName} ${a.lastName}`.toLowerCase(); vb = `${b.firstName} ${b.lastName}`.toLowerCase(); }
        else if (sortField === "position") { va = a.position.toLowerCase(); vb = b.position.toLowerCase(); }
        else if (sortField === "department") { va = (a.department || "").toLowerCase(); vb = (b.department || "").toLowerCase(); }
        else if (sortField === "salary") { va = a.salary; vb = b.salary; }
        else if (sortField === "hireDate") { va = a.hireDate || ""; vb = b.hireDate || ""; }
        if (va < vb) return sortDir === "asc" ? -1 : 1;
        if (va > vb) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
  }, [employees, search, filterStatus, filterDept, sortField, sortDir]);

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ChevronUp size={12} className="opacity-30" />;
    return sortDir === "asc" ? <ChevronUp size={12} className="text-accent" /> : <ChevronDown size={12} className="text-accent" />;
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-2 border-accent border-t-transparent"></div></div>;

  return (
    <PermissionGuard feature="employees">
    <div>
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-text-primary">{t("employees.title")}</h1>
        {canEdit && (
          <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover text-sm font-medium">
            <Plus size={16} /> {t("employees.add")}
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
        <div className="flex flex-wrap gap-2">
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="flex-1 min-w-[140px] sm:flex-none px-3 py-2 bg-dark-card border border-dark-border text-text-primary rounded-lg text-sm focus:ring-accent focus:border-accent">
            <option value="">{t("common.all_statuses")}</option>
            <option value="active">{t("status.active")}</option>
            <option value="inactive">{t("status.inactive")}</option>
            <option value="on_leave">{t("status.on_leave")}</option>
          </select>
          {departments.length > 0 && (
            <select value={filterDept} onChange={e => setFilterDept(e.target.value)} className="flex-1 min-w-[140px] sm:flex-none px-3 py-2 bg-dark-card border border-dark-border text-text-primary rounded-lg text-sm focus:ring-accent focus:border-accent">
              <option value="">{t("common.all_departments")}</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-dark-card border border-dark-border rounded-2xl p-4 sm:p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-text-primary">{editing ? t("employees.edit") : t("employees.add")}</h2>
              <button onClick={() => setShowForm(false)} className="text-text-muted hover:text-text-primary"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">{t("employees.first_name")} *</label>
                  <input required value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg focus:ring-accent focus:border-accent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">{t("employees.last_name")} *</label>
                  <input required value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg focus:ring-accent focus:border-accent" />
                </div>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">{t("employees.position")} *</label>
                  <input required value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg focus:ring-accent focus:border-accent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">{t("employees.department")}</label>
                  <input value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg focus:ring-accent focus:border-accent" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">{t("employees.salary")} *</label>
                  <input required type="number" step="0.01" min="0" value={form.salary} onChange={e => setForm({ ...form, salary: e.target.value })} onKeyDown={e => ["e", "E", "+", "-"].includes(e.key) && e.preventDefault()} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg focus:ring-accent focus:border-accent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">Paid Every</label>
                  <select value={form.salaryPeriod} onChange={e => setForm({ ...form, salaryPeriod: e.target.value })} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg focus:ring-accent focus:border-accent">
                    {SALARY_PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">{t("employees.currency")}</label>
                  <input disabled value={orgSettings.defaultCurrency} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-muted rounded-lg cursor-not-allowed opacity-60" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">{t("employees.hire_date")}</label>
                  <input type="date" value={form.hireDate} onChange={e => setForm({ ...form, hireDate: e.target.value })} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg focus:ring-accent focus:border-accent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">{t("field.status")}</label>
                  <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg focus:ring-accent focus:border-accent">
                    <option value="active">{t("status.active")}</option>
                    <option value="inactive">{t("status.inactive")}</option>
                    <option value="on_leave">{t("status.on_leave")}</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">{t("field.address")}</label>
                <input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg focus:ring-accent focus:border-accent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">{t("field.notes")}</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg focus:ring-accent focus:border-accent" />
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-medium text-text-secondary bg-dark-card border border-dark-border rounded-lg hover:bg-dark-card-hover">{t("common.cancel")}</button>
                <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent-hover">{editing ? t("common.save") : t("employees.add")}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-dark-card rounded-xl border border-dark-border overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead className="bg-dark-bg/50">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase cursor-pointer select-none" onClick={() => toggleSort("name")}>
                <span className="inline-flex items-center gap-1">{t("field.name")} <SortIcon field="name" /></span>
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase cursor-pointer select-none" onClick={() => toggleSort("position")}>
                <span className="inline-flex items-center gap-1">{t("employees.position")} <SortIcon field="position" /></span>
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase cursor-pointer select-none" onClick={() => toggleSort("department")}>
                <span className="inline-flex items-center gap-1">{t("employees.department")} <SortIcon field="department" /></span>
              </th>
              <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase">{t("field.email")}</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase cursor-pointer select-none" onClick={() => toggleSort("salary")}>
                <span className="inline-flex items-center gap-1 justify-end">{t("employees.salary")} <SortIcon field="salary" /></span>
              </th>
              <th className="text-center px-4 py-3 text-xs font-medium text-text-muted uppercase">{t("field.status")}</th>
              {canEdit && <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase">{t("common.actions")}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-dark-border/50">
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-text-muted">{search || filterStatus || filterDept ? t("common.no_results") : t("employees.empty")}</td></tr>
            ) : filtered.map(emp => (
              <tr key={emp.id} className="hover:bg-dark-card-hover">
                <td className="px-4 py-3 text-sm font-medium text-text-primary">{emp.firstName} {emp.lastName}</td>
                <td className="px-4 py-3 text-sm text-text-secondary">{emp.position}</td>
                <td className="px-4 py-3 text-sm text-text-secondary">{emp.department || "-"}</td>
                <td className="px-4 py-3 text-sm text-text-secondary">{emp.email || "-"}</td>
                <td className="px-4 py-3 text-sm text-text-primary text-right font-medium">
                  {emp.salary.toLocaleString()} <span className="text-text-muted font-normal">{emp.currency || "USD"}</span>
                  <span className="text-text-muted font-normal text-xs ml-1">/{emp.salaryPeriod || "month"}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    emp.status === "active" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                    emp.status === "on_leave" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                    "bg-slate-500/10 text-slate-400"
                  }`}>{t(`status.${emp.status}`)}</span>
                </td>
                {canEdit && (
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openEdit(emp)} className="text-text-muted hover:text-accent p-1"><Pencil size={16} /></button>
                    <button onClick={() => handleDelete(emp.id)} className="text-text-muted hover:text-danger p-1 ml-1"><Trash2 size={16} /></button>
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
