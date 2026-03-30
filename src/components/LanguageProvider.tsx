"use client";

import { createContext, useContext, useState, useEffect } from "react";
import type { Lang } from "@/lib/i18n";
import { t as translate } from "@/lib/i18n";

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
}

const LanguageContext = createContext<LangCtx>({ lang: "en", setLang: () => {} });

function applyDir(lang: Lang) {
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  document.documentElement.lang = lang;
}

export function LanguageProvider({ lang: serverLang, children }: { lang: Lang; children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(serverLang);

  useEffect(() => {
    const stored = localStorage.getItem("lang") as Lang | null;
    if (stored === "en" || stored === "fr" || stored === "ar") {
      setLangState(stored);
      applyDir(stored);
    } else {
      applyDir(serverLang);
    }
  }, [serverLang]);

  function setLang(newLang: Lang) {
    setLangState(newLang);
    localStorage.setItem("lang", newLang);
    applyDir(newLang);
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
  return (key: string, params?: Record<string, string>) => {
    let result = translate(lang, key);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        result = result.replace(new RegExp(`\\{${k}\\}`, "g"), v);
      }
    }
    return result;
  };
}
