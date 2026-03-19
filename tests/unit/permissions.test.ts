import { describe, it, expect } from "vitest";
import {
  canView,
  canEdit,
  parsePermissions,
  DEFAULT_ADMIN_PERMISSIONS,
  DEFAULT_EMPLOYEE_PERMISSIONS,
  ALL_FEATURES,
  type Permissions,
} from "@/lib/permissions";

describe("Permissions – pure functions", () => {
  // ─── DEFAULT_ADMIN_PERMISSIONS ──────────────────────────────────────────
  describe("DEFAULT_ADMIN_PERMISSIONS", () => {
    it("contains every feature", () => {
      for (const f of ALL_FEATURES) {
        expect(DEFAULT_ADMIN_PERMISSIONS).toHaveProperty(f);
      }
    });

    it("grants view + edit on every feature", () => {
      for (const f of ALL_FEATURES) {
        expect(DEFAULT_ADMIN_PERMISSIONS[f].view).toBe(true);
        expect(DEFAULT_ADMIN_PERMISSIONS[f].edit).toBe(true);
      }
    });
  });

  // ─── DEFAULT_EMPLOYEE_PERMISSIONS ───────────────────────────────────────
  describe("DEFAULT_EMPLOYEE_PERMISSIONS", () => {
    it("denies edit on every feature", () => {
      for (const f of ALL_FEATURES) {
        expect(DEFAULT_EMPLOYEE_PERMISSIONS[f].edit).toBe(false);
      }
    });

    it("denies view on sensitive features (clients, products, employees, invoices, ai, activity_log)", () => {
      const restricted: (keyof Permissions)[] = ["clients", "products", "employees", "invoices", "ai", "activity_log"];
      for (const f of restricted) {
        expect(DEFAULT_EMPLOYEE_PERMISSIONS[f].view).toBe(false);
      }
    });

    it("allows view on dashboard", () => {
      expect(DEFAULT_EMPLOYEE_PERMISSIONS.dashboard.view).toBe(true);
    });
  });

  // ─── canView ────────────────────────────────────────────────────────────
  describe("canView()", () => {
    it("returns true when view=true", () => {
      const perms = { ...DEFAULT_EMPLOYEE_PERMISSIONS, clients: { view: true, edit: false } };
      expect(canView(perms, "clients")).toBe(true);
    });

    it("returns true when edit=true even if view=false (edit implies view)", () => {
      const perms = { ...DEFAULT_EMPLOYEE_PERMISSIONS, clients: { view: false, edit: true } };
      expect(canView(perms, "clients")).toBe(true);
    });

    it("returns false when view=false and edit=false", () => {
      expect(canView(DEFAULT_EMPLOYEE_PERMISSIONS, "invoices")).toBe(false);
    });

    it("returns true for admin permissions on every feature", () => {
      for (const f of ALL_FEATURES) {
        expect(canView(DEFAULT_ADMIN_PERMISSIONS, f)).toBe(true);
      }
    });
  });

  // ─── canEdit ────────────────────────────────────────────────────────────
  describe("canEdit()", () => {
    it("returns true when edit=true", () => {
      const perms = { ...DEFAULT_EMPLOYEE_PERMISSIONS, clients: { view: true, edit: true } };
      expect(canEdit(perms, "clients")).toBe(true);
    });

    it("returns false when edit=false", () => {
      const perms = { ...DEFAULT_EMPLOYEE_PERMISSIONS, clients: { view: true, edit: false } };
      expect(canEdit(perms, "clients")).toBe(false);
    });

    it("returns false for all features in DEFAULT_EMPLOYEE_PERMISSIONS", () => {
      for (const f of ALL_FEATURES) {
        expect(canEdit(DEFAULT_EMPLOYEE_PERMISSIONS, f)).toBe(false);
      }
    });

    it("returns true for all features in DEFAULT_ADMIN_PERMISSIONS", () => {
      for (const f of ALL_FEATURES) {
        expect(canEdit(DEFAULT_ADMIN_PERMISSIONS, f)).toBe(true);
      }
    });
  });

  // ─── parsePermissions ───────────────────────────────────────────────────
  describe("parsePermissions()", () => {
    it("parses valid JSON string", () => {
      const perms = DEFAULT_ADMIN_PERMISSIONS;
      const json = JSON.stringify(perms);
      expect(parsePermissions(json)).toEqual(perms);
    });

    it("returns DEFAULT_EMPLOYEE_PERMISSIONS for null", () => {
      expect(parsePermissions(null)).toEqual(DEFAULT_EMPLOYEE_PERMISSIONS);
    });

    it("returns DEFAULT_EMPLOYEE_PERMISSIONS for undefined", () => {
      expect(parsePermissions(undefined)).toEqual(DEFAULT_EMPLOYEE_PERMISSIONS);
    });

    it("returns DEFAULT_EMPLOYEE_PERMISSIONS for malformed JSON", () => {
      expect(parsePermissions("{not valid json}")).toEqual(DEFAULT_EMPLOYEE_PERMISSIONS);
    });

    it("returns DEFAULT_EMPLOYEE_PERMISSIONS for empty string", () => {
      expect(parsePermissions("")).toEqual(DEFAULT_EMPLOYEE_PERMISSIONS);
    });

    it("parses partial permissions (missing features fall through)", () => {
      const partial = JSON.stringify({ clients: { view: true, edit: true } });
      const result = parsePermissions(partial);
      expect(result.clients).toEqual({ view: true, edit: true });
    });
  });
});
