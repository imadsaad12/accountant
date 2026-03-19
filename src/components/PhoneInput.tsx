"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Search } from "lucide-react";

interface Country {
  name: string;
  iso: string;
  dialCode: string;
  placeholder: string;
}

export const COUNTRIES: Country[] = [
  { name: "Lebanon", iso: "LB", dialCode: "+961", placeholder: "3 123 456" },
  { name: "Afghanistan", iso: "AF", dialCode: "+93", placeholder: "70 123 4567" },
  { name: "Albania", iso: "AL", dialCode: "+355", placeholder: "67 212 3456" },
  { name: "Algeria", iso: "DZ", dialCode: "+213", placeholder: "551 23 45 67" },
  { name: "Argentina", iso: "AR", dialCode: "+54", placeholder: "9 11 2345 6789" },
  { name: "Australia", iso: "AU", dialCode: "+61", placeholder: "412 345 678" },
  { name: "Austria", iso: "AT", dialCode: "+43", placeholder: "664 123456" },
  { name: "Bahrain", iso: "BH", dialCode: "+973", placeholder: "3600 1234" },
  { name: "Bangladesh", iso: "BD", dialCode: "+880", placeholder: "1812 345678" },
  { name: "Belgium", iso: "BE", dialCode: "+32", placeholder: "470 12 34 56" },
  { name: "Brazil", iso: "BR", dialCode: "+55", placeholder: "11 91234 5678" },
  { name: "Bulgaria", iso: "BG", dialCode: "+359", placeholder: "87 123 4567" },
  { name: "Canada", iso: "CA", dialCode: "+1", placeholder: "506 234 5678" },
  { name: "Chile", iso: "CL", dialCode: "+56", placeholder: "9 6123 4567" },
  { name: "China", iso: "CN", dialCode: "+86", placeholder: "131 2345 6789" },
  { name: "Colombia", iso: "CO", dialCode: "+57", placeholder: "321 123 4567" },
  { name: "Croatia", iso: "HR", dialCode: "+385", placeholder: "91 234 5678" },
  { name: "Cyprus", iso: "CY", dialCode: "+357", placeholder: "96 123456" },
  { name: "Czech Republic", iso: "CZ", dialCode: "+420", placeholder: "601 123 456" },
  { name: "Denmark", iso: "DK", dialCode: "+45", placeholder: "20 12 34 56" },
  { name: "Egypt", iso: "EG", dialCode: "+20", placeholder: "100 123 4567" },
  { name: "Ethiopia", iso: "ET", dialCode: "+251", placeholder: "91 123 4567" },
  { name: "Finland", iso: "FI", dialCode: "+358", placeholder: "41 2345678" },
  { name: "France", iso: "FR", dialCode: "+33", placeholder: "6 12 34 56 78" },
  { name: "Germany", iso: "DE", dialCode: "+49", placeholder: "151 23456789" },
  { name: "Ghana", iso: "GH", dialCode: "+233", placeholder: "23 123 4567" },
  { name: "Greece", iso: "GR", dialCode: "+30", placeholder: "691 234 5678" },
  { name: "Hungary", iso: "HU", dialCode: "+36", placeholder: "20 123 4567" },
  { name: "India", iso: "IN", dialCode: "+91", placeholder: "81234 56789" },
  { name: "Indonesia", iso: "ID", dialCode: "+62", placeholder: "812 3456 7890" },
  { name: "Iran", iso: "IR", dialCode: "+98", placeholder: "912 345 6789" },
  { name: "Iraq", iso: "IQ", dialCode: "+964", placeholder: "790 123 4567" },
  { name: "Ireland", iso: "IE", dialCode: "+353", placeholder: "85 123 4567" },
  { name: "Israel", iso: "IL", dialCode: "+972", placeholder: "50 234 5678" },
  { name: "Italy", iso: "IT", dialCode: "+39", placeholder: "312 345 6789" },
  { name: "Japan", iso: "JP", dialCode: "+81", placeholder: "90 1234 5678" },
  { name: "Jordan", iso: "JO", dialCode: "+962", placeholder: "7 9012 3456" },
  { name: "Kenya", iso: "KE", dialCode: "+254", placeholder: "712 123456" },
  { name: "Kuwait", iso: "KW", dialCode: "+965", placeholder: "5000 0000" },
  { name: "Libya", iso: "LY", dialCode: "+218", placeholder: "91 234 5678" },
  { name: "Malaysia", iso: "MY", dialCode: "+60", placeholder: "12 345 6789" },
  { name: "Mexico", iso: "MX", dialCode: "+52", placeholder: "55 1234 5678" },
  { name: "Morocco", iso: "MA", dialCode: "+212", placeholder: "6 12 34 56 78" },
  { name: "Netherlands", iso: "NL", dialCode: "+31", placeholder: "6 12345678" },
  { name: "New Zealand", iso: "NZ", dialCode: "+64", placeholder: "21 123 4567" },
  { name: "Nigeria", iso: "NG", dialCode: "+234", placeholder: "802 123 4567" },
  { name: "Norway", iso: "NO", dialCode: "+47", placeholder: "406 12 345" },
  { name: "Oman", iso: "OM", dialCode: "+968", placeholder: "9212 3456" },
  { name: "Pakistan", iso: "PK", dialCode: "+92", placeholder: "301 2345678" },
  { name: "Palestine", iso: "PS", dialCode: "+970", placeholder: "59 234 5678" },
  { name: "Peru", iso: "PE", dialCode: "+51", placeholder: "912 345 678" },
  { name: "Philippines", iso: "PH", dialCode: "+63", placeholder: "905 123 4567" },
  { name: "Poland", iso: "PL", dialCode: "+48", placeholder: "512 345 678" },
  { name: "Portugal", iso: "PT", dialCode: "+351", placeholder: "912 345 678" },
  { name: "Qatar", iso: "QA", dialCode: "+974", placeholder: "3312 3456" },
  { name: "Romania", iso: "RO", dialCode: "+40", placeholder: "712 034 567" },
  { name: "Russia", iso: "RU", dialCode: "+7", placeholder: "912 345 6789" },
  { name: "Saudi Arabia", iso: "SA", dialCode: "+966", placeholder: "51 234 5678" },
  { name: "Senegal", iso: "SN", dialCode: "+221", placeholder: "70 123 4567" },
  { name: "Serbia", iso: "RS", dialCode: "+381", placeholder: "60 1234567" },
  { name: "Singapore", iso: "SG", dialCode: "+65", placeholder: "8123 4567" },
  { name: "Slovakia", iso: "SK", dialCode: "+421", placeholder: "912 123 456" },
  { name: "South Africa", iso: "ZA", dialCode: "+27", placeholder: "71 123 4567" },
  { name: "South Korea", iso: "KR", dialCode: "+82", placeholder: "10 1234 5678" },
  { name: "Spain", iso: "ES", dialCode: "+34", placeholder: "612 34 56 78" },
  { name: "Sudan", iso: "SD", dialCode: "+249", placeholder: "91 123 1234" },
  { name: "Sweden", iso: "SE", dialCode: "+46", placeholder: "70 123 45 67" },
  { name: "Switzerland", iso: "CH", dialCode: "+41", placeholder: "78 123 45 67" },
  { name: "Syria", iso: "SY", dialCode: "+963", placeholder: "944 567 890" },
  { name: "Thailand", iso: "TH", dialCode: "+66", placeholder: "81 234 5678" },
  { name: "Tunisia", iso: "TN", dialCode: "+216", placeholder: "20 123 456" },
  { name: "Turkey", iso: "TR", dialCode: "+90", placeholder: "501 234 5678" },
  { name: "Ukraine", iso: "UA", dialCode: "+380", placeholder: "50 123 4567" },
  { name: "United Arab Emirates", iso: "AE", dialCode: "+971", placeholder: "50 123 4567" },
  { name: "United Kingdom", iso: "GB", dialCode: "+44", placeholder: "7911 123456" },
  { name: "United States", iso: "US", dialCode: "+1", placeholder: "201 555 0123" },
  { name: "Venezuela", iso: "VE", dialCode: "+58", placeholder: "412 1234567" },
  { name: "Vietnam", iso: "VN", dialCode: "+84", placeholder: "91 234 56 78" },
  { name: "Yemen", iso: "YE", dialCode: "+967", placeholder: "712 345 678" },
];

function flagEmoji(iso: string) {
  return iso
    .toUpperCase()
    .split("")
    .map(c => String.fromCodePoint(0x1f1e6 - 65 + c.charCodeAt(0)))
    .join("");
}

function parsePhone(raw: string): { country: Country | null; number: string } {
  if (!raw) return { country: null, number: "" };
  // Match longest dial code first to avoid "+1" swallowing "+961"
  const sorted = [...COUNTRIES].sort((a, b) => b.dialCode.length - a.dialCode.length);
  for (const c of sorted) {
    if (raw.startsWith(c.dialCode)) {
      return { country: c, number: raw.slice(c.dialCode.length).replace(/^\s*/, "") };
    }
  }
  return { country: null, number: raw };
}

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  required?: boolean;
  defaultCountry?: string; // ISO code e.g. "US"
}


export function PhoneInput({ value, onChange, className = "", required, defaultCountry }: PhoneInputProps) {
  const { country: parsedCountry, number: parsedNumber } = parsePhone(value);
  const fallback = defaultCountry
    ? (COUNTRIES.find(c => c.iso === defaultCountry) ?? COUNTRIES[0])
    : COUNTRIES[0];
  const [country, setCountry] = useState<Country | null>(parsedCountry ?? fallback);
  const [number, setNumber] = useState(parsedNumber);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);


  // Keep internal state in sync when value is set externally (e.g. openEdit)
  useEffect(() => {
    const { country: c, number: n } = parsePhone(value);
    setCountry(c ?? (defaultCountry ? (COUNTRIES.find(x => x.iso === defaultCountry) ?? COUNTRIES[0]) : COUNTRIES[0]));
    setNumber(n);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function selectCountry(c: Country) {
    setCountry(c);
    setOpen(false);
    setSearch("");
    setNumber("");
    onChange("");
  }

  function handleNumberChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setNumber(val);
    onChange(val ? `${country?.dialCode ?? ""}${val}` : "");
  }

  const filtered = COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.dialCode.includes(search)
  );

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <div className="flex" ref={dropdownRef}>
        {/* Country selector */}
        <div className="relative">
          <button
            type="button"
            onClick={() => { setOpen(o => !o); setSearch(""); }}
            className="flex items-center gap-1.5 h-full px-3 py-2 bg-dark-input border border-dark-border border-r-0 rounded-l-lg text-text-primary hover:bg-dark-card-hover focus:outline-none focus:ring-1 focus:ring-accent text-sm whitespace-nowrap"
          >
            <span>{country ? flagEmoji(country.iso) : "🌐"}</span>
            <span className="text-text-muted">{country?.dialCode ?? "+"}</span>
            <ChevronDown size={12} className="text-text-muted" />
          </button>

          {open && (
            <div className="absolute z-50 top-full left-0 mt-1 w-64 bg-dark-card border border-dark-border rounded-lg shadow-xl overflow-hidden">
              <div className="p-2 border-b border-dark-border">
                <div className="flex items-center gap-2 px-2 py-1.5 bg-dark-input rounded-md">
                  <Search size={13} className="text-text-muted shrink-0" />
                  <input
                    autoFocus
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search country..."
                    className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
                  />
                </div>
              </div>
              <ul className="max-h-52 overflow-y-auto">
                {filtered.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-text-muted">No results</li>
                ) : filtered.map(c => (
                  <li key={c.iso}>
                    <button
                      type="button"
                      onClick={() => selectCountry(c)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-dark-card-hover text-left ${country?.iso === c.iso ? "bg-accent/10 text-accent" : "text-text-primary"}`}
                    >
                      <span className="text-base">{flagEmoji(c.iso)}</span>
                      <span className="flex-1 truncate">{c.name}</span>
                      <span className="text-text-muted shrink-0">{c.dialCode}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Number input */}
        <input
          type="tel"
          required={required}
          value={number}
          onChange={handleNumberChange}
          placeholder={country?.placeholder ?? "Phone number"}
          className="flex-1 min-w-0 px-3 py-2 bg-dark-input border border-dark-border rounded-r-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent text-sm"
        />
      </div>

      <p className="text-xs text-text-muted">
        e.g. {country?.dialCode}{country?.placeholder ? ` ${country.placeholder}` : ""}
      </p>
    </div>
  );
}
