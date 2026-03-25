"use client";

import { Lock } from "lucide-react";
import { useTranslation } from "@/components/LanguageProvider";

export default function NoAccessPage() {
  const t = useTranslation();
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
