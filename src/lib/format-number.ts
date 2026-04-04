import type { Lang } from "@/lib/i18n";

const LOCALE_MAP: Record<Lang, string> = {
  en: "en-US",
  fr: "fr-FR",
  ar: "ar-SA",
};

export function getLocale(lang: Lang): string {
  return LOCALE_MAP[lang] || "en-US";
}

export function fmtAmt(n: number, lang: Lang = "en"): string {
  return n.toLocaleString(getLocale(lang), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtCompact(n: number, lang: Lang = "en"): string {
  const abs = Math.abs(n);
  const locale = getLocale(lang);
  if (abs >= 1_000_000_000) return (n / 1_000_000_000).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + "B";
  if (abs >= 1_000_000)     return (n / 1_000_000).toLocaleString(locale,     { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + "M";
  if (abs >= 1_000)         return (n / 1_000).toLocaleString(locale,         { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + "K";
  return n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtInt(n: number, lang: Lang = "en"): string {
  return n.toLocaleString(getLocale(lang));
}
