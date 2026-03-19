"use client";

import { useEffect, useState } from "react";
import { Check, Globe, Palette, Phone, DollarSign, Lock } from "lucide-react";
import { COUNTRIES } from "@/components/PhoneInput";
import { useTranslation, useSetLang } from "@/components/LanguageProvider";
import { useOrgSettings } from "@/components/OrgSettingsProvider";
import type { Lang } from "@/lib/i18n";

const CURRENCIES = [
  { code: "USD", name: "US Dollar" },
  { code: "EUR", name: "Euro" },
  { code: "XOF", name: "CFA Franc (Senegal, Ivory Coast)" },
  { code: "GNF", name: "Guinean Franc" },
  { code: "SLE", name: "Leone (Sierra Leone)" },
  { code: "GHS", name: "Cedi (Ghana)" },
  { code: "CDF", name: "Congolese Franc (Kinshasa)" },
  { code: "NGN", name: "Naira (Nigeria)" },
];

interface OrgSettings {
  defaultPhoneCountry: string;
  defaultCurrency: string;
}
interface UserPrefs {
  theme: "dark" | "light";
  language: "en" | "fr";
}

function SavedBadge({ show, label }: { show: boolean; label: string }) {
  if (!show) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-green-400 font-medium">
      <Check size={12} /> {label}
    </span>
  );
}

export default function SettingsPage() {
  const t = useTranslation();
  const setLang = useSetLang();
  const { updateOrgSettings } = useOrgSettings();
  const [orgSettings, setOrgSettings] = useState<OrgSettings>({ defaultPhoneCountry: "LB", defaultCurrency: "USD" });
  const [userPrefs, setUserPrefs] = useState<UserPrefs>({ theme: "dark", language: "en" });
  const [canEditOrg, setCanEditOrg] = useState(false);
  const [loading, setLoading] = useState(true);
  const [orgSaved, setOrgSaved] = useState(false);
  const [userSaved, setUserSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        setOrgSettings(data.orgSettings);
        setUserPrefs(data.userPrefs);
        setCanEditOrg(data.canEditOrg);
      })
      .finally(() => setLoading(false));
  }, []);

  async function saveOrg(updated: OrgSettings) {
    setOrgSettings(updated);
    updateOrgSettings(updated); // update context immediately — all pages react
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "org", data: updated }),
    });
    setOrgSaved(true);
    setTimeout(() => setOrgSaved(false), 2000);
  }

  async function saveUser(updated: UserPrefs) {
    setUserPrefs(updated);
    // Apply theme immediately and persist to localStorage
    localStorage.setItem("theme", updated.theme);
    if (updated.theme === "light") {
      document.documentElement.classList.add("light");
    } else {
      document.documentElement.classList.remove("light");
    }
    // Apply language immediately — no refresh needed
    setLang(updated.language as Lang);
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "user", data: updated }),
    });
    setUserSaved(true);
    setTimeout(() => setUserSaved(false), 2000);
  }

  if (loading) {
    return <div className="max-w-2xl mx-auto p-8 text-center text-text-muted">{t("common.loading")}</div>;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">{t("settings.title")}</h1>
        <p className="text-text-muted text-sm mt-1">{t("settings.subtitle")}</p>
      </div>

      {/* ── Organization Settings ── */}
      <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-dark-border flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Globe size={16} className="text-accent" />
              {t("settings.org_section")}
            </h2>
            <p className="text-xs text-text-muted mt-0.5">{t("settings.org_note")}</p>
          </div>
          <SavedBadge show={orgSaved} label={t("settings.saved")} />
        </div>

        {!canEditOrg ? (
          <div className="px-5 py-4 flex items-center gap-2 text-sm text-text-muted">
            <Lock size={14} />
            {t("settings.no_permission")}
          </div>
        ) : (
          <div className="p-5 space-y-5">
            {/* Default Phone Country */}
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-text-secondary mb-2">
                <Phone size={14} className="text-accent" />
                {t("settings.phone_country")}
              </label>
              <select
                value={orgSettings.defaultPhoneCountry}
                onChange={(e) => saveOrg({ ...orgSettings, defaultPhoneCountry: e.target.value })}
                className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg focus:ring-accent focus:border-accent focus:outline-none"
              >
                {COUNTRIES.map((c) => (
                  <option key={c.iso} value={c.iso}>
                    {c.name} ({c.dialCode})
                  </option>
                ))}
              </select>
            </div>

            {/* Default Currency */}
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-text-secondary mb-2">
                <DollarSign size={14} className="text-accent" />
                {t("settings.currency")}
              </label>
              <select
                value={orgSettings.defaultCurrency}
                onChange={(e) => saveOrg({ ...orgSettings, defaultCurrency: e.target.value })}
                className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg focus:ring-accent focus:border-accent focus:outline-none"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* ── Personal Preferences ── */}
      <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-dark-border flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Palette size={16} className="text-accent" />
              {t("settings.personal_section")}
            </h2>
            <p className="text-xs text-text-muted mt-0.5">{t("settings.personal_note")}</p>
          </div>
          <SavedBadge show={userSaved} label={t("settings.saved")} />
        </div>

        <div className="p-5 space-y-5">
          {/* Theme */}
          <div>
            <label className="text-sm font-medium text-text-secondary mb-3 block">
              {t("settings.theme")}
            </label>
            <div className="flex gap-3">
              {(["dark", "light"] as const).map((th) => (
                <button
                  key={th}
                  type="button"
                  onClick={() => saveUser({ ...userPrefs, theme: th })}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                    userPrefs.theme === th
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-dark-border text-text-muted hover:border-dark-border hover:text-text-secondary"
                  }`}
                >
                  <span className={`w-4 h-4 rounded-full border-2 ${th === "dark" ? "bg-gray-900 border-gray-600" : "bg-white border-gray-300"}`} />
                  {th === "dark" ? t("settings.theme_dark") : t("settings.theme_light")}
                  {userPrefs.theme === th && <Check size={14} />}
                </button>
              ))}
            </div>
          </div>

          {/* Language */}
          <div>
            <label className="text-sm font-medium text-text-secondary mb-3 block">
              {t("settings.language")}
            </label>
            <div className="flex gap-3">
              {([["en", "🇬🇧 English"], ["fr", "🇫🇷 Français"]] as const).map(([code, label]) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => saveUser({ ...userPrefs, language: code })}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                    userPrefs.language === code
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-dark-border text-text-muted hover:border-dark-border hover:text-text-secondary"
                  }`}
                >
                  {label}
                  {userPrefs.language === code && <Check size={14} />}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
