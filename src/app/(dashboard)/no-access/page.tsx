"use client";

import { useEffect } from "react";
import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/components/LanguageProvider";
import { usePermissions } from "@/components/PermissionGuard";
import { canView } from "@/lib/permissions";
import type { Feature } from "@/lib/permissions";

const FEATURE_ROUTES: { feature: Feature; route: string }[] = [
  { feature: "clients", route: "/dashboard/clients" },
  { feature: "suppliers", route: "/dashboard/suppliers" },
  { feature: "products", route: "/dashboard/products" },
  { feature: "employees", route: "/dashboard/employees" },
  { feature: "invoices", route: "/dashboard/invoices" },
  { feature: "expenses", route: "/dashboard/expenses" },
  { feature: "salary_advances", route: "/dashboard/salary-advances" },
  { feature: "reports", route: "/dashboard/reports" },
  { feature: "ai", route: "/dashboard/ai" },
  { feature: "activity_log", route: "/dashboard/activity-log" },
  { feature: "tax", route: "/dashboard/tax" },
  { feature: "settings", route: "/dashboard/settings" },
];

export default function NoAccessPage() {
  const t = useTranslation();
  const router = useRouter();
  const { info, loading } = usePermissions();

  useEffect(() => {
    if (loading || !info) return;
    if (info.role === "admin") {
      router.replace("/dashboard");
      return;
    }
    const first = FEATURE_ROUTES.find(({ feature }) => canView(info.permissions, feature));
    if (first) {
      router.replace(first.route);
    }
  }, [info, loading, router]);

  return (
    <div className="flex items-center justify-center h-full min-h-[60vh]">
      <div className="text-center max-w-sm px-6">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-5">
          <Lock size={28} className="text-red-400" />
        </div>
        <h1 className="text-xl font-bold text-text-primary mb-2">{t("team.no_access")}</h1>
        <p className="text-text-muted text-sm">{t("settings.no_permission")}</p>
      </div>
    </div>
  );
}
