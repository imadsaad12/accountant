export interface OrgSettings {
  defaultPhoneCountry: string; // ISO code e.g. "LB"
  defaultCurrency: string;     // e.g. "USD"
  timezone: string;            // IANA timezone e.g. "Asia/Beirut"
  defaultTaxRate: number;      // default invoice tax % e.g. 0
}

export interface UserPrefs {
  theme: "dark" | "light";
  language: "en" | "fr";
}

export const DEFAULT_ORG_SETTINGS: OrgSettings = {
  defaultPhoneCountry: "LB",
  defaultCurrency: "USD",
  timezone: "UTC",
  defaultTaxRate: 0,
};

export const DEFAULT_USER_PREFS: UserPrefs = {
  theme: "dark",
  language: "en",
};

export function parseOrgSettings(json: string | null | undefined): OrgSettings {
  if (!json) return { ...DEFAULT_ORG_SETTINGS };
  try {
    return { ...DEFAULT_ORG_SETTINGS, ...JSON.parse(json) };
  } catch {
    return { ...DEFAULT_ORG_SETTINGS };
  }
}
