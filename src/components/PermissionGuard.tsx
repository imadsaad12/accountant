"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { canView, canEdit, type Feature, type Permissions } from "@/lib/permissions";

interface UserInfo {
  role: string;
  permissions: Permissions;
}

let cachedUserInfo: UserInfo | null = null;

export function clearPermissionsCache() {
  cachedUserInfo = null;
}

export function usePermissions() {
  const [info, setInfo] = useState<UserInfo | null>(cachedUserInfo);
  const [loading, setLoading] = useState(!cachedUserInfo);

  useEffect(() => {
    if (cachedUserInfo) return;
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        const userInfo: UserInfo = { role: data.role, permissions: data.permissions };
        cachedUserInfo = userInfo;
        setInfo(userInfo);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const isAdmin = info?.role === "admin";

  return {
    info,
    loading,
    isAdmin,
    canViewFeature: (f: Feature) => isAdmin || (info ? canView(info.permissions, f) : false),
    canEditFeature: (f: Feature) => isAdmin || (info ? canEdit(info.permissions, f) : false),
  };
}

export function PermissionGuard({
  feature,
  requireEdit = false,
  children,
}: {
  feature: Feature;
  requireEdit?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { info, loading } = usePermissions();

  useEffect(() => {
    if (loading || !info) return;
    if (info.role === "admin") return;
    const allowed = requireEdit ? canEdit(info.permissions, feature) : canView(info.permissions, feature);
    if (!allowed) router.replace("/dashboard");
  }, [info, loading, feature, requireEdit, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!info) return null;
  if (info.role === "admin") return <>{children}</>;

  const allowed = requireEdit ? canEdit(info.permissions, feature) : canView(info.permissions, feature);
  if (!allowed) return null;

  return <>{children}</>;
}
