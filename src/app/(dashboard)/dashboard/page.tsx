"use client";

import { useEffect, useState } from "react";
import { Users, Package, UserCog, FileText, DollarSign, AlertTriangle, TrendingUp, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useOrgSettings, currencySymbol } from "@/components/OrgSettingsProvider";
import { useTranslation } from "@/components/LanguageProvider";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

interface DashboardData {
  clientCount: number;
  productCount: number;
  employeeCount: number;
  invoiceCount: number;
  totalRevenue: number;
  grossEarning: number;
  netEarning: number;
  pendingAmount: number;
  lowStockProducts: { id: string; name: string; quantity: number; minStock: number }[];
  recentInvoices: { id: string; number: string; total: number; status: string; date: string; client: { name: string } }[];
}

const CHART_COLORS = ["#6366f1", "#8b5cf6", "#a78bfa", "#c4b5fd", "#818cf8"];
const STATUS_COLORS: Record<string, string> = {
  paid: "#22c55e",
  sent: "#3b82f6",
  draft: "#64748b",
  overdue: "#ef4444",
};

const fmtAmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtCompact = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return (n / 1_000_000_000).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + "B";
  if (abs >= 1_000_000)     return (n / 1_000_000).toLocaleString("en-US",     { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + "M";
  if (abs >= 1_000)         return (n / 1_000).toLocaleString("en-US",         { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + "K";
  return fmtAmt(n);
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const { orgSettings } = useOrgSettings();
  const sym = currencySymbol(orgSettings.defaultCurrency);
  const t = useTranslation();
  const [isLight, setIsLight] = useState(false);

  useEffect(() => {
    const check = () => setIsLight(document.documentElement.classList.contains("light"));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const chartGrid   = isLight ? "#e2e8f0" : "#2a2d3a";
  const chartAxis   = isLight ? "#94a3b8" : "#64748b";
  const tooltipBg   = isLight ? "#ffffff"  : "#1a1d27";
  const tooltipBorder = isLight ? "#e2e8f0" : "#2a2d3a";
  const tooltipLabel  = isLight ? "#475569" : "#94a3b8";
  const tooltipItem   = isLight ? "#0f172a" : "#f1f5f9";

  useEffect(() => {
    fetch("/api/dashboard").then(r => r.json()).then(setData);
  }, []);

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
          <p className="text-text-muted text-sm">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  const stats = [
    { label: t("dashboard.gross"),     value: `${sym}${fmtCompact(data.grossEarning)}`,   tooltip: `${sym}${fmtAmt(data.grossEarning)}`,   icon: DollarSign, gradient: "from-emerald-500/20 to-emerald-600/5", iconBg: "bg-emerald-500/20", iconColor: "text-emerald-400", trend: null, up: true },
    { label: t("dashboard.net"),       value: `${sym}${fmtCompact(data.netEarning)}`,     tooltip: `${sym}${fmtAmt(data.netEarning)}`,     icon: TrendingUp, gradient: "from-teal-500/20 to-teal-600/5",    iconBg: "bg-teal-500/20",    iconColor: "text-teal-400",    trend: null, up: true },
    { label: t("dashboard.pending"),   value: `${sym}${fmtCompact(data.pendingAmount)}`,  tooltip: `${sym}${fmtAmt(data.pendingAmount)}`,  icon: TrendingUp, gradient: "from-amber-500/20 to-amber-600/5",  iconBg: "bg-amber-500/20",   iconColor: "text-amber-400",   trend: null, up: false },
    { label: t("dashboard.clients"),   value: data.clientCount,   tooltip: data.clientCount.toString(),   icon: Users,    gradient: "from-blue-500/20 to-blue-600/5",  iconBg: "bg-blue-500/20",  iconColor: "text-blue-400",  trend: data.newClientsThisMonth  > 0 ? `+${data.newClientsThisMonth} this month`  : null, up: true },
    { label: t("dashboard.employees"), value: data.employeeCount, tooltip: data.employeeCount.toString(), icon: UserCog,  gradient: "from-pink-500/20 to-pink-600/5",  iconBg: "bg-pink-500/20",  iconColor: "text-pink-400",  trend: null, up: true },
    { label: t("dashboard.invoices"),  value: data.invoiceCount,  tooltip: data.invoiceCount.toString(),  icon: FileText, gradient: "from-cyan-500/20 to-cyan-600/5",  iconBg: "bg-cyan-500/20",  iconColor: "text-cyan-400",  trend: data.newInvoicesThisMonth > 0 ? `+${data.newInvoicesThisMonth} this month` : null, up: true },
  ];

  // Build chart data from invoices
  const invoicesByStatus = data.recentInvoices.reduce((acc, inv) => {
    acc[inv.status] = (acc[inv.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const pieData = Object.entries(invoicesByStatus).map(([name, value]) => ({ name, value }));

  const revenueByDate = data.recentInvoices
    .slice()
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .reduce((acc, inv) => {
      const date = new Date(inv.date).toLocaleDateString("en", { month: "short", day: "numeric" });
      const existing = acc.find(a => a.date === date);
      if (existing) {
        existing.revenue += inv.total;
        existing.count += 1;
      } else {
        acc.push({ date, revenue: inv.total, count: 1 });
      }
      return acc;
    }, [] as { date: string; revenue: number; count: number }[]);

  const areaData = revenueByDate.length > 0 ? revenueByDate : [
    { date: t("dashboard.day.mon"), revenue: 0, count: 0 },
    { date: t("dashboard.day.tue"), revenue: 0, count: 0 },
    { date: t("dashboard.day.wed"), revenue: 0, count: 0 },
    { date: t("dashboard.day.thu"), revenue: 0, count: 0 },
    { date: t("dashboard.day.fri"), revenue: 0, count: 0 },
  ];

  const barData = data.recentInvoices.slice(0, 8).map(inv => ({
    name: inv.number,
    amount: inv.total,
    client: inv.client.name,
  }));

  return (
    <div>
      {/* Header */}
      <div className="mb-4 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-bold text-text-primary">{t("dashboard.title")}</h1>
        <p className="text-xs sm:text-sm text-text-muted mt-0.5 sm:mt-1">{t("dashboard.overview")}</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4 mb-4 sm:mb-8">
        {stats.map((stat) => (
          <div key={stat.label} className={`relative bg-gradient-to-br ${stat.gradient} bg-dark-card rounded-xl p-3 sm:p-5 border border-dark-border hover:border-dark-border/80 group`}>
            {/* Hover tooltip showing full number */}
            <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-dark-bg border border-dark-border text-text-primary text-xs px-2.5 py-1.5 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20">
              {stat.tooltip}
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-dark-border" />
            </div>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] sm:text-sm text-text-muted font-medium truncate">{stat.label}</p>
                <p className="text-base sm:text-2xl font-bold text-text-primary mt-0.5 sm:mt-1 truncate">{stat.value}</p>
                {stat.trend && (
                  <div className={`hidden sm:flex items-center gap-1 mt-2 text-xs font-medium ${stat.up ? "text-emerald-400" : "text-red-400"}`}>
                    {stat.up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    <span>{stat.trend}</span>
                    <span className="text-text-muted ml-1">{t("dashboard.vs_last_month")}</span>
                  </div>
                )}
              </div>
              <div className={`${stat.iconBg} p-1.5 sm:p-3 rounded-lg sm:rounded-xl shrink-0`}>
                <stat.icon className={stat.iconColor} size={16} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-6 mb-4 sm:mb-8">
        {/* Revenue Area Chart */}
        <div className="lg:col-span-2 bg-dark-card rounded-xl p-3 sm:p-5 border border-dark-border">
          <div className="flex items-center justify-between mb-3 sm:mb-6">
            <div>
              <h2 className="text-base font-semibold text-text-primary">{t("dashboard.revenue_trend")}</h2>
              <p className="text-xs text-text-muted mt-0.5">{t("dashboard.daily_trend")}</p>
            </div>
            <div className="px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-medium">
              {sym}{fmtAmt(data.grossEarning)} {t("dashboard.gross_label")}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={areaData}>
              <defs>
                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
              <XAxis dataKey="date" stroke={chartAxis} fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke={chartAxis} fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${sym}${v}`} />
              <Tooltip
                cursor={{ fill: "transparent" }}
                contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: "8px" }}
                labelStyle={{ color: tooltipLabel }}
                itemStyle={{ color: tooltipItem }}
              />
              <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2} fill="url(#revenueGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Invoice Status Pie Chart */}
        <div className="bg-dark-card rounded-xl p-5 border border-dark-border">
          <div className="mb-6">
            <h2 className="text-base font-semibold text-text-primary">{t("dashboard.invoice_breakdown")}</h2>
            <p className="text-xs text-text-muted mt-0.5">{t("dashboard.distribution_status")}</p>
          </div>
          {pieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={STATUS_COLORS[entry.name] || CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: "8px" }}
                    itemStyle={{ color: tooltipItem }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-3 justify-center mt-2">
                {pieData.map((entry, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[entry.name] || CHART_COLORS[i] }} />
                    <span className="text-text-secondary capitalize">{t(`status.${entry.name}`)}</span>
                    <span className="text-text-muted">({entry.value})</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-[200px] text-text-muted text-sm">{t("dashboard.no_recent")}</div>
          )}
        </div>
      </div>

      {/* Bar Chart + Low Stock Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-6 mb-4 sm:mb-8">
        {/* Invoice Amounts Bar Chart */}
        <div className="bg-dark-card rounded-xl p-3 sm:p-5 border border-dark-border">
          <div className="mb-3 sm:mb-6">
            <h2 className="text-base font-semibold text-text-primary">{t("dashboard.monthly_invoices")}</h2>
            <p className="text-xs text-text-muted mt-0.5">{t("dashboard.latest_totals")}</p>
          </div>
          {barData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
                <XAxis dataKey="name" stroke={chartAxis} fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke={chartAxis} fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `${sym}${v}`} />
                <Tooltip
                  cursor={{ fill: isLight ? "rgba(99,102,241,0.05)" : "transparent" }}
                  contentStyle={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: "8px" }}
                  labelStyle={{ color: tooltipLabel }}
                  itemStyle={{ color: tooltipItem }}
                  formatter={(value) => [`${sym}${fmtAmt(Number(value))}`, t("dashboard.amount")]}
                />
                <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                  {barData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[250px] text-text-muted text-sm">{t("dashboard.no_recent")}</div>
          )}
        </div>

        {/* Low Stock Alerts */}
        <div className="bg-dark-card rounded-xl p-3 sm:p-5 border border-dark-border">
          <div className="flex items-center gap-2 mb-3 sm:mb-4">
            <AlertTriangle size={18} className="text-amber-400" />
            <h2 className="text-base font-semibold text-text-primary">{t("dashboard.low_stock")}</h2>
          </div>
          {data.lowStockProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-text-muted">
              <Package size={32} className="mb-2 opacity-50" />
              <p className="text-sm">{t("dashboard.no_low_stock")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {data.lowStockProducts.map((prod) => {
                const pct = Math.min((prod.quantity / prod.minStock) * 100, 100);
                return (
                  <div key={prod.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-dark-bg/50 border border-dark-border/50">
                    <div>
                      <p className="text-sm font-medium text-text-primary">{prod.name}</p>
                      <p className="text-xs text-text-muted">{t("stock.min_stock")}: {prod.minStock}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-20 h-1.5 bg-dark-border rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${pct < 50 ? "bg-red-500" : "bg-amber-500"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className={`text-xs font-bold ${prod.quantity <= 2 ? "text-red-400" : "text-amber-400"}`}>
                        {prod.quantity}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent Invoices Table */}
      <div className="bg-dark-card rounded-xl border border-dark-border overflow-hidden">
        <div className="p-3 sm:p-5 border-b border-dark-border">
          <h2 className="text-base font-semibold text-text-primary">{t("dashboard.recent_invoices")}</h2>
          <p className="text-xs text-text-muted mt-0.5">{t("dashboard.latest_billing")}</p>
        </div>
        {data.recentInvoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-text-muted">
            <FileText size={32} className="mb-2 opacity-50" />
            <p className="text-sm">{t("dashboard.no_recent")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead>
              <tr className="bg-dark-bg/50">
                <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">{t("tax.invoice")}</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">{t("invoices.client")}</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">{t("field.date")}</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">{t("field.total")}</th>
                <th className="text-center px-5 py-3 text-xs font-medium text-text-muted uppercase tracking-wider">{t("field.status")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-border/50">
              {data.recentInvoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-dark-card-hover">
                  <td className="px-5 py-3.5 text-sm font-mono font-medium text-accent">{inv.number}</td>
                  <td className="px-5 py-3.5 text-sm text-text-secondary">{inv.client.name}</td>
                  <td className="px-5 py-3.5 text-sm text-text-muted">{new Date(inv.date).toLocaleDateString("en-GB")}</td>
                  <td className="px-5 py-3.5 text-sm text-text-primary text-right font-medium">{sym}{fmtAmt(inv.total)}</td>
                  <td className="px-5 py-3.5 text-center">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                      inv.status === "paid" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                      inv.status === "sent" ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" :
                      inv.status === "overdue" ? "bg-red-500/10 text-red-400 border border-red-500/20" :
                      inv.status === "partially_paid" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                      "bg-slate-500/10 text-slate-400 border border-slate-500/20"
                    }`}>{t(`status.${inv.status}`)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
