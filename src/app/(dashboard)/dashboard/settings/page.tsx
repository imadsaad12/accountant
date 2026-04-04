"use client";

import { useEffect, useState } from "react";
import { Check, Globe, Palette, Phone, DollarSign, Lock, Building2, Clock, Loader2, Percent, Trash2, Database, AlertTriangle, X, Mail } from "lucide-react";
import { SettingsSkeleton } from "@/components/skeletons/SettingsSkeleton";
import { TIMEZONES } from "@/lib/tz";
import { COUNTRIES } from "@/components/PhoneInput";
import { useTranslation, useSetLang } from "@/components/LanguageProvider";
import { useOrgSettings } from "@/components/OrgSettingsProvider";
import type { Lang } from "@/lib/i18n";

const CURRENCIES = [
  { code: "USD", name: "US Dollar" },
  { code: "EUR", name: "Euro" },
  { code: "LBP", name: "Lebanese Pound" },
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
  timezone: string;
  defaultTaxRate: number;
}
interface UserPrefs {
  theme: "dark" | "light";
  language: "en" | "fr" | "ar";
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
  const [orgSettings, setOrgSettings] = useState<OrgSettings>({ defaultPhoneCountry: "LB", defaultCurrency: "USD", timezone: "UTC", defaultTaxRate: 0 });
  const [orgName, setOrgName] = useState("");
  const [draft, setDraft] = useState<OrgSettings & { orgName: string }>({ defaultPhoneCountry: "LB", defaultCurrency: "USD", timezone: "UTC", defaultTaxRate: 0, orgName: "" });
  const [userPrefs, setUserPrefs] = useState<UserPrefs>({ theme: "dark", language: "en" });
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailSaved, setEmailSaved] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [canEditOrg, setCanEditOrg] = useState(false);
  const [loading, setLoading] = useState(true);
  const [orgSaving, setOrgSaving] = useState(false);
  const [orgSaved, setOrgSaved] = useState(false);
  const [userSaved, setUserSaved] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [deleteSending, setDeleteSending] = useState(false);
  const [deleteRequested, setDeleteRequested] = useState(false);
  const [dataRequesting, setDataRequesting] = useState(false);
  const [dataRequested, setDataRequested] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        setOrgSettings(data.orgSettings);
        setOrgName(data.orgName ?? "");
        setDraft({ ...data.orgSettings, orgName: data.orgName ?? "" });
        setUserPrefs(data.userPrefs);
        if (data.userEmail != null) {
          setUserEmail(data.userEmail);
          setEmailDraft(data.userEmail);
        }
        setCanEditOrg(data.canEditOrg);
        if (data.deletionRequestedAt) setDeleteRequested(true);
        if (data.dataExportRequestedAt) setDataRequested(true);
      })
      .finally(() => setLoading(false));
  }, []);

  const orgDirty =
    draft.orgName !== orgName ||
    draft.defaultPhoneCountry !== orgSettings.defaultPhoneCountry ||
    draft.defaultCurrency !== orgSettings.defaultCurrency ||
    draft.timezone !== orgSettings.timezone ||
    draft.defaultTaxRate !== orgSettings.defaultTaxRate;

  async function saveOrg() {
    setOrgSaving(true);
    const { orgName: draftName, ...settings } = draft;
    const promises: Promise<unknown>[] = [
      fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "org", data: settings }),
      }),
    ];
    if (draftName.trim() && draftName !== orgName) {
      promises.push(
        fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "org", data: { orgName: draftName } }),
        })
      );
    }
    await Promise.all(promises);
    setOrgSettings(settings);
    setOrgName(draftName);
    updateOrgSettings(settings);
    setOrgSaving(false);
    setOrgSaved(true);
    setTimeout(() => setOrgSaved(false), 2000);
  }

  async function savePassword() {
    setPasswordError("");
    if (!currentPassword) { setPasswordError(t("settings.password_required")); return; }
    if (newPassword.length < 6) { setPasswordError(t("settings.password_min")); return; }
    if (newPassword !== confirmPassword) { setPasswordError(t("settings.password_mismatch")); return; }
    setPasswordSaving(true);
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "account", data: { currentPassword, password: newPassword } }),
    });
    if (res.ok) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSaved(true);
      setTimeout(() => setPasswordSaved(false), 2000);
    } else {
      const data = await res.json();
      setPasswordError(data.error || t("settings.password_fail"));
    }
    setPasswordSaving(false);
  }

  async function saveEmail() {
    setEmailError("");
    setEmailSaving(true);
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "account", data: { email: emailDraft } }),
    });
    if (res.ok) {
      setUserEmail(emailDraft);
      setEmailSaved(true);
      setTimeout(() => setEmailSaved(false), 2000);
    } else {
      const data = await res.json();
      setEmailError(data.error || t("settings.email_fail"));
    }
    setEmailSaving(false);
  }

  async function saveUser(updated: UserPrefs) {
    setUserPrefs(updated);
    localStorage.setItem("theme", updated.theme);
    if (updated.theme === "light") {
      document.documentElement.classList.add("light");
    } else {
      document.documentElement.classList.remove("light");
    }
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
    return <SettingsSkeleton />;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-text-primary">{t("settings.title")}</h1>
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
          {orgSaved ? (
            <SavedBadge show={orgSaved} label={t("settings.saved")} />
          ) : canEditOrg ? (
            <button
              type="button"
              onClick={saveOrg}
              disabled={!orgDirty || orgSaving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-accent rounded-lg hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {orgSaving ? <Loader2 size={12} className="animate-spin" /> : null}
              {t("common.save")}
            </button>
          ) : null}
        </div>

        {!canEditOrg ? (
          <div className="px-5 py-4 flex items-center gap-2 text-sm text-text-muted">
            <Lock size={14} />
            {t("settings.no_permission")}
          </div>
        ) : (
          <div className="p-5 space-y-5">
            {/* Organization Name */}
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-text-secondary mb-2">
                <Building2 size={14} className="text-accent" />
                {t("settings.org_name")}
              </label>
              <input
                type="text"
                value={draft.orgName}
                onChange={(e) => setDraft({ ...draft, orgName: e.target.value })}
                className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg focus:ring-accent focus:border-accent focus:outline-none text-sm"
              />
            </div>

            {/* Default Phone Country */}
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-text-secondary mb-2">
                <Phone size={14} className="text-accent" />
                {t("settings.phone_country")}
              </label>
              <select
                value={draft.defaultPhoneCountry}
                onChange={(e) => setDraft({ ...draft, defaultPhoneCountry: e.target.value })}
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
                value={draft.defaultCurrency}
                onChange={(e) => setDraft({ ...draft, defaultCurrency: e.target.value })}
                className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg focus:ring-accent focus:border-accent focus:outline-none"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Timezone */}
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-text-secondary mb-2">
                <Clock size={14} className="text-accent" />
                {t("settings.timezone")}
              </label>
              <select
                value={draft.timezone || "UTC"}
                onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}
                className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg focus:ring-accent focus:border-accent focus:outline-none"
              >
                {TIMEZONES.map((group) => (
                  <optgroup key={group.region} label={group.region}>
                    {group.zones.map((z) => (
                      <option key={z.tz} value={z.tz}>{z.city}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <p className="text-xs text-text-muted mt-1.5">
                {t("settings.timezone_note")}
              </p>
            </div>

            {/* Default Tax Rate */}
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-text-secondary mb-2">
                <Percent size={14} className="text-accent" />
                {t("settings.default_tax_rate")}
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={draft.defaultTaxRate}
                  onChange={(e) => setDraft({ ...draft, defaultTaxRate: parseFloat(e.target.value) || 0 })}
                  onKeyDown={(e) => ["e", "E", "+", "-"].includes(e.key) && e.preventDefault()}
                  className="w-full px-3 py-2 pr-8 bg-dark-input border border-dark-border text-text-primary rounded-lg focus:ring-accent focus:border-accent focus:outline-none text-sm"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">%</span>
              </div>
              <p className="text-xs text-text-muted mt-1.5">
                {t("settings.default_tax_rate_note")}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Account (admin only) ── */}
      {userEmail != null && (
        <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-dark-border">
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Mail size={16} className="text-accent" />
              {t("settings.account")}
            </h2>
            <p className="text-xs text-text-muted mt-0.5">{t("settings.account_note")}</p>
          </div>
          <div className="p-5 space-y-5">
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">{t("settings.email")}</label>
              {emailError && (
                <div className="mb-2 bg-red-500/10 text-red-400 border border-red-500/20 p-3 rounded-lg text-sm">{emailError}</div>
              )}
              <div className="flex gap-3 items-center">
                <input
                  type="email"
                  value={emailDraft}
                  onChange={(e) => { setEmailDraft(e.target.value); setEmailError(""); }}
                  autoComplete="off"
                  className="flex-1 px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg focus:ring-accent focus:border-accent focus:outline-none text-sm"
                />
                {emailSaved ? (
                  <SavedBadge show={emailSaved} label={t("settings.saved")} />
                ) : (
                  <button
                    type="button"
                    onClick={saveEmail}
                    disabled={emailSaving || emailDraft === userEmail || !emailDraft}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {emailSaving ? <Loader2 size={14} className="animate-spin" /> : null}
                    {t("common.save")}
                  </button>
                )}
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">{t("settings.change_password")}</label>
              {passwordError && (
                <div className="mb-2 bg-red-500/10 text-red-400 border border-red-500/20 p-3 rounded-lg text-sm">{passwordError}</div>
              )}
              <div className="space-y-2">
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => { setCurrentPassword(e.target.value); setPasswordError(""); }}
                  placeholder={t("settings.current_password")}
                  autoComplete="current-password"
                  className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg focus:ring-accent focus:border-accent focus:outline-none text-sm"
                />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setPasswordError(""); }}
                  placeholder={t("settings.new_password")}
                  autoComplete="new-password"
                  className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg focus:ring-accent focus:border-accent focus:outline-none text-sm"
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError(""); }}
                  placeholder={t("settings.confirm_password")}
                  autoComplete="new-password"
                  className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg focus:ring-accent focus:border-accent focus:outline-none text-sm"
                />
              </div>
              <div className="flex justify-end mt-3">
                {passwordSaved ? (
                  <SavedBadge show={passwordSaved} label={t("settings.saved")} />
                ) : (
                  <button
                    type="button"
                    onClick={savePassword}
                    disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {passwordSaving ? <Loader2 size={14} className="animate-spin" /> : null}
                    {t("common.save")}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

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
            <div className="flex gap-3 flex-wrap">
              {([["en", "🇬🇧 English"], ["fr", "🇫🇷 Français"], ["ar", "🇱🇧 العربية"]] as const).map(([code, label]) => (
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
      {/* ── Danger Zone ── */}
      {canEditOrg && (
        <div className="bg-dark-card border border-red-500/20 rounded-xl overflow-hidden mt-6">
          <div className="px-5 py-4 border-b border-red-500/20">
            <h2 className="text-sm font-semibold text-red-400 flex items-center gap-2">
              <AlertTriangle size={16} />
              {t("settings.danger_zone")}
            </h2>
            <p className="text-xs text-text-muted mt-0.5">{t("settings.danger_note")}</p>
          </div>
          <div className="p-5 space-y-4">

            {/* Request Data Export */}
            <div className="flex items-center justify-between gap-4 py-3 border-b border-dark-border">
              <div className="flex items-start gap-3">
                <Database size={16} className="text-text-muted mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-text-primary">{t("settings.request_data_export")}</p>
                  <p className="text-xs text-text-muted mt-0.5">
                    {t("settings.request_data_desc")}
                  </p>
                  {dataRequested && (
                    <p className="text-xs text-emerald-400 mt-1">✓ {t("settings.data_requested")}</p>
                  )}
                </div>
              </div>
              <button
                onClick={async () => {
                  if (dataRequested) return;
                  setDataRequesting(true);
                  await fetch("/api/settings/request-data", { method: "POST" });
                  setDataRequesting(false);
                  setDataRequested(true);
                }}
                disabled={dataRequesting || dataRequested}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-dark-border text-text-secondary rounded-lg hover:bg-dark-card-hover disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {dataRequesting ? <Loader2 size={12} className="animate-spin" /> : <Database size={12} />}
                {dataRequested ? t("settings.requested") : t("settings.request_data_btn")}
              </button>
            </div>

            {/* Delete Organization */}
            <div className="flex items-center justify-between gap-4 py-3">
              <div className="flex items-start gap-3">
                <Trash2 size={16} className="text-red-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-400">{t("settings.delete_org")}</p>
                  <p className="text-xs text-text-muted mt-0.5">
                    {t("settings.delete_org_desc")}
                  </p>
                  {deleteRequested && (
                    <p className="text-xs text-amber-400 mt-1">⚠ {t("settings.deletion_requested")}</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => { setDeleteConfirmName(""); setShowDeleteModal(true); }}
                disabled={deleteRequested}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 size={12} />
                {deleteRequested ? t("settings.deletion_requested_btn") : t("settings.delete_org")}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-dark-card border border-red-500/30 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-red-500/15 flex items-center justify-center">
                  <AlertTriangle size={16} className="text-red-400" />
                </div>
                <h2 className="text-base font-semibold text-text-primary">{t("settings.delete_org")}</h2>
              </div>
              <button onClick={() => setShowDeleteModal(false)} className="text-text-muted hover:text-text-primary">
                <X size={18} />
              </button>
            </div>

            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-5 space-y-2 text-sm text-text-secondary">
              <p dangerouslySetInnerHTML={{ __html: t("settings.delete_modal_warning1").replace(/<strong>/g, '<strong class="text-red-400">') }} />
              <p dangerouslySetInnerHTML={{ __html: t("settings.delete_modal_warning2").replace(/<strong>/g, '<strong class="text-text-primary">') }} />
              <p dangerouslySetInnerHTML={{ __html: t("settings.delete_modal_warning3").replace(/<strong>/g, '<strong class="text-red-400">') }} />
            </div>

            <div className="mb-5">
              <label className="block text-xs font-medium text-text-secondary mb-2">
                {t("settings.delete_confirm_label")} <strong className="text-text-primary">&quot;{orgName}&quot;</strong>
              </label>
              <input
                value={deleteConfirmName}
                onChange={e => setDeleteConfirmName(e.target.value)}
                placeholder={orgName}
                className="w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary placeholder:text-text-muted rounded-lg text-sm focus:ring-red-500 focus:border-red-500"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 px-4 py-2 text-sm font-medium text-text-secondary bg-dark-card border border-dark-border rounded-lg hover:bg-dark-card-hover"
              >
                {t("settings.cancel")}
              </button>
              <button
                disabled={deleteConfirmName !== orgName || deleteSending}
                onClick={async () => {
                  setDeleteSending(true);
                  await fetch("/api/settings/delete-org", { method: "POST" });
                  setDeleteSending(false);
                  setShowDeleteModal(false);
                  setDeleteRequested(true);
                }}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {deleteSending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                {t("settings.request_deletion")}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
