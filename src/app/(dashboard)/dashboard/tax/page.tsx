"use client";

import { useEffect, useState } from "react";
import { PermissionGuard } from "@/components/PermissionGuard";
import { TablePageSkeleton } from "@/components/skeletons/TablePageSkeleton";
import { useOrgSettings, useOrgTimezone, currencySymbol } from "@/components/OrgSettingsProvider";
import { formatDateInTz } from "@/lib/tz";
import { useTranslation } from "@/components/LanguageProvider";

interface TaxInvoice {
  id: string;
  number: string;
  date: string;
  status: string;
  subtotal: number;
  tax: number;
  taxRate: number;
  total: number;
  client: { name: string };
}

const STATUS_STYLES: Record<string, string> = {
  paid: "bg-green-500/15 text-green-400",
  sent: "bg-blue-500/15 text-blue-400",
  overdue: "bg-red-500/15 text-red-400",
  draft: "bg-dark-input text-text-muted",
  partially_paid: "bg-amber-500/15 text-amber-400",
};

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtCompact(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return (n / 1_000_000_000).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + "B";
  if (abs >= 1_000_000)     return (n / 1_000_000).toLocaleString("en-US",     { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + "M";
  if (abs >= 1_000)         return (n / 1_000).toLocaleString("en-US",         { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + "K";
  return fmt(n);
}

export default function TaxPage() {
  const { orgSettings } = useOrgSettings();
  const tz = useOrgTimezone();
  const sym = currencySymbol(orgSettings.defaultCurrency);
  const t = useTranslation();
  const [invoices, setInvoices] = useState<TaxInvoice[]>([]);
  const [totalTaxCollected, setTotalTaxCollected] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/tax")
      .then((r) => r.json())
      .then((data) => {
        setInvoices(data.invoices ?? []);
        setTotalTaxCollected(data.totalTaxCollected ?? 0);
      })
      .finally(() => setLoading(false));
  }, []);

  const paidTax = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.tax, 0);
  const pendingTax = invoices.filter((i) => i.status === "sent" || i.status === "overdue").reduce((s, i) => s + i.tax, 0);

  if (loading) return <TablePageSkeleton rows={6} hasFilters statCards={4} cols={5} />;

  return (
    <PermissionGuard feature="tax">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl sm:text-2xl font-bold text-text-primary">{t("tax.title")}</h1>
          <p className="text-text-muted text-sm mt-1">{t("tax.subtitle")}</p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          <div className="relative bg-dark-card border border-dark-border rounded-xl p-3 sm:p-4 group">
            <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-dark-bg border border-dark-border text-text-primary text-xs px-2.5 py-1.5 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20">
              {sym}{fmt(paidTax)}
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-dark-border" />
            </div>
            <p className="text-xs text-text-muted uppercase font-medium mb-1">{t("tax.collected")}</p>
            <p className="text-lg sm:text-2xl font-bold text-green-400">{sym}{fmtCompact(paidTax)}</p>
            <p className="text-xs text-text-muted mt-1">{t("tax.collected_hint")}</p>
          </div>
          <div className="relative bg-dark-card border border-dark-border rounded-xl p-3 sm:p-4 group">
            <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-dark-bg border border-dark-border text-text-primary text-xs px-2.5 py-1.5 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20">
              {sym}{fmt(pendingTax)}
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-dark-border" />
            </div>
            <p className="text-xs text-text-muted uppercase font-medium mb-1">{t("tax.pending")}</p>
            <p className="text-lg sm:text-2xl font-bold text-yellow-400">{sym}{fmtCompact(pendingTax)}</p>
            <p className="text-xs text-text-muted mt-1">{t("tax.pending_hint")}</p>
          </div>
          <div className="col-span-2 sm:col-span-1 bg-dark-card border border-dark-border rounded-xl p-3 sm:p-4">
            <p className="text-xs text-text-muted uppercase font-medium mb-1">{t("tax.total_invoices")}</p>
            <p className="text-lg sm:text-2xl font-bold text-text-primary">{invoices.length}</p>
            <p className="text-xs text-text-muted mt-1">{t("tax.all_statuses")}</p>
          </div>
        </div>

        {/* Table */}
        <div className="bg-dark-card border border-dark-border rounded-xl overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-text-muted">{t("common.loading")}</div>
          ) : invoices.length === 0 ? (
            <div className="p-8 text-center text-text-muted">{t("invoices.empty")}</div>
          ) : (
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-dark-border bg-dark-input/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">{t("tax.invoice")}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">{t("invoices.client")}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">{t("field.date")}</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">{t("field.status")}</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">{t("invoices.subtotal")}</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">{t("tax.tax_pct")}</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">{t("tax.tax_amount")}</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-text-muted uppercase tracking-wider">{t("field.total")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-border">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-dark-input/30 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-text-primary">{inv.number}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{inv.client.name}</td>
                    <td className="px-4 py-3 text-sm text-text-muted">
                      {formatDateInTz(inv.date, tz)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_STYLES[inv.status] ?? "bg-dark-input text-text-muted"}`}>
                        {t(`status.${inv.status}`)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary text-right">{sym}{fmt(inv.subtotal)}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary text-right">{inv.taxRate}%</td>
                    <td className={`px-4 py-3 text-sm font-medium text-right ${inv.status === "paid" ? "text-green-400" : "text-text-secondary"}`}>
                      {sym}{fmt(inv.tax)}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-text-primary text-right">{sym}{fmt(inv.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-dark-border bg-dark-input/30">
                  <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-text-secondary">{t("tax.totals")}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-text-primary text-right">
                    {sym}{fmt(invoices.reduce((s, i) => s + i.subtotal, 0))}
                  </td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-sm font-semibold text-green-400 text-right">
                    {sym}{fmt(invoices.reduce((s, i) => s + i.tax, 0))}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-text-primary text-right">
                    {sym}{fmt(invoices.reduce((s, i) => s + i.total, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </PermissionGuard>
  );
}
