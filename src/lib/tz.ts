/**
 * Timezone utilities — all date helpers go through these so the org timezone
 * is respected everywhere (form defaults, display, filter ranges).
 */

/** Returns "YYYY-MM-DD" for today in the given timezone (for <input type="date"> defaults). */
export function todayInTz(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Returns "YYYY-MM-DD" for the first day of the current month in the given timezone. */
export function monthStartInTz(tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
  // en-CA gives "YYYY-MM", append "-01"
  return `${parts}-01`;
}

/** Returns { from: "YYYY-MM-DD", to: "YYYY-MM-DD" } for the previous calendar month in the given timezone. */
export function lastMonthRangeInTz(tz: string): { from: string; to: string } {
  const now = new Date();
  // Get current year/month in tz
  const ymParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
  }).format(now).split("-"); // ["YYYY", "MM"]
  let year = parseInt(ymParts[0]);
  let month = parseInt(ymParts[1]); // 1-12

  // Go back one month
  month -= 1;
  if (month === 0) { month = 12; year -= 1; }

  const pad = (n: number) => String(n).padStart(2, "0");
  // Last day of that month: day 0 of the next month
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate(); // works since we just need days-in-month
  return {
    from: `${year}-${pad(month)}-01`,
    to: `${year}-${pad(month)}-${pad(lastDay)}`,
  };
}

/** Returns the current year in the given timezone. */
export function currentYearInTz(tz: string): number {
  return parseInt(
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric" }).format(new Date())
  );
}

/** Returns the current month number (1-12) in the given timezone. */
export function currentMonthInTz(tz: string): number {
  return parseInt(
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, month: "2-digit" }).format(new Date())
  );
}

/** Formats a Date or date string for display as DD/MM/YYYY in the given timezone. */
export function formatDateInTz(date: Date | string, tz: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

/** Formats a Date for display with month abbreviation e.g. "15 Jan 2026" in the given timezone. */
export function formatDateLongInTz(date: Date | string, tz: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

/** Formats a date with only month abbreviation e.g. "Jan" in the given timezone. */
export function formatMonthInTz(date: Date | string, tz: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    month: "short",
  }).format(d);
}

/** Formats a date + time e.g. "15/01/2026, 14:32" in the given timezone. */
export function formatDateTimeInTz(date: Date | string, tz: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** Major IANA timezones grouped by region for the settings selector. */
export const TIMEZONES: { region: string; zones: { tz: string; city: string }[] }[] = [
  {
    region: "UTC",
    zones: [{ tz: "UTC", city: "UTC / Greenwich Mean Time" }],
  },
  {
    region: "Middle East",
    zones: [
      { tz: "Asia/Beirut", city: "Beirut (Lebanon)" },
      { tz: "Asia/Riyadh", city: "Riyadh (Saudi Arabia)" },
      { tz: "Asia/Dubai", city: "Dubai (UAE)" },
      { tz: "Asia/Kuwait", city: "Kuwait City" },
      { tz: "Asia/Qatar", city: "Doha (Qatar)" },
      { tz: "Asia/Baghdad", city: "Baghdad (Iraq)" },
      { tz: "Asia/Amman", city: "Amman (Jordan)" },
      { tz: "Asia/Damascus", city: "Damascus (Syria)" },
      { tz: "Asia/Jerusalem", city: "Jerusalem / Tel Aviv" },
      { tz: "Asia/Tehran", city: "Tehran (Iran)" },
      { tz: "Asia/Muscat", city: "Muscat (Oman)" },
      { tz: "Asia/Bahrain", city: "Manama (Bahrain)" },
      { tz: "Asia/Aden", city: "Aden (Yemen)" },
      { tz: "Asia/Nicosia", city: "Nicosia (Cyprus)" },
    ],
  },
  {
    region: "Africa",
    zones: [
      { tz: "Africa/Cairo", city: "Cairo (Egypt)" },
      { tz: "Africa/Casablanca", city: "Casablanca (Morocco)" },
      { tz: "Africa/Tunis", city: "Tunis (Tunisia)" },
      { tz: "Africa/Algiers", city: "Algiers (Algeria)" },
      { tz: "Africa/Tripoli", city: "Tripoli (Libya)" },
      { tz: "Africa/Lagos", city: "Lagos (Nigeria)" },
      { tz: "Africa/Nairobi", city: "Nairobi (Kenya)" },
      { tz: "Africa/Johannesburg", city: "Johannesburg (South Africa)" },
      { tz: "Africa/Addis_Ababa", city: "Addis Ababa (Ethiopia)" },
      { tz: "Africa/Khartoum", city: "Khartoum (Sudan)" },
    ],
  },
  {
    region: "Europe",
    zones: [
      { tz: "Europe/London", city: "London (UK)" },
      { tz: "Europe/Lisbon", city: "Lisbon (Portugal)" },
      { tz: "Europe/Dublin", city: "Dublin (Ireland)" },
      { tz: "Europe/Paris", city: "Paris (France)" },
      { tz: "Europe/Berlin", city: "Berlin (Germany)" },
      { tz: "Europe/Amsterdam", city: "Amsterdam (Netherlands)" },
      { tz: "Europe/Brussels", city: "Brussels (Belgium)" },
      { tz: "Europe/Madrid", city: "Madrid (Spain)" },
      { tz: "Europe/Rome", city: "Rome (Italy)" },
      { tz: "Europe/Zurich", city: "Zurich (Switzerland)" },
      { tz: "Europe/Vienna", city: "Vienna (Austria)" },
      { tz: "Europe/Prague", city: "Prague (Czech Republic)" },
      { tz: "Europe/Warsaw", city: "Warsaw (Poland)" },
      { tz: "Europe/Budapest", city: "Budapest (Hungary)" },
      { tz: "Europe/Stockholm", city: "Stockholm (Sweden)" },
      { tz: "Europe/Oslo", city: "Oslo (Norway)" },
      { tz: "Europe/Copenhagen", city: "Copenhagen (Denmark)" },
      { tz: "Europe/Helsinki", city: "Helsinki (Finland)" },
      { tz: "Europe/Bucharest", city: "Bucharest (Romania)" },
      { tz: "Europe/Athens", city: "Athens (Greece)" },
      { tz: "Europe/Istanbul", city: "Istanbul (Turkey)" },
      { tz: "Europe/Moscow", city: "Moscow (Russia)" },
      { tz: "Europe/Kiev", city: "Kyiv (Ukraine)" },
    ],
  },
  {
    region: "Asia",
    zones: [
      { tz: "Asia/Karachi", city: "Karachi (Pakistan)" },
      { tz: "Asia/Kolkata", city: "Mumbai / Delhi (India)" },
      { tz: "Asia/Colombo", city: "Colombo (Sri Lanka)" },
      { tz: "Asia/Kathmandu", city: "Kathmandu (Nepal)" },
      { tz: "Asia/Dhaka", city: "Dhaka (Bangladesh)" },
      { tz: "Asia/Yangon", city: "Yangon (Myanmar)" },
      { tz: "Asia/Bangkok", city: "Bangkok (Thailand)" },
      { tz: "Asia/Ho_Chi_Minh", city: "Ho Chi Minh City (Vietnam)" },
      { tz: "Asia/Jakarta", city: "Jakarta (Indonesia)" },
      { tz: "Asia/Singapore", city: "Singapore" },
      { tz: "Asia/Kuala_Lumpur", city: "Kuala Lumpur (Malaysia)" },
      { tz: "Asia/Shanghai", city: "Beijing / Shanghai (China)" },
      { tz: "Asia/Hong_Kong", city: "Hong Kong" },
      { tz: "Asia/Taipei", city: "Taipei (Taiwan)" },
      { tz: "Asia/Tokyo", city: "Tokyo (Japan)" },
      { tz: "Asia/Seoul", city: "Seoul (South Korea)" },
      { tz: "Asia/Kabul", city: "Kabul (Afghanistan)" },
      { tz: "Asia/Almaty", city: "Almaty (Kazakhstan)" },
      { tz: "Asia/Tashkent", city: "Tashkent (Uzbekistan)" },
    ],
  },
  {
    region: "Americas",
    zones: [
      { tz: "America/New_York", city: "New York (EST)" },
      { tz: "America/Chicago", city: "Chicago (CST)" },
      { tz: "America/Denver", city: "Denver (MST)" },
      { tz: "America/Los_Angeles", city: "Los Angeles (PST)" },
      { tz: "America/Anchorage", city: "Anchorage (Alaska)" },
      { tz: "America/Toronto", city: "Toronto (Canada)" },
      { tz: "America/Vancouver", city: "Vancouver (Canada)" },
      { tz: "America/Halifax", city: "Halifax (Canada)" },
      { tz: "America/Mexico_City", city: "Mexico City" },
      { tz: "America/Bogota", city: "Bogotá (Colombia)" },
      { tz: "America/Lima", city: "Lima (Peru)" },
      { tz: "America/Sao_Paulo", city: "São Paulo (Brazil)" },
      { tz: "America/Buenos_Aires", city: "Buenos Aires (Argentina)" },
      { tz: "Pacific/Honolulu", city: "Honolulu (Hawaii)" },
    ],
  },
  {
    region: "Oceania",
    zones: [
      { tz: "Australia/Sydney", city: "Sydney (Australia)" },
      { tz: "Australia/Melbourne", city: "Melbourne (Australia)" },
      { tz: "Australia/Brisbane", city: "Brisbane (Australia)" },
      { tz: "Australia/Perth", city: "Perth (Australia)" },
      { tz: "Australia/Adelaide", city: "Adelaide (Australia)" },
      { tz: "Pacific/Auckland", city: "Auckland (New Zealand)" },
      { tz: "Pacific/Fiji", city: "Suva (Fiji)" },
    ],
  },
];
