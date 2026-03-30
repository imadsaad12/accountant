# How Cashent Accounting App Works

This document explains how all calculations and features work in the Cashent accounting system.

## Table of Contents

1. [Invoices & Revenue](#invoices--revenue)
2. [Clients & Payments](#clients--payments)
3. [Stock & Inventory](#stock--inventory)
4. [Expenses & Recurring Charges](#expenses--recurring-charges)
5. [Employees & Payroll](#employees--payroll)
6. [Supplier Bills & Payables](#supplier-bills--payables)
7. [Tax Calculations](#tax-calculations)
8. [Financial Reports](#financial-reports)
9. [Dashboard KPIs](#dashboard-kpis)
10. [Data Integrity & Validation](#data-integrity--validation)

---

## Invoices & Revenue

### Invoice Total Calculation

An invoice's total is calculated in this order:

```
Subtotal = SUM(item.quantity × item.unitPrice for all items)
After Discount = Subtotal − (Subtotal × discount%)
Tax = After Discount × (tax rate / 100)
Total = After Discount + Tax + Fees
```

**Example:**
- 2 items @ $100 each = $200 subtotal
- 10% discount = $200 − $20 = $180
- 19% tax on $180 = $34.20
- +$5 fee = **$219.20 total**

### Invoice Payment Tracking

Payments are applied to invoices individually:

- **Amount Paid** = Sum of all payments applied to this invoice
- **Remaining Balance** = Total − Amount Paid
- **Invoice Status** (auto-updated):
  - `draft` → Not sent to client
  - `sent` → Sent but not paid
  - `partially_paid` → Some payment received (0 < Paid < Total)
  - `paid` → Fully paid (Paid ≥ Total)
  - `overdue` → Due date passed and unpaid

### Cost of Goods Sold (COGS)

Product costs are **snapshotted at invoice creation time**:

- Each invoice item records `unitCost` at creation
- **Item COGS** = unitCost × quantity
- **Invoice COGS** = Sum of all item COGS
- Used in profit calculations and never changes (historical accuracy)

### Payment Validation

- Cannot accept a payment larger than the remaining invoice balance
- Remaining balance = Total − (sum of all previous payments)
- Balance values are fixed to 2 decimal places

### Special Case: Automatic Balance Application

When a client has an outstanding **balance** (from overpayments or credits), it automatically applies to new invoices:

- If new invoice total = $500 and client balance = $100
- Client owes only $400 (balance auto-applied)
- Balance shown as applied payment in invoice table

---

## Clients & Payments

### Client Balance Tracking

A client's balance is tracked cumulatively:

- **Total Invoiced** = Sum of all invoice totals for this client
- **Total Paid** = Sum of all payments applied to client's invoices
- **Total Pending** = Total Invoiced − Total Paid
- **Client Balance** = Available credit (from overpayments)

### Bulk Payment Distribution (FIFO)

When a client makes a payment and you apply it via "Bulk Payment":

1. Fetches all unpaid/partially-paid invoices, **oldest first**
2. For each invoice:
   - Calculates remaining balance = Invoice Total − Paid Amount
   - Applies available payment amount (minimum of: payment available OR remaining balance)
   - Updates invoice status based on new paid amount
3. If payment exceeds all invoice balances:
   - Excess is added to **Client Balance** (credit for future invoices)

**Example:**
- Invoice 1 (overdue): $500 unpaid
- Invoice 2: $300 unpaid
- Client pays $600
- Result: Invoice 1 fully paid ($500), Invoice 2 partially paid ($100), Client Balance = $0

---

## Stock & Inventory

### Stock Quantity Tracking

- **Simple Products**: Quantity is stored directly
- **Composite Products** (assemblies): Effective quantity = lowest component availability
  ```
  Effective Qty = floor(min(
    component1_available / component1_needed,
    component2_available / component2_needed,
    ...
  ))
  ```

**Example:**
- Chair (composite) needs: 1 frame + 4 wheels
- Available: 10 frames, 32 wheels
- Effective quantity = floor(min(10/1, 32/4)) = floor(min(10, 8)) = **8 chairs**

### Low Stock Alerts

Products are flagged as low stock when:
```
Effective Quantity ≤ Minimum Stock Threshold
```

Default `minStock = 5` per product.

### Stock Deduction on Invoice

When an invoice is created:

1. **Validation**: System checks sufficient stock exists BEFORE allowing invoice creation
2. **Deduction** (after invoice saved):
   - Simple product: `quantity -= item.quantity`
   - Composite product: For each component, `quantity -= (component.quantity_needed × item.quantity)`

**Validation Rejection:**
- Error shows: "Insufficient stock. Have: X, Need: Y"
- Invoice creation is blocked until resolved

### Automatic SKU Generation

Product SKUs are auto-generated during creation or category change:

```
SKU = [Category Prefix] + [Sequence Number]
Sequence = Count of products in this category + 1
```

**Example:**
- Category: "Furniture"
- If 3 furniture products exist, new product gets SKU "Furniture-4"
- When editing and changing category, SKU auto-updates

---

## Expenses & Recurring Charges

### One-Time Expenses

- Recorded with a date and fixed amount
- Included in reports only if date is within the report period
- No pro-ration

### Recurring Expenses

Recurring expenses are stored as a rate and **pro-rated** based on their recurrence pattern.

#### Pro-ration Formulas by Recurrence

| Recurrence | Formula | Example |
|------------|---------|---------|
| **Weekly** | rate × (days / 7) | $100/week × 10 days = $142.86 |
| **Monthly** | rate × months (calendar-accurate) | $1000/month × 1.5 months = $1500 |
| **Quarterly** | rate × (months / 3) | $3000/quarter × 2 months = $2000 |
| **Yearly** | rate × (days / 365) | $12000/year × 100 days = $3287.67 |

#### Calendar-Accurate Month Calculation

Months are calculated based on actual days in each month (28/29/30/31):

```
calcMonths(fromDate, toDate):
  daysInCurrentMonth = days remaining in month of fromDate
  daysInLastMonth = days passed in month of toDate
  monthsInBetween = count of full calendar months

  return (daysInCurrentMonth / daysInFromMonth) + monthsInBetween + (daysInLastMonth / daysInToMonth)
```

**Example: Feb 15 → Mar 17**
- Days in Feb after 15th: (28 − 15 + 1) / 28 = 14/28 = 0.5 months
- Full month of March: 1 month
- Days in March up to 17: 17/31 = 0.548 months
- **Total: 0.5 + 1 + 0.548 = 2.048 months**
- For a $1000/month expense: $1000 × 2.048 = **$2048**

### Rounding for Recurring Expenses

Monthly recurring expenses use **`Math.round()`** to snap fractional months:

- 1.048 months → rounds to **1 month**
- 1.5 months → rounds to **2 months**
- 2.4 months → rounds to **2 months**

This ensures monthly subscription expenses align with calendar months.

### Calculation Breakdown Display

In reports, expenses show calculation as: `($rate × periods)`

Example: `($1000 × 2 months)` for a $2000 recurring charge

---

## Employees & Payroll

### Salary Calculation by Period

Base salary is calculated differently based on the employee's salary period:

| Period | Formula | Rounding |
|--------|---------|----------|
| **Day** | rate × days | Exact calculation |
| **Week** | rate × (days / 7) | 2 decimals |
| **Month** | rate × months (calendar-accurate) | 2 decimals |

**Example:**
- $3000/month employee over Feb 15 → Mar 17 (2.048 months)
- Base salary: $3000 × 2.048 = $6144 → **rounds to $6144.00**

### Salary Advances: Deduction & Pro-rating

Salary advances reduce take-home pay for the period they're issued:

1. **Advance Date**: When advance is issued
2. **Pro-ration**: Calculated based on remaining days in pay period
   - Day period: Advance counts if date is within period
   - Week period: Advance counts for days remaining in week
   - Month period: Advance counts for days remaining in month
3. **Net Salary** = Base Salary − (Sum of all pro-rated advances)

#### Advance Pro-ration Formula

```
Remaining Days in Period = Period End Date − Advance Date + 1
Pro-Rated Advance = Advance Amount × (Remaining Days / Total Days in Period)
```

**Example:**
- Employee: $3000/month (Jan salary)
- Issues $500 advance on Jan 25
- Remaining days in January: 31 − 25 + 1 = 7 days
- Pro-rated deduction: $500 × (7/31) = $112.90
- Net salary: $3000 − $112.90 = **$2887.10**

### Automatic Advance Status

Salary advances are auto-marked as "paid" once their pay period ends:

- **Day period**: Advance is marked paid if date has passed
- **Week period**: Advance is marked paid if current week has started
- **Month period**: Advance is marked paid if current month has started

Unpaid advances remain deducted from salary. Paid advances don't affect future periods.

### Active Employee Filter

Only **active** employees are included in payroll calculations. Inactive employees are excluded from salary and advance deductions.

---

## Supplier Bills & Payables

### Bill Payment Tracking

Similar to invoices, supplier bills track:

- **Bill Amount** = Stored at creation
- **Amount Paid** = Sum of all payments applied to this bill
- **Remaining** = Bill Amount − Amount Paid
- **Bill Status**:
  - `pending` → No payments made
  - `partially_paid` → Some payment made (0 < Paid < Amount)
  - `paid` → Fully paid (Paid ≥ Amount)

### Days Overdue

```
daysOverdue = floor((now − dueDate) / 86400000)
```

Aging categories in reports:
- **Current**: 0 days overdue
- **1-30 days**: 1–30 days overdue
- **31-60 days**: 31–60 days overdue
- **61-90 days**: 61–90 days overdue
- **90+ days**: More than 90 days overdue

---

## Tax Calculations

### Tax per Invoice

Tax is calculated on the **discounted amount**:

```
Tax = (Subtotal − Discount) × (Tax Rate / 100)
```

Default tax rate: **19%**

### Tax Collection Tracking

- **Tax Collected** = Sum of tax from invoices with status = "paid"
  - Only counted from invoices that received payments
- **Tax Pending** = Sum of tax from invoices with status = "sent" or "overdue"
  - Tax on invoices not yet paid

### Pro-Rated Tax in Reports

When a partially-paid invoice is included in a P&L report:

```
Recognized Tax = (Payment Received / Invoice Total) × Invoice Tax
```

**Example:**
- Invoice total: $1000 with $190 tax
- Payment received: $500
- Recognized tax: ($500/$1000) × $190 = **$95**

### Tax Display

- Tax page shows summary: collected vs. pending
- Breakdown by invoice with tax rate and amount
- PDF export includes all details

---

## Financial Reports

### Profit & Loss (P&L) Report

The P&L report calculates profitability over a date range.

#### Revenue (Cash Basis)

```
Revenue = Sum of all payments received in period
```

- Counted by **payment date**, not invoice date
- Includes partial payments
- Only counts payments made during the report period

#### Cost of Goods Sold (COGS)

For each invoice that received a payment in the period:

```
Invoice COGS = Sum of (unitCost × quantity) for all items
```

- COGS is counted **once per invoice**, even if invoice has multiple payments
- Uses snapshot cost (unitCost) from invoice creation

#### Gross Profit

```
Gross Profit = Revenue − COGS
```

#### Total Expenses

Includes:
1. **One-time expenses**: All with dates in [fromDate, toDate]
2. **Recurring expenses**: Pro-rated for [fromDate, toDate]
3. **Salary expenses**: Pro-rated minus advances
4. **Supplier bill payments**: All with dates in [fromDate, toDate]

Can exclude expense categories (e.g., "exclude Rent").

#### Net Profit

```
Net Profit = Gross Profit − Total Expenses
```

### Balance Sheet Report

Snapshot of financial position at a date.

#### Assets

- **Cash**: Sum of all payments ever received
- **Accounts Receivable**: Sum of unpaid invoice balances (for remaining balance, not paid status)
- **Inventory**: Sum of (product.cost × product.quantity) for all products
- **Total Assets** = Cash + AR + Inventory

#### Liabilities

- **Tax Payable**: Pro-rated tax portion on unpaid invoices
  ```
  Tax Payable per Invoice = (Invoice Tax / Invoice Total) × Unpaid Balance
  ```

#### Equity

```
Equity = Total Assets − Total Liabilities
```

### Comprehensive Report

Combines P&L with detailed breakdowns:

#### Revenue Breakdown

- **Period Invoice Revenue**: Payments from invoices issued in [fromDate, toDate]
- **Old Invoice Revenue**: Payments from invoices issued before period
- **Total Revenue**: Sum of both

#### COGS by Invoice

For each invoice, shows:
- Period payment amount
- Total paid to date
- Total COGS
- Gross profit = Total Paid − COGS

#### Receivable Aging

Groups unpaid invoices by days overdue:
- Current (0 days)
- 1-30 days
- 31-60 days
- 61-90 days
- 90+ days

Shows amount and due date for each.

#### Payable Aging

Groups unpaid supplier bills by days overdue (same buckets as receivables).

For each bill:
- Period payment amount
- Total paid to date
- Remaining balance

#### Profit Margins

```
COGS Margin = (Total COGS / Total Revenue) × 100
Gross Margin = (Gross Profit / Total Revenue) × 100
Net Margin = (Net Profit / Total Revenue) × 100
```

---

## Dashboard KPIs

The dashboard home page displays key metrics:

### Earnings Summary

- **Gross Earning** = Sum of all invoice totals (all statuses)
- **COGS** = Sum of (unitCost × qty) for all invoiced items
- **Total Tax** = Sum of tax field across all invoices
- **Total Supplier Bills** = Sum of supplier bill amounts (all statuses)
- **Total Expenses** = Sum of one-time + pro-rated recurring expenses
- **Net Earning** = Gross − COGS − Tax − Supplier Bills − Expenses
- **Pending Amount** = Sum of unpaid invoice balances

### Revenue Trend (12-Month Lookback)

- Groups invoices by YYYY-MM
- Fills missing months with $0
- Displays: 1-month, 3-month, 6-month, or 12-month trends
- **Trend %** = ((current month − prior month) / prior month) × 100
  - Green: positive trend
  - Red: negative trend

### New This Month

- Counts new clients created after month start
- Counts new invoices created after month start

### Low Stock Products

Lists products with:
```
Effective Quantity ≤ minStock Threshold
```

Shows available quantity and minimum required.

---

## Data Integrity & Validation

### Invoice Creation Validation

1. ✓ Client must exist
2. ✓ At least one invoice item required
3. ✓ Item quantity > 0
4. ✓ Product must exist and have sufficient stock
5. ✓ Item unit price must be ≥ product cost
6. ✓ Invoice date must be valid
7. ✓ If tax rate is provided, must be 0–100%

**If validation fails:** Invoice is not created, error is shown.

### Stock Deduction Guarantee

Stock deduction is **guaranteed atomic**:
- If stock validation passes, deduction WILL succeed
- If validation fails, invoice creation is prevented entirely
- No orphaned invoices without stock deduction

### Rounding & Precision

**All currency values:** 2 decimal places

Rounding methods:
- `parseFloat(value.toFixed(2))` — standard rounding
- `Math.floor()` — for days, integer counts
- `Math.round()` — for monthly recurring expenses

### Payment Boundary Checks

- Cannot pay more than remaining invoice balance
- Cannot exceed invoice total through multiple payments
- Balance is checked at each payment application

### Audit Trail

All actions are logged in the Activity Log:
- Invoice creation/update/delete
- Payment application
- Expense addition
- Stock adjustments
- Employee/Salary changes
- Advance issuance

---

## Number Display & Formatting

### Formatting Rules

| Value Type | Display Format | Example |
|---|---|---|
| Currency | 2 decimals with symbol | $1,234.56 |
| Percentage | 1 decimal place | 19.5% |
| Month (pro-ration) | 4 decimals (internal only) | 1.5048 |
| Days | Integer | 30 |
| Quantity | 2 decimals (for decimals) or integer | 5 or 2.5 |

### Compact Display (Dashboard only)

Large numbers are shown compactly:
```
≥ 1,000,000,000 → billions (B)
≥ 1,000,000 → millions (M)
≥ 1,000 → thousands (K)
< 1,000 → full amount
```

**Example:** $2,500,000 displays as "$2.5M"

---

## Supported Currencies

- USD (US Dollar) — $
- EUR (Euro) — €
- LBP (Lebanese Pound) — ل.ل
- XOF (CFA Franc) — CFA
- GNF (Guinean Franc) — FG
- SLE (Leone) — Le
- GHS (Cedi) — ₵
- CDF (Congolese Franc) — FC
- NGN (Naira) — ₦

Default: **USD**

---

## Supported Languages

- English (en)
- Français (fr)
- العربية (ar)

All reports, invoices, and PDFs support multilingual output. Select language in Settings.

---

## Known Features & Limitations

### Fully Implemented Features

✅ Invoicing with line items
✅ Client payment tracking
✅ Automatic balance application
✅ Stock/Inventory management
✅ Composite products
✅ Recurring & one-time expenses
✅ Salary tracking with advances
✅ Supplier bills & payments
✅ Tax tracking
✅ Profit & Loss reports
✅ Balance sheet
✅ Comprehensive aging reports
✅ Multi-language support (EN/FR/AR)
✅ Multi-user team management
✅ Audit logging
✅ PDF exports for invoices, reports, and tax
✅ AI-powered natural language commands
✅ Chart of Accounts (implemented, see [note below](#chart-of-accounts-note))

### Not Yet Implemented

❌ Bank integrations / auto-sync
❌ Direct tax filing integration
❌ Email invoice delivery to clients
❌ Multi-currency transaction support (all transactions in single org currency)
❌ Customer self-service portal
❌ Payment gateway integration (manual entry only)

### Chart of Accounts Note

The Chart of Accounts feature is **fully implemented** with:
- Standard 19-account chart
- Full CRUD operations
- Account type categorization (Asset, Liability, Equity, etc.)

However, the navigation link is **intentionally hidden** from the sidebar as the feature awaits formal release.

---

## Support & Troubleshooting

### Common Questions

**Q: Why does my invoice total seem wrong?**
A: Check the tax rate (default 19%) and discount percentage. Formula is: `(Subtotal − Discount) × (1 + Tax Rate) + Fees`

**Q: How are partial payments handled?**
A: Each payment is applied individually. Invoice status auto-updates: `paid` (100%), `partially_paid` (>0% but <100%), or `sent` (0%).

**Q: Why was stock deducted but invoice creation failed?**
A: This shouldn't happen. If you see this, contact support—it indicates a system error.

**Q: How do I calculate profit for a specific period?**
A: Use the **Profit & Loss Report** with the date range. Revenue is cash-basis (payment date), not invoice date.

**Q: Can I use multiple currencies?**
A: All transactions use your organization's default currency (set in Settings). Multi-currency support is not yet available.

---

**Last Updated:** 2026-03-30
**Version:** 1.0
