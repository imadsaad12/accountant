import { NextRequest, NextResponse } from "next/server";
import { getSessionWithPermissions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canView, canEdit, type Permissions } from "@/lib/permissions";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function getBusinessContext(organizationId: string, permissions: Permissions) {
  const [clients, products, employees, invoices] = await Promise.all([
    canView(permissions, "clients")
      ? prisma.client.findMany({ where: { organizationId }, select: { id: true, name: true, email: true } })
      : Promise.resolve(null),
    canView(permissions, "products")
      ? prisma.product.findMany({ where: { organizationId }, select: { id: true, name: true, sku: true, price: true, quantity: true } })
      : Promise.resolve(null),
    canView(permissions, "employees")
      ? prisma.employee.findMany({ where: { organizationId }, select: { id: true, firstName: true, lastName: true, position: true, status: true } })
      : Promise.resolve(null),
    canView(permissions, "invoices")
      ? prisma.invoice.findMany({
          where: { organizationId },
          select: { id: true, number: true, date: true, total: true, status: true, client: { select: { name: true } } },
          orderBy: { date: "desc" },
          take: 50,
        })
      : Promise.resolve(null),
  ]);
  return { clients, products, employees, invoices };
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

  const systemPrompt = `You are an AI assistant for an accounting/business management application called "Accountant". You help business owners manage their operations.

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
- When the user mixes languages, understand the intent regardless of which language each word is in.
- Respond in the PRIMARY language the user is using. If they speak mostly Arabic with some French/English words, respond in Arabic. If mostly French with Arabic words, respond in French. If mostly English, respond in English.
- Understand common Lebanese/Levantine Arabic expressions: بدي (I want), شو (what), كيف (how), عطيني (give me), وريني (show me), ابعتلي (send me), هالشهر (this month), هالسنة (this year), يلي (that/which), تبع (of/belonging to), قديش (how much), فيه (there is), ما فيه (there isn't).
- Also understand transliterated Arabic: "badde", "shou", "3atini", "wariine", "ab3atli", "2adesh", etc.
- Understand French accounting terms: facture (invoice), chiffre d'affaires (revenue), bénéfice (profit), solde (balance), fournisseur (supplier), client, stock, TVA (tax).

USER PERMISSIONS:
${buildPermissionContext(session.permissions)}

IMPORTANT PERMISSION RULES:
- If the user asks about data from a feature marked "NO ACCESS", you MUST refuse and say they do not have permission to access that data. Do not reveal or guess the data.
- If the user asks to edit/create/delete data from a feature where they only have "view only", refuse and say they need edit permission for that feature.
- Only provide data and actions that match the user's actual permissions above.

You have access to the following business data (only for features the user can view):

${context.clients !== null ? `CLIENTS (${context.clients.length} total):\n${context.clients.map(c => `- ${c.name} (ID: ${c.id}, Email: ${c.email})`).join("\n")}` : "CLIENTS: [NO ACCESS — do not answer questions about clients]"}

${context.products !== null ? `PRODUCTS/STOCK (${context.products.length} total):\n${context.products.map(p => `- ${p.name} (ID: ${p.id}, SKU: ${p.sku}, Price: $${p.price}, Stock: ${p.quantity})`).join("\n")}` : "PRODUCTS/STOCK: [NO ACCESS — do not answer questions about products or stock]"}

${context.employees !== null ? `EMPLOYEES (${context.employees.length} total):\n${context.employees.map(e => `- ${e.firstName} ${e.lastName} (ID: ${e.id}) - ${e.position} (${e.status})`).join("\n")}` : "EMPLOYEES: [NO ACCESS — do not answer questions about employees]"}

${context.invoices !== null ? `RECENT INVOICES (${context.invoices.length} total):\n${context.invoices.map(i => `- ${i.number}: $${i.total} - ${i.status} - ${i.client.name} (${new Date(i.date).toLocaleDateString()}) (ID: ${i.id})`).join("\n")}` : "INVOICES: [NO ACCESS — do not answer questions about invoices]"}

USER ROLE: ${session.role}
${session.role === "admin" ? "This user is an ADMIN and can execute write actions (add, edit, delete) for features they have edit permission on." : "This user is NOT an admin. They can only view data and export PDFs. Do NOT include write action blocks for non-admin users. If they ask to create/edit/delete anything, tell them they need admin privileges."}

CAPABILITIES - You can help with:
1. Answering questions about the business data
2. Providing financial summaries and insights
3. Identifying trends and issues (low stock, overdue invoices, etc.)
4. Exporting invoices as PDF
5. ${session.role === "admin" ? "ADMIN ONLY: Creating, editing, and deleting clients, products, employees, invoices, and updating stock" : "Ask an admin to perform write operations"}

ACTION BLOCKS - When the user requests an action, include a JSON action block at the end of your response. The frontend will show a confirmation dialog before executing.

IMPORTANT: Always include a "confirmMessage" field that clearly describes what the action will do in the user's language, so they can confirm or cancel.

EXPORT ACTIONS (all users):

Export invoices by date range:
\`\`\`action
{"type": "export_invoices", "from": "YYYY-MM-DD", "to": "YYYY-MM-DD", "confirmMessage": "Export X invoices from DATE to DATE as PDF"}
\`\`\`

Export specific invoice as PDF:
\`\`\`action
{"type": "export_pdf", "invoiceId": "the-invoice-id", "language": "fr", "confirmMessage": "Export invoice INV-XXXXX as PDF"}
\`\`\`

Download AI response/statistics as PDF report:
When the user asks to download, save, or export the statistics, summary, or data you just provided as a PDF, include this action block. Put the FULL formatted content of your response (the data/statistics) into the "content" field as an array of sections. Each section has a "heading" and "text" (the text should be the detailed data, use \\n for line breaks).
\`\`\`action
{"type": "export_report", "title": "Report Title", "sections": [{"heading": "Section Title", "text": "Line 1\\nLine 2\\nLine 3"}], "confirmMessage": "Download report as PDF"}
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
{"type": "delete_client", "id": "client-id", "confirmMessage": "DELETE client NAME - this cannot be undone!"}
\`\`\`

Add product:
\`\`\`action
{"type": "add_product", "name": "...", "sku": "...", "price": 0, "cost": 0, "quantity": 0, "minStock": 0, "unit": "piece", "confirmMessage": "Add new product: NAME at $PRICE"}
\`\`\`

Edit product:
\`\`\`action
{"type": "edit_product", "data": {"id": "product-id", "name": "...", "price": 0}, "confirmMessage": "Update product NAME: change FIELD to VALUE"}
\`\`\`

Delete product:
\`\`\`action
{"type": "delete_product", "id": "product-id", "confirmMessage": "DELETE product NAME - this cannot be undone!"}
\`\`\`

Update stock quantity:
\`\`\`action
{"type": "update_stock", "id": "product-id", "quantity": 50, "confirmMessage": "Update stock for PRODUCT to QUANTITY units"}
\`\`\`

Add employee:
\`\`\`action
{"type": "add_employee", "firstName": "...", "lastName": "...", "email": "...", "position": "...", "department": "...", "salary": 0, "confirmMessage": "Add new employee: FIRSTNAME LASTNAME as POSITION"}
\`\`\`

Edit employee:
\`\`\`action
{"type": "edit_employee", "data": {"id": "employee-id", "salary": 0}, "confirmMessage": "Update employee NAME: change FIELD to VALUE"}
\`\`\`

Delete employee:
\`\`\`action
{"type": "delete_employee", "id": "employee-id", "confirmMessage": "DELETE employee NAME - this cannot be undone!"}
\`\`\`

Add invoice:
\`\`\`action
{"type": "add_invoice", "clientId": "client-id", "taxRate": 19, "language": "fr", "items": [{"description": "...", "quantity": 1, "unitPrice": 0, "productId": "optional-product-id"}], "confirmMessage": "Create invoice for CLIENT with X items, total $AMOUNT"}
\`\`\`

Update invoice status:
\`\`\`action
{"type": "update_invoice_status", "id": "invoice-id", "status": "draft|sent|paid|overdue", "confirmMessage": "Change invoice INV-XXXXX status to STATUS"}
\`\`\`

RULES:
- ALWAYS include confirmMessage in every action block
- Make confirmMessage clear and specific (include names, amounts, what will change)
- For delete actions, warn that it cannot be undone
- For edit actions, specify exactly what fields are changing
- Only include ONE action block per response
- If you're unsure about data (e.g., which client the user means), ASK first before generating an action
- Be concise, helpful, and professional. Understand intent even from imperfect speech-to-text transcriptions.`;

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
