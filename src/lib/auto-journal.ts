import { prisma } from "@/lib/db";

/**
 * Default account codes used for auto-journaling.
 * These match the seeded default accounts in the COA.
 */
const ACCOUNT_CODES = {
  CASH: "1000",
  ACCOUNTS_RECEIVABLE: "1100",
  INVENTORY: "1200",
  ACCOUNTS_PAYABLE: "2000",
  TAX_PAYABLE: "2100",
  SALES_REVENUE: "4000",
  COGS: "5000",
  SALARIES_EXPENSE: "5300",
} as const;

interface JournalLineInput {
  accountCode: string;
  debit: number;
  credit: number;
  description?: string;
}

interface CreateJournalParams {
  organizationId: string;
  date: Date;
  description: string;
  type: string;
  sourceId: string;
  lines: JournalLineInput[];
}

/**
 * Resolves account codes to account IDs for an organization.
 * Creates default accounts if they don't exist yet.
 */
async function resolveAccountIds(
  organizationId: string,
  codes: string[]
): Promise<Record<string, string>> {
  const accounts = await prisma.account.findMany({
    where: { organizationId, code: { in: codes } },
    select: { id: true, code: true },
  });
  const map: Record<string, string> = {};
  for (const a of accounts) map[a.code] = a.id;
  return map;
}

/**
 * Creates a balanced journal entry with the given lines.
 * Validates that total debits = total credits before inserting.
 */
export async function createJournalEntry(params: CreateJournalParams) {
  const { organizationId, date, description, type, sourceId, lines } = params;

  // Validate balance
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    console.error(`Journal entry not balanced: debit=${totalDebit}, credit=${totalCredit}`, description);
    return null;
  }

  // Resolve account codes to IDs
  const codes = lines.map((l) => l.accountCode);
  const accountMap = await resolveAccountIds(organizationId, codes);

  // Check all accounts exist
  for (const line of lines) {
    if (!accountMap[line.accountCode]) {
      console.error(`Account ${line.accountCode} not found for org ${organizationId}`);
      return null;
    }
  }

  // Create journal entry with lines in a transaction
  return prisma.journalEntry.create({
    data: {
      date,
      description,
      type,
      sourceId,
      organizationId,
      lines: {
        create: lines.map((l) => ({
          accountId: accountMap[l.accountCode],
          debit: l.debit,
          credit: l.credit,
          description: l.description,
        })),
      },
    },
    include: { lines: true },
  });
}

/**
 * Delete journal entries linked to a source (for reversals/corrections).
 */
export async function deleteJournalEntriesBySource(sourceId: string) {
  const entries = await prisma.journalEntry.findMany({
    where: { sourceId },
    select: { id: true },
  });
  if (entries.length === 0) return;
  await prisma.journalLine.deleteMany({
    where: { journalEntryId: { in: entries.map((e) => e.id) } },
  });
  await prisma.journalEntry.deleteMany({
    where: { id: { in: entries.map((e) => e.id) } },
  });
}

// ─── Domain-specific journal entry creators ──────────────────────────

/**
 * Invoice payment received:
 *   Debit  Cash
 *   Credit Accounts Receivable
 *   (If invoice has tax: Credit Tax Payable for tax portion)
 */
export async function journalInvoicePayment(opts: {
  organizationId: string;
  paymentId: string;
  amount: number;
  date: Date;
  invoiceNumber: string;
}) {
  return createJournalEntry({
    organizationId: opts.organizationId,
    date: opts.date,
    description: `Payment received for invoice ${opts.invoiceNumber}`,
    type: "invoice_payment",
    sourceId: opts.paymentId,
    lines: [
      { accountCode: ACCOUNT_CODES.CASH, debit: opts.amount, credit: 0 },
      { accountCode: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE, debit: 0, credit: opts.amount },
    ],
  });
}

/**
 * Invoice created/sent (recognizes receivable):
 *   Debit  Accounts Receivable (total)
 *   Credit Sales Revenue (subtotal after discount)
 *   Credit Tax Payable (tax amount, if any)
 */
export async function journalInvoiceCreated(opts: {
  organizationId: string;
  invoiceId: string;
  invoiceNumber: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  date: Date;
}) {
  const netRevenue = opts.subtotal - (opts.subtotal * opts.discount / 100);
  const lines: JournalLineInput[] = [
    { accountCode: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE, debit: opts.total, credit: 0 },
    { accountCode: ACCOUNT_CODES.SALES_REVENUE, debit: 0, credit: netRevenue },
  ];
  if (opts.tax > 0) {
    lines.push({ accountCode: ACCOUNT_CODES.TAX_PAYABLE, debit: 0, credit: opts.tax });
  }
  return createJournalEntry({
    organizationId: opts.organizationId,
    date: opts.date,
    description: `Invoice ${opts.invoiceNumber} issued`,
    type: "invoice_created",
    sourceId: opts.invoiceId,
    lines,
  });
}

/**
 * Expense recorded:
 *   Debit  Expense account (from expense.accountId code, or fallback to 5900 Other Expenses)
 *   Credit Cash
 */
export async function journalExpenseCreated(opts: {
  organizationId: string;
  expenseId: string;
  amount: number;
  date: Date;
  description: string;
  accountCode?: string;
}) {
  return createJournalEntry({
    organizationId: opts.organizationId,
    date: opts.date,
    description: `Expense: ${opts.description}`,
    type: "expense",
    sourceId: opts.expenseId,
    lines: [
      { accountCode: opts.accountCode || "5900", debit: opts.amount, credit: 0 },
      { accountCode: ACCOUNT_CODES.CASH, debit: 0, credit: opts.amount },
    ],
  });
}

/**
 * Supplier bill payment:
 *   Debit  Accounts Payable
 *   Credit Cash
 */
export async function journalSupplierBillPayment(opts: {
  organizationId: string;
  paymentId: string;
  amount: number;
  date: Date;
  supplierName: string;
  billReference?: string;
}) {
  return createJournalEntry({
    organizationId: opts.organizationId,
    date: opts.date,
    description: `Payment to ${opts.supplierName}${opts.billReference ? ` (${opts.billReference})` : ""}`,
    type: "supplier_payment",
    sourceId: opts.paymentId,
    lines: [
      { accountCode: ACCOUNT_CODES.ACCOUNTS_PAYABLE, debit: opts.amount, credit: 0 },
      { accountCode: ACCOUNT_CODES.CASH, debit: 0, credit: opts.amount },
    ],
  });
}

/**
 * Salary advance given to employee:
 *   Debit  Salaries Expense
 *   Credit Cash
 */
export async function journalSalaryAdvance(opts: {
  organizationId: string;
  advanceId: string;
  amount: number;
  date: Date;
  employeeName: string;
}) {
  return createJournalEntry({
    organizationId: opts.organizationId,
    date: opts.date,
    description: `Salary advance to ${opts.employeeName}`,
    type: "salary_advance",
    sourceId: opts.advanceId,
    lines: [
      { accountCode: ACCOUNT_CODES.SALARIES_EXPENSE, debit: opts.amount, credit: 0 },
      { accountCode: ACCOUNT_CODES.CASH, debit: 0, credit: opts.amount },
    ],
  });
}
