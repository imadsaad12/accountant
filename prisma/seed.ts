import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

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
  console.log("Seeding database...");

  // Create organization
  const org = await prisma.organization.upsert({
    where: { id: "seed-org-001" },
    update: { name: "Demo Company" },
    create: { id: "seed-org-001", name: "Demo Company" },
  });
  console.log("Created organization:", org.name);

  // Create admin user
  const password = await bcrypt.hash("admin123", 12);
  const user = await prisma.user.upsert({
    where: { email: "admin@accountant.com" },
    update: { role: "admin", permissions: JSON.stringify(ALL_PERMISSIONS), organizationId: org.id },
    create: {
      email: "admin@accountant.com",
      password,
      name: "Admin User",
      role: "admin",
      permissions: JSON.stringify(ALL_PERMISSIONS),
      organizationId: org.id,
    },
  });
  console.log("Created user:", user.email);

  // Create categories
  const categoryNames = ["Electronics", "Office Supplies", "Furniture", "Software", "Services"];
  const categories = await Promise.all(
    categoryNames.map((name) =>
      prisma.category.upsert({
        where: { name_organizationId: { name, organizationId: org.id } },
        update: {},
        create: { name, organizationId: org.id },
      })
    )
  );
  console.log("Created", categories.length, "categories");

  // Create clients
  const clientsData = [
    { name: "Acme Corporation", email: "contact@acme.com", phone: "+1 555-0100", address: "123 Business Ave", city: "New York", country: "USA", taxId: "US-12345678" },
    { name: "TechStart SAS", email: "info@techstart.fr", phone: "+33 1 23 45 67 89", address: "45 Rue de la Paix", city: "Paris", country: "France", taxId: "FR-87654321" },
    { name: "Al Noor Trading", email: "info@alnoor.sa", phone: "+966 11 234 5678", address: "King Fahd Road", city: "Riyadh", country: "Saudi Arabia", taxId: "SA-11223344" },
    { name: "Global Dynamics Ltd", email: "hello@globaldyn.co.uk", phone: "+44 20 7946 0958", address: "10 Downing Street", city: "London", country: "UK", taxId: "GB-99887766" },
    { name: "Sakura Industries", email: "contact@sakura.jp", phone: "+81 3-1234-5678", address: "1-1 Marunouchi", city: "Tokyo", country: "Japan", taxId: "JP-55667788" },
    { name: "Mediterranean Foods", email: "orders@medfood.it", phone: "+39 06 1234 5678", address: "Via Roma 25", city: "Rome", country: "Italy", taxId: "IT-33445566" },
    { name: "Nordic Solutions AB", email: "support@nordic.se", phone: "+46 8 123 456", address: "Kungsgatan 10", city: "Stockholm", country: "Sweden", taxId: "SE-77889900" },
    { name: "Desert Tech LLC", email: "sales@deserttech.ae", phone: "+971 4 567 8901", address: "Dubai Marina Tower", city: "Dubai", country: "UAE", taxId: "AE-44556677" },
  ];

  const clients = await Promise.all(
    clientsData.map((data) => prisma.client.create({ data: { ...data, organizationId: org.id } }))
  );
  console.log("Created", clients.length, "clients");

  // Create products
  const productsData = [
    { name: 'MacBook Pro 16"', sku: "ELEC-001", description: "Apple MacBook Pro 16-inch M3 Pro", price: 2499.99, cost: 2100.0, quantity: 15, minStock: 5, unit: "piece", categoryId: categories[0].id },
    { name: 'Dell Monitor 27"', sku: "ELEC-002", description: "Dell UltraSharp 27 4K USB-C Monitor", price: 549.99, cost: 380.0, quantity: 22, minStock: 8, unit: "piece", categoryId: categories[0].id },
    { name: "Logitech MX Master 3S", sku: "ELEC-003", description: "Wireless mouse with ergonomic design", price: 99.99, cost: 65.0, quantity: 45, minStock: 10, unit: "piece", categoryId: categories[0].id },
    { name: "Mechanical Keyboard", sku: "ELEC-004", description: "Keychron K2 Pro Wireless Mechanical", price: 89.99, cost: 55.0, quantity: 30, minStock: 10, unit: "piece", categoryId: categories[0].id },
    { name: "A4 Paper (Box)", sku: "OFF-001", description: "Premium A4 copy paper, 5000 sheets", price: 45.99, cost: 28.0, quantity: 3, minStock: 10, unit: "box", categoryId: categories[1].id },
    { name: "Ink Cartridge Set", sku: "OFF-002", description: "HP 63XL Black & Color combo pack", price: 65.99, cost: 42.0, quantity: 18, minStock: 5, unit: "piece", categoryId: categories[1].id },
    { name: "Whiteboard Markers", sku: "OFF-003", description: "Expo dry erase markers, 12 pack", price: 14.99, cost: 8.0, quantity: 50, minStock: 15, unit: "box", categoryId: categories[1].id },
    { name: "Executive Desk", sku: "FURN-001", description: "L-shaped executive desk, walnut finish", price: 899.99, cost: 520.0, quantity: 4, minStock: 2, unit: "piece", categoryId: categories[2].id },
    { name: "Ergonomic Chair", sku: "FURN-002", description: "Herman Miller Aeron chair", price: 1395.0, cost: 950.0, quantity: 8, minStock: 3, unit: "piece", categoryId: categories[2].id },
    { name: "Filing Cabinet", sku: "FURN-003", description: "4-drawer vertical filing cabinet, steel", price: 299.99, cost: 180.0, quantity: 12, minStock: 4, unit: "piece", categoryId: categories[2].id },
    { name: "Microsoft 365 License", sku: "SOFT-001", description: "Annual business subscription per user", price: 264.0, cost: 200.0, quantity: 100, minStock: 20, unit: "piece", categoryId: categories[3].id },
    { name: "Adobe Creative Cloud", sku: "SOFT-002", description: "Annual all-apps license", price: 659.88, cost: 500.0, quantity: 25, minStock: 5, unit: "piece", categoryId: categories[3].id },
    { name: "IT Consultation", sku: "SERV-001", description: "Hourly IT consultation service", price: 150.0, cost: 0, quantity: 999, minStock: 0, unit: "piece", categoryId: categories[4].id },
    { name: "Web Development", sku: "SERV-002", description: "Custom web development per hour", price: 120.0, cost: 0, quantity: 999, minStock: 0, unit: "piece", categoryId: categories[4].id },
    { name: "USB-C Hub", sku: "ELEC-005", description: "Anker 7-in-1 USB-C Hub", price: 35.99, cost: 18.0, quantity: 2, minStock: 10, unit: "piece", categoryId: categories[0].id },
  ];

  const products = await Promise.all(
    productsData.map((data) => prisma.product.create({ data: { ...data, organizationId: org.id } }))
  );
  console.log("Created", products.length, "products");

  // Create employees
  const employeesData = [
    { firstName: "Sarah", lastName: "Johnson", email: "sarah.johnson@company.com", phone: "+1 555-0201", position: "CEO", department: "Executive", salary: 12000, status: "active" },
    { firstName: "Mohamed", lastName: "Al-Rashid", email: "m.alrashid@company.com", phone: "+1 555-0202", position: "CFO", department: "Finance", salary: 10000, status: "active" },
    { firstName: "Pierre", lastName: "Dubois", email: "p.dubois@company.com", phone: "+33 6 12 34 56 78", position: "CTO", department: "Technology", salary: 10500, status: "active" },
    { firstName: "Emily", lastName: "Chen", email: "e.chen@company.com", phone: "+1 555-0204", position: "Senior Developer", department: "Technology", salary: 8500, status: "active" },
    { firstName: "Omar", lastName: "Benali", email: "o.benali@company.com", phone: "+212 6 12 34 56 78", position: "Sales Manager", department: "Sales", salary: 7000, status: "active" },
    { firstName: "Fatima", lastName: "Zahra", email: "f.zahra@company.com", phone: "+966 5 1234 5678", position: "Accountant", department: "Finance", salary: 6000, status: "active" },
    { firstName: "James", lastName: "Wilson", email: "j.wilson@company.com", phone: "+44 7700 900123", position: "Marketing Lead", department: "Marketing", salary: 7500, status: "active" },
    { firstName: "Yuki", lastName: "Tanaka", email: "y.tanaka@company.com", phone: "+81 90-1234-5678", position: "UI/UX Designer", department: "Design", salary: 7000, status: "active" },
    { firstName: "Ahmed", lastName: "Hassan", email: "a.hassan@company.com", phone: "+20 10 1234 5678", position: "Support Lead", department: "Support", salary: 5500, status: "on_leave" },
    { firstName: "Maria", lastName: "Garcia", email: "m.garcia@company.com", phone: "+34 612 345 678", position: "HR Manager", department: "Human Resources", salary: 6500, status: "active" },
    { firstName: "David", lastName: "Kim", email: "d.kim@company.com", phone: "+82 10-1234-5678", position: "QA Engineer", department: "Technology", salary: 6000, status: "active" },
    { firstName: "Layla", lastName: "Ibrahim", email: "l.ibrahim@company.com", phone: "+971 50 123 4567", position: "Junior Developer", department: "Technology", salary: 4500, status: "inactive" },
  ];

  await Promise.all(
    employeesData.map((data) =>
      prisma.employee.create({
        data: {
          ...data,
          organizationId: org.id,
          hireDate: new Date(2023 + Math.floor(Math.random() * 3), Math.floor(Math.random() * 12), 1 + Math.floor(Math.random() * 28)),
        },
      })
    )
  );
  console.log("Created", employeesData.length, "employees");

  // Create invoices
  const invoicesData = [
    { clientIdx: 0, status: "paid", daysAgo: 45, taxRate: 19, language: "en", items: [{ pi: 0, qty: 3 }, { pi: 1, qty: 3 }, { pi: 2, qty: 5 }] },
    { clientIdx: 1, status: "paid", daysAgo: 38, taxRate: 20, language: "fr", items: [{ pi: 8, qty: 5 }, { pi: 10, qty: 10 }] },
    { clientIdx: 2, status: "sent", daysAgo: 20, taxRate: 15, language: "fr", items: [{ pi: 0, qty: 10 }, { pi: 3, qty: 10 }, { pi: 1, qty: 5 }] },
    { clientIdx: 3, status: "paid", daysAgo: 30, taxRate: 20, language: "en", items: [{ pi: 12, qty: 40 }, { pi: 13, qty: 20 }] },
    { clientIdx: 4, status: "sent", daysAgo: 12, taxRate: 10, language: "en", items: [{ pi: 7, qty: 2 }, { pi: 8, qty: 4 }, { pi: 9, qty: 3 }] },
    { clientIdx: 5, status: "draft", daysAgo: 5, taxRate: 22, language: "fr", items: [{ pi: 4, qty: 20 }, { pi: 5, qty: 10 }, { pi: 6, qty: 15 }] },
    { clientIdx: 6, status: "paid", daysAgo: 60, taxRate: 25, language: "en", items: [{ pi: 11, qty: 5 }, { pi: 10, qty: 15 }] },
    { clientIdx: 7, status: "overdue", daysAgo: 50, taxRate: 5, language: "en", items: [{ pi: 0, qty: 5 }, { pi: 8, qty: 3 }, { pi: 12, qty: 10 }] },
    { clientIdx: 0, status: "paid", daysAgo: 15, taxRate: 19, language: "en", items: [{ pi: 13, qty: 50 }] },
    { clientIdx: 2, status: "sent", daysAgo: 3, taxRate: 15, language: "fr", items: [{ pi: 7, qty: 1 }, { pi: 9, qty: 2 }] },
    { clientIdx: 1, status: "draft", daysAgo: 1, taxRate: 20, language: "fr", items: [{ pi: 3, qty: 15 }, { pi: 2, qty: 20 }, { pi: 14, qty: 10 }] },
    { clientIdx: 3, status: "paid", daysAgo: 70, taxRate: 20, language: "en", items: [{ pi: 0, qty: 2 }, { pi: 11, qty: 3 }] },
  ];

  let invoiceCount = 0;
  for (const inv of invoicesData) {
    invoiceCount++;
    const number = `INV-${String(invoiceCount).padStart(5, "0")}`;
    const date = new Date();
    date.setDate(date.getDate() - inv.daysAgo);
    const dueDate = new Date(date);
    dueDate.setDate(dueDate.getDate() + 30);

    const items = inv.items.map(({ pi, qty }) => ({
      description: products[pi].name,
      quantity: qty,
      unitPrice: products[pi].price,
      total: qty * products[pi].price,
      productId: products[pi].id,
    }));

    const subtotal = items.reduce((s, i) => s + i.total, 0);
    const tax = subtotal * (inv.taxRate / 100);

    await prisma.invoice.create({
      data: {
        number,
        clientId: clients[inv.clientIdx].id,
        organizationId: org.id,
        date,
        dueDate,
        status: inv.status,
        subtotal,
        tax,
        taxRate: inv.taxRate,
        total: subtotal + tax,
        language: inv.language,
        notes: inv.status === "overdue" ? "Payment overdue - please follow up" : null,
        items: { create: items },
      },
    });
  }
  console.log("Created", invoiceCount, "invoices");

  console.log("\nSeeding complete!");
  console.log("Login: admin@accountant.com / admin123");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
