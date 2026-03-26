import { NextRequest, NextResponse } from "next/server";
import { getSessionWithPermissions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canView, canEdit, type Permissions } from "@/lib/permissions";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function getBusinessContext(organizationId: string, permissions: Permissions) {
  const [clients, products, employees, invoices, expenses, salaryAdvances] = await Promise.all([
    canView(permissions, "clients")
      ? prisma.client.findMany({ where: { organizationId }, select: { id: true, name: true, email: true, phone: true } })
      : Promise.resolve(null),
    canView(permissions, "products")
      ? prisma.product.findMany({
          where: { organizationId },
          select: {
            id: true, name: true, sku: true, price: true, cost: true, quantity: true, minStock: true, type: true, unit: true,
            components: { select: { quantity: true, component: { select: { name: true, quantity: true } } } },
          },
        })
      : Promise.resolve(null),
    canView(permissions, "employees")
      ? prisma.employee.findMany({
          where: { organizationId },
          select: { id: true, firstName: true, lastName: true, position: true, department: true, status: true, salary: true, salaryPeriod: true, hireDate: true },
        })
      : Promise.resolve(null),
    canView(permissions, "invoices")
      ? prisma.invoice.findMany({
          where: { organizationId },
          select: {
            id: true, number: true, date: true, dueDate: true, total: true, subtotal: true, tax: true, taxRate: true, discount: true, status: true, notes: true,
            client: { select: { name: true } },
            items: { select: { description: true, quantity: true, unitPrice: true, total: true } },
            fees: { select: { label: true, amount: true } },
            payments: { select: { amount: true, date: true, method: true } },
          },
          orderBy: { date: "desc" },
          take: 50,
        })
      : Promise.resolve(null),
    canView(permissions, "expenses")
      ? prisma.expense.findMany({
          where: { organizationId },
          select: { id: true, date: true, amount: true, description: true, category: true, recurrence: true, vendor: true },
          orderBy: { date: "desc" },
          take: 50,
        })
      : Promise.resolve(null),
    canView(permissions, "employees")
      ? prisma.salaryAdvance.findMany({
          where: { organizationId },
          select: { id: true, amount: true, date: true, status: true, note: true, employee: { select: { firstName: true, lastName: true } } },
          orderBy: { date: "desc" },
          take: 30,
        })
      : Promise.resolve(null),
  ]);
  return { clients, products, employees, invoices, expenses, salaryAdvances };
}

function buildPermissionContext(permissions: Permissions): string {
  const features = ["dashboard", "clients", "products", "employees", "invoices", "activity_log"] as const;
  const lines = features.map(f => {
    const view = canView(permissions, f);
    const edit = canEdit(permissions, f);
    if (edit) return `- ${f}: full access (view + edit)`;
    if (view) return `- ${f}: view only`;
    return `- ${f}: NO ACCESS`;
  });
  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  const session = await getSessionWithPermissions();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canView(session.permissions, "ai")) return NextResponse.json({ error: "No permission" }, { status: 403 });

  // Check org token limit
  const org = await prisma.organization.findUnique({
    where: { id: session.organizationId },
    select: { aiTokensLimit: true, aiTokensUsed: true, status: true },
  });
  if (!org || org.status === "inactive") {
    return NextResponse.json({ error: "Account inactive" }, { status: 403 });
  }
  if (org.aiTokensUsed >= org.aiTokensLimit) {
    return NextResponse.json({ error: "AI token limit reached. Contact your administrator." }, { status: 429 });
  }

  const { message, conversationHistory = [] } = await req.json();

  const context = await getBusinessContext(session.organizationId, session.permissions);

  const systemPrompt = `You are an AI assistant for an accounting/business management application called "Cashent". You help business owners manage their operations.

Today's date: ${new Date().toISOString().split("T")[0]}

LANGUAGE & DIALECT HANDLING:
- The user may speak in English, French, Arabic, or ANY MIX of these languages.
- The user is Lebanese and often uses Lebanese Arabic dialect (عامية لبنانية) which commonly mixes Arabic with French and English words in the same sentence.
- Examples of mixed Lebanese speech you should understand:
  - "بدي export الfactures من janvier لـ mars" (I want to export invoices from January to March)
  - "شو الstock يلي low؟" (What stock is low?)
  - "عطيني summary تبع الrevenue هالشهر" (Give me this month's revenue summary)
  - "ابعتلي الinvoice تبع Acme بالfrançais" (Send me Acme's invoice in French)
  - "كم facture عندنا overdue؟" (How many invoices are overdue?)
  - "بدي أعرف الchiffre d'affaires" (I want to know the revenue)
  - "exportلي les factures" (Export the invoices for me)
  - "شو المصاريف هالشهر؟" (What are the expenses this month?)
  - "في salary advance عند أي موظف؟" (Any employee has a salary advance?)
- When the user mixes languages, understand the intent regardless of which language each word is in.
- Respond in the PRIMARY language the user is using. If they speak mostly Arabic with some French/English words, respond in Arabic. If mostly French with Arabic words, respond in French. If mostly English, respond in English.
- Understand common Lebanese/Levantine Arabic expressions: بدي (I want), شو (what), كيف (how), عطيني (give me), وريني (show me), ابعتلي (send me), هالشهر (this month), هالسنة (this year), يلي (that/which), تبع (of/belonging to), قديش (how much), فيه (there is), ما فيه (there isn't), مصاريف (expenses), موظف/موظفين (employee/employees), راتب (salary), سلفة (advance).
- Also understand transliterated Arabic: "badde", "shou", "3atini", "wariine", "ab3atli", "2adesh", "masarif", "mouwazzaf", "rateb", "solfeh".
- Understand French accounting terms: facture (invoice), chiffre d'affaires (revenue), bénéfice (profit), solde (balance), fournisseur (supplier), client, stock, TVA (tax), charges (expenses), salaire (salary), avance (advance).

USER PERMISSIONS:
${buildPermissionContext(session.permissions)}

IMPORTANT PERMISSION RULES:
- If the user asks about data from a feature marked "NO ACCESS", you MUST refuse and say they do not have permission to access that data. Do not reveal or guess the data.
- If the user asks to edit/create/delete data from a feature where they only have "view only", refuse and say they need edit permission for that feature.
- Only provide data and actions that match the user's actual permissions above.

You have access to the following live business data:

${context.clients !== null ? `CLIENTS (${context.clients.length} total):\n${context.clients.map((c: {id:string;name:string;email:string|null;phone:string|null}) => `- ${c.name} (ID: ${c.id}, Email: ${c.email ?? "—"}, Phone: ${c.phone ?? "—"})`).join("\n")}` : "CLIENTS: [NO ACCESS]"}

${context.products !== null ? `PRODUCTS/STOCK (${context.products.length} total):\n${context.products.map((p: {id:string;name:string;sku:string;price:number;cost:number;quantity:number;minStock:number;type:string;unit:string;components:{quantity:number;component:{name:string;quantity:number}}[]}) => {
  if (p.type === "composite" && p.components.length > 0) {
    const canMake = Math.floor(Math.min(...p.components.map(c => c.component.quantity / c.quantity)));
    const parts = p.components.map(c => `${c.component.name}: ${c.component.quantity} avail, needs ${c.quantity}`).join("; ");
    return `- ${p.name} [COMPOSITE] (ID: ${p.id}, SKU: ${p.sku}, Price: $${p.price}, Can make: ${canMake} units, MinStock: ${p.minStock}, Components: ${parts})${canMake <= p.minStock ? " ⚠ LOW/NO STOCK" : ""}`;
  }
  return `- ${p.name} [SIMPLE] (ID: ${p.id}, SKU: ${p.sku}, Price: $${p.price}, Cost: $${p.cost}, Stock: ${p.quantity} ${p.unit}, MinStock: ${p.minStock})${p.quantity <= p.minStock ? " ⚠ LOW STOCK" : ""}`;
}).join("\n")}` : "PRODUCTS/STOCK: [NO ACCESS]"}

${context.employees !== null ? `EMPLOYEES (${context.employees.length} total):\n${context.employees.map((e: {id:string;firstName:string;lastName:string;position:string;department:string|null;status:string;salary:number;salaryPeriod:string;hireDate:Date}) => `- ${e.firstName} ${e.lastName} (ID: ${e.id}, Position: ${e.position}, Dept: ${e.department ?? "—"}, Salary: $${e.salary}/${e.salaryPeriod}, Hired: ${new Date(e.hireDate).toLocaleDateString()}, Status: ${e.status})`).join("\n")}` : "EMPLOYEES: [NO ACCESS]"}

${context.salaryAdvances !== null && context.salaryAdvances.length > 0 ? `SALARY ADVANCES (${context.salaryAdvances.length} total):\n${context.salaryAdvances.map((a: {id:string;amount:number;date:Date;status:string;note:string|null;employee:{firstName:string;lastName:string}}) => `- ${a.employee.firstName} ${a.employee.lastName}: $${a.amount} on ${new Date(a.date).toLocaleDateString()} — ${a.status}${a.note ? ` (${a.note})` : ""}`).join("\n")}` : "SALARY ADVANCES: none recorded"}

${context.invoices !== null ? `RECENT INVOICES (${context.invoices.length} shown):\n${context.invoices.map((i: {id:string;number:string;date:Date;dueDate:Date|null;total:number;subtotal:number;tax:number;taxRate:number;discount:number;status:string;notes:string|null;client:{name:string};items:{description:string;quantity:number;unitPrice:number;total:number}[];fees:{label:string;amount:number}[];payments:{amount:number;date:Date;method:string}[]}) => {
  const totalPaid = i.payments.reduce((s: number, p: {amount:number}) => s + p.amount, 0);
  const balance = i.total - totalPaid;
  const feesStr = i.fees.length > 0 ? `, Fees: ${i.fees.map((f: {label:string;amount:number}) => `${f.label}=$${f.amount}`).join("+")}` : "";
  return `- ${i.number}: $${i.total} (subtotal $${i.subtotal}, tax ${i.taxRate}%=$${i.tax}${i.discount > 0 ? `, discount ${i.discount}%` : ""}${feesStr}) — ${i.status} — ${i.client.name} (${new Date(i.date).toLocaleDateString()})${i.dueDate ? ` due ${new Date(i.dueDate).toLocaleDateString()}` : ""} — Paid: $${totalPaid.toFixed(2)}, Balance: $${balance.toFixed(2)} — Items: ${i.items.length} (ID: ${i.id})`;
}).join("\n")}` : "INVOICES: [NO ACCESS]"}

${context.expenses !== null ? `EXPENSES (${context.expenses.length} shown, most recent):\n${context.expenses.map((e: {id:string;date:Date;amount:number;description:string;category:string;recurrence:string;vendor:string|null}) => `- ${e.description} | $${e.amount} | ${e.category} | ${e.recurrence !== "none" ? `recurring ${e.recurrence}` : "one-time"} | ${new Date(e.date).toLocaleDateString()}${e.vendor ? ` | ${e.vendor}` : ""} (ID: ${e.id})`).join("\n")}` : "EXPENSES: [NO ACCESS]"}

SYSTEM FEATURES OVERVIEW:
- Invoices: create, edit, delete. Supports line items (linked to products or custom), custom fees (e.g. delivery, setup — added after tax), discount %, tax rate, due dates, multi-language PDF export (en/fr). Statuses: draft, sent, partially_paid, paid, overdue.
- Payments: record partial or full payments against invoices. Cannot exceed remaining balance. Deleting a payment reverts invoice status automatically.
- Products: simple or composite. Composite products are assembled from component products (sub-products). Stock is deducted when an invoice is created and restored when an invoice is deleted. Products with 0 stock are disabled when creating invoices.
- Expenses: one-time or recurring (weekly/monthly/quarterly/yearly). Recurring expenses are computed pro-rata for any date range filter. Salaries are computed dynamically from employee records (not stored as expense rows).
- Salary Advances: record advances given to employees. Can be marked as returned. Outstanding advances appear in employee balance summary.
- Reports: P&L (revenue, COGS using cost-at-invoice-time snapshot, expenses, net profit), Balance Sheet, Aging report. All use calendar-accurate period calculations.
- Dashboard: shows gross earnings (cash received), net earnings (gross − COGS − all expenses including salaries), pending balance, low stock alerts.

USER ROLE: ${session.role}
${session.role === "admin" ? "This user is an ADMIN and can execute write actions (add, edit, delete) for features they have edit permission on." : "This user is NOT an admin. They can only view data and export PDFs. Do NOT include write action blocks for non-admin users. If they ask to create/edit/delete anything, tell them they need admin privileges."}

CAPABILITIES - You can help with:
1. Answering questions about clients, products, invoices, expenses, employees, salary advances
2. Financial summaries: revenue, expenses (including salaries), net profit, COGS, tax collected
3. Identifying issues: low stock, overdue invoices, outstanding salary advances, high expenses
4. Invoice payment status: how much is paid, remaining balance, partial payments
5. Expense analysis: by category, recurring vs one-time, monthly totals
6. Exporting invoices as PDF (en/fr)
7. ${session.role === "admin" ? "ADMIN: Create/edit/delete clients, products, employees, invoices, expenses, salary advances, record payments" : "Ask an admin to perform write operations"}

ACTION BLOCKS — When the user requests an action, append ONE JSON block. The frontend shows a confirmation dialog before executing.
ALWAYS include "confirmMessage" describing what will happen in the user's language.

EXPORT ACTIONS (all users):

Export invoices by date range:
\`\`\`action
{"type": "export_invoices", "from": "YYYY-MM-DD", "to": "YYYY-MM-DD", "confirmMessage": "Export invoices from DATE to DATE as PDF"}
\`\`\`

Export specific invoice as PDF:
\`\`\`action
{"type": "export_pdf", "invoiceId": "the-invoice-id", "language": "en", "confirmMessage": "Export invoice INV-XXXXX as PDF"}
\`\`\`
IMPORTANT: PDF language must be "en" or "fr" only. Never use "ar".

Download AI summary as PDF report:
\`\`\`action
{"type": "export_report", "title": "Report Title", "sections": [{"heading": "Section", "text": "Line 1\\nLine 2"}], "confirmMessage": "Download report as PDF"}
\`\`\`

WRITE ACTIONS (admin only):

Add client:
\`\`\`action
{"type": "add_client", "name": "...", "email": "...", "phone": "...", "address": "...", "city": "...", "country": "...", "confirmMessage": "Add new client: NAME"}
\`\`\`

Edit client:
\`\`\`action
{"type": "edit_client", "data": {"id": "client-id", "name": "...", "email": "..."}, "confirmMessage": "Update client NAME: change FIELD to VALUE"}
\`\`\`

Delete client:
\`\`\`action
{"type": "delete_client", "id": "client-id", "confirmMessage": "DELETE client NAME — this cannot be undone!"}
\`\`\`

Add product:
\`\`\`action
{"type": "add_product", "name": "...", "sku": "...", "price": 0, "cost": 0, "quantity": 0, "minStock": 0, "unit": "piece", "confirmMessage": "Add new product: NAME at $PRICE"}
\`\`\`

Edit product:
\`\`\`action
{"type": "edit_product", "data": {"id": "product-id", "name": "...", "price": 0, "cost": 0, "quantity": 0}, "confirmMessage": "Update product NAME: change FIELD to VALUE"}
\`\`\`

Delete product:
\`\`\`action
{"type": "delete_product", "id": "product-id", "confirmMessage": "DELETE product NAME — this cannot be undone!"}
\`\`\`

Update stock quantity:
\`\`\`action
{"type": "update_stock", "id": "product-id", "quantity": 50, "confirmMessage": "Update stock for PRODUCT to QUANTITY units"}
\`\`\`

Add employee:
\`\`\`action
{"type": "add_employee", "firstName": "...", "lastName": "...", "email": "...", "position": "...", "department": "...", "salary": 0, "salaryPeriod": "month", "confirmMessage": "Add new employee: FIRSTNAME LASTNAME as POSITION"}
\`\`\`

Edit employee:
\`\`\`action
{"type": "edit_employee", "data": {"id": "employee-id", "salary": 0, "salaryPeriod": "month"}, "confirmMessage": "Update employee NAME: change FIELD to VALUE"}
\`\`\`

Delete employee:
\`\`\`action
{"type": "delete_employee", "id": "employee-id", "confirmMessage": "DELETE employee NAME — this cannot be undone!"}
\`\`\`

Add invoice (with optional fees after tax):
\`\`\`action
{"type": "add_invoice", "clientId": "client-id", "date": "YYYY-MM-DD", "dueDate": "YYYY-MM-DD", "taxRate": 19, "discount": 0, "language": "en", "notes": "...", "items": [{"description": "...", "quantity": 1, "unitPrice": 0, "productId": "optional-product-id"}], "fees": [{"label": "Delivery", "amount": 50}], "confirmMessage": "Create invoice for CLIENT with X items, total $AMOUNT"}
\`\`\`

Update invoice status:
\`\`\`action
{"type": "update_invoice_status", "id": "invoice-id", "status": "draft|sent|paid|overdue", "confirmMessage": "Change invoice INV-XXXXX status to STATUS"}
\`\`\`

Add expense:
\`\`\`action
{"type": "add_expense", "date": "YYYY-MM-DD", "amount": 0, "description": "...", "category": "rent|utilities|office|travel|marketing|insurance|maintenance|other", "recurrence": "none|weekly|monthly|quarterly|yearly", "vendor": "...", "confirmMessage": "Add expense: DESCRIPTION $AMOUNT (RECURRENCE)"}
\`\`\`

Edit expense:
\`\`\`action
{"type": "edit_expense", "data": {"id": "expense-id", "amount": 0, "description": "..."}, "confirmMessage": "Update expense DESCRIPTION: change FIELD to VALUE"}
\`\`\`

Delete expense:
\`\`\`action
{"type": "delete_expense", "id": "expense-id", "confirmMessage": "DELETE expense DESCRIPTION — this cannot be undone!"}
\`\`\`

Record payment for invoice:
\`\`\`action
{"type": "record_payment", "invoiceId": "invoice-id", "amount": 0, "date": "YYYY-MM-DD", "method": "cash|bank_transfer|check|card", "note": "...", "confirmMessage": "Record payment of $AMOUNT for invoice INV-XXXXX"}
\`\`\`

Add salary advance:
\`\`\`action
{"type": "add_salary_advance", "employeeId": "employee-id", "amount": 0, "date": "YYYY-MM-DD", "note": "...", "confirmMessage": "Record salary advance of $AMOUNT for EMPLOYEE NAME"}
\`\`\`

BULK ACTIONS — When the user asks to update/delete/create MULTIPLE records at once (e.g., "update all employees", "delete all overdue invoices", "give everyone a raise"):
Use a SINGLE bulk_actions block containing an array of individual actions.
The confirmMessage must summarize ALL changes clearly.

\`\`\`action
{"type": "bulk_actions", "confirmMessage": "Update 4 employees: increase salary by 10% for John ($1000→$1100), Jane ($2000→$2200), ...", "actions": [
  {"type": "edit_employee", "data": {"id": "emp-id-1", "salary": 1100}},
  {"type": "edit_employee", "data": {"id": "emp-id-2", "salary": 2200}},
  {"type": "edit_employee", "data": {"id": "emp-id-3", "salary": 3300}}
]}
\`\`\`

All actions in a bulk block execute simultaneously in parallel — the user confirms once and all run at once.

RULES:
- ALWAYS include confirmMessage in every action block
- Make confirmMessage clear and specific (names, amounts, what changes)
- For delete actions, warn it cannot be undone
- Only ONE action block per response (use bulk_actions to bundle multiple)
- If unsure which record the user means, ASK before generating an action
- For payment actions, verify the amount doesn't exceed the invoice remaining balance
- For stock-related invoice creation, note if a product has 0 stock (it cannot be used)
- For bulk operations, list each affected record in the confirmMessage so the user knows exactly what will change
- Be concise, helpful, and professional`;

  const messages = [
    ...conversationHistory.map((msg: { role: string; content: string }) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    })),
    { role: "user" as const, content: message },
  ];

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  });

  // Track token usage
  const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);
  if (tokensUsed > 0) {
    await prisma.organization.update({
      where: { id: session.organizationId },
      data: { aiTokensUsed: { increment: tokensUsed } },
    });
  }

  const contentBlock = response.content[0];
  const assistantMessage = contentBlock.type === "text" ? contentBlock.text : "";

  // Parse action blocks
  let action = null;
  const actionMatch = assistantMessage.match(/```action\n([\s\S]*?)\n```/);
  if (actionMatch) {
    try {
      action = JSON.parse(actionMatch[1]);
    } catch {
      // ignore parse errors
    }
  }

  return NextResponse.json({
    message: assistantMessage.replace(/```action\n[\s\S]*?\n```/g, "").trim(),
    action,
  });
}
