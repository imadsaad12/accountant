"use client";

import { useState } from "react";
import { useTranslation } from "@/components/LanguageProvider";
import { ChevronDown, Menu, X } from "lucide-react";

const SECTIONS = [
  { id: "invoicing", label: "Invoices & Revenue" },
  { id: "clients", label: "Clients & Payments" },
  { id: "stock", label: "Stock & Inventory" },
  { id: "expenses", label: "Expenses & Recurring" },
  { id: "salary", label: "Employees & Payroll" },
  { id: "supplier-bills", label: "Supplier Bills" },
  { id: "tax", label: "Tax Calculations" },
  { id: "reports", label: "Financial Reports" },
  { id: "dashboard", label: "Dashboard KPIs" },
  { id: "validation", label: "Data Integrity" },
  { id: "faq", label: "FAQ" },
];

export default function HowItWorksPage() {
  const t = useTranslation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleSectionClick = (id: string) => {
    setSidebarOpen(false);
    const element = document.getElementById(id);
    if (element) {
      setTimeout(() => element.scrollIntoView({ behavior: "smooth" }), 100);
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
          <h2 className="text-lg font-bold text-text-primary">How It Works</h2>
          <p className="text-xs text-text-muted mt-2">
            Complete calculation guide
          </p>
        </div>

        <nav className="p-4 space-y-1">
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              onClick={() => handleSectionClick(section.id)}
              className="w-full text-left px-4 py-3 rounded-lg transition-colors text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-dark-card"
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
            <h1 className="text-2xl font-bold text-text-primary">How It Works</h1>
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
          <Section id="invoicing" title="Invoices & Revenue">
            <Subsection title="Invoice Total Calculation">
              <p className="text-text-secondary mb-4">
                An invoice's total is calculated in this order:
              </p>
              <FormulaBox
                formulas={[
                  "Subtotal = SUM(item.quantity × item.unitPrice)",
                  "After Discount = Subtotal − (Subtotal × discount%)",
                  "Tax = After Discount × (tax rate / 100)",
                  "Total = After Discount + Tax + Fees",
                ]}
              />
              <p className="text-text-secondary text-sm mt-4">
                <strong>Example:</strong> 2 items @ $100 each = $200 subtotal, 10% discount = $180, 19% tax on $180 = $34.20, +$5 fee = <strong>$219.20 total</strong>
              </p>
            </Subsection>

            <Subsection title="Payment Tracking">
              <p className="text-text-secondary mb-4">
                Payments are applied individually to invoices:
              </p>
              <div className="bg-dark-card border border-dark-border rounded p-4 space-y-2 text-sm text-text-secondary mb-4">
                <div>• <strong>Amount Paid</strong> = Sum of all payments applied</div>
                <div>• <strong>Remaining Balance</strong> = Total − Amount Paid</div>
                <div>• <strong>Status</strong> (auto-updated):</div>
                <div className="ml-4 space-y-1 text-text-muted">
                  <div>draft → Not sent to client</div>
                  <div>sent → Sent but not paid</div>
                  <div>partially_paid → 0 &lt; Paid &lt; Total</div>
                  <div>paid → Paid ≥ Total</div>
                  <div>overdue → Due date passed, unpaid</div>
                </div>
              </div>
            </Subsection>

            <Subsection title="Overpayment → Client Balance">
              <p className="text-text-secondary mb-4">
                When a payment exceeds the remaining invoice balance, the excess is automatically added to the client's credit balance:
              </p>
              <FormulaBox
                formulas={[
                  "Applied to Invoice = min(Payment Amount, Remaining Balance)",
                  "Excess = Payment Amount − Applied to Invoice",
                  "Client Balance += Excess",
                ]}
              />
              <p className="text-text-secondary text-sm mt-4">
                <strong>Example:</strong> Invoice total = $200, already paid $150, remaining = $50. Client pays $80 → $50 applied to invoice (status → paid), $30 added to client balance.
              </p>
              <p className="text-text-secondary text-sm mt-2">
                The client's balance is then auto-applied to future invoices at creation time.
              </p>
            </Subsection>

            <Subsection title="Cost of Goods Sold (COGS)">
              <p className="text-text-secondary mb-4">
                Product costs are <strong>snapshotted at invoice creation time</strong>:
              </p>
              <div className="bg-dark-card border border-dark-border rounded p-4 space-y-2 text-sm text-text-secondary">
                <div>• Each item records <code className="bg-dark-bg px-1 rounded">unitCost</code> at creation</div>
                <div>• <strong>Item COGS</strong> = unitCost × quantity</div>
                <div>• <strong>Invoice COGS</strong> = Sum of all item COGS</div>
                <div>• Used in profit calculations, never changes</div>
              </div>
            </Subsection>

            <Subsection title="Automatic Balance Application">
              <p className="text-text-secondary">
                When a client has an outstanding balance (from overpayments), it automatically applies to new invoices. If new invoice = $500 and client balance = $100, the client owes only $400.
              </p>
            </Subsection>
          </Section>

          {/* Clients */}
          <Section id="clients" title="Clients & Payments">
            <Subsection title="Client Balance Tracking">
              <p className="text-text-secondary mb-4">
                A client's balance is tracked cumulatively:
              </p>
              <div className="bg-dark-card border border-dark-border rounded p-4 space-y-2 text-sm text-text-secondary">
                <div>• <strong>Total Invoiced</strong> = Sum of all invoice totals</div>
                <div>• <strong>Total Paid</strong> = Sum of all payments applied</div>
                <div>• <strong>Total Pending</strong> = Total Invoiced − Total Paid</div>
                <div>• <strong>Client Balance</strong> = Available credit from overpayments</div>
              </div>
            </Subsection>

            <Subsection title="Bulk Payment Distribution (FIFO)">
              <p className="text-text-secondary mb-4">
                Payments are distributed oldest invoice first:
              </p>
              <ol className="text-text-secondary space-y-2 list-decimal list-inside">
                <li>Fetch unpaid invoices, oldest first</li>
                <li>Apply payment to each (minimum of: payment available OR remaining balance)</li>
                <li>If payment exceeds all balances, excess becomes Client Balance</li>
              </ol>
              <p className="text-text-secondary text-sm mt-4">
                <strong>Example:</strong> Invoice 1: $500 unpaid, Invoice 2: $300 unpaid. Client pays $600 → Invoice 1 fully paid ($500), Invoice 2 partially paid ($100), Client Balance = $0.
              </p>
            </Subsection>
          </Section>

          {/* Stock */}
          <Section id="stock" title="Stock & Inventory">
            <Subsection title="Stock Quantity Tracking">
              <p className="text-text-secondary mb-4">
                Stock is tracked differently for simple and composite products:
              </p>
              <div className="bg-dark-card border border-dark-border rounded p-4 space-y-3 text-sm text-text-secondary mb-4">
                <div>
                  <strong>Simple Products:</strong> Quantity is stored directly
                </div>
                <div>
                  <strong>Composite Products:</strong> Effective Qty = floor(min(component1_available / component1_needed, ...))
                </div>
              </div>
              <p className="text-text-secondary text-sm">
                <strong>Example:</strong> Chair (composite) needs 1 frame + 4 wheels. Available: 10 frames, 32 wheels → Effective qty = floor(min(10/1, 32/4)) = floor(min(10, 8)) = <strong>8 chairs</strong>
              </p>
            </Subsection>

            <Subsection title="Low Stock Alerts">
              <p className="text-text-secondary">
                Products are flagged as low stock when: <code className="bg-dark-bg px-1 rounded">Effective Quantity ≤ Minimum Stock</code> (default minStock = 5)
              </p>
            </Subsection>

            <Subsection title="Stock Deduction on Invoice">
              <p className="text-text-secondary mb-4">
                When an invoice is created:
              </p>
              <ol className="text-text-secondary space-y-2 list-decimal list-inside">
                <li><strong>Validation:</strong> Check sufficient stock exists BEFORE allowing creation</li>
                <li><strong>Deduction:</strong> After invoice saved, subtract from stock</li>
                <li>Simple: <code className="bg-dark-bg px-1 rounded">quantity -= item.quantity</code></li>
                <li>Composite: For each component, <code className="bg-dark-bg px-1 rounded">quantity -= (component.quantity_needed × item.quantity)</code></li>
              </ol>
              <p className="text-text-secondary text-sm mt-4">
                ⚠️ <strong>Stock deduction is atomic:</strong> If validation passes, deduction WILL succeed. If validation fails, invoice creation is blocked entirely.
              </p>
            </Subsection>

            <Subsection title="Automatic SKU Generation">
              <p className="text-text-secondary mb-2">
                SKUs are auto-generated during creation or category change:
              </p>
              <p className="text-text-muted font-mono text-sm">
                SKU = [Category Prefix] + [Sequence Number]
              </p>
              <p className="text-text-secondary text-sm mt-3">
                <strong>Example:</strong> Category "Furniture" with 3 existing products → new product gets SKU "Furniture-4"
              </p>
            </Subsection>
          </Section>

          {/* Expenses */}
          <Section id="expenses" title="Expenses & Recurring Charges">
            <Subsection title="One-Time Expenses">
              <p className="text-text-secondary">
                Fixed amount expenses included in reports only if date is within report period. No pro-ration applied.
              </p>
            </Subsection>

            <Subsection title="Recurring Expenses">
              <p className="text-text-secondary mb-4">
                Stored as a rate and pro-rated based on recurrence pattern:
              </p>
              <Table
                headers={["Recurrence", "Formula", "Example"]}
                rows={[
                  ["Weekly", "rate × (days ÷ 7)", "$100/week × 10 days = $142.86"],
                  ["Monthly", "rate × months (calendar-accurate)", "$1000/month × 1.5 months = $1500"],
                  ["Quarterly", "rate × (months ÷ 3)", "$3000/quarter × 2 months = $2000"],
                  ["Yearly", "rate × (days ÷ 365)", "$12000/year × 100 days = $3287.67"],
                ]}
              />
            </Subsection>

            <Subsection title="Calendar-Accurate Month Calculation">
              <p className="text-text-secondary mb-4">
                When you have a monthly expense or salary, the system needs to figure out <strong>how many months</strong> fit between two dates. Instead of assuming every month has 30 days, it counts using the real calendar.
              </p>
              <p className="text-text-secondary mb-2 text-sm">
                <strong>The idea is simple:</strong> split the date range into 3 parts:
              </p>
              <div className="bg-dark-card border border-dark-border rounded p-4 space-y-2 text-sm text-text-secondary mb-4">
                <div>1. <strong>Remaining days in the first month</strong> — how much of the starting month is left?</div>
                <div>2. <strong>Full months in between</strong> — any complete months from start to end?</div>
                <div>3. <strong>Days used in the last month</strong> — how far into the ending month?</div>
              </div>

              <p className="text-text-secondary text-sm mb-2">
                <strong>Example: Feb 15 → Mar 17</strong> (expense is $1,000/month)
              </p>
              <div className="bg-dark-card border-l-4 border-accent rounded p-4 space-y-3 text-sm text-text-secondary mb-4">
                <div>
                  <strong>Step 1 — Rest of February:</strong> Feb has 28 days. From Feb 15 to Feb 28 = 14 days remaining.
                  <div className="font-mono text-text-muted mt-1">14 ÷ 28 = 0.5 (half a month)</div>
                </div>
                <div>
                  <strong>Step 2 — Full months between:</strong> Feb and Mar are next to each other, so there are 0 full months in between.
                </div>
                <div>
                  <strong>Step 3 — Days used in March:</strong> 17 days into March. March has 31 days.
                  <div className="font-mono text-text-muted mt-1">17 ÷ 31 = 0.5484 months</div>
                </div>
                <div className="border-t border-dark-border pt-2 text-accent font-semibold">
                  Total = 0.5 + 0 + 0.5484 = 1.0484 months → $1,000 × 1.0484 = <strong>$1,048.40</strong>
                </div>
              </div>

              <p className="text-text-secondary text-sm mb-2">
                <strong>Another example: Jan 1 → Mar 31</strong>
              </p>
              <div className="bg-dark-card border-l-4 border-accent rounded p-4 space-y-2 text-sm text-text-secondary mb-4">
                <div><strong>Step 1:</strong> Jan 1 to Jan 31 = full month → 1.0</div>
                <div><strong>Step 2:</strong> February is one full month in between → 1.0</div>
                <div><strong>Step 3:</strong> Mar 1 to Mar 31 = full month → 31 ÷ 31 = 1.0</div>
                <div className="border-t border-dark-border pt-2 text-accent font-semibold">Total = 1.0 + 1.0 + 1.0 = 3.0 months exactly</div>
              </div>

              <div className="bg-dark-card border border-dark-border rounded p-4 space-y-2 text-sm text-text-secondary">
                <div><strong>Rounding difference between reports:</strong></div>
                <div>• <strong>P&L Report:</strong> Uses the exact number (e.g. 1.0484 months)</div>
                <div>• <strong>Comprehensive Report:</strong> Rounds to the nearest whole month (e.g. 1.0484 → 1 month)</div>
              </div>
            </Subsection>
          </Section>

          {/* Salary */}
          <Section id="salary" title="Employees & Payroll">
            <Subsection title="Salary Calculation by Period">
              <p className="text-text-secondary mb-4">
                Base salary is calculated differently by employee's salary period:
              </p>
              <div className="space-y-3">
                <SalaryPeriodBox
                  period="Weekly"
                  formula="Salary = rate × (days ÷ 7)"
                  example="$1000/week, 21 days (3 weeks) = $3000"
                />
                <SalaryPeriodBox
                  period="Monthly"
                  formula="Salary = rate × calcMonths() [calendar-accurate]"
                  example="$3000/month, Feb 15–Mar 17 (1.0484 months) = $3145.20"
                />
              </div>
            </Subsection>

            <Subsection title="Salary Advances: Deduction & Pro-rating">
              <p className="text-text-secondary mb-4">
                Advances reduce take-home pay, pro-rated by overlap between the advance's pay period and the report period:
              </p>
              <FormulaBox
                formulas={[
                  "Remaining Days = calcDays(Advance Date, Period End)",
                  "Daily Rate = Advance Amount ÷ Remaining Days",
                  "Overlap Days = calcDays(max(Advance Date, Report Start), min(Period End, Report End))",
                  "Deduction = Daily Rate × Overlap Days",
                  "Net Salary = Base Salary − Sum of Deductions",
                ]}
              />
              <p className="text-text-secondary text-sm mt-4">
                <strong>Example:</strong> $3000/month employee, $500 advance on Jan 25. Period end = Jan 31. Remaining days = calcDays(Jan 25, Jan 31) = 7. Daily rate = $500 ÷ 7 = $71.43. If report covers full January: overlap = 7 days → Deduction = $71.43 × 7 = <strong>$500</strong>. Net salary: $3000 − $500 = <strong>$2500</strong>.
              </p>
              <p className="text-text-secondary text-sm mt-2">
                If report only covers Jan 25–Jan 28 (4 overlap days): Deduction = $71.43 × 4 = <strong>$285.71</strong>.
              </p>
            </Subsection>

            <Subsection title="Advance Status & What Each Means">
              <p className="text-text-secondary mb-4">
                Every salary advance has one of 3 statuses:
              </p>
              <div className="bg-dark-card border border-dark-border rounded p-4 space-y-3 text-sm text-text-secondary mb-4">
                <div>
                  <strong className="text-yellow-400">Pending</strong> — The advance was given but the pay period hasn't ended yet. It <strong>will be deducted</strong> from the employee's salary.
                </div>
                <div>
                  <strong className="text-accent">Deducted from Salary</strong> — The pay period has ended and the advance was automatically deducted from salary. This happens on its own — you don't need to do anything.
                </div>
                <div>
                  <strong className="text-green-400">Returned</strong> — The employee gave back the money directly (not through salary). The advance is <strong>NOT deducted</strong> from salary.
                </div>
              </div>

              <p className="text-text-secondary text-sm mb-2">
                <strong>When does it auto-change to "Deducted"?</strong>
              </p>
              <div className="bg-dark-card border border-dark-border rounded p-4 space-y-2 text-sm text-text-secondary mb-4">
                <div>• <strong>Weekly</strong> employee → when a new week starts after the advance</div>
                <div>• <strong>Monthly</strong> employee → when a new month starts after the advance</div>
              </div>

              <p className="text-text-secondary text-sm mb-2">
                <strong>What can you change manually?</strong>
              </p>
              <div className="bg-dark-card border border-dark-border rounded p-4 space-y-2 text-sm text-text-secondary">
                <div>• You can mark a <strong>Pending</strong> advance as <strong>Returned</strong> (employee gave the money back) — it will no longer be deducted from salary</div>
                <div>• You can switch a <strong>Returned</strong> advance back to <strong>Pending</strong> if needed</div>
                <div>• Once an advance is <strong>Deducted from Salary</strong>, you cannot change it — it's already been applied</div>
              </div>
            </Subsection>

            <Subsection title="Active Employee Filter">
              <p className="text-text-secondary">
                Only <strong>active</strong> employees are included in payroll calculations. Inactive employees are excluded from salary and advance deductions.
              </p>
            </Subsection>
          </Section>

          {/* Supplier Bills */}
          <Section id="supplier-bills" title="Supplier Bills & Payables">
            <Subsection title="Bill Type">
              <p className="text-text-secondary mb-4">
                Each supplier bill has a <strong>type</strong> that determines how it is treated in financial calculations:
              </p>
              <div className="bg-dark-card border border-dark-border rounded p-4 space-y-3 text-sm text-text-secondary">
                <div>
                  <strong className="text-blue-400">Stock / Inventory</strong> — The bill is for purchasing stock or raw materials.
                  <span className="block mt-1 text-text-muted">This cost is already reflected in <strong>COGS</strong> when products are sold, so it is <strong>NOT</strong> included in operating expenses. This avoids double-counting.</span>
                </div>
                <div>
                  <strong className="text-violet-400">Operating Expense</strong> — The bill is for services, rent, utilities, or other operational costs.
                  <span className="block mt-1 text-text-muted">This <strong>IS</strong> included in operating expenses on reports, dashboard, and expense listings.</span>
                </div>
              </div>
            </Subsection>

            <Subsection title="Bill Payment Tracking">
              <p className="text-text-secondary mb-4">
                Similar to invoices, supplier bills track:
              </p>
              <div className="bg-dark-card border border-dark-border rounded p-4 space-y-2 text-sm text-text-secondary">
                <div>• <strong>Bill Amount</strong> = Stored at creation</div>
                <div>• <strong>Amount Paid</strong> = Sum of all payments</div>
                <div>• <strong>Remaining</strong> = Bill Amount − Amount Paid</div>
                <div>• <strong>Status</strong>: pending (0%), partially_paid (0–100%), paid (100%)</div>
              </div>
            </Subsection>

            <Subsection title="Days Overdue">
              <p className="text-text-secondary mb-4">
                <code className="bg-dark-bg px-1 rounded">daysOverdue = floor((now − dueDate) ÷ 86400000)</code>
              </p>
              <p className="text-text-secondary text-sm">
                Aging categories: <strong>Current</strong> (0 days), <strong>1-30</strong>, <strong>31-60</strong>, <strong>61-90</strong>, <strong>90+</strong>
              </p>
            </Subsection>
          </Section>

          {/* Tax */}
          <Section id="tax" title="Tax Calculations">
            <Subsection title="Tax per Invoice">
              <p className="text-text-secondary mb-4">
                Tax is calculated on the <strong>discounted amount</strong>:
              </p>
              <p className="text-text-secondary font-mono text-sm">
                Tax = (Subtotal − Discount) × (Tax Rate ÷ 100)
              </p>
              <p className="text-text-secondary text-sm mt-4">
                Default tax rate: <strong>19%</strong>
              </p>
            </Subsection>

            <Subsection title="Tax Collection Tracking">
              <div className="bg-dark-card border border-dark-border rounded p-4 space-y-2 text-sm text-text-secondary">
                <div><strong>Total Tax:</strong> Sum of tax from <strong>all invoices</strong> regardless of status (draft, sent, partially paid, paid)</div>
                <div>• Tax is treated like COGS — it is recognized in full at invoice creation, not pro-rated by payment</div>
              </div>
            </Subsection>

            <Subsection title="Tax in P&L Reports">
              <p className="text-text-secondary mb-2">
                Tax is calculated on all invoices within the report period:
              </p>
              <p className="text-text-secondary font-mono text-sm">
                Tax Collected = SUM(invoice.tax) for all invoices in period
              </p>
              <p className="text-text-secondary text-sm mt-3">
                <strong>Example:</strong> 3 invoices in January — $190 tax (paid), $95 tax (partially paid), $50 tax (draft) → Total tax = <strong>$335</strong>
              </p>
            </Subsection>
          </Section>

          {/* Reports */}
          <Section id="reports" title="Financial Reports">
            <Subsection title="Profit & Loss (P&L) Report">
              <p className="text-text-secondary mb-4">
                Calculates profitability over a date range.
              </p>
              <FormulaBox
                formulas={[
                  "Revenue = SUM(payments in period) [cash basis]",
                  "COGS = SUM(unitCost × qty) for invoices with payments in period",
                  "Tax = SUM(invoice.tax) for all invoices in period [full amount regardless of payment status]",
                  "Gross Profit = Revenue − COGS",
                  "Total Expenses = one-time + recurring + salary + bills",
                  "Net Profit = Gross Profit − Expenses",
                ]}
              />
            </Subsection>

            <Subsection title="Balance Sheet Report">
              <p className="text-text-secondary mb-4">
                Snapshot of financial position.
              </p>
              <div className="bg-dark-card border border-dark-border rounded p-4 space-y-2 text-sm text-text-secondary">
                <div><strong>Assets:</strong> Cash + Accounts Receivable + Inventory</div>
                <div><strong>Liabilities:</strong> Tax Payable (full tax from all invoices)</div>
                <div><strong>Equity:</strong> Total Assets − Total Liabilities</div>
              </div>
            </Subsection>

            <Subsection title="Comprehensive Report">
              <p className="text-text-secondary mb-4">
                Combines P&L with detailed breakdowns:
              </p>
              <ul className="text-text-secondary space-y-2 list-disc list-inside">
                <li>Revenue breakdown (period vs. old invoices)</li>
                <li>COGS by invoice with gross profit</li>
                <li>Receivable aging (by days overdue)</li>
                <li>Payable aging (supplier bills)</li>
                <li>Profit margins (COGS, Gross, Net)</li>
              </ul>
            </Subsection>

            <Subsection title="Profit Margins">
              <FormulaBox
                formulas={[
                  "COGS Margin = (Total COGS ÷ Revenue) × 100",
                  "Gross Margin = (Gross Profit ÷ Revenue) × 100",
                  "Net Margin = (Net Profit ÷ Revenue) × 100",
                ]}
              />
            </Subsection>
          </Section>

          {/* Dashboard */}
          <Section id="dashboard" title="Dashboard KPIs">
            <Subsection title="Earnings Summary">
              <div className="bg-dark-card border border-dark-border rounded p-4 space-y-2 text-sm text-text-secondary">
                <div>• <strong>Gross Earning:</strong> Sum of all invoice totals</div>
                <div>• <strong>COGS:</strong> Sum of (unitCost × qty) for all invoiced items</div>
                <div>• <strong>Total Tax:</strong> Sum of tax across all invoices</div>
                <div>• <strong>Total Supplier Bills:</strong> Sum of all bill amounts</div>
                <div>• <strong>Total Expenses:</strong> Sum of one-time + recurring</div>
                <div>• <strong>Total Salaries:</strong> All employees prorated from hire date to today (minus advances)</div>
                <div>• <strong>Net Earning:</strong> Gross − COGS − Tax − Bills − Expenses − Salaries</div>
                <div>• <strong>Pending Amount:</strong> Sum of unpaid invoice balances</div>
              </div>
            </Subsection>

            <Subsection title="Revenue Trend">
              <p className="text-text-secondary mb-4">
                Groups invoices by month (12-month lookback):
              </p>
              <p className="text-text-secondary text-sm">
                Trend % = ((current month − prior month) ÷ prior month) × 100
              </p>
              <p className="text-text-secondary text-sm mt-2">
                Green indicates positive trend, red indicates negative.
              </p>
            </Subsection>

            <Subsection title="New This Month">
              <p className="text-text-secondary">
                Counts new clients and invoices created after month start.
              </p>
            </Subsection>

            <Subsection title="Low Stock Products">
              <p className="text-text-secondary">
                Lists products where Effective Quantity ≤ Minimum Stock Threshold.
              </p>
            </Subsection>
          </Section>

          {/* Data Integrity */}
          <Section id="validation" title="Data Integrity & Validation">
            <Subsection title="Invoice Creation Validation">
              <ul className="text-text-secondary space-y-2 list-disc list-inside">
                <li>Client must exist</li>
                <li>At least one invoice item required</li>
                <li>Item quantity &gt; 0</li>
                <li>Product must exist with sufficient stock</li>
                <li>Item unit price must be ≥ product cost</li>
                <li>Invoice date must be valid</li>
                <li>Tax rate (if provided) must be 0–100%</li>
              </ul>
              <p className="text-text-secondary text-sm mt-3">
                ⚠️ If validation fails, invoice is NOT created and error is shown.
              </p>
            </Subsection>

            <Subsection title="Rounding & Precision">
              <Table
                headers={["Value Type", "Format", "Example"]}
                rows={[
                  ["Currency", "2 decimals with symbol", "$1,234.56"],
                  ["Percentage", "1 decimal place", "19.5%"],
                  ["Month (pro-ration)", "4 decimals (internal)", "1.5048"],
                  ["Days", "Integer (floor)", "30"],
                  ["Quantity", "2 decimals or integer", "5 or 2.5"],
                ]}
              />
            </Subsection>

            <Subsection title="Payment Boundary Checks">
              <ul className="text-text-secondary space-y-2 list-disc list-inside">
                <li>Payment amount must be greater than 0</li>
                <li>If payment exceeds remaining balance, only the remaining is applied to the invoice — excess goes to client balance</li>
                <li>Invoice payment records never exceed the invoice total</li>
                <li>Client balance auto-applies to new invoices at creation</li>
              </ul>
            </Subsection>

            <Subsection title="Audit Trail">
              <p className="text-text-secondary">
                All actions are logged in Activity Log: invoice creation/update/delete, payments, expenses, stock adjustments, employee changes, advances.
              </p>
            </Subsection>
          </Section>

          {/* FAQ */}
          <Section id="faq" title="Frequently Asked Questions">
            <FAQ
              items={[
                {
                  question: "Why does my invoice total seem wrong?",
                  answer:
                    "Check the tax rate (default 19%) and discount percentage. Formula is: (Subtotal − Discount) × (1 + Tax Rate) + Fees.",
                },
                {
                  question: "How are partial payments handled?",
                  answer:
                    "Each payment is applied individually. Invoice status auto-updates: paid (100%), partially_paid (>0% but <100%), or sent (0%).",
                },
                {
                  question: "How is monthly recurring expense pro-ration calculated?",
                  answer:
                    "Uses calendar-accurate month calculation based on actual days in each month (28/29/30/31). Feb 15 → Mar 17 = 1.0484 months. The Comprehensive Report uses Math.round() (1.0484 → 1 month), while the P&L report uses the exact fractional value.",
                },
                {
                  question: "Can I use multiple currencies?",
                  answer:
                    "All transactions use your organization's default currency (set in Settings). Multi-currency support is not yet available.",
                },
                {
                  question: "How do I calculate profit for a specific period?",
                  answer:
                    "Use the Profit & Loss Report with your date range. Revenue is cash-basis (payment date), not invoice date.",
                },
                {
                  question: "What's the difference between COGS and expenses?",
                  answer:
                    "COGS = cost of products sold (inventory cost). Expenses = operational costs (rent, utilities, salary, supplier bills). Both reduce net profit but tracked separately.",
                },
                {
                  question: "When are salary advances deducted from salary?",
                  answer:
                    "Advances are spread across remaining days in the pay period (from advance date to period end). The deduction for a report equals (advance ÷ remaining days) × overlap days with the report period. If the report covers the full remaining period, the entire advance is deducted.",
                },
                {
                  question: "How is composite product stock calculated?",
                  answer:
                    "Effective quantity = floor(min(component1_qty / component1_needed, component2_qty / component2_needed, ...)). The bottleneck component determines availability.",
                },
                {
                  question: "What happens if a client overpays an invoice?",
                  answer:
                    "The payment is capped at the remaining invoice balance and the invoice is marked as paid. The excess amount is automatically added to the client's credit balance, which will be auto-applied to their next invoice.",
                },
              ]}
            />
          </Section>
        </div>
      </div>
    </div>
  );
}

// Helper Components
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
    <section id={id} className="mb-12 scroll-mt-24">
      <h2 className="text-2xl font-bold text-text-primary mb-6 pb-3 border-b border-dark-border">
        {title}
      </h2>
      {children}
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
    <div className="mb-6">
      <h3 className="text-lg font-semibold text-text-primary mb-3">{title}</h3>
      {children}
    </div>
  );
}

function FormulaBox({ formulas }: { formulas: string[] }) {
  return (
    <div className="bg-dark-card border-l-4 border-accent rounded p-4 mb-4 font-mono text-sm text-text-secondary space-y-2">
      {formulas.map((formula, idx) => (
        <div key={idx}>{formula}</div>
      ))}
    </div>
  );
}

function Table({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  return (
    <div className="overflow-x-auto mb-4">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-dark-card border-b border-dark-border">
            {headers.map((header, idx) => (
              <th
                key={idx}
                className="px-4 py-2 text-left text-text-secondary font-semibold"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) => (
            <tr
              key={rowIdx}
              className="border-b border-dark-border hover:bg-dark-card/50 transition-colors"
            >
              {row.map((cell, cellIdx) => (
                <td key={cellIdx} className="px-4 py-2 text-text-secondary">
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
