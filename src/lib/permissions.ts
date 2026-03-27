export type Feature = "dashboard" | "clients" | "suppliers" | "products" | "employees" | "invoices" | "ai" | "activity_log" | "tax" | "settings" | "expenses" | "reports" | "salary_advances";

export interface Permission {
  view: boolean;
  edit: boolean;
}

export type Permissions = Record<Feature, Permission>;

export const ALL_FEATURES: Feature[] = ["dashboard", "clients", "suppliers", "products", "employees", "invoices", "expenses", "salary_advances", "reports", "ai", "activity_log", "tax", "settings"];

export const FEATURE_LABELS: Record<Feature, string> = {
  dashboard: "Dashboard",
  clients: "Clients",
  suppliers: "Suppliers",
  products: "Stock / Products",
  employees: "Employees",
  invoices: "Invoices",
  expenses: "Expenses",
  salary_advances: "Salary Advances",
  reports: "Financial Reports",
  ai: "AI Assistant",
  activity_log: "Activity Log",
  tax: "Tax",
  settings: "Edit Org Settings",
};

export const DEFAULT_ADMIN_PERMISSIONS: Permissions = {
  dashboard: { view: true, edit: true },
  clients: { view: true, edit: true },
  suppliers: { view: true, edit: true },
  products: { view: true, edit: true },
  employees: { view: true, edit: true },
  invoices: { view: true, edit: true },
  expenses: { view: true, edit: true },
  salary_advances: { view: true, edit: true },
  reports: { view: true, edit: true },
  ai: { view: true, edit: true },
  activity_log: { view: true, edit: true },
  tax: { view: true, edit: true },
  settings: { view: true, edit: true },
};

export const DEFAULT_EMPLOYEE_PERMISSIONS: Permissions = {
  dashboard: { view: true, edit: false },
  clients: { view: false, edit: false },
  suppliers: { view: false, edit: false },
  products: { view: false, edit: false },
  employees: { view: false, edit: false },
  invoices: { view: false, edit: false },
  expenses: { view: false, edit: false },
  salary_advances: { view: false, edit: false },
  reports: { view: false, edit: false },
  ai: { view: false, edit: false },
  activity_log: { view: false, edit: false },
  tax: { view: false, edit: false },
  settings: { view: false, edit: false },
};

export function parsePermissions(json: string | null | undefined): Permissions {
  if (!json) return DEFAULT_EMPLOYEE_PERMISSIONS;
  try {
    const parsed = JSON.parse(json) as Partial<Permissions>;
    // Fill any missing feature with default (handles users created before suppliers was added)
    return { ...DEFAULT_EMPLOYEE_PERMISSIONS, ...parsed };
  } catch {
    return DEFAULT_EMPLOYEE_PERMISSIONS;
  }
}

export function canView(permissions: Permissions, feature: Feature): boolean {
  return permissions[feature]?.view === true || permissions[feature]?.edit === true;
}

export function canEdit(permissions: Permissions, feature: Feature): boolean {
  return permissions[feature]?.edit === true;
}
