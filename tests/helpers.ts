import { vi } from "vitest";
import type { Permissions } from "@/lib/permissions";
import { DEFAULT_ADMIN_PERMISSIONS, DEFAULT_EMPLOYEE_PERMISSIONS } from "@/lib/permissions";

// ─── Sessions ──────────────────────────────────────────────────────────────

export const ORG_ID = "test-org-id";
export const OTHER_ORG_ID = "other-org-id";

export const adminSession = {
  userId: "admin-user-id",
  email: "admin@test.com",
  name: "Admin User",
  role: "admin",
  organizationId: ORG_ID,
  permissions: DEFAULT_ADMIN_PERMISSIONS,
  isAdmin: true,
};

export function employeeSession(permissions: Partial<Permissions> = {}) {
  const perms = { ...DEFAULT_EMPLOYEE_PERMISSIONS, ...permissions } as Permissions;
  return {
    userId: "employee-user-id",
    email: "employee@test.com",
    name: "Employee User",
    role: "employee",
    organizationId: ORG_ID,
    permissions: perms,
    isAdmin: false,
  };
}

export function viewOnlySession(feature: keyof Permissions) {
  const perms = { ...DEFAULT_EMPLOYEE_PERMISSIONS } as Permissions;
  perms[feature] = { view: true, edit: false };
  return employeeSession(perms);
}

// ─── Request factory ───────────────────────────────────────────────────────

export function makeReq(body?: unknown, url = "http://localhost/api/test") {
  return {
    url,
    method: body !== undefined ? "POST" : "GET",
    nextUrl: new URL(url),
    json: async () => body ?? {},
  };
}

export function makeReqWithUrl(url: string) {
  return {
    url,
    method: "GET",
    nextUrl: new URL(url),
    json: async () => ({}),
  };
}

// ─── Prisma mock factory ───────────────────────────────────────────────────

export function makePrismaMock() {
  return {
    client: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "c1", name: "Test Client" }),
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({ id: "c1", name: "Updated" }),
      delete: vi.fn().mockResolvedValue({ id: "c1" }),
    },
    product: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "p1", name: "Test Product", sku: "SKU-001" }),
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({ id: "p1" }),
      delete: vi.fn().mockResolvedValue({ id: "p1" }),
    },
    employee: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "e1", firstName: "John", lastName: "Doe" }),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({ id: "e1" }),
      delete: vi.fn().mockResolvedValue({ id: "e1" }),
    },
    invoice: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({
        id: "inv1", number: "INV-00001", client: { name: "Client" }, total: 100,
      }),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({ id: "inv1" }),
      delete: vi.fn().mockResolvedValue({ id: "inv1" }),
      count: vi.fn().mockResolvedValue(0),
    },
    invoiceItem: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "u1", email: "new@test.com", role: "employee" }),
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({ id: "u1" }),
      delete: vi.fn().mockResolvedValue({ id: "u1" }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    organization: {
      create: vi.fn().mockResolvedValue({ id: ORG_ID, name: "Test Org" }),
      upsert: vi.fn(),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: "log1" }),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    category: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "cat1" }),
      upsert: vi.fn(),
    },
    $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) => fn({
      organization: { create: vi.fn().mockResolvedValue({ id: ORG_ID, name: "Test Org" }) },
      user: { create: vi.fn().mockResolvedValue({ id: "u1", email: "new@test.com", role: "admin", name: "Admin" }) },
    })),
  };
}

// ─── Sample data ───────────────────────────────────────────────────────────

export const sampleClient = {
  id: "client-1",
  name: "Acme Corp",
  email: "info@acme.com",
  phone: "+1 555-0100",
  address: "123 Main St",
  city: "New York",
  country: "USA",
  taxId: "US-123",
  organizationId: ORG_ID,
  _count: { invoices: 2 },
};

export const sampleProduct = {
  id: "product-1",
  name: "Test Product",
  sku: "TEST-001",
  price: 99.99,
  cost: 50.0,
  quantity: 100,
  minStock: 10,
  unit: "piece",
  organizationId: ORG_ID,
  category: null,
};

export const sampleEmployee = {
  id: "employee-1",
  firstName: "John",
  lastName: "Doe",
  email: "john@company.com",
  position: "Developer",
  department: "Tech",
  salary: 5000,
  status: "active",
  organizationId: ORG_ID,
};

export const sampleInvoice = {
  id: "invoice-1",
  number: "INV-00001",
  clientId: "client-1",
  client: { id: "client-1", name: "Acme Corp", email: "info@acme.com" },
  date: new Date("2026-01-15"),
  dueDate: new Date("2026-02-15"),
  status: "draft",
  subtotal: 1000,
  tax: 190,
  taxRate: 19,
  total: 1190,
  language: "fr",
  organizationId: ORG_ID,
  items: [],
};
