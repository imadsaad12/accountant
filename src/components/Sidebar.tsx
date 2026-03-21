"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Package,
  UserCog,
  FileText,
  Mic,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ScrollText,
  UsersRound,
  Receipt,
  Settings,
  TrendingDown,
  BarChart2,
  X,
} from "lucide-react";
import { useState, useEffect } from "react";
import { canView, type Permissions } from "@/lib/permissions";
import { useTranslation } from "@/components/LanguageProvider";
import CashentLogo from "@/components/CashentLogo";

const NAV_ITEMS = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard, feature: "dashboard" as const },
  { href: "/dashboard/clients", labelKey: "nav.clients", icon: Users, feature: "clients" as const },
  { href: "/dashboard/stock", labelKey: "nav.stock", icon: Package, feature: "products" as const },
  { href: "/dashboard/employees", labelKey: "nav.employees", icon: UserCog, feature: "employees" as const },
  { href: "/dashboard/invoices", labelKey: "nav.invoices", icon: FileText, feature: "invoices" as const },
  { href: "/dashboard/expenses", labelKey: "nav.expenses", icon: TrendingDown, feature: "expenses" as const },
  // { href: "/dashboard/accounts", labelKey: "nav.accounts", icon: BookOpen, feature: "accounts" as const },
  { href: "/dashboard/reports", labelKey: "nav.reports", icon: BarChart2, feature: "reports" as const },
  { href: "/dashboard/ai-assistant", labelKey: "nav.ai", icon: Mic, feature: "ai" as const },
  { href: "/dashboard/activity-log", labelKey: "nav.activity", icon: ScrollText, feature: "activity_log" as const },
  { href: "/dashboard/tax", labelKey: "nav.tax", icon: Receipt, feature: "tax" as const },
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

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (isAdmin) return true;
    if (!permissions) return item.feature === "dashboard"; // show only dashboard while loading
    return canView(permissions, item.feature);
  });

  return (
    <aside
      style={{ height: "100dvh" }}
      className={[
        // Mobile: fixed overlay
        "fixed inset-y-0 left-0 z-50",
        // Desktop: static in-flow
        "md:static md:z-auto",
        // Width
        collapsed ? "md:w-[72px] w-64" : "w-64",
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
            <CashentLogo className="text-xl" />
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

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-0.5 mt-2 overflow-y-auto">
        {visibleItems.map((item) => {
          const activePath = optimisticPath ?? pathname;
          const isActive =
            item.href === "/dashboard"
              ? activePath === "/dashboard"
              : activePath.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => { setOptimisticPath(item.href); onMobileClose(); }}
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
        {isAdmin && (
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
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-text-muted hover:bg-danger/10 hover:text-danger w-full border border-transparent"
          title={collapsed ? t("nav.logout") : undefined}
        >
          <LogOut size={18} />
          {!collapsed && <span>{t("nav.logout")}</span>}
        </button>
      </div>
    </aside>
  );
}
