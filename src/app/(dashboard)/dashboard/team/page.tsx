"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, Pencil, Trash2, Shield, X, Check, ChevronDown, ChevronUp, UserCheck } from "lucide-react";
import { ALL_FEATURES, FEATURE_LABELS, DEFAULT_EMPLOYEE_PERMISSIONS, type Permissions, type Feature } from "@/lib/permissions";
import { useTranslation } from "@/components/LanguageProvider";

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
}

interface User {
  id: string;
  name: string;
  email: string;
  username: string | null;
  role: string;
  permissions: string | null;
  createdAt: string;
}

type TeamSortField = "name" | "role" | "joined" | "";
type SortDir = "asc" | "desc";

const emptyForm = {
  name: "",
  username: "",
  password: "",
  permissions: DEFAULT_EMPLOYEE_PERMISSIONS as Permissions,
};

function PermissionMatrix({
  permissions,
  onChange,
  readonly,
  t,
}: {
  permissions: Permissions;
  onChange?: (p: Permissions) => void;
  readonly?: boolean;
  t: (key: string) => string;
}) {
  const toggle = (feature: Feature, type: "view" | "edit") => {
    if (!onChange) return;
    const updated = { ...permissions };
    if (type === "edit") {
      updated[feature] = { view: true, edit: !permissions[feature].edit };
    } else {
      if (permissions[feature].view) {
        updated[feature] = { view: false, edit: false };
      } else {
        updated[feature] = { view: true, edit: false };
      }
    }
    onChange(updated);
  };

  const toggleAI = () => {
    if (!onChange) return;
    const hasAccess = permissions.ai?.view || permissions.ai?.edit;
    onChange({ ...permissions, ai: { view: !hasAccess, edit: !hasAccess } });
  };

  return (
    <div className="rounded-lg border border-dark-border overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-dark-input">
            <th className="text-left px-3 py-2 text-text-muted font-medium">{t("team.feature")}</th>
            <th className="text-center px-3 py-2 text-text-muted font-medium w-20">{t("team.view")}</th>
            <th className="text-center px-3 py-2 text-text-muted font-medium w-20">{t("team.edit_col")}</th>
          </tr>
        </thead>
        <tbody>
          {ALL_FEATURES.map((feature) => {
            if (feature === "ai") {
              const hasAccess = permissions.ai?.view || permissions.ai?.edit;
              return (
                <tr key={feature} className="border-t border-dark-border">
                  <td className="px-3 py-2 text-text-primary">{FEATURE_LABELS[feature]}</td>
                  <td colSpan={2} className="px-3 py-2 text-center">
                    <button
                      type="button"
                      disabled={readonly}
                      onClick={toggleAI}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                        hasAccess
                          ? "bg-accent/20 text-accent hover:bg-accent/30"
                          : "bg-dark-input text-text-muted hover:bg-dark-card"
                      } disabled:cursor-default`}
                    >
                      {hasAccess ? t("team.access_granted") : t("team.grant_access")}
                    </button>
                  </td>
                </tr>
              );
            }
            return (
              <tr key={feature} className="border-t border-dark-border">
                <td className="px-3 py-2 text-text-primary">{FEATURE_LABELS[feature]}</td>
                <td className="px-3 py-2 text-center">
                  <button
                    type="button"
                    disabled={readonly}
                    onClick={() => toggle(feature, "view")}
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center mx-auto transition-colors ${
                      permissions[feature]?.view
                        ? "bg-green-500 border-green-500"
                        : "bg-transparent border-dark-border hover:border-green-500/50"
                    } disabled:cursor-default`}
                  >
                    {permissions[feature]?.view && <Check size={12} className="text-white" strokeWidth={3} />}
                  </button>
                </td>
                <td className="px-3 py-2 text-center">
                  <button
                    type="button"
                    disabled={readonly}
                    onClick={() => toggle(feature, "edit")}
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center mx-auto transition-colors ${
                      permissions[feature]?.edit
                        ? "bg-green-500 border-green-500"
                        : "bg-transparent border-dark-border hover:border-green-500/50"
                    } disabled:cursor-default`}
                  >
                    {permissions[feature]?.edit && <Check size={12} className="text-white" strokeWidth={3} />}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function TeamPage() {
  const t = useTranslation();
  const [users, setUsers] = useState<User[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showPermissions, setShowPermissions] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [sortField, setSortField] = useState<TeamSortField>("");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/users");
    if (res.ok) {
      const data = await res.json();
      setUsers(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  useEffect(() => {
    fetch("/api/employees")
      .then((r) => r.ok ? r.json() : [])
      .then(setEmployees)
      .catch(() => {});
  }, []);

  function openAdd() {
    setEditing(null);
    setForm({ ...emptyForm, permissions: { ...DEFAULT_EMPLOYEE_PERMISSIONS } });
    setError("");
    setShowPermissions(false);
    setShowModal(true);
  }

  function handleEmployeeSelect(employeeId: string) {
    if (!employeeId) return;
    const emp = employees.find((e) => e.id === employeeId);
    if (!emp) return;
    const username = `${emp.firstName}.${emp.lastName}`
      .toLowerCase()
      .replace(/[^a-z0-9._]/g, "");
    const name = `${emp.firstName} ${emp.lastName}`;
    setForm((prev) => ({ ...prev, name, username }));
  }

  function openEdit(user: User) {
    setEditing(user);
    let perms = DEFAULT_EMPLOYEE_PERMISSIONS;
    if (user.permissions) {
      try { perms = JSON.parse(user.permissions); } catch { /* use default */ }
    }
    setForm({ name: user.name, username: user.username || "", password: "", permissions: perms });
    setError("");
    setShowPermissions(false);
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const body: Record<string, unknown> = {
      name: form.name,
      username: form.username,
      permissions: form.permissions,
    };
    if (form.password) body.password = form.password;
    if (!editing) body.password = form.password;

    const res = await fetch(editing ? `/api/users/${editing.id}` : "/api/users", {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      setShowModal(false);
      fetchUsers();
    } else {
      const data = await res.json();
      setError(data.error || t("team.failed_save"));
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
    if (res.ok) fetchUsers();
    setDeleteConfirm(null);
  }

  function toggleSort(field: TeamSortField) {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  }

  function SortIcon({ field }: { field: TeamSortField }) {
    if (sortField !== field) return <ChevronUp size={12} className="opacity-30" />;
    return sortDir === "asc" ? <ChevronUp size={12} className="text-accent" /> : <ChevronDown size={12} className="text-accent" />;
  }

  const sortedUsers = useMemo(() => {
    if (!sortField) return users;
    return [...users].sort((a, b) => {
      let va: string = "";
      let vb: string = "";
      if (sortField === "name") { va = a.name.toLowerCase(); vb = b.name.toLowerCase(); }
      else if (sortField === "role") { va = a.role; vb = b.role; }
      else if (sortField === "joined") { va = a.createdAt; vb = b.createdAt; }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [users, sortField, sortDir]);

  function getPermissionSummary(user: User): string {
    if (user.role === "admin") return t("team.full_access");
    if (!user.permissions) return t("team.no_access");
    try {
      const perms = JSON.parse(user.permissions) as Permissions;
      const editCount = ALL_FEATURES.filter((f) => perms[f]?.edit).length;
      const viewCount = ALL_FEATURES.filter((f) => perms[f]?.view && !perms[f]?.edit).length;
      const parts = [];
      if (editCount > 0) parts.push(`${editCount} ${t("team.perm_edit")}`);
      if (viewCount > 0) parts.push(`${viewCount} ${t("team.perm_view")}`);
      return parts.length ? parts.join(", ") : t("team.no_access");
    } catch { return t("team.no_access"); }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-text-primary">{t("team.title")}</h1>
          <p className="text-text-muted text-xs sm:text-sm mt-0.5 sm:mt-1">{t("team.subtitle")}</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 px-3 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} /> {t("team.add")}
        </button>
      </div>

      <div className="bg-dark-card border border-dark-border rounded-xl overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-text-muted">{t("common.loading")}</div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-text-muted">{t("team.empty")}</div>
        ) : (
          <table className="w-full min-w-[560px]">
            <thead>
              <tr className="border-b border-dark-border bg-dark-input/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider cursor-pointer select-none" onClick={() => toggleSort("name")}><span className="inline-flex items-center gap-1">{t("team.full_name")} <SortIcon field="name" /></span></th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider cursor-pointer select-none" onClick={() => toggleSort("role")}><span className="inline-flex items-center gap-1">{t("field.role")} <SortIcon field="role" /></span></th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">{t("team.permissions")}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider cursor-pointer select-none" onClick={() => toggleSort("joined")}><span className="inline-flex items-center gap-1">{t("team.joined")} <SortIcon field="joined" /></span></th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-border">
              {sortedUsers.map((user) => (
                <tr key={user.id} className="hover:bg-dark-input/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent/60 to-purple-500/60 flex items-center justify-center text-xs font-bold text-white">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-text-primary">{user.name}</p>
                        <p className="text-xs text-text-muted">{user.username ? `@${user.username}` : user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                      user.role === "admin"
                        ? "bg-accent/15 text-accent"
                        : "bg-dark-input text-text-secondary"
                    }`}>
                      {user.role === "admin" && <Shield size={10} />}
                      {user.role === "admin" ? t("team.role.admin") : t("team.role.employee")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{getPermissionSummary(user)}</td>
                  <td className="px-4 py-3 text-sm text-text-muted">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    {user.role !== "admin" && (
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => openEdit(user)}
                          className="p-1.5 rounded-lg hover:bg-dark-input text-text-muted hover:text-text-primary transition-colors"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(user.id)}
                          className="p-1.5 rounded-lg hover:bg-danger/10 text-text-muted hover:text-danger transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-card border border-dark-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-dark-border">
              <h2 className="text-lg font-semibold text-text-primary">
                {editing ? t("team.edit") : t("team.add")}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-dark-input text-text-muted">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
              {error && (
                <div className="bg-red-500/10 text-red-400 border border-red-500/20 p-3 rounded-lg text-sm">{error}</div>
              )}

              {!editing && employees.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1">
                    <span className="flex items-center gap-1.5"><UserCheck size={14} className="text-accent" /> {t("team.select_employee")}</span>
                  </label>
                  <select
                    defaultValue=""
                    onChange={(e) => handleEmployeeSelect(e.target.value)}
                    className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg focus:ring-accent focus:border-accent focus:outline-none"
                  >
                    <option value="">{t("team.choose_employee")}</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.firstName} {emp.lastName}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-text-muted">{t("team.select_employee_hint")}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">{t("team.full_name")}</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg focus:ring-accent focus:border-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">{t("team.username")}</label>
                <input
                  type="text"
                  required
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/\s/g, "") })}
                  placeholder={t("team.username_placeholder")}
                  className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg focus:ring-accent focus:border-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  {t("team.password")} {editing && <span className="text-text-muted text-xs">{t("team.password_hint")}</span>}
                </label>
                <input
                  type="password"
                  required={!editing}
                  minLength={6}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={editing ? "••••••" : ""}
                  className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg focus:ring-accent focus:border-accent focus:outline-none"
                />
              </div>

              {/* Permissions toggle */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowPermissions(!showPermissions)}
                  className="flex items-center gap-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors w-full"
                >
                  <Shield size={15} className="text-accent" />
                  {t("team.permissions")}
                  {showPermissions ? <ChevronUp size={14} className="ml-auto" /> : <ChevronDown size={14} className="ml-auto" />}
                </button>
                {showPermissions && (
                  <div className="mt-3">
                    <PermissionMatrix
                      permissions={form.permissions}
                      onChange={(p) => setForm({ ...form, permissions: p })}
                      t={t}
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-dark-border text-text-secondary rounded-lg hover:bg-dark-input transition-colors text-sm"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {saving ? t("common.loading") : editing ? t("common.save") : t("team.add")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-card border border-dark-border rounded-2xl p-4 sm:p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold text-text-primary mb-2">{t("team.remove")}</h3>
            <p className="text-text-muted text-sm mb-5">{t("team.remove_confirm")}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 px-4 py-2 border border-dark-border text-text-secondary rounded-lg hover:bg-dark-input transition-colors text-sm"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="flex-1 px-4 py-2 bg-danger hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {t("team.remove")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
