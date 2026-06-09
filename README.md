Here's a full pricing strategy analysis based on the app's feature set, infrastructure costs, and competitive landscape:

App Feature Inventory (from codebase)
The app has these modules: Dashboard, Clients, Invoices (PDF), Stock/Inventory, Suppliers + Bills, Expenses (recurring), Employees + Salary Advances, Tax, Reports (P&L comprehensive), AI Assistant (Claude), Audit Log, Team management, Chart of Accounts, Multi-language (EN/FR/AR), Data export.

Cost Per Organization/Month (Estimated)
Component	Basic User	Pro User
Server (Vercel/Railway)	~$0.50	~$1.50
DB storage (SQLite → Postgres)	~$0.30	~$1.00
Claude AI API (light usage)	~$0.10	~$2.00–5.00
PDF generation (jsPDF = free)	$0	$0
CDN / bandwidth	~$0.10	~$0.30
Total cost/org/month	~$1–2	~$5–8
AI is the wildcard. Claude Haiku at ~100 queries/month ≈ $0.30. Claude Sonnet at 100 complex queries ≈ $1.50. Heavy AI report generation can push to $5+/org/month.

Competitor Pricing Benchmark (2025)
Product	Entry	Mid	Advanced
QuickBooks Online	$35/mo	$65/mo	$99/mo
Xero	$20/mo	$47/mo	$80/mo
FreshBooks	$19/mo	$33/mo	$60/mo
Zoho Books	Free (1 user)	$20/mo	$50/mo
Sage Business Cloud	$10/mo	$25/mo	$33/mo
Wave	Free	—	Paid add-ons
Holded (MENA popular)	€9/mo	€19/mo	€39/mo
Odoo	Free (community)	$25/user/mo	Custom
Kashoo	$20/mo (flat)	—	—
QuickFile	Free (low vol)	£45/year	Custom
Proposed Packages
Free Trial (keep as-is)
Full access, 14–30 days, no credit card.

Basic — $14/month (or $10/month billed annually)
Target: Solo freelancers, micro-businesses, 1 person managing everything.

Included:

1 user
Up to 30 clients
Up to 40 invoices/month (PDF export included)
Up to 100 products in stock
Up to 10 suppliers
Up to 3 employees
Basic expenses tracking
Simple reports only (dashboard summary, basic invoice history)
Email support (48h response)
Multi-language (EN/FR/AR)
Not included:

AI assistant
Comprehensive P&L / tax reports
Audit log / activity log
Team members
Salary advances module
Data export (CSV/JSON)
Chart of accounts (accounts module)
Margin at $14: Costs ~$1.50 → ~89% gross margin

Pro — $34/month (or $25/month billed annually)
Target: Small businesses with a team, needing full visibility and AI assistance.

Included (everything in Basic, plus):

Up to 5 users (roles: admin, accountant, viewer)
Unlimited clients, invoices, products, suppliers, employees
AI Assistant — 150 queries/month (chat + voice commands)
Full reports — Comprehensive P&L, tax summary, expense breakdown, salary report
Audit log / Activity log
Salary advances module
Chart of accounts
Data export (CSV, JSON)
AI-generated report PDFs
Priority support (12h response)
Additional users at +$6/user/month
Margin at $34: Costs ~$6–8 → ~76–82% gross margin

Enterprise — Custom pricing (contact sales)
For 10+ users, custom AI quotas, dedicated support, on-premise options.

Key Differentiators to Emphasize
Built-in Claude AI — none of the top 10 competitors have native AI assistants at this price point (QuickBooks has Intuit Assist, but it's Basic tier only)
Arabic language support — Xero, FreshBooks, Kashoo don't have AR; this is a significant MENA market advantage
AI report PDF generation — unique feature, worth highlighting in Pro marketing
Suggested Usage Limits Summary
Feature	Free Trial	Basic	Pro
Users	1	1	5 (+$6/extra)
Clients	Unlimited	30	Unlimited
Invoices/month	Unlimited	40	Unlimited
Products	Unlimited	100	Unlimited
Suppliers	Unlimited	10	Unlimited
Employees	Unlimited	3	Unlimited
AI queries/month	20	—	150
Comprehensive reports	Yes	No	Yes
Audit log	Yes	No	Yes
Data export	Yes	No	Yes
Duration	14–30 days	Ongoing	Ongoing
Positioning Recommendation
Price slightly below Xero/FreshBooks (which charge $20–33 for comparable features) since you're newer, but don't go as low as you might think — the AI + Arabic support justifies being priced above Sage's $10 starter. The $14/$34 split hits a sweet spot:

Basic at $14 undercuts FreshBooks Lite ($19) and matches Zoho Standard ($20) while being cheaper
Pro at $34 matches FreshBooks Plus ($33) but includes AI, which FreshBooks doesn't offer at any tier
Annual billing discount (28–35% off) drives commitment and improves cash flow predictability


1. we should add loading button on adding category in stock and deleting item in stock
2. in filters in stock we do not have available and unavailable for services
3. in suppliers we should have same validation as clients (no duplicate emails or phone numbers)
4. we removed daily paid we should re-add it in employee creation
5. when we create service in stock section then we navigate to invoice to create one in detailed invoices the drop down list to choose product/service its always disabled even if its avalble
6. when adding extra payment in invice it shows:  payments.excess_to_balance instead of readable word 
7. when creating detailed invoice in products drop down we should only display product name not name-price
8. when creating invoice with this payload i gott g00 internal server error: {"clientId":"cmq6chcya000pjvasyqhhubwy","date":"2026-06-09","dueDate":"","taxRate":19,"discount":10,"language":"en","notes":"","status":"draft","items":[{"description":"MSI Screen ","quantity":1,"unitPrice":100,"productId":"cmq6bn92a0001r6cc730ey2ks"}],"fees":[]}



1. we should not be able to add quantity for products more than what we have in stock, now we are returning bad request error but user cannot know why its not creating, we should validate the number before we create invoice

2. For Suppliers bill comment the input field related to select type of bill and make it all by default stock type

3. when we try edit bill the form to edit always dhows on top of list of bills, it should be shown under the bill directly

4. Comment balance sheet in reports

Phase A — Account & master data
Step 1 — Register & log in

Register a new org + admin → land on dashboard. Log out, log back in.
✅ Expected: registration works; re-login works; visiting /dashboard while logged out redirects to login.
Step 2 — Add a category

Stock → "Add Category" → add Electronics.
✅ Expected: appears in category list.
Step 3 — Add simple products (Stock → Add Product → Simple)

Screen: price 100, cost 75, qty 10, category Electronics.
Mouse: price 20, cost 7, qty 10, category Electronics.
✅ Expected: both created; SKU auto-filled from category; list shows qty 10 each.
Step 4 — Add a composite product

Full Set = composite, components 1× Screen + 1× Mouse, price 110.
✅ Expected: cost auto-computed = 82 (75+7); effective qty = min(10,10) = 10.
Step 5 — Add services (Add Product → Service)

Installation: price 50, Available.
Repair: price 30, Not available.
✅ Expected for each: quantity/min-stock fields hidden; Category locked to "Service" and disabled; Availability toggle works. List shows a "Service" badge + Available/Unavailable pill. Both services share one auto-created "Service" category.
Step 6 — Verify Stock page

✅ Expected: Screen 10, Mouse 10, Full Set "can make 10", Installation = Available, Repair = Unavailable. Filter by type = Service shows only the two services.
Step 7 — Add clients (Clients → Add)

Acme Corp, Beta LLC.
✅ Expected: both listed.
Step 8 — Add suppliers (Suppliers → Add)

TechSupply, AdAgency.
✅ Expected: both listed.
Step 9 — Add employees (Employees → Add)

Sara: salary 20, period Day, hire date = 1st of current month.
Omar: salary 2000, period Month, hire date = 1st of current month.
✅ Expected: both created.
Phase B — Invoicing (detailed)
Step 10 — Create Inv-1 (detailed)

Invoices → "+ New Invoice" (it's a tab, not a popup) → keep Detailed.
Client Acme, tax 0%, items: 2× Screen ($100), 1× Mouse ($20). Save (no payment).
✅ Expected: Total $220; status Sent. Stock now: Screen 8, Mouse 9. Open invoice → item unit costs show 75 and 7 (COGS snapshot).
Step 11 — Partial payment

Open Inv-1 → add payment $50.
✅ Expected: status Partially Paid, remaining $170.
Step 12 — Overpayment → client credit

Add payment $200 to Inv-1.
✅ Expected: only $170 applied → status Paid, remaining $0; excess $30 added to Acme's balance.
Step 13 — Inv-2 (discount + tax + auto-apply balance)

New Invoice (Detailed), Acme, discount 10%, tax 19%, item 1× Screen ($100). Save (no manual payment).
✅ Expected: Subtotal 100 → −10% = 90 → +19% tax (17.10) → Total $107.10. Acme's $30 balance auto-applied → remaining $77.10, status Partially Paid. Stock: Screen 7.
Step 14 — Inv-3 (composite + service)

New Invoice (Detailed), Beta, tax 0, items: 1× Full Set ($110) + 1× Installation (service, $50). Save.
✅ Expected: Total $160. Stock: Screen 6, Mouse 8 (Full Set consumed 1 each; service deducts nothing).
Step 15 — Unavailable service is blocked

Start a new invoice, try to add Repair (unavailable) and save.
✅ Expected: rejected — "Repair is not available."
Step 16 — Validation (all should fail, no stock change)

Try saving invoices with: no client / no items / qty 0 / Screen unit price 50 (below cost 75) / tax rate 200 / Screen qty 9999.
✅ Expected: each rejected with a clear message; Stock unchanged (Screen 6, Mouse 8); no invoice created.
Phase C — Simple (POS) invoice
Step 17 — Simple sale

New Invoice tab → toggle Simple.
✅ Expected: 70% product boxes (name • price • stock), 30% cart. Search/category filter work. Boxes can't exceed stock; Installation shows "Service"; Repair disabled.
Pick customer Beta (or type a new name to create inline), tap Mouse ×3, then Save & Pay.
✅ Expected: Total $60, status Paid (cash recorded). Stock: Mouse 5.
Phase D — Edit / delete invoices
Step 18 — Edit Inv-3 (popup)

From the list, click the pencil on Inv-3.
✅ Expected: opens as a popup (not the tab), prefilled. Change Full Set qty 1 → 2, save.
✅ Expected: Total $270 (2×110 + 50); item unit cost still 82 (not zeroed). Stock: Screen 5, Mouse 4 (old restored, new deducted).
Step 19 — Delete Inv-2

Delete Inv-2 (Acme).
✅ Expected: Stock: Screen 6; the $30 balance payment is refunded → Acme balance back to $30.
Step 20 — Live stat boxes

Watch the Total / Paid / Partial / Pending cards while doing steps 11–19.
✅ Expected: they update immediately, no page refresh.
Phase E — Suppliers & bills
Step 21 — Bill created as Paid

TechSupply → Add Bill: amount 600, type Expense, status Paid.
✅ Expected: the "Record Payment Now" section is hidden + note shown. On save → status Paid, remaining $0, 1 payment recorded.
Step 22 — Pending + partial payment

TechSupply → Add Bill: 100, status Pending. Then open it → Record payment $40.
✅ Expected: status Partially Paid, remaining $60. Try paying $100 → rejected (exceeds remaining).
Step 23 — Pending expense + stock-type bill

AdAgency → Add Bill 300, Expense, Pending. TechSupply → Add Bill 200, Stock, Pending.
✅ Expected: created. (Stock-type will be excluded from operating expenses in reports — verified in Step 30.)
Step 24 — Live supplier boxes + delete

✅ Expected: Billed/Paid/Pending cards update live as you add. Delete one bill → cards update immediately.
Phase F — Expenses
Step 25 — One-time + recurring

Expenses → Add: Printer Repair $150, recurrence None, date today.
Add: Office Rent $1000, recurrence Monthly, date = 1st of current month.
Add: Internet $100, recurrence Weekly, date = 1st of month.
✅ Expected (current-month view): Printer = $150; Rent prorated by days elapsed this month (e.g. on the 9th → 9/30 × 1000 ≈ $300); Internet ≈ days/7 × 100. Verify against the formula.
Step 26 — Live update on edit

Edit Office Rent amount 1000 → 2000, save.
✅ Expected: the Total box updates immediately (no refresh) to reflect the new prorated amount.
Step 27 — Salary & supplier rows

✅ Expected: the expense list also shows salary rows (Sara, Omar — computed) and expense-type supplier-bill rows; stock-type bills are not listed as opex.
Phase G — Salary advances
Step 28 — Advance + return

Employees → Omar → Salary Advances → add $500, dated mid-month.
✅ Expected: status Pending; Omar's salary row in Expenses/Reports is reduced by the prorated advance.
Now mark the advance Returned.
✅ Expected: it is no longer deducted (salary returns to full).
Phase H — Reports & tax
Step 29 — P&L (current month)

Reports → Profit & Loss → this month → Generate.
✅ Expected: Revenue = payments actually received this month (cash basis): $50+$170 (Inv-1) + $30 (Inv-2 auto-balance, only if dated in period) + $60 (POS) etc. COGS counted once per paid invoice. Tax = full tax of period invoices. Net = Gross − Expenses. Cross-check the math.
Step 30 — Comprehensive + Cash Out + exclude

Generate Comprehensive (same period).
✅ Expected: revenue breakdown, COGS-by-invoice, receivable & payable aging, margins (no NaN). Cash Out = one-time expenses + all supplier-bill payments (excludes recurring & salaries). Stock-type bill not double-counted. Toggle "exclude Rent" → totals drop accordingly. P&L and Comprehensive agree for the same period.
Step 31 — Tax page

✅ Expected: Total Tax = sum of tax across all invoices (Inv-2's $17.10 etc.), regardless of payment. PDF export works.
Phase I — Dashboard, AI, team, settings, activity
Step 32 — Dashboard

✅ Expected: all KPIs render; Net Earning = Gross − COGS − Tax − Supplier Bills − Expenses − Salaries (verify arithmetic); Pending = unpaid invoice balances; Low Stock excludes services; revenue trend renders.
Step 33 — AI Assistant

Ask "How much revenue this month?" → reasonable answer.
"Add a client called Gamma" → asks confirmation before creating.
✅ Expected: read queries auto-run; writes need confirmation.
Step 34 — Team & permissions

Team → create a user with Employee role / limited features. Log in as them (incognito).
✅ Expected: restricted nav/actions; AI can only query (no writes).
Step 35 — Settings

Change language (EN/FR/AR — AR is right-to-left) and currency; change timezone.
✅ Expected: UI + amounts + PDFs reflect changes; AR renders RTL.
Step 36 — Activity Log

✅ Expected: shows entries for the creates/edits/deletes/payments/imports you did.
Step 37 — Accounting is disabled

✅ Expected: sidebar has no Accounting group. Manually visiting /dashboard/accounts, /dashboard/journal-entries, /dashboard/trial-balance, /dashboard/budgets redirects to /dashboard. Payments still record without errors.
Phase J — Final checks
Step 38 — Final stock summary

✅ Expected after all steps: Screen 6, Mouse 4, Full Set "can make 4", services unchanged.
Step 39 — Excel imports (optional)

Clients import with name,email,phone,balance,pending (include "1,250.00" and "$500") → parsed correctly, duplicates skipped. Suppliers import similarly.
Step 40 — Cleanup (optional, throwaway org only)

Settings → request data export / delete org behave as designed. Do not run on a real org.