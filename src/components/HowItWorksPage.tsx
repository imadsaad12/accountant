"use client";

import { useState } from "react";
import { useTranslation } from "@/components/LanguageProvider";
import { ChevronDown, Menu, X } from "lucide-react";

const SECTIONS = [
  { id: "invoicing", label: "Invoicing" },
  { id: "expenses", label: "Expenses" },
  { id: "salary", label: "Salary Management" },
  { id: "advances", label: "Salary Advances" },
  { id: "supplier-bills", label: "Supplier Bills" },
  { id: "dashboard", label: "Dashboard Metrics" },
  { id: "reports", label: "Financial Reports" },
  { id: "stock", label: "Stock Management" },
  { id: "accounts", label: "Accounts & Journal" },
  { id: "faq", label: "FAQ" },
];

export default function HowItWorksPage() {
  const t = useTranslation();
  const [activeSection, setActiveSection] = useState("invoicing");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleSectionClick = (id: string) => {
    setActiveSection(id);
    setSidebarOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="flex h-screen bg-dark-bg">
      {/* Sidebar */}
      <div
        className={`fixed lg:relative w-64 h-screen bg-dark-sidebar border-r border-dark-border overflow-y-auto transition-all duration-300 z-40 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="sticky top-0 bg-dark-sidebar border-b border-dark-border p-6">
          <h2 className="text-lg font-bold text-text-primary">
            {t("howItWorks.title")}
          </h2>
          <p className="text-xs text-text-muted mt-2">
            {t("howItWorks.subtitle")}
          </p>
        </div>

        <nav className="p-4 space-y-1">
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              onClick={() => handleSectionClick(section.id)}
              className={`w-full text-left px-4 py-3 rounded-lg transition-colors text-sm font-medium ${
                activeSection === section.id
                  ? "bg-accent text-white shadow-lg shadow-accent/30"
                  : "text-text-secondary hover:text-text-primary hover:bg-dark-card"
              }`}
            >
              {section.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 lg:hidden z-30"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-20 bg-dark-bg/95 backdrop-blur-sm border-b border-dark-border">
          <div className="px-4 sm:px-6 py-4 flex items-center justify-between">
            <h1 className="text-2xl font-bold text-text-primary">
              {t("howItWorks.title")}
            </h1>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 hover:bg-dark-card rounded-lg transition-colors"
            >
              {sidebarOpen ? (
                <X size={24} className="text-text-primary" />
              ) : (
                <Menu size={24} className="text-text-primary" />
              )}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 pb-20">
          {/* Invoicing */}
          <Section id="invoicing" title={t("howItWorks.section.invoicing")}>
            <Subsection title={t("howItWorks.invoicing.overview")}>
              <p className="text-text-secondary">
                {t("howItWorks.invoicing.overviewText")}
              </p>
            </Subsection>

            <Subsection title={t("howItWorks.invoicing.calculation")}>
              <FormulaBox
                formulas={[
                  "Subtotal = Σ(item.quantity × item.unitPrice)",
                  "Discount Amount = Subtotal × (discount% ÷ 100)",
                  "After Discount = Subtotal − Discount Amount",
                  "Tax = After Discount × (taxRate% ÷ 100)",
                  "Fees Total = Σ(fee.amount)",
                  "TOTAL = After Discount + Tax + Fees",
                ]}
              />
            </Subsection>

            <Subsection title={t("howItWorks.invoicing.example")}>
              <p className="text-text-muted text-sm mb-4">
                {t("howItWorks.invoicing.exampleDesc")}
              </p>
              <Table
                rows={[
                  ["Item A", "10 units", "$50", "$500"],
                  ["Item B", "5 units", "$30", "$150"],
                  ["Subtotal", "", "", "$650"],
                  ["Discount (10%)", "", "", "−$65"],
                  ["After Discount", "", "", "$585"],
                  ["Tax (19%)", "", "", "+$111.15"],
                  ["Additional Fee", "", "", "+$10"],
                  ["TOTAL", "", "", "$706.15"],
                ]}
                headers={["Item", "Quantity", "Unit Price", "Amount"]}
              />
            </Subsection>

            <Subsection title={t("howItWorks.invoicing.statusFlow")}>
              <p className="text-text-muted text-sm mb-4">
                {t("howItWorks.invoicing.statusFlowDesc")}
              </p>
              <StatusFlow
                statuses={[
                  {
                    name: "Draft",
                    description: t("howItWorks.invoicing.draft"),
                  },
                  {
                    name: "Sent",
                    description: t("howItWorks.invoicing.sent"),
                  },
                  {
                    name: "Partially Paid",
                    description: t("howItWorks.invoicing.partiallyPaid"),
                  },
                  {
                    name: "Paid",
                    description: t("howItWorks.invoicing.paid"),
                  },
                  {
                    name: "Overdue",
                    description: t("howItWorks.invoicing.overdue"),
                  },
                ]}
              />
            </Subsection>

            <Subsection title={t("howItWorks.invoicing.edgeCases")}>
              <EdgeCase
                title={t("howItWorks.invoicing.compositeProducts")}
                description={t("howItWorks.invoicing.compositeProductsDesc")}
                example="Product 'Laptop Kit' contains 2× 'Component A'. Invoice qty=5 → 10 units of Component A deducted from stock."
              />
              <EdgeCase
                title={t("howItWorks.invoicing.partialPaymentCOGS")}
                description={t("howItWorks.invoicing.partialPaymentCOGSDesc")}
                example="Invoice total=$1000 (COGS=$400), payment=$600. Actual COGS = $400 × (600÷1000) = $240."
              />
            </Subsection>
          </Section>

          {/* Expenses */}
          <Section id="expenses" title={t("howItWorks.section.expenses")}>
            <Subsection title={t("howItWorks.expenses.overview")}>
              <p className="text-text-secondary">
                {t("howItWorks.expenses.overviewText")}
              </p>
            </Subsection>

            <Subsection title={t("howItWorks.expenses.oneTime")}>
              <p className="text-text-muted text-sm">
                {t("howItWorks.expenses.oneTimeDesc")}
              </p>
              <p className="text-text-secondary text-sm mt-3">
                <strong>Example:</strong> Office equipment purchase on Mar 20 for
                $1500. If reporting Mar 1-31, this $1500 is included. If
                reporting Feb 1-28, it's excluded.
              </p>
            </Subsection>

            <Subsection title={t("howItWorks.expenses.recurring")}>
              <p className="text-text-muted text-sm mb-4">
                {t("howItWorks.expenses.recurringDesc")}
              </p>
              <FormulaBox
                formulas={[
                  "Daily: amount = rate × days",
                  "Weekly: amount = rate × (days ÷ 7)",
                  "Monthly: amount = rate × calcMonths()",
                  "Quarterly: amount = rate × (months ÷ 3)",
                  "Yearly: amount = rate × years",
                ]}
              />
            </Subsection>
          </Section>

          {/* Salary */}
          <Section id="salary" title={t("howItWorks.section.salary")}>
            <Subsection title={t("howItWorks.salary.overview")}>
              <p className="text-text-secondary">
                {t("howItWorks.salary.overviewText")}
              </p>
            </Subsection>

            <Subsection title={t("howItWorks.salary.periods")}>
              <p className="text-text-muted text-sm mb-4">
                {t("howItWorks.salary.periodsDesc")}
              </p>
              <div className="space-y-3">
                <SalaryPeriodBox
                  period="Daily"
                  formula="Salary = rate × days_worked"
                  example="$150/day, worked 20 days in Jan = $3000"
                />
                <SalaryPeriodBox
                  period="Weekly"
                  formula="Salary = rate × (days ÷ 7)"
                  example="$1000/week, 21 days (3 weeks) = $3000"
                />
                <SalaryPeriodBox
                  period="Monthly"
                  formula="Salary = rate × calcMonths()"
                  example="$3000/month, hired Jan 15: (31-15+1)÷31 = 0.548 month = $1645"
                />
              </div>
            </Subsection>
          </Section>

          {/* Advances */}
          <Section id="advances" title={t("howItWorks.section.advances")}>
            <Subsection title={t("howItWorks.advances.overview")}>
              <p className="text-text-secondary">
                {t("howItWorks.advances.overviewText")}
              </p>
            </Subsection>

            <Subsection title={t("howItWorks.advances.deductionModel")}>
              <p className="text-text-muted text-sm mb-4">
                {t("howItWorks.advances.deductionModelDesc")}
              </p>
              <FormulaBox
                formulas={[
                  "period_end = end of pay period",
                  "remaining_days = days(advance_date, period_end)",
                  "daily_deduction = advance_amount ÷ remaining_days",
                  "actual_deduction = daily_deduction × overlap_days",
                  "net_salary = gross_salary − actual_deduction",
                ]}
              />
            </Subsection>

            <Subsection title={t("howItWorks.advances.example")}>
              <p className="text-text-muted text-sm mb-4">
                {t("howItWorks.advances.exampleDesc")}
              </p>
              <AdvanceExampleBox
                title="Advance taken on Mar 1 (31-day month)"
                details={[
                  "Remaining days: 31",
                  "Daily deduction: $500 ÷ 31 = $16.13/day",
                  "For Mar 27-27 (1 day): $16.13",
                  "Monthly salary $3000 ÷ 31 days = $96.77",
                  "Net salary: $96.77 − $16.13 = $80.64",
                ]}
              />
            </Subsection>

            <Subsection title={t("howItWorks.advances.statuses")}>
              <p className="text-text-muted text-sm mb-4">
                {t("howItWorks.advances.statusesDesc")}
              </p>
              <StatusFlow
                statuses={[
                  {
                    name: "Pending",
                    description: t("howItWorks.advances.pending"),
                  },
                  {
                    name: "Paid",
                    description: t("howItWorks.advances.paid"),
                  },
                  {
                    name: "Returned",
                    description: t("howItWorks.advances.returned"),
                  },
                ]}
              />
            </Subsection>
          </Section>

          {/* Supplier Bills */}
          <Section id="supplier-bills" title={t("howItWorks.section.supplierBills")}>
            <Subsection title={t("howItWorks.supplierBills.overview")}>
              <p className="text-text-secondary">
                {t("howItWorks.supplierBills.overviewText")}
              </p>
            </Subsection>

            <Subsection title={t("howItWorks.supplierBills.calculation")}>
              <FormulaBox
                formulas={[
                  "amountPaid = Σ(all payments for bill)",
                  "balance = amount − amountPaid",
                  "pending → partially_paid (when payment > 0)",
                  "partially_paid → paid (when amountPaid ≥ amount)",
                ]}
              />
            </Subsection>
          </Section>

          {/* Dashboard */}
          <Section id="dashboard" title={t("howItWorks.section.dashboard")}>
            <Subsection title={t("howItWorks.dashboard.overview")}>
              <p className="text-text-secondary">
                {t("howItWorks.dashboard.overviewText")}
              </p>
            </Subsection>

            <Subsection title={t("howItWorks.dashboard.grossEarning")}>
              <p className="text-text-muted text-sm">
                {t("howItWorks.dashboard.grossEarningDesc")}
              </p>
              <p className="text-text-secondary text-sm mt-3">
                <strong>Formula:</strong> Gross = Σ(payments) from paid/partially
                paid invoices
              </p>
            </Subsection>

            <Subsection title={t("howItWorks.dashboard.cogs")}>
              <p className="text-text-muted text-sm">
                {t("howItWorks.dashboard.cogsDesc")}
              </p>
              <p className="text-text-secondary text-sm mt-3">
                <strong>Example:</strong> Invoice $1000 (COGS=$400), paid $600.
                Actual COGS = $400 × (600÷1000) = $240
              </p>
            </Subsection>

            <Subsection title={t("howItWorks.dashboard.netEarning")}>
              <p className="text-text-muted text-sm">
                {t("howItWorks.dashboard.netEarningDesc")}
              </p>
              <p className="text-text-secondary text-sm mt-3">
                <strong>Formula:</strong> Net = Gross − COGS − Total Expenses
              </p>
            </Subsection>
          </Section>

          {/* Reports */}
          <Section id="reports" title={t("howItWorks.section.reports")}>
            <Subsection title={t("howItWorks.reports.overview")}>
              <p className="text-text-secondary">
                {t("howItWorks.reports.overviewText")}
              </p>
            </Subsection>

            <Subsection title={t("howItWorks.reports.plReport")}>
              <p className="text-text-muted text-sm">
                {t("howItWorks.reports.plReportDesc")}
              </p>
              <p className="text-text-secondary text-sm mt-3">
                <strong>Formula:</strong> Net Profit = Revenue − COGS −
                Expenses
              </p>
            </Subsection>

            <Subsection title={t("howItWorks.reports.balanceSheet")}>
              <p className="text-text-muted text-sm">
                {t("howItWorks.reports.balanceSheetDesc")}
              </p>
              <p className="text-text-secondary text-sm mt-3">
                <strong>Formula:</strong> Equity = Total Assets − Total
                Liabilities
              </p>
            </Subsection>

            <Subsection title={t("howItWorks.reports.agingReport")}>
              <p className="text-text-muted text-sm">
                {t("howItWorks.reports.agingReportDesc")}
              </p>
              <p className="text-text-secondary text-sm mt-3">
                Classifies unpaid invoices: Current, 1-30 days, 31-60 days,
                61-90 days, 90+ days
              </p>
            </Subsection>
          </Section>

          {/* Stock */}
          <Section id="stock" title={t("howItWorks.section.stock")}>
            <Subsection title={t("howItWorks.stock.overview")}>
              <p className="text-text-secondary">
                {t("howItWorks.stock.overviewText")}
              </p>
            </Subsection>

            <Subsection title={t("howItWorks.stock.simpleProducts")}>
              <p className="text-text-muted text-sm">
                Individual products with fixed quantity and price.
              </p>
            </Subsection>

            <Subsection title={t("howItWorks.stock.compositeProducts")}>
              <p className="text-text-muted text-sm mb-3">
                Products made from multiple components.
              </p>
              <p className="text-text-secondary text-sm">
                <strong>Effective qty:</strong> min(component1_qty ÷ ratio1,
                component2_qty ÷ ratio2, ...)
              </p>
            </Subsection>
          </Section>

          {/* Accounts */}
          <Section id="accounts" title={t("howItWorks.section.accounts")}>
            <Subsection title={t("howItWorks.accounts.overview")}>
              <p className="text-text-secondary">
                {t("howItWorks.accounts.overviewText")}
              </p>
            </Subsection>

            <Subsection title={t("howItWorks.accounts.chartOfAccounts")}>
              <p className="text-text-muted text-sm mb-3">
                Five account categories:
              </p>
              <div className="space-y-2 text-text-secondary text-sm">
                <p>
                  <strong>Assets:</strong> Bank, Cash, AR, Inventory
                </p>
                <p>
                  <strong>Liabilities:</strong> Payable, Tax Payable, Loans
                </p>
                <p>
                  <strong>Equity:</strong> Owner's Capital, Retained Earnings
                </p>
                <p>
                  <strong>Revenue:</strong> Sales, Service Revenue
                </p>
                <p>
                  <strong>Expenses:</strong> COGS, Rent, Utilities, Salaries
                </p>
              </div>
            </Subsection>

            <Subsection title={t("howItWorks.accounts.journalEntries")}>
              <p className="text-text-muted text-sm">
                Every transaction recorded with matching debit and credit entries.
              </p>
            </Subsection>
          </Section>

          {/* FAQ */}
          <Section id="faq" title={t("howItWorks.faq")}>
            <FAQ
              items={[
                {
                  question: t("howItWorks.faq.q1"),
                  answer: t("howItWorks.faq.a1"),
                },
                {
                  question: t("howItWorks.faq.q2"),
                  answer: t("howItWorks.faq.a2"),
                },
                {
                  question: t("howItWorks.faq.q3"),
                  answer: t("howItWorks.faq.a3"),
                },
                {
                  question: t("howItWorks.faq.q4"),
                  answer: t("howItWorks.faq.a4"),
                },
                {
                  question: t("howItWorks.faq.q5"),
                  answer: t("howItWorks.faq.a5"),
                },
              ]}
            />
          </Section>
        </div>
      </div>
    </div>
  );
}

/* Components */

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mb-12">
      <h2 className="text-2xl font-bold text-text-primary mb-6 pb-3 border-b border-dark-border">
        {title}
      </h2>
      <div className="space-y-6">{children}</div>
    </section>
  );
}

function Subsection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-lg font-semibold text-text-primary mb-3">{title}</h3>
      <div className="space-y-3 text-text-secondary">{children}</div>
    </div>
  );
}

function FormulaBox({ formulas }: { formulas: string[] }) {
  return (
    <div className="bg-dark-card border border-dark-border rounded-lg p-4 font-mono text-sm space-y-2 text-text-secondary overflow-x-auto">
      {formulas.map((formula, idx) => (
        <div key={idx} className="whitespace-pre-wrap">
          {formula}
        </div>
      ))}
    </div>
  );
}

function Table({
  headers,
  rows,
}: {
  headers: string[];
  rows: (string | number)[][];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-dark-border">
            {headers.map((header, idx) => (
              <th
                key={idx}
                className="px-3 py-2 text-left font-semibold text-text-primary bg-dark-card"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ridx) => (
            <tr key={ridx} className="border-b border-dark-border/50">
              {row.map((cell, cidx) => (
                <td
                  key={cidx}
                  className={`px-3 py-2 ${
                    ridx % 2 === 1 ? "bg-dark-card/30" : ""
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusFlow({
  statuses,
}: {
  statuses: { name: string; description: string }[];
}) {
  return (
    <div className="space-y-3">
      {statuses.map((status, idx) => (
        <div key={idx}>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-3 h-3 rounded-full bg-accent" />
            <span className="font-semibold text-text-primary text-sm">
              {status.name}
            </span>
          </div>
          <p className="text-text-muted text-sm ml-5">{status.description}</p>
          {idx < statuses.length - 1 && (
            <div className="ml-2 h-4 border-l-2 border-dark-border" />
          )}
        </div>
      ))}
    </div>
  );
}

function EdgeCase({
  title,
  description,
  example,
}: {
  title: string;
  description: string;
  example: string;
}) {
  return (
    <div className="bg-dark-card border-l-4 border-accent rounded p-4 mb-4">
      <h4 className="font-semibold text-text-primary mb-1 text-sm">{title}</h4>
      <p className="text-text-muted text-xs mb-2">{description}</p>
      <p className="text-text-secondary text-xs">
        <strong>Example:</strong> {example}
      </p>
    </div>
  );
}

function SalaryPeriodBox({
  period,
  formula,
  example,
}: {
  period: string;
  formula: string;
  example: string;
}) {
  return (
    <div className="bg-dark-card border border-dark-border rounded p-4">
      <p className="font-semibold text-text-primary mb-2 text-sm">{period}</p>
      <p className="text-text-secondary text-xs font-mono mb-2">{formula}</p>
      <p className="text-text-muted text-xs">{example}</p>
    </div>
  );
}

function AdvanceExampleBox({
  title,
  details,
}: {
  title: string;
  details: string[];
}) {
  return (
    <div className="bg-dark-card border border-dark-border rounded p-4 mb-4">
      <h4 className="font-semibold text-text-primary mb-3 text-sm">{title}</h4>
      <div className="space-y-2 text-sm text-text-secondary font-mono">
        {details.map((detail, idx) => (
          <div key={idx} className="pl-2">
            {detail}
          </div>
        ))}
      </div>
    </div>
  );
}

function FAQ({ items }: { items: { question: string; answer: string }[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <div className="space-y-3">
      {items.map((item, idx) => (
        <button
          key={idx}
          onClick={() => setOpenIdx(openIdx === idx ? null : idx)}
          className="w-full text-left bg-dark-card border border-dark-border rounded-lg p-4 hover:border-accent transition-colors"
        >
          <div className="flex items-start justify-between gap-3">
            <h4 className="font-semibold text-text-primary text-sm">
              {item.question}
            </h4>
            <ChevronDown
              size={18}
              className={`text-accent flex-shrink-0 transition-transform ${
                openIdx === idx ? "rotate-180" : ""
              }`}
            />
          </div>
          {openIdx === idx && (
            <p className="text-text-muted text-xs mt-3">{item.answer}</p>
          )}
        </button>
      ))}
    </div>
  );
}
