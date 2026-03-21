import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

async function main() {
  console.log("🌱 Seeding demo data on Railway...");

  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 12);

  // ── Organization ───────────────────────────────────────────────
  const org = await prisma.organization.upsert({
    where: { id: "demo-org-hero" },
    update: { name: "Velaro Agency" },
    create: {
      id: "demo-org-hero",
      name: "Velaro Agency",
      status: "active",
      plan: "pro",
      trialEndsAt,
      maxUsers: 10,
      aiTokensLimit: 50000,
      aiTokensUsed: 12400,
    },
  });
  console.log("✅ Organization:", org.name);

  // ── Admin user ─────────────────────────────────────────────────
  const password = await bcrypt.hash("demo1234", 12);
  const user = await prisma.user.upsert({
    where: { email: "demo@velaro.com" },
    update: { password },
    create: {
      email: "demo@velaro.com",
      password,
      name: "Alex Martin",
      role: "admin",
      permissions: JSON.stringify({
        dashboard: { view: true, edit: true },
        clients: { view: true, edit: true },
        products: { view: true, edit: true },
        employees: { view: true, edit: true },
        invoices: { view: true, edit: true },
        expenses: { view: true, edit: true },
        reports: { view: true, edit: true },
        ai: { view: true, edit: true },
        activity_log: { view: true, edit: true },
        tax: { view: true, edit: true },
      }),
      organizationId: org.id,
    },
  });
  console.log("✅ User:", user.email);

  // ── Clients ────────────────────────────────────────────────────
  const clientData = [
    { id: "demo-c-01", name: "Northwave Tech",    email: "billing@northwave.io",  phone: "+1 415 823 4400",   address: "240 Market St, San Francisco, CA" },
    { id: "demo-c-02", name: "Luminos Creative",  email: "finance@luminos.co",    phone: "+44 20 7946 0123",  address: "12 Carnaby St, London, UK" },
    { id: "demo-c-03", name: "Arko Retail Group", email: "accounts@arko.com",     phone: "+33 1 42 86 55 20", address: "18 Rue de Rivoli, Paris, France" },
    { id: "demo-c-04", name: "Zenith Solutions",  email: "pay@zenithsol.ae",      phone: "+971 4 355 8899",   address: "DIFC Gate, Dubai, UAE" },
    { id: "demo-c-05", name: "Maple Ventures",    email: "invoice@maple.ca",      phone: "+1 604 921 7700",   address: "888 West Georgia, Vancouver, BC" },
  ];

  for (const c of clientData) {
    await prisma.client.upsert({
      where: { id: c.id },
      update: {},
      create: { ...c, organizationId: org.id },
    });
  }
  console.log("✅ Clients:", clientData.length);

  // ── Products ───────────────────────────────────────────────────
  const productData = [
    { id: "demo-p-01", sku: "SVC-001", name: "UI/UX Design Package",          price: 2400, cost: 800,  quantity: 50,  minStock: 5  },
    { id: "demo-p-02", sku: "SVC-002", name: "Brand Identity Kit",             price: 1800, cost: 600,  quantity: 30,  minStock: 5  },
    { id: "demo-p-03", sku: "SVC-003", name: "Web Development (per page)",     price: 950,  cost: 300,  quantity: 100, minStock: 10 },
    { id: "demo-p-04", sku: "SVC-004", name: "SEO Monthly Retainer",           price: 1200, cost: 400,  quantity: 20,  minStock: 3  },
    { id: "demo-p-05", sku: "SVC-005", name: "Social Media Management",        price: 850,  cost: 250,  quantity: 15,  minStock: 2  },
  ];

  for (const p of productData) {
    await prisma.product.upsert({
      where: { id: p.id },
      update: {},
      create: { ...p, organizationId: org.id },
    });
  }
  console.log("✅ Products:", productData.length);

  // ── Employees ──────────────────────────────────────────────────
  const employeeData = [
    { id: "demo-e-01", firstName: "Sarah",  lastName: "Johnson", position: "Lead Designer",   salary: 5800, currency: "USD" },
    { id: "demo-e-02", firstName: "Marcus", lastName: "Chen",    position: "Full-Stack Dev",   salary: 7200, currency: "USD" },
    { id: "demo-e-03", firstName: "Leila",  lastName: "Benali",  position: "Project Manager",  salary: 5200, currency: "USD" },
    { id: "demo-e-04", firstName: "Omar",   lastName: "Khalil",  position: "SEO Specialist",   salary: 4100, currency: "USD" },
  ];

  for (const e of employeeData) {
    await prisma.employee.upsert({
      where: { id: e.id },
      update: {},
      create: { ...e, organizationId: org.id },
    });
  }
  console.log("✅ Employees:", employeeData.length);

  // ── Invoices + Payments ────────────────────────────────────────
  //
  // MATH VERIFICATION (taxRate=20%):
  //   inv-01: subtotal=4800,  tax=4800*0.20=960,   total=5760   ✅  items: 2×2400=4800  ✅
  //   inv-02: subtotal=3600,  tax=3600*0.20=720,   total=4320   ✅  items: 2×1800=3600  ✅
  //   inv-03: subtotal=5700,  tax=5700*0.20=1140,  total=6840   ✅  items: 6×950=5700   ✅
  //   inv-04: subtotal=2400,  tax=2400*0.20=480,   total=2880   ✅  items: 2×1200=2400  ✅
  //   inv-05: subtotal=1700,  tax=1700*0.20=340,   total=2040   ✅  items: 2×850=1700   ✅
  //   inv-06: subtotal=3600,  tax=3600*0.20=720,   total=4320   ✅  items: 2×1800=3600  ✅
  //   inv-07: subtotal=6000,  tax=6000*0.20=1200,  total=7200   ✅  items: 2×2400+1×1200=6000 ✅
  //
  // PAYMENTS (gross earning = sum of all payments):
  //   inv-01 paid:     payment=5760   ✅ covers full total
  //   inv-02 paid:     payment=4320   ✅ covers full total
  //   inv-03 partial:  payment=3000   (balance=3840 remaining)
  //   inv-07 paid:     payment=7200   ✅ covers full total
  //
  // GROSS EARNING = 5760+4320+3000+7200 = $20,280
  // PENDING       = (6840-3000) + 2880 + 2040 = 3840+2880+2040 = $8,760
  //
  // EXPENSES TOTAL = $11,933 (see below)
  // NET EARNING    = $20,280 - $11,933 = $8,347  ✅ positive and realistic

  type InvoiceItem = { description: string; quantity: number; unitPrice: number; total: number };
  type InvoiceSeed = {
    id: string; number: string; clientId: string; status: string;
    subtotal: number; taxRate: number; tax: number; total: number;
    date: Date; dueDate: Date;
    items: InvoiceItem[];
    payments: { amount: number; date: Date }[];
  };

  const invoiceData: InvoiceSeed[] = [
    {
      id: "demo-inv-01", number: "VEL-00041", clientId: "demo-c-01",
      status: "paid", subtotal: 4800, taxRate: 20, tax: 960, total: 5760,
      date: daysAgo(25), dueDate: daysAgo(5),
      items: [{ description: "UI/UX Design Package", quantity: 2, unitPrice: 2400, total: 4800 }],
      payments: [{ amount: 5760, date: daysAgo(6) }],
    },
    {
      id: "demo-inv-02", number: "VEL-00042", clientId: "demo-c-02",
      status: "paid", subtotal: 3600, taxRate: 20, tax: 720, total: 4320,
      date: daysAgo(20), dueDate: daysAgo(2),
      items: [{ description: "Brand Identity Kit", quantity: 2, unitPrice: 1800, total: 3600 }],
      payments: [{ amount: 4320, date: daysAgo(3) }],
    },
    {
      id: "demo-inv-03", number: "VEL-00043", clientId: "demo-c-03",
      status: "partially_paid", subtotal: 5700, taxRate: 20, tax: 1140, total: 6840,
      date: daysAgo(15), dueDate: daysFromNow(10),
      items: [{ description: "Web Development (per page)", quantity: 6, unitPrice: 950, total: 5700 }],
      payments: [{ amount: 3000, date: daysAgo(5) }],
    },
    {
      id: "demo-inv-04", number: "VEL-00044", clientId: "demo-c-04",
      status: "sent", subtotal: 2400, taxRate: 20, tax: 480, total: 2880,
      date: daysAgo(10), dueDate: daysFromNow(20),
      items: [{ description: "SEO Monthly Retainer", quantity: 2, unitPrice: 1200, total: 2400 }],
      payments: [],
    },
    {
      id: "demo-inv-05", number: "VEL-00045", clientId: "demo-c-05",
      status: "overdue", subtotal: 1700, taxRate: 20, tax: 340, total: 2040,
      date: daysAgo(40), dueDate: daysAgo(10),
      items: [{ description: "Social Media Management", quantity: 2, unitPrice: 850, total: 1700 }],
      payments: [],
    },
    {
      id: "demo-inv-06", number: "VEL-00046", clientId: "demo-c-01",
      status: "draft", subtotal: 3600, taxRate: 20, tax: 720, total: 4320,
      date: daysAgo(2), dueDate: daysFromNow(28),
      items: [{ description: "Brand Identity Kit", quantity: 2, unitPrice: 1800, total: 3600 }],
      payments: [],
    },
    {
      id: "demo-inv-07", number: "VEL-00047", clientId: "demo-c-02",
      status: "paid", subtotal: 6000, taxRate: 20, tax: 1200, total: 7200,
      date: daysAgo(35), dueDate: daysAgo(15),
      items: [
        { description: "UI/UX Design Package",  quantity: 2, unitPrice: 2400, total: 4800 },
        { description: "SEO Monthly Retainer",  quantity: 1, unitPrice: 1200, total: 1200 },
      ],
      payments: [{ amount: 7200, date: daysAgo(16) }],
    },
  ];

  for (const inv of invoiceData) {
    const { items, payments, ...invFields } = inv;

    // delete existing items/payments first so upsert is clean
    await prisma.invoiceItem.deleteMany({ where: { invoiceId: inv.id } });
    await prisma.payment.deleteMany({ where: { invoiceId: inv.id } });

    await prisma.invoice.upsert({
      where: { id: inv.id },
      update: { ...invFields },
      create: {
        ...invFields,
        organizationId: org.id,
        items: { create: items },
      },
    });

    // re-create items on update
    const existing = await prisma.invoiceItem.count({ where: { invoiceId: inv.id } });
    if (existing === 0) {
      await prisma.invoiceItem.createMany({ data: items.map(i => ({ ...i, invoiceId: inv.id })) });
    }

    for (const p of payments) {
      await prisma.payment.create({
        data: { ...p, invoiceId: inv.id, organizationId: org.id },
      });
    }
  }
  console.log("✅ Invoices:", invoiceData.length);

  // ── Expenses ───────────────────────────────────────────────────
  // Total = 2500+599+1200+4800+320+444+800+210+380+280 = $11,533
  // Net Earning = $20,280 - $11,533 = $8,747 ✅
  const expenseData = [
    { id: "demo-exp-01", description: "Office rent - March",        amount: 2500.00, category: "rent",      date: daysAgo(5)  },
    { id: "demo-exp-02", description: "Adobe Creative Cloud",        amount: 599.00,  category: "software",  date: daysAgo(8)  },
    { id: "demo-exp-03", description: "Google Ads - Q1",             amount: 1200.00, category: "marketing", date: daysAgo(12) },
    { id: "demo-exp-04", description: "Team salaries - February",    amount: 4800.00, category: "salaries",  date: daysAgo(20) },
    { id: "demo-exp-05", description: "Electricity & Internet",      amount: 320.00,  category: "utilities", date: daysAgo(18) },
    { id: "demo-exp-06", description: "Figma Pro - annual",          amount: 444.00,  category: "software",  date: daysAgo(22) },
    { id: "demo-exp-07", description: "Business travel - Dubai",     amount: 800.00,  category: "travel",    date: daysAgo(30) },
    { id: "demo-exp-08", description: "Office supplies",             amount: 210.00,  category: "office",    date: daysAgo(14) },
    { id: "demo-exp-09", description: "LinkedIn Premium x4",         amount: 380.00,  category: "software",  date: daysAgo(9)  },
    { id: "demo-exp-10", description: "Team lunch - client meeting", amount: 280.00,  category: "other",     date: daysAgo(3)  },
  ];

  for (const e of expenseData) {
    await prisma.expense.upsert({
      where: { id: e.id },
      update: {},
      create: { ...e, organizationId: org.id, createdById: user.id },
    });
  }
  console.log("✅ Expenses:", expenseData.length);

  // ── Summary ────────────────────────────────────────────────────
  const grossEarning = 5760 + 4320 + 3000 + 7200;           // $20,280
  const totalExpenses = 2500+599+1200+4800+320+444+800+210+380+280; // $11,533
  const netEarning = grossEarning - totalExpenses;            // $8,747
  const pending = (6840 - 3000) + 2880 + 2040;               // $8,760

  console.log("\n🎉 Demo data seeded successfully!");
  console.log("─────────────────────────────────────────────");
  console.log(`  Gross Earning : $${grossEarning.toLocaleString()}`);
  console.log(`  Total Expenses: $${totalExpenses.toLocaleString()}`);
  console.log(`  Net Earning   : $${netEarning.toLocaleString()}`);
  console.log(`  Pending       : $${pending.toLocaleString()}`);
  console.log("─────────────────────────────────────────────");
  console.log("  Email   : demo@velaro.com");
  console.log("  Password: demo1234");
  console.log("  App URL : https://accountant-b9bq.vercel.app");
  console.log("─────────────────────────────────────────────");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
