"use client";

import { useEffect } from "react";

function applyTheme(theme: string) {
  if (theme === "light") {
    document.documentElement.classList.add("light");
  } else {
    document.documentElement.classList.remove("light");
  }
}

export function ThemeProvider({ theme }: { theme: string }) {
  useEffect(() => {
    // Check localStorage first (set by settings page), fall back to server value
    const stored = localStorage.getItem("theme");
    const effective = stored === "light" || stored === "dark" ? stored : theme;
    applyTheme(effective);
  }, [theme]);

  return null;
}
