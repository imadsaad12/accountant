"use client";

import { useEffect, useState } from "react";
import { ScrollText, Sparkles, User, ChevronLeft, ChevronRight, Search, Plus, Pencil, Trash2, X } from "lucide-react";
import { PermissionGuard } from "@/components/PermissionGuard";
import { useTranslation } from "@/components/LanguageProvider";
import { useOrgTimezone } from "@/components/OrgSettingsProvider";
import { formatDateTimeInTz } from "@/lib/tz";

interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  action: string;
  entity: string;
  entityId: string | null;
  description: string;
  method: string;
  metadata: string | null;
  createdAt: string;
}

const ACTION_STYLES: Record<string, { bg: string; text: string; icon: typeof Plus }> = {
  create: { bg: "bg-emerald-500/10 border-emerald-500/20", text: "text-emerald-400", icon: Plus },
  update: { bg: "bg-amber-500/10 border-amber-500/20", text: "text-amber-400", icon: Pencil },
  delete: { bg: "bg-red-500/10 border-red-500/20", text: "text-red-400", icon: Trash2 },
};

export default function ActivityLogPage() {
  const t = useTranslation();
  const tz = useOrgTimezone();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [entityFilter, setEntityFilter] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [search, setSearch] = useState("");

  const hasFilters = entityFilter || methodFilter || actionFilter || search;

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "30");
    if (entityFilter) params.set("entity", entityFilter);
    if (methodFilter) params.set("method", methodFilter);
    if (actionFilter) params.set("action", actionFilter);
    if (search) params.set("search", search);

    fetch(`/api/audit-logs?${params}`)
      .then(r => r.json())
      .then(data => {
        setLogs(data.logs);
        setTotalPages(data.totalPages);
        setTotal(data.total);
      })
      .finally(() => setLoading(false));
  }, [page, entityFilter, methodFilter, actionFilter, search]);

  function clearFilters() {
    setEntityFilter("");
    setMethodFilter("");
    setActionFilter("");
    setSearch("");
    setPage(1);
  }

  function formatDate(dateStr: string) {
    return formatDateTimeInTz(dateStr, tz);
  }

  return (
    <PermissionGuard feature="activity_log">
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
            <ScrollText size={20} className="text-accent" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-text-primary">{t("activity.title")}</h1>
            <p className="text-sm text-text-muted">{total} {t("activity.total_recorded")}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-dark-card rounded-xl border border-dark-border p-4 mb-6">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">{t("activity.entity")}</label>
            <select
              value={entityFilter}
              onChange={e => { setEntityFilter(e.target.value); setPage(1); }}
              className="px-3 py-2 bg-dark-input border border-dark-border rounded-lg text-sm text-text-primary focus:ring-accent focus:border-accent"
            >
              <option value="">{t("activity.all_entities")}</option>
              <option value="client">{t("activity.entity.client")}</option>
              <option value="product">{t("activity.entity.product")}</option>
              <option value="employee">{t("activity.entity.employee")}</option>
              <option value="invoice">{t("activity.entity.invoice")}</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">{t("activity.method")}</label>
            <select
              value={methodFilter}
              onChange={e => { setMethodFilter(e.target.value); setPage(1); }}
              className="px-3 py-2 bg-dark-input border border-dark-border rounded-lg text-sm text-text-primary focus:ring-accent focus:border-accent"
            >
              <option value="">{t("activity.all_methods")}</option>
              <option value="manual">{t("activity.manual")}</option>
              <option value="ai">{t("activity.ai")}</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">{t("activity.action")}</label>
            <select
              value={actionFilter}
              onChange={e => { setActionFilter(e.target.value); setPage(1); }}
              className="px-3 py-2 bg-dark-input border border-dark-border rounded-lg text-sm text-text-primary focus:ring-accent focus:border-accent"
            >
              <option value="">{t("activity.all_actions")}</option>
              <option value="create">{t("activity.create")}</option>
              <option value="update">{t("activity.update")}</option>
              <option value="delete">{t("activity.delete")}</option>
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-text-muted mb-1">{t("common.search")}</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder={t("activity.search_placeholder")}
                className="w-full pl-9 pr-3 py-2 bg-dark-input border border-dark-border rounded-lg text-sm text-text-primary placeholder:text-text-muted focus:ring-accent focus:border-accent"
              />
            </div>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={clearFilters}
              disabled={!hasFilters}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-dark-border rounded-lg text-text-secondary hover:text-text-primary hover:bg-dark-card-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <X size={14} />
              {t("common.clear")}
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-dark-card rounded-xl border border-dark-border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-text-muted">
            <ScrollText size={40} className="mb-3 opacity-40" />
            <p className="text-sm">{t("activity.empty")}</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-dark-bg/50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">{t("field.date")}</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">{t("activity.user")}</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">{t("activity.action")}</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">{t("activity.entity")}</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">{t("field.description")}</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">{t("activity.method")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-border/50">
                  {logs.map(log => {
                    const style = ACTION_STYLES[log.action] || ACTION_STYLES.update;
                    const ActionIcon = style.icon;
                    return (
                      <tr key={log.id} className="hover:bg-dark-card-hover">
                        <td className="px-4 py-3 text-xs text-text-muted whitespace-nowrap">
                          {formatDate(log.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center text-[10px] font-bold text-accent">
                              {log.userName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm text-text-primary font-medium">{log.userName}</p>
                              <p className="text-[10px] text-text-muted">{log.userEmail}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium border ${style.bg} ${style.text}`}>
                            <ActionIcon size={10} />
                            {t(`activity.${log.action}`) || log.action}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs px-2 py-1 rounded-lg bg-dark-bg text-text-secondary font-medium capitalize">
                            {log.entity}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-text-secondary max-w-[300px]">
                          {log.description.length > 60 ? (
                            <span className="truncate block max-w-[300px] cursor-help" title={log.description}>
                              {log.description}
                            </span>
                          ) : (
                            log.description
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {log.method === "ai" ? (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium bg-violet-500/10 text-violet-400 border border-violet-500/20">
                              <Sparkles size={10} />
                              {t("activity.ai")}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium bg-slate-500/10 text-slate-400 border border-slate-500/20">
                              <User size={10} />
                              {t("activity.manual")}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-dark-border">
              <p className="text-xs text-text-muted">
                {t("activity.page_info").replace("{page}", String(page)).replace("{total_pages}", String(totalPages)).replace("{total}", String(total))}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-dark-bg border border-dark-border rounded-lg text-text-secondary hover:bg-dark-card-hover disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={14} />
                  {t("activity.previous")}
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-dark-bg border border-dark-border rounded-lg text-text-secondary hover:bg-dark-card-hover disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {t("activity.next")}
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
    </PermissionGuard>
  );
}
