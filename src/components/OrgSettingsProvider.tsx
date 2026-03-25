"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { OrgSettings } from "@/lib/settings";
import { DEFAULT_ORG_SETTINGS } from "@/lib/settings";

interface OrgSettingsContextValue {
  orgSettings: OrgSettings;
  updateOrgSettings: (s: OrgSettings) => void;
  loading: boolean;
}

const OrgSettingsContext = createContext<OrgSettingsContextValue>({
  orgSettings: DEFAULT_ORG_SETTINGS,
  updateOrgSettings: () => {},
  loading: true,
});

export function OrgSettingsProvider({ children }: { children: React.ReactNode }) {
  const [orgSettings, setOrgSettings] = useState<OrgSettings>(DEFAULT_ORG_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.orgSettings) setOrgSettings(data.orgSettings); })
      .finally(() => setLoading(false));
  }, []);

  return (
    <OrgSettingsContext.Provider value={{ orgSettings, updateOrgSettings: setOrgSettings, loading }}>
      {children}
    </OrgSettingsContext.Provider>
  );
}

export function useOrgSettings() {
  return useContext(OrgSettingsContext);
}

export function useOrgTimezone(): string {
  return useContext(OrgSettingsContext).orgSettings.timezone || "UTC";
}

/** Currency code → symbol */
export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  XOF: "CFA",
  GNF: "FG",
  SLE: "Le",
  GHS: "₵",
  CDF: "FC",
  NGN: "₦",
};

export function currencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[code] ?? code;
}
