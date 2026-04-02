"use client";

import { useEffect, useState, useMemo } from "react";
import { Plus, Pencil, Trash2, X, Search, ChevronUp, ChevronDown, Loader2, Users, DollarSign, Calendar, Download } from "lucide-react";
import { TablePageSkeleton } from "@/components/skeletons/TablePageSkeleton";
import { PermissionGuard, usePermissions } from "@/components/PermissionGuard";
import { PhoneInput } from "@/components/PhoneInput";
import { useOrgSettings, useOrgTimezone } from "@/components/OrgSettingsProvider";
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
  outstandingAdvance: number;
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
  const tz = useOrgTimezone();
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
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  useEffect(() => { loadEmployees(); }, []);
  useEffect(() => { setPage(1); }, [search, filterStatus, filterDept, sortField, sortDir]);

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
    setSaving(true);
    try {
      const url = editing ? `/api/employees/${editing.id}` : "/api/employees";
      const method = editing ? "PUT" : "POST";
      await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false);
      loadEmployees();
    } finally {
      setSaving(false);
    }
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

  const activeEmployees = employees.filter(e => e.status === "active");

  // Same helpers as the expenses/reports API
  function calcDays(start: Date, end: Date) {
    return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  }
  function calcMonths(start: Date, end: Date) {
    const sd = start.getUTCDate(), ed = end.getUTCDate();
    const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
    if (sd === 1 && ed === lastDay) {
      return (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth()) + 1;
    }
    return parseFloat((calcDays(start, end) / 30).toFixed(2));
  }

  // Current month range using org timezone
  const currentMonthSalary = useMemo(() => {
    if (!tz) return 0;
    const nowStr = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date()); // "YYYY-MM-DD"
    const [y, m] = nowStr.split("-").map(Number);
    const fromDate = new Date(Date.UTC(y, m - 1, 1));
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const toDate = new Date(Date.UTC(y, m - 1, lastDay, 23, 59, 59));

    let total = 0;
    for (const emp of employees) {
      if (emp.status !== "active") continue;
      const hireDate = new Date(emp.hireDate);
      if (hireDate > toDate) continue; // not yet hired
      const empStart = hireDate > fromDate ? hireDate : fromDate;
      const days = calcDays(empStart, toDate);
      if (days <= 0) continue;
      const rate = emp.salary;
      const period = emp.salaryPeriod || "month";
      if (period === "day") total += rate * days;
      else if (period === "week") total += rate * (days / 7);
      else total += rate * calcMonths(empStart, toDate);
    }
    return Math.round(total);
  }, [employees, tz]); // eslint-disable-line react-hooks/exhaustive-deps
  const byPeriod = {
    month: employees.filter(e => e.status === "active" && e.salaryPeriod === "month").length,
    week:  employees.filter(e => e.status === "active" && e.salaryPeriod === "week").length,
    day:   employees.filter(e => e.status === "active" && e.salaryPeriod === "day").length,
  };

  function fmtSalary(n: number) {
    if (n >= 1_000_000) return (n / 1_000_000).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + "M";
    if (n >= 1_000) return (n / 1_000).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + "K";
    return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  const [exportingList, setExportingList] = useState(false);
  async function exportListPDF() {
    setExportingList(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      const doc = new jsPDF({ orientation: "landscape" });
      doc.setFontSize(16);
      doc.setTextColor(37, 99, 235);
      doc.text(t("employees.title"), 14, 16);
      doc.setFontSize(9);
      doc.setTextColor(120);
      doc.text(`${t("field.total")}: ${filtered.length} — ${new Date().toLocaleDateString()}`, 14, 23);
      doc.setTextColor(0);
      autoTable(doc, {
        startY: 28,
        head: [[t("field.name"), t("field.email"), t("employees.position"), t("employees.department"), t("employees.salary"), t("employees.outstanding_advance"), t("employees.hire_date"), t("field.status")]],
        body: filtered.map(e => [
          `${e.firstName} ${e.lastName}`,
          e.email || "—",
          e.position,
          e.department || "—",
          `${e.salary.toLocaleString("en-US", { minimumFractionDigits: 2 })}/${e.salaryPeriod}`,
          e.outstandingAdvance > 0 ? e.outstandingAdvance.toLocaleString("en-US", { minimumFractionDigits: 2 }) : "—",
          e.hireDate ? new Date(e.hireDate).toLocaleDateString("en-GB") : "—",
          e.status,
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [37, 99, 235], textColor: 255, fontSize: 8, fontStyle: "bold" },
        columnStyles: { 4: { halign: "right" }, 5: { halign: "right" } },
        margin: { left: 14, right: 14 },
        didParseCell: (data: { section: string; column: { index: number }; cell: { styles: { textColor: number[] } }; row: { raw: string[] } }) => {
          if (data.section === "body" && data.column.index === 7) {
            const val = data.row.raw[7];
            if (val === "active") data.cell.styles.textColor = [34, 197, 94];
            else if (val === "inactive") data.cell.styles.textColor = [220, 38, 38];
            else data.cell.styles.textColor = [202, 138, 4];
          }
        },
      });
      doc.save(`employees-${new Date().toISOString().split("T")[0]}.pdf`);
    } finally {
      setExportingList(false);
    }
  }

  if (loading) return <TablePageSkeleton rows={8} hasFilters cols={5} />;

  return (
    <PermissionGuard feature="employees">
    <div>
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-text-primary">{t("employees.title")}</h1>
        <div className="flex gap-2">
          <button onClick={exportListPDF} disabled={exportingList} className="flex items-center gap-1.5 px-3 py-2 bg-dark-card text-text-secondary border border-dark-border rounded-lg hover:bg-dark-card-hover text-sm font-medium">
            {exportingList ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} {t("employees.export_pdf")}
          </button>
          {canEdit && (
            <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover text-sm font-medium">
              <Plus size={16} /> {t("employees.add")}
            </button>
          )}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        {/* Total monthly salaries */}
        <div className="relative bg-dark-card border border-dark-border rounded-xl p-3 sm:p-4 group">
          <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-dark-bg border border-dark-border text-text-primary text-xs px-2.5 py-1.5 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20">
            {currentMonthSalary.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-dark-border" />
          </div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-text-muted">{t("employees.total_monthly_salaries")}</span>
            <DollarSign size={15} className="text-emerald-400" />
          </div>
          <div className="text-lg sm:text-2xl font-bold text-emerald-400">{fmtSalary(currentMonthSalary)}</div>
          <div className="text-xs text-text-muted mt-0.5">{activeEmployees.length} {t("employees.active_employees")}</div>
        </div>

        {/* Total employees */}
        <div className="bg-dark-card border border-dark-border rounded-xl p-3 sm:p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-text-muted">{t("employees.total_employees")}</span>
            <Users size={15} className="text-blue-400" />
          </div>
          <div className="text-lg sm:text-2xl font-bold text-blue-400">{employees.length}</div>
          <div className="text-xs text-text-muted mt-0.5">
            {employees.filter(e => e.status === "inactive").length} {t("status.inactive")}
            {employees.filter(e => e.status === "on_leave").length > 0 && ` · ${employees.filter(e => e.status === "on_leave").length} ${t("status.on_leave")}`}
          </div>
        </div>

        {/* Pay period breakdown */}
        <div className="col-span-2 sm:col-span-1 bg-dark-card border border-dark-border rounded-xl p-3 sm:p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-text-muted">{t("employees.pay_schedule")}</span>
            <Calendar size={15} className="text-purple-400" />
          </div>
          <div className="space-y-1.5">
            {([["month", t("employees.period.month")], ["week", t("employees.period.week")], ["day", t("employees.period.day")]] as [keyof typeof byPeriod, string][]).map(([period, label]) => (
              <div key={period} className="flex items-center justify-between text-xs">
                <span className="text-text-secondary">{label}</span>
                <span className="font-semibold text-text-primary">{byPeriod[period]} {t("employees.people")}</span>
              </div>
            ))}
          </div>
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
                <button type="submit" disabled={saving} className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent-hover disabled:opacity-60">
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  {editing ? t("common.save") : t("employees.add")}
                </button>
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
              <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase">{t("employees.outstanding_advance")}</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-text-muted uppercase">{t("field.status")}</th>
              {canEdit && <th className="text-right px-4 py-3 text-xs font-medium text-text-muted uppercase">{t("common.actions")}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-dark-border/50">
            {filtered.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-text-muted">{search || filterStatus || filterDept ? t("common.no_results") : t("employees.empty")}</td></tr>
            ) : filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(emp => (
              <tr key={emp.id} className="hover:bg-dark-card-hover">
                <td className="px-4 py-3 text-sm font-medium text-text-primary">{emp.firstName} {emp.lastName}</td>
                <td className="px-4 py-3 text-sm text-text-secondary">{emp.position}</td>
                <td className="px-4 py-3 text-sm text-text-secondary">{emp.department || "-"}</td>
                <td className="px-4 py-3 text-sm text-text-secondary">{emp.email || "-"}</td>
                <td className="px-4 py-3 text-sm text-text-primary text-right font-medium">
                  {emp.salary.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-text-muted font-normal">{emp.currency || "USD"}</span>
                  <span className="text-text-muted font-normal text-xs ml-1">/{emp.salaryPeriod || "month"}</span>
                </td>
                <td className="px-4 py-3 text-sm text-right font-medium">
                  {emp.outstandingAdvance > 0
                    ? <span className="text-amber-400">{emp.outstandingAdvance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    : <span className="text-text-muted">—</span>
                  }
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
