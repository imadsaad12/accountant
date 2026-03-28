import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Find Testing Organization and admin user
  const testOrg = await prisma.organization.findFirst({
    where: { name: "Testing Organization" },
  });

  if (!testOrg) {
    console.error("Testing Organization not found");
    process.exit(1);
  }

  const adminUser = await prisma.user.findUnique({
    where: { email: "imadsaad11@gmail.com" },
  });

  if (!adminUser) {
    console.error("Admin user not found");
    process.exit(1);
  }

  console.log("Deleting existing data for Testing Organization...");

  // Delete all data except admin user
  await prisma.journalLine.deleteMany({
    where: { journalEntry: { organizationId: testOrg.id } },
  });
  await prisma.journalEntry.deleteMany({
    where: { organizationId: testOrg.id },
  });
  await prisma.payment.deleteMany({
    where: { organizationId: testOrg.id },
  });
  await prisma.invoiceItem.deleteMany({
    where: { invoice: { organizationId: testOrg.id } },
  });
  await prisma.invoiceFee.deleteMany({
    where: { invoice: { organizationId: testOrg.id } },
  });
  await prisma.invoice.deleteMany({
    where: { organizationId: testOrg.id },
  });
  await prisma.expense.deleteMany({
    where: { organizationId: testOrg.id },
  });
  await prisma.salaryAdvance.deleteMany({
    where: { organizationId: testOrg.id },
  });
  await prisma.employee.deleteMany({
    where: { organizationId: testOrg.id },
  });
  await prisma.supplierBillPayment.deleteMany({
    where: { organizationId: testOrg.id },
  });
  await prisma.supplierBill.deleteMany({
    where: { organizationId: testOrg.id },
  });
  await prisma.supplier.deleteMany({
    where: { organizationId: testOrg.id },
  });
  await prisma.productComponent.deleteMany({
    where: { composite: { organizationId: testOrg.id } },
  });
  await prisma.product.deleteMany({
    where: { organizationId: testOrg.id },
  });
  await prisma.category.deleteMany({
    where: { organizationId: testOrg.id },
  });
  await prisma.client.deleteMany({
    where: { organizationId: testOrg.id },
  });
  await prisma.account.deleteMany({
    where: { organizationId: testOrg.id },
  });

  console.log("Creating clients...");
  const clients = await Promise.all([
    prisma.client.create({
      data: {
        name: "ABC Corp",
        email: "contact@abccorp.com",
        phone: "+1-555-0101",
        address: "123 Main St",
        city: "New York",
        country: "USA",
        taxId: "12-3456789",
        organizationId: testOrg.id,
      },
    }),
    prisma.client.create({
      data: {
        name: "XYZ Solutions",
        email: "sales@xyzsol.com",
        phone: "+1-555-0102",
        address: "456 Oak Ave",
        city: "Los Angeles",
        country: "USA",
        taxId: "98-7654321",
        organizationId: testOrg.id,
      },
    }),
    prisma.client.create({
      data: {
        name: "Global Industries",
        email: "procurement@globalind.com",
        phone: "+44-20-7946-0958",
        address: "789 Thames St",
        city: "London",
        country: "UK",
        organizationId: testOrg.id,
      },
    }),
    prisma.client.create({
      data: {
        name: "Tech Ventures Inc",
        email: "hello@techventures.io",
        phone: "+1-555-0103",
        address: "321 Silicon Valley",
        city: "San Francisco",
        country: "USA",
        organizationId: testOrg.id,
      },
    }),
    prisma.client.create({
      data: {
        name: "Retail Partners",
        email: "b2b@retailpartners.com",
        organizationId: testOrg.id,
      },
    }),
  ]);

  console.log("Creating categories and products...");
  const category = await prisma.category.create({
    data: {
      name: "Electronics",
      organizationId: testOrg.id,
    },
  });

  const simpleProducts = await Promise.all([
    prisma.product.create({
      data: {
        name: "Laptop Component A",
        sku: "LCA-001",
        description: "Basic laptop component",
        price: 100,
        cost: 50,
        quantity: 500,
        unit: "piece",
        categoryId: category.id,
        organizationId: testOrg.id,
      },
    }),
    prisma.product.create({
      data: {
        name: "Laptop Component B",
        sku: "LCB-001",
        description: "Advanced laptop component",
        price: 150,
        cost: 75,
        quantity: 300,
        unit: "piece",
        categoryId: category.id,
        organizationId: testOrg.id,
      },
    }),
    prisma.product.create({
      data: {
        name: "Screen Panel",
        sku: "SP-001",
        price: 200,
        cost: 100,
        quantity: 200,
        unit: "piece",
        categoryId: category.id,
        organizationId: testOrg.id,
      },
    }),
  ]);

  const compositeProduct = await prisma.product.create({
    data: {
      name: "Complete Laptop Kit",
      sku: "CLK-001",
      description: "Full laptop assembly kit",
      price: 500,
      cost: 250,
      quantity: 50,
      unit: "piece",
      type: "composite",
      categoryId: category.id,
      organizationId: testOrg.id,
    },
  });

  // Create product components
  await Promise.all([
    prisma.productComponent.create({
      data: {
        compositeId: compositeProduct.id,
        componentId: simpleProducts[0].id,
        quantity: 2,
      },
    }),
    prisma.productComponent.create({
      data: {
        compositeId: compositeProduct.id,
        componentId: simpleProducts[1].id,
        quantity: 1,
      },
    }),
    prisma.productComponent.create({
      data: {
        compositeId: compositeProduct.id,
        componentId: simpleProducts[2].id,
        quantity: 1,
      },
    }),
  ]);

  console.log("Creating invoices with payments...");
  const today = new Date();
  const utcDate = (year: number, month: number, day: number) =>
    new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00.000Z`);

  const invoices = [
    {
      number: "INV-001",
      clientId: clients[0].id,
      status: "paid",
      date: utcDate(2026, 1, 15),
      dueDate: utcDate(2026, 2, 15),
      items: [
        { product: simpleProducts[0], quantity: 5, unitPrice: 100, unitCost: 50 },
      ],
    },
    {
      number: "INV-002",
      clientId: clients[1].id,
      status: "sent",
      date: utcDate(2026, 3, 10),
      dueDate: utcDate(2026, 4, 10),
      items: [
        { product: simpleProducts[1], quantity: 3, unitPrice: 150, unitCost: 75 },
      ],
    },
    {
      number: "INV-003",
      clientId: clients[2].id,
      status: "partially_paid",
      date: utcDate(2026, 3, 5),
      dueDate: utcDate(2026, 3, 20),
      items: [
        { product: compositeProduct, quantity: 2, unitPrice: 500, unitCost: 250 },
      ],
      amountPaid: 600,
    },
    {
      number: "INV-004",
      clientId: clients[0].id,
      status: "paid",
      date: utcDate(2026, 2, 28),
      dueDate: utcDate(2026, 3, 28),
      items: [
        { product: simpleProducts[2], quantity: 10, unitPrice: 200, unitCost: 100 },
      ],
    },
    {
      number: "INV-005",
      clientId: clients[3].id,
      status: "overdue",
      date: utcDate(2026, 1, 5),
      dueDate: utcDate(2026, 1, 20),
      items: [
        { product: simpleProducts[0], quantity: 2, unitPrice: 100, unitCost: 50 },
        { product: simpleProducts[1], quantity: 1, unitPrice: 150, unitCost: 75 },
      ],
    },
    {
      number: "INV-006",
      clientId: clients[4].id,
      status: "draft",
      date: today,
      items: [
        { product: compositeProduct, quantity: 1, unitPrice: 500, unitCost: 250 },
      ],
    },
  ];

  for (const inv of invoices) {
    const subtotal = inv.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0
    );
    const tax = subtotal * 0.19;
    const total = subtotal + tax;

    const createdInv = await prisma.invoice.create({
      data: {
        number: inv.number,
        clientId: inv.clientId,
        status: inv.status,
        date: inv.date,
        dueDate: inv.dueDate,
        subtotal,
        tax,
        total,
        taxRate: 19,
        organizationId: testOrg.id,
        items: {
          create: inv.items.map((item) => ({
            productId: item.product.id,
            description: item.product.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            unitCost: item.unitCost,
            total: item.quantity * item.unitPrice,
          })),
        },
      },
    });

    // Add payments for paid/partially paid invoices
    if (inv.status === "paid") {
      await prisma.payment.create({
        data: {
          invoiceId: createdInv.id,
          amount: total,
          date: new Date(inv.date.getTime() + 7 * 24 * 60 * 60 * 1000),
          method: "bank_transfer",
          organizationId: testOrg.id,
        },
      });
    } else if (inv.status === "partially_paid" && inv.amountPaid) {
      await prisma.payment.create({
        data: {
          invoiceId: createdInv.id,
          amount: inv.amountPaid,
          date: new Date(inv.date.getTime() + 3 * 24 * 60 * 60 * 1000),
          method: "cash",
          organizationId: testOrg.id,
        },
      });
    }
  }

  console.log("Creating suppliers and bills...");
  const suppliers = await Promise.all([
    prisma.supplier.create({
      data: {
        name: "Parts Wholesale",
        contactName: "John Smith",
        email: "orders@partswholesale.com",
        phone: "+1-555-0201",
        address: "100 Industrial Park",
        city: "Chicago",
        country: "USA",
        taxId: "55-1234567",
        paymentTerms: 30,
        organizationId: testOrg.id,
      },
    }),
    prisma.supplier.create({
      data: {
        name: "Tech Supplies Ltd",
        contactName: "Sarah Johnson",
        email: "sales@techsupplies.co.uk",
        phone: "+44-121-5555555",
        address: "50 Gear Lane",
        city: "Birmingham",
        country: "UK",
        paymentTerms: 45,
        organizationId: testOrg.id,
      },
    }),
    prisma.supplier.create({
      data: {
        name: "Global Components",
        email: "procurement@globalcomp.com",
        organizationId: testOrg.id,
      },
    }),
  ]);

  const bills = [
    {
      supplierId: suppliers[0].id,
      amount: 5000,
      description: "Monthly parts order",
      reference: "PO-001",
      date: utcDate(2026, 1, 20),
      dueDate: utcDate(2026, 2, 20),
      status: "paid" as const,
      amountPaid: 5000,
    },
    {
      supplierId: suppliers[1].id,
      amount: 3000,
      description: "Component batch",
      reference: "PO-002",
      date: utcDate(2026, 2, 10),
      dueDate: utcDate(2026, 3, 27),
      status: "partially_paid" as const,
      amountPaid: 1500,
    },
    {
      supplierId: suppliers[2].id,
      amount: 2000,
      description: "Spare parts",
      date: utcDate(2026, 3, 15),
      dueDate: utcDate(2026, 4, 15),
      status: "pending" as const,
      amountPaid: 0,
    },
  ];

  for (const bill of bills) {
    const createdBill = await prisma.supplierBill.create({
      data: {
        supplierId: bill.supplierId,
        amount: bill.amount,
        description: bill.description,
        reference: bill.reference,
        date: bill.date,
        dueDate: bill.dueDate,
        status: bill.status,
        amountPaid: bill.amountPaid,
        organizationId: testOrg.id,
      },
    });

    if (bill.status === "paid" && bill.amountPaid > 0) {
      await prisma.supplierBillPayment.create({
        data: {
          billId: createdBill.id,
          amount: bill.amountPaid,
          date: new Date(bill.date.getTime() + 5 * 24 * 60 * 60 * 1000),
          method: "bank_transfer",
          organizationId: testOrg.id,
        },
      });
    } else if (bill.status === "partially_paid" && bill.amountPaid > 0) {
      await prisma.supplierBillPayment.create({
        data: {
          billId: createdBill.id,
          amount: bill.amountPaid,
          date: new Date(bill.date.getTime() + 3 * 24 * 60 * 60 * 1000),
          method: "cash",
          organizationId: testOrg.id,
        },
      });
    }
  }

  console.log("Creating employees and salary advances...");
  const employees = await Promise.all([
    prisma.employee.create({
      data: {
        firstName: "Alice",
        lastName: "Johnson",
        email: "alice@example.com",
        position: "Manager",
        department: "Operations",
        salary: 3000,
        salaryPeriod: "month",
        hireDate: utcDate(2025, 7, 1),
        organizationId: testOrg.id,
      },
    }),
    prisma.employee.create({
      data: {
        firstName: "Bob",
        lastName: "Smith",
        position: "Developer",
        department: "Engineering",
        salary: 2500,
        salaryPeriod: "month",
        hireDate: utcDate(2025, 1, 15),
        organizationId: testOrg.id,
      },
    }),
    prisma.employee.create({
      data: {
        firstName: "Charlie",
        lastName: "Davis",
        position: "Sales Rep",
        salary: 1000,
        salaryPeriod: "week",
        hireDate: utcDate(2026, 1, 1),
        organizationId: testOrg.id,
      },
    }),
    prisma.employee.create({
      data: {
        firstName: "Diana",
        lastName: "Wilson",
        position: "Contractor",
        salary: 150,
        salaryPeriod: "day",
        hireDate: utcDate(2026, 3, 1),
        organizationId: testOrg.id,
      },
    }),
    prisma.employee.create({
      data: {
        firstName: "Eve",
        lastName: "Brown",
        position: "Intern",
        salary: 2000,
        salaryPeriod: "month",
        hireDate: utcDate(2026, 3, 15),
        organizationId: testOrg.id,
      },
    }),
  ]);

  // Create salary advances with various statuses (using UTC dates)
  await Promise.all([
    prisma.salaryAdvance.create({
      data: {
        employeeId: employees[0].id,
        amount: 500,
        date: new Date("2026-03-01T00:00:00.000Z"), // Mar 1
        status: "pending",
        organizationId: testOrg.id,
      },
    }),
    prisma.salaryAdvance.create({
      data: {
        employeeId: employees[0].id,
        amount: 800,
        date: new Date("2026-02-15T00:00:00.000Z"), // Feb 15
        status: "paid",
        organizationId: testOrg.id,
      },
    }),
    prisma.salaryAdvance.create({
      data: {
        employeeId: employees[1].id,
        amount: 1000,
        date: new Date("2026-01-20T00:00:00.000Z"), // Jan 20
        status: "paid",
        organizationId: testOrg.id,
      },
    }),
    prisma.salaryAdvance.create({
      data: {
        employeeId: employees[2].id,
        amount: 300,
        date: new Date("2026-03-10T00:00:00.000Z"), // Mar 10
        status: "pending",
        organizationId: testOrg.id,
      },
    }),
    prisma.salaryAdvance.create({
      data: {
        employeeId: employees[3].id,
        amount: 450,
        date: new Date("2026-03-05T00:00:00.000Z"), // Mar 5
        status: "returned",
        organizationId: testOrg.id,
      },
    }),
  ]);

  console.log("Creating expenses...");
  await Promise.all([
    // Recurring expenses
    prisma.expense.create({
      data: {
        date: utcDate(2026, 1, 1),
        amount: 500,
        description: "Monthly office rent",
        category: "rent",
        recurrence: "monthly",
        vendor: "Landlord LLC",
        organizationId: testOrg.id,
        createdById: adminUser.id,
      },
    }),
    prisma.expense.create({
      data: {
        date: utcDate(2026, 1, 5),
        amount: 100,
        description: "Internet service",
        category: "utilities",
        recurrence: "monthly",
        vendor: "ISP Corp",
        organizationId: testOrg.id,
        createdById: adminUser.id,
      },
    }),
    prisma.expense.create({
      data: {
        date: utcDate(2026, 3, 1),
        amount: 200,
        description: "Weekly maintenance",
        category: "maintenance",
        recurrence: "weekly",
        vendor: "Maintenance Co",
        organizationId: testOrg.id,
        createdById: adminUser.id,
      },
    }),
    // One-time expenses
    prisma.expense.create({
      data: {
        date: utcDate(2026, 3, 20),
        amount: 1500,
        description: "Office equipment purchase",
        category: "equipment",
        recurrence: "none",
        vendor: "Office Depot",
        reference: "receipt-12345",
        organizationId: testOrg.id,
        createdById: adminUser.id,
      },
    }),
    prisma.expense.create({
      data: {
        date: utcDate(2026, 2, 15),
        amount: 250,
        description: "Team lunch",
        category: "meals",
        recurrence: "none",
        organizationId: testOrg.id,
        createdById: adminUser.id,
      },
    }),
  ]);

  console.log("✅ Seed data created successfully!");
  console.log(`
Testing Organization "${testOrg.id}" has been populated with:
  - 5 Clients (ABC Corp, XYZ Solutions, Global Industries, Tech Ventures, Retail Partners)
  - 3 Simple Products + 1 Composite Product
  - 6 Invoices (various statuses: draft, sent, paid, partially_paid, overdue)
  - 3 Suppliers with bills
  - 5 Employees (different salary periods: month, week, day)
  - 5 Salary Advances (various statuses: pending, paid, returned)
  - 5 Expenses (recurring and one-time)

Test Cases to Verify:
1. Invoicing:
   - Draft invoice should not appear in revenue
   - Sent/overdue invoices should show in AR
   - Paid invoice should show full revenue
   - Partially paid should show correct balance

2. Salary Advances:
   - Employee with pending advance (500) on Mar 1 should show deduction in Mar 27 view
   - Employee with paid advance (800) on Feb 15 should show deduction in full month
   - Advance taken mid-period should be spread over remaining days, not full month

3. Reports:
   - P&L for Mar 27 only with Alice's advance (Mar 1) should show salary reduction
   - Comprehensive report should match P&L calculations
   - Balance sheet should show correct AR and inventory values

4. Recurring Expenses:
   - Monthly rent (500/month) should vary based on date range
   - Weekly maintenance should calculate correctly for partial weeks

5. Bill Management:
   - Partially paid bill should show correct balance
   - Bill payments should appear in reports
  `);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
