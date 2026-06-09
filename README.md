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