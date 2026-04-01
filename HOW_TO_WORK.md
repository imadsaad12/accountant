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
- **Total Expenses** = Sum of one-time + pro-rated recurring expenses (from Expenses table)
- **Total Salaries** = Sum of all employee salaries prorated from each hire date to today
- **Net Earning** = Gross − COGS − Tax − Supplier Bills − Expenses − Salaries
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

**Last Updated:** 2026-03-31
**Version:** 1.0

---

## Manual Test Scenarios

Real-world business scenarios to manually verify all calculations are working correctly.

---

### Scenario A: Charbel Hadded — Full Lifecycle

#### Initial Setup

Create the following before starting:

**Products** (Stock → Add Product):

| Name      | Price  | Cost  | Qty | Type   |
|-----------|--------|-------|-----|--------|
| Screen    | $100   | $75   | 10  | Simple |
| Mouse     | $20    | $7    | 10  | Simple |
| Full Set  | $110   | $82   | 10  | Simple |

**Employees** (Employees → Add Employee):

| Name              | Salary  | Period | Hire Date  |
|-------------------|---------|--------|------------|
| Sarah Baraket     | $20     | Day    | 2026-01-01 |
| Khodor Aboud      | $300    | Week   | 2026-02-15 |
| Youssef El-Helew  | $2000   | Month  | 2026-03-01 |

**Clients** (Clients → Add Client):
- Charbel Hadded
- Hassan Hammoud

**Suppliers** (Suppliers → Add Supplier):
- XYZ Solution
- X-Factor

---

#### Step 1 — Invoice #1: 2×Screen + 1×Mouse with $50 partial payment

**Date:** 2026-04-01

**Action:**
1. Go to Invoices → New Invoice
2. Select client: **Charbel Hadded**
3. Set date: **2026-04-01**
4. Set tax rate: **0%**
5. Add items:
   - Select product **Screen**, qty **2**, unit price **$100**
   - Add item → Select product **Mouse**, qty **1**, unit price **$20**
6. Expand "Record Payment" section, enter amount **$50**, date **2026-04-01**, method **Cash**
7. Save invoice

**Expected Results:**

| Check | Expected Value |
|-------|---------------|
| Invoice total | **$220.00** |
| Invoice status | **Partially Paid** |
| Amount paid | **$50.00** |
| Remaining balance | **$170.00** |
| Screen stock (Stock page) | **8** |
| Mouse stock (Stock page) | **9** |
| Full Set stock (Stock page) | **10** (unchanged) |

**Client Detail** (Clients → click Charbel → filter Apr 1–30, 2026):

| Metric | Expected |
|--------|----------|
| Invoices shown | 1 |
| Total Invoiced | $220.00 |
| Total Paid | $50.00 |
| Total Pending | $170.00 |
| Client Balance | $0.00 |

**Dashboard:**

| Metric | Expected |
|--------|----------|
| Gross Earning | increases by $220 |
| Net Earning | increases by $63 *(= $220 − $157 COGS)* |
| Pending Amount | increases by $170 |

---

#### Step 2 — Invoice #2: 1×Full Set + $10 Delivery Fee with $50 partial payment

**Date:** 2026-04-01

**Action:**
1. Go to Invoices → New Invoice
2. Select client: **Charbel Hadded**
3. Set date: **2026-04-01**
4. Set tax rate: **0%**
5. Add item: Select product **Full Set**, qty **1**, unit price **$110**
6. Click **Add Fee** → label: **Delivery**, amount: **$10**
7. Expand "Record Payment" → amount **$50**, date **2026-04-01**, method **Cash**
8. Save invoice

**Expected Results:**

| Check | Expected Value |
|-------|---------------|
| Subtotal | $110.00 |
| Fee | $10.00 |
| Invoice total | **$120.00** |
| Invoice status | **Partially Paid** |
| Amount paid | **$50.00** |
| Remaining balance | **$70.00** |
| Screen stock (Stock page) | **7** *(8 − 1, consumed by Full Set)* |
| Mouse stock (Stock page) | **8** *(9 − 1, consumed by Full Set)* |
| Full Set effective stock | **7** *(min(Screen 7, Mouse 8) = 7)* |

**Client Detail** (Clients → Charbel → filter Apr 1–30, 2026):

| Metric | Expected |
|--------|----------|
| Invoices shown | 2 |
| Total Invoiced | **$340.00** *(220 + 120)* |
| Total Paid | **$100.00** *(50 + 50)* |
| Total Pending | **$240.00** *(170 + 70)* |
| Client Balance | $0.00 |

---

#### Step 3 — Bulk Payment $140 (2026-04-02)

**Action:**
1. Go to Clients → click **Charbel Hadded**
2. Expand "Bulk Payment" section
3. Enter amount: **$140**, date: **2026-04-02**, method: **Cash**
4. Submit

**How it distributes (FIFO — oldest invoice first):**

| Invoice | Before (Paid/Total) | Applied | After (Paid/Total) | Status |
|---------|--------------------|---------|--------------------|--------|
| Inv-1 ($220) | $50 / $220 | **$140** | $190 / $220 | Partially Paid |
| Inv-2 ($120) | $50 / $120 | $0 *(nothing left)* | $50 / $120 | Partially Paid |
| **Remaining** | | | **$0** | → no excess |

**Expected Results:**

| Check | Expected Value |
|-------|---------------|
| Inv-1 paid | $190.00 |
| Inv-1 remaining | **$30.00** |
| Inv-1 status | **Partially Paid** |
| Inv-2 paid | $50.00 |
| Inv-2 remaining | **$70.00** |
| Inv-2 status | **Partially Paid** |
| Client balance | $0.00 |

**Client Detail** (Clients → Charbel → filter Apr 1–30, 2026):

| Metric | Expected |
|--------|----------|
| Total Paid | **$240.00** *(190 + 50)* |
| Total Pending | **$100.00** *(30 + 70)* |
| Client Balance | $0.00 |

---

#### Step 4 — Bulk Payment $110 (2026-04-03)

**Action:**
1. Clients → Charbel → Bulk Payment
2. Amount: **$110**, date: **2026-04-03**, method: **Cash**
3. Submit

**How it distributes:**

| Invoice | Before (Paid/Total) | Applied | After (Paid/Total) | Status |
|---------|--------------------|---------|--------------------|--------|
| Inv-1 ($220) | $190 / $220 | **$30** | $220 / $220 | **Paid ✓** |
| Inv-2 ($120) | $50 / $120 | **$70** | $120 / $120 | **Paid ✓** |
| **Remaining** | | **$10 excess** | | → added to client balance |

**Expected Results:**

| Check | Expected Value |
|-------|---------------|
| Inv-1 status | **Paid** |
| Inv-2 status | **Paid** |
| Amount applied | **$100.00** *(30 + 70)* |
| Excess / Added to balance | **$10.00** |
| **Client Balance** | **$10.00** |

**Client Detail** (Clients → Charbel → filter Apr 1–30, 2026):

| Metric | Expected |
|--------|----------|
| Total Paid | **$340.00** |
| Total Pending | **$0.00** |
| Client Balance | **$10.00** |

---

#### Step 5 — Invoice #3: 1×Mouse with Balance Credit (2026-04-04)

**Action:**
1. Go to Invoices → New Invoice
2. Client: **Charbel Hadded**, date: **2026-04-04**, tax: **0%**
3. Item: **Mouse**, qty **1**, unit price **$20**
4. Save (do NOT add an initial payment — balance auto-applies)

**Auto Balance Application (happens automatically on save):**
- Client balance = $10 → auto-applied as "balance" payment
- Invoice: $10 paid from balance, $10 still owed

5. After invoice is created, go to the invoice → Add Payment → amount **$10**, date **2026-04-04**, method **Cash**

**Expected Results:**

| Check | Expected Value |
|-------|---------------|
| Invoice total | **$20.00** |
| Auto-applied from balance | **$10.00** |
| Cash payment added | **$10.00** |
| Invoice total paid | **$20.00** |
| Invoice status | **Paid** |
| **Client Balance** | **$0.00** |
| Mouse stock | **7** *(8 − 1)* |

**Client Detail** (Clients → Charbel → filter Apr 1–30, 2026):

| Metric | Expected |
|--------|----------|
| Invoices shown | **3** |
| Total Invoiced | **$360.00** *(220 + 120 + 20)* |
| Total Paid | **$360.00** |
| Total Pending | **$0.00** |
| Client Balance | **$0.00** |

---

#### Final Stock Summary (after all 5 steps)

| Product  | Initial Qty | Direct Sold | Consumed by Full Set | Final Qty |
|----------|-------------|-------------|---------------------|-----------|
| Screen   | 10          | 2           | 1                   | **7**     |
| Mouse    | 10          | 2           | 1                   | **7**     |
| Full Set | *(composite)* | 1 sold    | —                   | **7** *(eff: min(Screen 7, Mouse 7))* |

> Full Set is a **composite product** (1×Screen + 1×Mouse). Selling 1 Full Set decrements Screen and Mouse stock by 1 each. Full Set has no independent physical stock — its effective quantity = min(component qty / component ratio).

---

### Scenario B: Youssef El-Helew — April 2026 Monthly Salary

*(Requires Youssef El-Helew employee from Setup above: $2000/month, hired 2026-03-01)*

**How to verify:**

1. Go to **Expenses**
2. Select date mode: **Custom**
3. From: **2026-04-01**, To: **2026-04-30**
4. Category filter: **Salaries**
5. Click **Search**

**Expected:**

| Employee | Period | Calculation | Expected Salary |
|----------|--------|-------------|-----------------|
| Youssef El-Helew | Month | $2000 × 1 month (Apr 1–30 = full month) | **$2000.00** |

The row should show:
- Vendor: **Youssef El-Helew**
- Description: **Salary — Youssef El-Helew ($2000/month × 1 month)**
- Amount: **$2000.00**

---

### Scenario C: April 2026 Salary Summary (All Employees)

Filter Expenses: Custom, Apr 1–30, 2026, Category: Salaries

| Employee | Rate | Period | Days in April | Calculation | Expected |
|----------|------|--------|---------------|-------------|----------|
| Sarah Baraket | $20 | Day | 30 | $20 × 30 days | **$600.00** |
| Khodor Aboud | $300 | Week | 30 | $300 × (30 ÷ 7) | **$1,285.71** |
| Youssef El-Helew | $2000 | Month | 30 | $2000 × 1 month | **$2,000.00** |
| **Total** | | | | | **$3,885.71** |

> **Note on month calculation:** April 1 → April 30 is detected as exactly 1 full month because start day = 1st and end day = last day of April (30). This uses the exact-month shortcut in the calendar logic. If the period were Apr 1 → Apr 29, it would calculate as `29 ÷ 30 ≈ 0.97 months` instead.

---

### Scenario D: Supplier Bills

*(Uses XYZ Solution and X-Factor from Setup)*

#### D-1: XYZ Solution — Screen Stock Restock

**Action:**
1. Suppliers → XYZ Solution → Add Bill
2. Description: **Screen Stock**, Amount: **$600**, Date: **2026-04-02**, Due: **2026-04-30**
3. Save bill
4. Open the bill → Add Payment → **$600**, date **2026-04-02**, method **Bank Transfer**

**Expected:**

| Check | Expected |
|-------|----------|
| Bill status | **Paid** |
| Amount paid | $600.00 |
| Remaining | $0.00 |

---

#### D-2: XYZ Solution — Mouse & Accessories

**Action:**
1. Suppliers → XYZ Solution → Add Bill
2. Description: **Mouse & Accessories**, Amount: **$100**, Date: **2026-04-02**, Due: **2026-04-30**
3. Save bill
4. Open the bill → Add Payment → **$50**, date **2026-04-05**, method **Cash**

**Expected:**

| Check | Expected |
|-------|----------|
| Bill status | **Partially Paid** |
| Amount paid | $50.00 |
| Remaining | $50.00 |

---

#### D-3: X-Factor — Marketing Package

**Action:**
1. Suppliers → X-Factor → Add Bill
2. Description: **Marketing Package**, Amount: **$300**, Date: **2026-04-10**, Due: **2026-04-30**
3. Save bill — **no payment added**

**Expected:**

| Check | Expected |
|-------|----------|
| Bill status | **Pending** |
| Amount paid | $0.00 |
| Remaining | $300.00 |

---

#### Supplier Bills Summary (Payables page)

| Supplier | Bill | Amount | Paid | Remaining | Status |
|----------|------|--------|------|-----------|--------|
| XYZ Solution | Screen Stock | $600.00 | $600.00 | $0.00 | Paid |
| XYZ Solution | Mouse & Accessories | $100.00 | $50.00 | $50.00 | Partially Paid |
| X-Factor | Marketing Package | $300.00 | $0.00 | $300.00 | Pending |
| **Total** | | **$1,000.00** | **$650.00** | **$350.00** | |

> **Dashboard note:** The dashboard counts **total bill amounts** ($1,000) regardless of how much has been paid. This is by design — the full liability is tracked, not just what's been settled.

---

### Scenario E: Expenses (Monthly, Weekly, One-Time)

*(Go to Expenses page to add these)*

#### E-1: Monthly Recurring — Office Rent

**Action:**
1. Expenses → Add Expense
2. Description: **Office Rent**, Amount: **$800**, Date: **2026-04-01**
3. Recurrence: **Monthly**
4. Save

#### E-2: Weekly Recurring — Internet & Phone

**Action:**
1. Expenses → Add Expense
2. Description: **Internet & Phone**, Amount: **$100**, Date: **2026-04-01**
3. Recurrence: **Weekly**
4. Save

#### E-3: One-Time — Printer Repair

**Action:**
1. Expenses → Add Expense
2. Description: **Printer Repair**, Amount: **$150**, Date: **2026-04-10**
3. Recurrence: **None (one-time)**
4. Save

---

#### Expenses Verification (filter Custom: Apr 1–30, 2026, Category: All)

| # | Description | Type | Rate | Calculation | Expected Amount |
|---|-------------|------|------|-------------|-----------------|
| 1 | Office Rent | Monthly | $800/mo | $800 × 1 month | **$800.00** |
| 2 | Internet & Phone | Weekly | $100/wk | $100 × (30 ÷ 7) | **$428.57** |
| 3 | Printer Repair | One-time | — | fixed | **$150.00** |
| 4 | Sarah Baraket | Salary/Day | $20/day | $20 × 30 | **$600.00** |
| 5 | Khodor Aboud | Salary/Week | $300/wk | $300 × (30 ÷ 7) | **$1,285.71** |
| 6 | Youssef El-Helew | Salary/Month | $2000/mo | $2000 × 1 | **$2,000.00** |
| | **Total (April 2026)** | | | | **$5,264.28** |

> **Important:** Rows 1–3 come from the Expenses table. Rows 4–6 are salary rows computed dynamically from Employees — they are not stored in the Expenses table.

---

### Scenario F: Hassan Hammoud — Invoices with Different Statuses

*(Uses Hassan Hammoud client from Setup. Demonstrates draft, sent, paid, partially paid, and overdue statuses.)*

#### F-1: Invoice #4 — 1×Screen, Fully Paid

**Action:**
1. Invoices → New Invoice
2. Client: **Hassan Hammoud**, date: **2026-04-05**, tax: **0%**
3. Item: **Screen**, qty **1**, unit price **$100**
4. Record Payment: **$100**, date **2026-04-05**, method **Cash**
5. Save

**Expected:**

| Check | Expected |
|-------|----------|
| Invoice total | **$100.00** |
| Invoice status | **Paid** |
| Amount paid | $100.00 |
| Remaining | $0.00 |
| Screen stock | **6** *(7 − 1)* |
| Mouse stock | **7** *(unchanged)* |

---

#### F-2: Invoice #5 — 1×Mouse, Sent (no payment)

**Action:**
1. Invoices → New Invoice
2. Client: **Hassan Hammoud**, date: **2026-04-08**, due: **2026-04-30**, tax: **0%**
3. Item: **Mouse**, qty **1**, unit price **$20**
4. Save (no payment)
5. Open the invoice → Change status to **Sent**

**Expected:**

| Check | Expected |
|-------|----------|
| Invoice total | **$20.00** |
| Invoice status | **Sent** |
| Amount paid | $0.00 |
| Remaining | $20.00 |
| Screen stock | **6** *(unchanged)* |
| Mouse stock | **6** *(7 − 1)* |

---

#### F-3: Invoice #6 — 1×Screen + 1×Mouse, Partially Paid

**Action:**
1. Invoices → New Invoice
2. Client: **Hassan Hammoud**, date: **2026-04-10**, due: **2026-04-30**, tax: **0%**
3. Items: **Screen** qty **1** ($100) + **Mouse** qty **1** ($20)
4. Record Payment: **$30**, date **2026-04-10**, method **Cash**
5. Save

**Expected:**

| Check | Expected |
|-------|----------|
| Invoice total | **$120.00** |
| Invoice status | **Partially Paid** |
| Amount paid | $30.00 |
| Remaining | $90.00 |
| Screen stock | **5** *(6 − 1)* |
| Mouse stock | **5** *(6 − 1)* |
| Full Set effective stock | **5** *(min(5, 5))* |

---

#### F-4: Invoice #7 — 1×Full Set, Overdue (no payment)

**Action:**
1. Invoices → New Invoice
2. Client: **Hassan Hammoud**, date: **2026-04-01**, due: **2026-04-15**, tax: **0%**
3. Item: **Full Set**, qty **1**, unit price **$110**
4. Save (no payment)
5. Open the invoice → Change status to **Sent**
6. After April 15 passes → Change status to **Overdue**

**Expected:**

| Check | Expected |
|-------|----------|
| Invoice total | **$110.00** |
| Invoice status | **Overdue** |
| Amount paid | $0.00 |
| Remaining | $110.00 |
| Days overdue (on Apr 30) | **15 days** |
| Screen stock | **4** *(5 − 1, consumed by Full Set)* |
| Mouse stock | **4** *(5 − 1, consumed by Full Set)* |
| Full Set effective stock | **4** *(min(Screen 4, Mouse 4))* |

> Selling 1 Full Set decrements Screen and Mouse by 1 each (composite product).

---

#### Hassan Client Detail (Clients → Hassan → filter Apr 1–30, 2026)

| Metric | Expected |
|--------|----------|
| Invoices shown | **4** |
| Total Invoiced | **$350.00** *(100 + 20 + 120 + 110)* |
| Total Paid | **$130.00** *(100 + 0 + 30 + 0)* |
| Total Pending | **$220.00** *(0 + 20 + 90 + 110)* |
| Client Balance | **$0.00** |

#### Invoice Status Summary (after Scenario F)

| Invoice | Client | Total | Paid | Status |
|---------|--------|-------|------|--------|
| Inv-1 | Charbel | $220.00 | $220.00 | **Paid** |
| Inv-2 | Charbel | $120.00 | $120.00 | **Paid** |
| Inv-3 | Charbel | $20.00 | $20.00 | **Paid** |
| Inv-4 | Hassan | $100.00 | $100.00 | **Paid** |
| Inv-5 | Hassan | $20.00 | $0.00 | **Sent** |
| Inv-6 | Hassan | $120.00 | $30.00 | **Partially Paid** |
| Inv-7 | Hassan | $110.00 | $0.00 | **Overdue** |

#### Final Stock Summary (after Scenarios A + F)

| Product  | After A | Direct Sold (F) | Consumed by Full Set (F) | Final Qty |
|----------|---------|-----------------|--------------------------|-----------|
| Screen   | 7       | 2 *(F-1, F-3)*  | 1 *(F-4)*                | **4**     |
| Mouse    | 7       | 2 *(F-2, F-3)*  | 1 *(F-4)*                | **4**     |
| Full Set | 7 *(eff)* | 1 *(F-4)*     | —                        | **4** *(eff: min(4, 4))* |

> Full Set is a **composite product** (1×Screen + 1×Mouse). It has no independent physical stock. Selling 1 Full Set decrements Screen and Mouse by 1 each. Effective qty = min(Screen, Mouse) = 4.

---

### Scenario G: Salary Advances

*(Give salary advances to Sarah and Youssef, then verify deductions on the Expenses page)*

#### G-1: Sarah Baraket — $100 Advance

**Action:**
1. Employees → Sarah Baraket → Salary Advances → Add Advance
2. Amount: **$100**, Date: **2026-04-20**
3. Save (status defaults to **Pending**)

**How the deduction works:**
- Sarah's salary period = **day**
- Period end for a daily employee = **same day** as advance (Apr 20)
- Remaining days in period = calcDays(Apr 20, Apr 20) = **1 day**
- Deduction per day = $100 / 1 = **$100**
- Overlap with Apr 1–30: Apr 20→Apr 20 = **1 day**
- **Total deduction = $100**

#### G-2: Youssef El-Helew — $500 Advance

**Action:**
1. Employees → Youssef El-Helew → Salary Advances → Add Advance
2. Amount: **$500**, Date: **2026-04-15**
3. Save (status defaults to **Pending**)

**How the deduction works:**
- Youssef's salary period = **month**
- Period end for monthly = **end of advance month** = Apr 30
- Remaining days in period = calcDays(Apr 15, Apr 30) = **16 days**
- Deduction per day = $500 / 16 = **$31.25**
- Overlap with Apr 1–30: Apr 15→Apr 30 = **16 days**
- **Total deduction = $31.25 × 16 = $500**

---

#### Updated Expenses Verification (filter Custom: Apr 1–30, 2026, Category: All)

| # | Description | Type | Gross Salary | Advance Deduction | Expected Amount |
|---|-------------|------|-------------|-------------------|-----------------|
| 1 | Office Rent | Monthly | $800/mo × 1 | — | **$800.00** |
| 2 | Internet & Phone | Weekly | $100/wk × (30÷7) | — | **$428.57** |
| 3 | Printer Repair | One-time | $150 | — | **$150.00** |
| 4 | Sarah Baraket | Salary/Day | $20 × 30 = $600 | −$100 | **$500.00** |
| 5 | Khodor Aboud | Salary/Week | $300 × (30÷7) = $1,285.71 | — | **$1,285.71** |
| 6 | Youssef El-Helew | Salary/Month | $2000 × 1 = $2,000 | −$500 | **$1,500.00** |
| | **Total (April 2026)** | | | | **$4,664.28** |

> The description for rows with advances will show e.g. "Youssef El-Helew salary (−500 advance)" in the comprehensive report.

---

### Scenario H: Reports — P&L and Comprehensive (April 2026)

*(Go to Reports page, select period Apr 1–30, 2026)*

> **Key concept:** P&L reports use **cash-basis revenue** — only payments actually received in the period count as revenue. COGS is counted once per invoice that received at least one payment. The Comprehensive report adds receivable/payable aging, COGS by invoice, and margin calculations.

---

#### H-1: P&L Report (Apr 1–30, 2026)

**Action:**
1. Reports → Select **Profit & Loss**
2. Period: **2026-04-01** to **2026-04-30**
3. Generate

**Revenue (cash-basis — payments received in period):**

| Source | Payments | Amount |
|--------|----------|--------|
| Inv-1 (Charbel) | $50 + $140 + $30 | $220.00 |
| Inv-2 (Charbel) | $50 + $70 | $120.00 |
| Inv-3 (Charbel) | $10 (balance) + $10 (cash) | $20.00 |
| Inv-4 (Hassan) | $100 | $100.00 |
| Inv-6 (Hassan) | $30 | $30.00 |
| **Total Revenue** | | **$490.00** |

> Inv-5 ($20, Sent) and Inv-7 ($110, Overdue) have **no payments** → not included in revenue.

**COGS (one-time per invoice that received a payment):**

| Invoice | Items | COGS |
|---------|-------|------|
| Inv-1 | 2×Screen($75) + 1×Mouse($7) | $157.00 |
| Inv-2 | 1×Full Set($82) | $82.00 |
| Inv-3 | 1×Mouse($7) | $7.00 |
| Inv-4 | 1×Screen($75) | $75.00 |
| Inv-6 | 1×Screen($75) + 1×Mouse($7) | $82.00 |
| **Total COGS** | | **$403.00** |

> Inv-5 and Inv-7 have no payments → their COGS is **not counted** in the P&L.

**Gross Profit:** $490.00 − $403.00 = **$87.00**

**Expenses by Category:**

| Category | Items | Amount |
|----------|-------|--------|
| Rent | Office Rent ($800 × 1 month) | $800.00 |
| Utilities | Internet & Phone ($100 × 30÷7) | $428.57 |
| Office | Printer Repair (one-time) | $150.00 |
| Salaries | Sarah ($500) + Khodor ($1,285.71) + Youssef ($1,500) | $3,285.71 |
| Supplier Bills | XYZ Screen ($600) + XYZ Mouse ($50) | $650.00 |
| **Total Expenses** | | **$5,314.28** |

> **Supplier bills in P&L** = bill **payments** made in the period ($650), not total bill amounts ($1,000). This differs from the dashboard which uses total bill amounts.

**P&L Summary:**

| Line | Value |
|------|-------|
| **Revenue** | **$490.00** |
| **COGS** | **$403.00** |
| **Gross Profit** | **$87.00** |
| **Total Expenses** | **$5,314.28** |
| **Net Profit** | **−$5,227.28** |

**Total Sales in Period (all invoices, regardless of payment):**

| Metric | Value |
|--------|-------|
| Total Revenue (all invoice totals) | $710.00 |
| Total COGS (all invoices) | $492.00 |
| Gross Profit | $218.00 |
| Total Paid | $490.00 |
| Total Pending | $220.00 |
| Invoice Count | 7 |
| Paid Count | 4 |
| Partial Count | 1 |

**Most Sold Products (by invoice item quantity):**

| Product | Qty Sold | Unit Price | Total |
|---------|----------|------------|-------|
| Screen | 4 *(Inv-1:2, Inv-4:1, Inv-6:1)* | $100.00 | $400.00 |
| Mouse | 4 *(Inv-1:1, Inv-3:1, Inv-5:1, Inv-6:1)* | $20.00 | $80.00 |
| Full Set | 2 *(Inv-2:1, Inv-7:1)* | $110.00 | $220.00 |

> This counts invoice line items, not physical stock movements. Full Set appears as its own product here — component consumption (Screen + Mouse) is tracked separately in stock.

---

#### H-2: Comprehensive Report (Apr 1–30, 2026)

**Action:**
1. Reports → Select **Comprehensive**
2. Period: **2026-04-01** to **2026-04-30**
3. Generate

The Comprehensive report includes everything from the P&L plus:

**Revenue Breakdown:**

| Source | Amount |
|--------|--------|
| Period Invoice Revenue (payments from invoices issued in Apr) | **$490.00** |
| Old Invoice Revenue (payments from invoices before Apr) | **$0.00** |
| **Total Revenue** | **$490.00** |

**Margins:**

| Margin | Formula | Value |
|--------|---------|-------|
| COGS % | COGS ÷ Revenue | **82.2%** |
| Gross Margin | Gross Profit ÷ Revenue | **17.8%** |
| Net Margin | Net Profit ÷ Revenue | **−1,066.8%** |

**Invoice Status Breakdown (in period):**

| Status | Count |
|--------|-------|
| Paid | 4 |
| Partially Paid | 1 |
| Sent | 1 |
| Overdue | 1 |
| Draft | 0 |

**COGS by Invoice:**

| Invoice # | Client | Total | Period Payment | COGS | Gross Profit |
|-----------|--------|-------|----------------|------|--------------|
| Inv-1 | Charbel | $220.00 | $220.00 | $157.00 | $63.00 |
| Inv-2 | Charbel | $120.00 | $120.00 | $82.00 | $38.00 |
| Inv-3 | Charbel | $20.00 | $20.00 | $7.00 | $13.00 |
| Inv-4 | Hassan | $100.00 | $100.00 | $75.00 | $25.00 |
| Inv-6 | Hassan | $120.00 | $30.00 | $82.00 | −$52.00 |

> Inv-6 shows negative gross profit because only $30 was paid but full COGS ($82) is recognized.

**Expense Rows (detailed):**

| Category | Description | Amount |
|----------|-------------|--------|
| Rent | Office Rent (monthly) | $800.00 |
| Utilities | Internet & Phone (weekly) | $428.57 |
| Office | Printer Repair | $150.00 |
| Salaries | Sarah Baraket salary (−100 advance) | $500.00 |
| Salaries | Khodor Aboud salary | $1,285.71 |
| Salaries | Youssef El-Helew salary (−500 advance) | $1,500.00 |
| Supplier Bill | XYZ Solution: Screen Stock | $600.00 |
| Supplier Bill | XYZ Solution: Mouse & Accessories | $50.00 |
| **Total** | | **$5,314.28** |

**Receivable Aging (open invoices as of report date):**

| Invoice | Client | Total | Paid | Balance | Due Date | Days Overdue | Bucket |
|---------|--------|-------|------|---------|----------|-------------|--------|
| Inv-5 | Hassan | $20.00 | $0.00 | $20.00 | 2026-04-30 | 0 | Current |
| Inv-6 | Hassan | $120.00 | $30.00 | $90.00 | 2026-04-30 | 0 | Current |
| Inv-7 | Hassan | $110.00 | $0.00 | $110.00 | 2026-04-15 | 15 | 1-30 |

| Aging Bucket | Amount |
|-------------|--------|
| Current | $110.00 |
| 1-30 days | $110.00 |
| 31-60 days | $0.00 |
| 61-90 days | $0.00 |
| 90+ days | $0.00 |
| **Total Outstanding** | **$220.00** |

**Payable Aging (unpaid supplier bills):**

| Supplier | Bill | Amount | Paid | Remaining | Due Date | Days Overdue | Bucket |
|----------|------|--------|------|-----------|----------|-------------|--------|
| XYZ Solution | Mouse & Accessories | $100.00 | $50.00 | $50.00 | 2026-04-30 | 0 | Current |
| X-Factor | Marketing Package | $300.00 | $0.00 | $300.00 | 2026-04-30 | 0 | Current |

| **Total Payable** | **$350.00** |
|---|---|

---

### Final Dashboard Numbers (after all Scenarios A + D + E + F + G)

> Dashboard figures are **all-time cumulative** (not filtered by date). Recurring expenses are prorated from their start date to the **current date** the dashboard is loaded. Numbers below assume the dashboard is viewed on **April 30, 2026**.

---

#### Invoices (all 7 invoices)

| Invoice | Client | Total | COGS | Tax |
|---------|--------|-------|------|-----|
| Inv-1: 2×Screen + 1×Mouse | Charbel | $220.00 | 2×$75 + 1×$7 = $157.00 | $0.00 |
| Inv-2: 1×Full Set *(composite)* + $10 fee | Charbel | $120.00 | 1×$82 = $82.00 | $0.00 |
| Inv-3: 1×Mouse | Charbel | $20.00 | 1×$7 = $7.00 | $0.00 |
| Inv-4: 1×Screen | Hassan | $100.00 | 1×$75 = $75.00 | $0.00 |
| Inv-5: 1×Mouse | Hassan | $20.00 | 1×$7 = $7.00 | $0.00 |
| Inv-6: 1×Screen + 1×Mouse | Hassan | $120.00 | 1×$75 + 1×$7 = $82.00 | $0.00 |
| Inv-7: 1×Full Set *(composite)* | Hassan | $110.00 | 1×$82 = $82.00 | $0.00 |
| **Total** | | **$710.00** | **$492.00** | **$0.00** |

> Full Set is a composite product (1×Screen + 1×Mouse) with its own cost of $82. On the invoice, the COGS uses the Full Set's unit cost ($82), not the sum of component costs ($75 + $7 = $82). Stock-wise, selling a Full Set decrements Screen and Mouse by 1 each.

#### Expenses (from Expenses table, recurring prorated to Apr 30)

| Expense | Calculation | Amount |
|---------|-------------|--------|
| Office Rent (monthly, Apr 1→Apr 30) | $800 × 1 month | $800.00 |
| Internet & Phone (weekly, Apr 1→Apr 30) | $100 × (30÷7) | $428.57 |
| Printer Repair (one-time, Apr 10) | fixed | $150.00 |
| **Total Expenses** | | **$1,378.57** |

#### Salaries (computed from Employees, prorated from hire date to Apr 30, with advances)

| Employee | Hire Date | Gross Salary | Advance | Net Amount |
|----------|-----------|-------------|---------|------------|
| Sarah Baraket | 2026-01-01 | $20/day × 120 days = $2,400.00 | −$100.00 | **$2,300.00** |
| Khodor Aboud | 2026-02-15 | $300/wk × (75÷7) = $3,214.29 | — | **$3,214.29** |
| Youssef El-Helew | 2026-03-01 | $2000/mo × 2 months = $4,000.00 | −$500.00 | **$3,500.00** |
| **Total Salaries** | | **$9,614.29** | **−$600.00** | **$9,014.29** |

> Dashboard advance deduction: For all-time computation, the full advance amount is always deducted (overlap = entire advance period).

#### Supplier Bills (all bills, regardless of payment status)

| Supplier | Bill Amount |
|----------|-------------|
| XYZ — Screen Stock | $600.00 |
| XYZ — Mouse & Accessories | $100.00 |
| X-Factor — Marketing Package | $300.00 |
| **Total Supplier Bills** | **$1,000.00** |

---

#### Dashboard KPI Summary

| KPI | Formula | Value |
|-----|---------|-------|
| **Gross Earning** | Sum of all invoice totals | **$710.00** |
| **COGS** | Sum of (unitCost × qty) on all items | **$492.00** |
| **Total Tax** | Sum of tax on all invoices | **$0.00** |
| **Total Supplier Bills** | Sum of all bill amounts | **$1,000.00** |
| **Total Expenses** | One-time + recurring (prorated to today) | **$1,378.57** |
| **Total Salaries** | All employees prorated from hire date to today (minus advances) | **$9,014.29** |
| **Net Earning** | Gross − COGS − Tax − Bills − Expenses − Salaries | **−$11,174.86** |
| **Pending Amount** | Remaining on unpaid invoices | **$220.00** |

> **Pending = $220** from Hassan's 3 unpaid invoices: Inv-5 ($20) + Inv-6 ($90) + Inv-7 ($110).

---

#### Dashboard Net Earning Breakdown

```
Gross Earning:           +$710.00
  − COGS:                −$492.00   (Charbel $246 + Hassan $246)
  − Tax:                    −$0.00  (0% tax on all invoices)
  − Supplier Bills:     −$1,000.00  (XYZ $700 + X-Factor $300)
  − Expenses:           −$1,378.57  (Rent $800 + Internet $428.57 + Printer $150)
  − Salaries:           −$9,014.29  (Sarah $2,300 + Khodor $3,214.29 + Youssef $3,500)
                        ───────────
Net Earning:           −$11,174.86
Pending:                  $220.00
```

---

#### Dashboard vs P&L vs Comprehensive — Key Differences

| Aspect | Dashboard | P&L Report | Comprehensive Report |
|--------|-----------|------------|---------------------|
| **Revenue** | All invoice totals (accrual) | Payments received (cash-basis) | Payments received (cash-basis) |
| **COGS** | All invoices | Only invoices with payments | Only invoices with payments |
| **Expenses** | Prorated to current date | Prorated within selected period | Prorated within selected period |
| **Salaries** | Hire date → today (all-time) | Within selected period only | Within selected period only |
| **Supplier Bills** | Total bill amounts | Bill payments made in period | Bill payments made in period |
| **Pending** | Remaining on unpaid invoices | Total Sales − Total Paid | Total Sales − Total Paid |
| **Aging** | Not shown | Not shown | Receivable + Payable aging |
| **Margins** | Not shown | Not shown | COGS%, Gross%, Net% |
