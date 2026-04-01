"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Truck,
  Package,
  UserCog,
  FileText,
  Mic,
  LogOut,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ScrollText,
  UsersRound,
  Receipt,
  Settings,
  TrendingDown,
  BarChart2,
  X,
  Banknote,
  HelpCircle,
  Search,
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { canView, type Permissions } from "@/lib/permissions";
import { useTranslation } from "@/components/LanguageProvider";
import CashentLogo from "@/components/CashentLogo";

const NAV_ITEMS = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard, feature: "dashboard" as const },
  { href: "/dashboard/clients", labelKey: "nav.clients", icon: Users, feature: "clients" as const },
  { href: "/dashboard/suppliers", labelKey: "nav.suppliers", icon: Truck, feature: "suppliers" as const },
  { href: "/dashboard/stock", labelKey: "nav.stock", icon: Package, feature: "products" as const },
  { href: "/dashboard/employees", labelKey: "nav.employees", icon: UserCog, feature: "employees" as const },
  { href: "/dashboard/invoices", labelKey: "nav.invoices", icon: FileText, feature: "invoices" as const },
  { href: "/dashboard/expenses", labelKey: "nav.expenses", icon: TrendingDown, feature: "expenses" as const },
  { href: "/dashboard/salary-advances", labelKey: "nav.salary_advances", icon: Banknote, feature: "salary_advances" as const },
  // { href: "/dashboard/accounts", labelKey: "nav.accounts", icon: BookOpen, feature: "accounts" as const },
  { href: "/dashboard/reports", labelKey: "nav.reports", icon: BarChart2, feature: "reports" as const },
  { href: "/dashboard/ai-assistant", labelKey: "nav.ai", icon: Mic, feature: "ai" as const },
  { href: "/dashboard/activity-log", labelKey: "nav.activity", icon: ScrollText, feature: "activity_log" as const },
  { href: "/dashboard/tax", labelKey: "nav.tax", icon: Receipt, feature: "tax" as const },
  { href: "/how-it-works", labelKey: "nav.how_it_works", icon: HelpCircle, feature: "dashboard" as const, newTab: true },
];

export default function Sidebar({
  user,
  orgName,
  mobileOpen = false,
  onMobileClose = () => {},
}: {
  user: { name: string; email: string; role?: string };
  orgName: string;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}) {
  const pathname = usePathname();

  const t = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const [permissions, setPermissions] = useState<Permissions | null>(null);
  const [optimisticPath, setOptimisticPath] = useState<string | null>(null);
  const isAdmin = user.role === "admin";

  useEffect(() => {
    setOptimisticPath(null);
  }, [pathname]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.permissions) setPermissions(data.permissions);
      })
      .catch(() => {});
  }, []);

  const [loggingOut, setLoggingOut] = useState(false);
  const [navSearch, setNavSearch] = useState("");

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const visibleItems = useMemo(() => {
    const permitted = NAV_ITEMS.filter((item) => {
      if (isAdmin) return true;
      if (!permissions) return item.feature === "dashboard";
      return canView(permissions, item.feature);
    });
    if (!navSearch.trim()) return permitted;
    const q = navSearch.toLowerCase();
    return permitted.filter((item) => t(item.labelKey).toLowerCase().includes(q));
  }, [isAdmin, permissions, navSearch, t]);

  return (
    <aside
      style={{ height: "100dvh" }}
      className={[
        // Mobile: fixed overlay
        "fixed inset-y-0 left-0 z-50",
        // Desktop: static in-flow
        "md:static md:z-auto",
        // Width
        collapsed ? "md:w-[72px] w-48" : "w-48 md:w-48 lg:w-52 xl:w-56",
        // Mobile open/close via transform
        mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        // Common
        "bg-dark-sidebar border-r border-dark-border flex flex-col",
        "transition-transform md:transition-all duration-300",
        "overflow-hidden shrink-0",
      ].join(" ")}
    >
      {/* Logo */}
      <div className="p-4 border-b border-dark-border flex items-center justify-between">
        {!collapsed && (
          <div className="flex flex-col">
            <CashentLogo className="text-3xl" />
            <span className="text-xs text-text-muted truncate">{orgName}</span>
          </div>
        )}
        {/* Desktop collapse button */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden md:block p-1.5 rounded-lg hover:bg-dark-card text-text-muted hover:text-text-secondary"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
        {/* Mobile close button */}
        <button
          onClick={onMobileClose}
          className="md:hidden p-1.5 rounded-lg hover:bg-dark-card text-text-muted hover:text-text-secondary"
        >
          <X size={16} />
        </button>
      </div>

      {/* Search — sticky above nav */}
      {!collapsed && (
        <div className="px-2 pt-2 shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input
              type="text"
              value={navSearch}
              onChange={(e) => setNavSearch(e.target.value)}
              placeholder={t("common.search") ?? "Search..."}
              className="w-full pl-8 pr-2 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg text-xs focus:ring-1 focus:ring-accent focus:border-accent"
            />
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-0.5 mt-1 overflow-y-auto">
        {visibleItems.map((item) => {
          const activePath = optimisticPath ?? pathname;
          const isActive =
            item.href === "/dashboard"
              ? activePath === "/dashboard"
              : activePath.startsWith(item.href);
          const isNewTab = "newTab" in item && item.newTab;
          return (
            <Link
              key={item.href}
              href={item.href}
              {...(isNewTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              onClick={() => { if (!isNewTab) setOptimisticPath(item.href); onMobileClose(); }}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                isActive
                  ? "bg-accent/10 text-accent-hover border border-accent/20"
                  : "text-text-secondary hover:bg-dark-card hover:text-text-primary border border-transparent"
              }`}
              title={collapsed ? t(item.labelKey) : undefined}
            >
              <item.icon size={18} className={isActive ? "text-accent" : ""} />
              {!collapsed && <span>{t(item.labelKey)}</span>}
            </Link>
          );
        })}

        {/* Team — admin only */}
        {isAdmin && (!navSearch.trim() || t("nav.team").toLowerCase().includes(navSearch.toLowerCase())) && (
          <Link
            href="/dashboard/team"
            onClick={() => { setOptimisticPath("/dashboard/team"); onMobileClose(); }}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
              (optimisticPath ?? pathname).startsWith("/dashboard/team")
                ? "bg-accent/10 text-accent-hover border border-accent/20"
                : "text-text-secondary hover:bg-dark-card hover:text-text-primary border border-transparent"
            }`}
            title={collapsed ? t("nav.team") : undefined}
          >
            <UsersRound size={18} className={(optimisticPath ?? pathname).startsWith("/dashboard/team") ? "text-accent" : ""} />
            {!collapsed && <span>{t("nav.team")}</span>}
          </Link>
        )}

        {/* Settings — always visible */}
        {(!navSearch.trim() || t("nav.settings").toLowerCase().includes(navSearch.toLowerCase())) && (
          <Link
            href="/dashboard/settings"
            onClick={() => { setOptimisticPath("/dashboard/settings"); onMobileClose(); }}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
              (optimisticPath ?? pathname).startsWith("/dashboard/settings")
                ? "bg-accent/10 text-accent-hover border border-accent/20"
                : "text-text-secondary hover:bg-dark-card hover:text-text-primary border border-transparent"
            }`}
            title={collapsed ? t("nav.settings") : undefined}
          >
            <Settings size={18} className={(optimisticPath ?? pathname).startsWith("/dashboard/settings") ? "text-accent" : ""} />
            {!collapsed && <span>{t("nav.settings")}</span>}
          </Link>
        )}
      </nav>

      {/* User & Logout */}
      <div className="p-2 border-t border-dark-border shrink-0" style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}>
        {!collapsed && (
          <div className="px-3 py-2 mb-1">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-accent/60 to-purple-500/60 flex items-center justify-center text-xs font-bold text-white">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-text-primary truncate">{user.name}</p>
                <p className="text-[10px] text-text-muted truncate">{user.email}</p>
              </div>
            </div>
          </div>
        )}
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-text-muted hover:bg-danger/10 hover:text-danger w-full border border-transparent disabled:opacity-60"
          title={collapsed ? t("nav.logout") : undefined}
        >
          {loggingOut ? <Loader2 size={18} className="animate-spin" /> : <LogOut size={18} />}
          {!collapsed && <span>{loggingOut ? "..." : t("nav.logout")}</span>}
        </button>
      </div>
    </aside>
  );
}
