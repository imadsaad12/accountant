"use client";

import { createContext, useContext, useState, useEffect } from "react";
import type { Lang } from "@/lib/i18n";
import { t as translate } from "@/lib/i18n";

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
}

const LanguageContext = createContext<LangCtx>({ lang: "en", setLang: () => {} });

export function LanguageProvider({ lang: serverLang, children }: { lang: Lang; children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(serverLang);

  // On mount, prefer localStorage over server value (instant reactivity)
  useEffect(() => {
    const stored = localStorage.getItem("lang") as Lang | null;
    if (stored === "en" || stored === "fr") setLangState(stored);
  }, []);

  function setLang(newLang: Lang) {
    setLangState(newLang);
    localStorage.setItem("lang", newLang);
  }

  return <LanguageContext.Provider value={{ lang, setLang }}>{children}</LanguageContext.Provider>;
}

export function useLang(): Lang {
  return useContext(LanguageContext).lang;
}

export function useSetLang() {
  return useContext(LanguageContext).setLang;
}

export function useTranslation() {
  const { lang } = useContext(LanguageContext);
  return (key: string) => translate(lang, key);
}
