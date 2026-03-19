import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const ORG_ID = "cmmv1p3wr0001imlb8ra5rzx8";

const ALL_PERMISSIONS = {
  dashboard: { view: true, edit: true },
  clients: { view: true, edit: true },
  products: { view: true, edit: true },
  employees: { view: true, edit: true },
  invoices: { view: true, edit: true },
  ai: { view: true, edit: true },
  activity_log: { view: true, edit: true },
};

async function main() {
  // Admin user
  const existingAdmin = await prisma.user.findFirst({ where: { organizationId: ORG_ID, role: "admin" } });
  if (!existingAdmin) {
    const pw = await bcrypt.hash("monty123", 12);
    await prisma.user.create({
      data: {
        email: "admin@monty.com",
        password: pw,
        name: "Monty Admin",
        role: "admin",
        permissions: JSON.stringify(ALL_PERMISSIONS),
        organizationId: ORG_ID,
      },
    });
    console.log("Created admin: admin@monty.com / monty123");
  } else {
    console.log("Admin exists:", existingAdmin.email);
  }

  // Categories
  const catNames = ["Hardware", "Software", "Consulting", "Training", "Maintenance"];
  const cats = await Promise.all(catNames.map(name =>
    prisma.category.upsert({
      where: { name_organizationId: { name, organizationId: ORG_ID } },
      update: {},
      create: { name, organizationId: ORG_ID },
    })
  ));
  console.log("Created", cats.length, "categories");

  // Clients
  const clientsData = [
    { name: "Banque du Liban", email: "info@bdl.gov.lb", phone: "+961 1 750 000", address: "Hamra St", city: "Beirut", country: "Lebanon", taxId: "LB-001" },
    { name: "Alfa Telecom", email: "corp@alfa.com.lb", phone: "+961 1 900 000", address: "Zalka", city: "Beirut", country: "Lebanon", taxId: "LB-002" },
    { name: "Spinneys Lebanon", email: "finance@spinneys.lb", phone: "+961 4 712 000", address: "Dbayeh", city: "Beirut", country: "Lebanon", taxId: "LB-003" },
    { name: "Fattal Group", email: "info@fattal.com", phone: "+961 1 480 000", address: "Achrafieh", city: "Beirut", country: "Lebanon", taxId: "LB-004" },
    { name: "SGBL", email: "contact@sgbl.com.lb", phone: "+961 1 608 000", address: "Hamra", city: "Beirut", country: "Lebanon", taxId: "LB-005" },
    { name: "Libnor", email: "info@libnor.gov.lb", phone: "+961 1 455 600", address: "Badaro", city: "Beirut", country: "Lebanon" },
  ];
  const clients = await Promise.all(clientsData.map(d =>
    prisma.client.create({ data: { ...d, organizationId: ORG_ID } })
  ));
  console.log("Created", clients.length, "clients");

  // Products
  const productsData = [
    { name: "Server Rack Unit", sku: "HW-001", description: "1U rack server Intel Xeon", price: 3200, cost: 2400, quantity: 8, minStock: 2, unit: "piece", categoryId: cats[0].id },
    { name: "Network Switch 48P", sku: "HW-002", description: "Cisco 48-port managed switch", price: 1850, cost: 1300, quantity: 14, minStock: 3, unit: "piece", categoryId: cats[0].id },
    { name: "UPS 3000VA", sku: "HW-003", description: "APC UPS 3000VA rack mount", price: 750, cost: 500, quantity: 6, minStock: 2, unit: "piece", categoryId: cats[0].id },
    { name: "ERP License", sku: "SW-001", description: "Annual ERP enterprise license", price: 4800, cost: 3200, quantity: 50, minStock: 5, unit: "piece", categoryId: cats[1].id },
    { name: "Antivirus Suite", sku: "SW-002", description: "Kaspersky Business per endpoint/year", price: 45, cost: 28, quantity: 200, minStock: 20, unit: "piece", categoryId: cats[1].id },
    { name: "Backup Solution", sku: "SW-003", description: "Veeam Backup Business annual", price: 1200, cost: 800, quantity: 30, minStock: 5, unit: "piece", categoryId: cats[1].id },
    { name: "IT Audit", sku: "CON-001", description: "Full infrastructure audit per day", price: 900, cost: 0, quantity: 999, minStock: 0, unit: "day", categoryId: cats[2].id },
    { name: "System Integration", sku: "CON-002", description: "Custom integration per hour", price: 180, cost: 0, quantity: 999, minStock: 0, unit: "hour", categoryId: cats[2].id },
    { name: "Security Training", sku: "TRN-001", description: "Cybersecurity awareness per session", price: 600, cost: 150, quantity: 999, minStock: 0, unit: "session", categoryId: cats[3].id },
    { name: "Preventive Maintenance", sku: "MNT-001", description: "Quarterly server maintenance visit", price: 350, cost: 80, quantity: 999, minStock: 0, unit: "visit", categoryId: cats[4].id },
  ];
  const products = await Promise.all(productsData.map(d =>
    prisma.product.create({ data: { ...d, organizationId: ORG_ID } })
  ));
  console.log("Created", products.length, "products");

  // Employees
  const employeesData = [
    { firstName: "Karim", lastName: "Mansour", email: "k.mansour@monty.com", phone: "+961 70 123 456", position: "CEO", department: "Executive", salary: 9000, status: "active" },
    { firstName: "Nadia", lastName: "Haddad", email: "n.haddad@monty.com", phone: "+961 71 234 567", position: "CFO", department: "Finance", salary: 7500, status: "active" },
    { firstName: "Elie", lastName: "Khoury", email: "e.khoury@monty.com", phone: "+961 76 345 678", position: "CTO", department: "Technology", salary: 8000, status: "active" },
    { firstName: "Rima", lastName: "Saad", email: "r.saad@monty.com", phone: "+961 78 456 789", position: "Sales Manager", department: "Sales", salary: 5500, status: "active" },
    { firstName: "Tarek", lastName: "Nassar", email: "t.nassar@monty.com", phone: "+961 79 567 890", position: "Senior Developer", department: "Technology", salary: 6500, status: "active" },
    { firstName: "Lara", lastName: "Abi Nader", email: "l.abinader@monty.com", phone: "+961 70 678 901", position: "HR Manager", department: "HR", salary: 5000, status: "active" },
    { firstName: "Georges", lastName: "Frem", email: "g.frem@monty.com", phone: "+961 71 789 012", position: "Network Engineer", department: "Technology", salary: 5800, status: "active" },
    { firstName: "Maya", lastName: "Chamoun", email: "m.chamoun@monty.com", phone: "+961 76 890 123", position: "Accountant", department: "Finance", salary: 4500, status: "active" },
    { firstName: "Jad", lastName: "Rahme", email: "j.rahme@monty.com", phone: "+961 78 901 234", position: "Support Engineer", department: "Support", salary: 3800, status: "on_leave" },
  ];
  await Promise.all(employeesData.map(d =>
    prisma.employee.create({
      data: {
        ...d,
        organizationId: ORG_ID,
        hireDate: new Date(2021 + Math.floor(Math.random() * 4), Math.floor(Math.random() * 12), 1 + Math.floor(Math.random() * 28)),
      },
    })
  ));
  console.log("Created", employeesData.length, "employees");

  // Invoices
  const invDefs = [
    { ci: 0, status: "paid",    daysAgo: 60, items: [{ pi: 0, qty: 2 }, { pi: 6, qty: 3 }] },
    { ci: 1, status: "paid",    daysAgo: 45, items: [{ pi: 3, qty: 5 }, { pi: 4, qty: 20 }] },
    { ci: 2, status: "sent",    daysAgo: 20, items: [{ pi: 1, qty: 3 }, { pi: 9, qty: 4 }] },
    { ci: 3, status: "paid",    daysAgo: 30, items: [{ pi: 5, qty: 10 }, { pi: 8, qty: 2 }] },
    { ci: 4, status: "overdue", daysAgo: 55, items: [{ pi: 7, qty: 20 }, { pi: 2, qty: 2 }] },
    { ci: 5, status: "draft",   daysAgo: 3,  items: [{ pi: 6, qty: 5 }, { pi: 9, qty: 8 }] },
    { ci: 0, status: "paid",    daysAgo: 90, items: [{ pi: 3, qty: 3 }, { pi: 4, qty: 50 }] },
    { ci: 2, status: "sent",    daysAgo: 10, items: [{ pi: 0, qty: 1 }, { pi: 7, qty: 8 }] },
    { ci: 1, status: "paid",    daysAgo: 75, items: [{ pi: 5, qty: 5 }, { pi: 8, qty: 3 }] },
    { ci: 3, status: "draft",   daysAgo: 1,  items: [{ pi: 1, qty: 2 }, { pi: 2, qty: 3 }] },
  ];

  let count = 0;
  for (const inv of invDefs) {
    count++;
    const date = new Date();
    date.setDate(date.getDate() - inv.daysAgo);
    const due = new Date(date);
    due.setDate(due.getDate() + 30);
    const items = inv.items.map(({ pi, qty }) => ({
      description: products[pi].name,
      quantity: qty,
      unitPrice: products[pi].price,
      total: qty * products[pi].price,
      productId: products[pi].id,
    }));
    const sub = items.reduce((s, i) => s + i.total, 0);
    const tax = sub * 0.11;
    await prisma.invoice.create({
      data: {
        number: `MONTY-${String(count).padStart(4, "0")}`,
        clientId: clients[inv.ci].id,
        organizationId: ORG_ID,
        date, dueDate: due,
        status: inv.status,
        subtotal: sub, tax, taxRate: 11, total: sub + tax,
        language: "fr",
        items: { create: items },
      },
    });
  }
  console.log("Created", count, "invoices");
  console.log("\nDone! Login: admin@monty.com / monty123");
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
