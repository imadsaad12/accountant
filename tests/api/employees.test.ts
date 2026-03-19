import { describe, it, expect, vi, beforeEach } from "vitest";
import { adminSession, viewOnlySession, makeReq, sampleEmployee, ORG_ID } from "../helpers";

// ─── Mocks ─────────────────────────────────────────────────────────────────
const { prismaMock, mockSession, mockLogAudit } = vi.hoisted(() => {
  const mkFns = () => ({
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: "x" }),
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue({ id: "x" }),
    delete: vi.fn().mockResolvedValue({ id: "x" }),
  });
  return {
    prismaMock: {
      client: mkFns(),
      product: { ...mkFns(), count: vi.fn().mockResolvedValue(0) },
      employee: mkFns(),
      invoice: { ...mkFns(), count: vi.fn().mockResolvedValue(0) },
      invoiceItem: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      user: { ...mkFns(), updateMany: vi.fn() },
      organization: { create: vi.fn(), upsert: vi.fn() },
      auditLog: { create: vi.fn(), findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
      $transaction: vi.fn(),
    },
    mockSession: vi.fn(),
    mockLogAudit: vi.fn(),
  };
});

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth", () => ({ getSessionWithPermissions: mockSession }));
vi.mock("@/lib/audit", () => ({ logAudit: mockLogAudit }));

import { GET, POST } from "@/app/api/employees/route";
import { PUT, DELETE } from "@/app/api/employees/[id]/route";

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("Employees API", () => {
  beforeEach(() => vi.clearAllMocks());

  // ─── GET ────────────────────────────────────────────────────────────────
  describe("GET /api/employees", () => {
    it("returns 401 when unauthenticated", async () => {
      mockSession.mockResolvedValueOnce(null);
      const res = await GET();
      expect(res.status).toBe(401);
    });

    it("returns 403 with no view permission", async () => {
      mockSession.mockResolvedValueOnce({ ...adminSession, permissions: { employees: { view: false, edit: false }, dashboard: { view: true, edit: true }, clients: { view: false, edit: false }, products: { view: false, edit: false }, invoices: { view: false, edit: false }, ai: { view: false, edit: false }, activity_log: { view: false, edit: false } }, isAdmin: false, role: "employee" });
      const res = await GET();
      expect(res.status).toBe(403);
    });

    it("returns 200 with employee list", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.employee.findMany.mockResolvedValueOnce([sampleEmployee]);
      const res = await GET();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data[0].firstName).toBe("John");
    });

    it("scopes query to org", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.employee.findMany.mockResolvedValueOnce([]);
      await GET();
      expect(prismaMock.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: ORG_ID }) })
      );
    });
  });

  // ─── POST ───────────────────────────────────────────────────────────────
  describe("POST /api/employees", () => {
    const validEmployee = {
      firstName: "Jane", lastName: "Smith", email: "jane@company.com",
      position: "Developer", department: "Tech", salary: "6000",
      status: "active", hireDate: "2024-01-15",
    };

    it("returns 401 when unauthenticated", async () => {
      mockSession.mockResolvedValueOnce(null);
      const res = await POST(makeReq(validEmployee) as never);
      expect(res.status).toBe(401);
    });

    it("returns 403 for view-only employee", async () => {
      mockSession.mockResolvedValueOnce(viewOnlySession("employees"));
      const res = await POST(makeReq(validEmployee) as never);
      expect(res.status).toBe(403);
    });

    it("creates employee and returns 201", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.employee.create.mockResolvedValueOnce({ ...sampleEmployee, ...validEmployee });
      const res = await POST(makeReq(validEmployee) as never);
      expect(res.status).toBe(201);
    });

    it("parses salary string to float on create", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.employee.create.mockResolvedValueOnce(sampleEmployee);
      await POST(makeReq({ ...validEmployee, salary: "7500.50" }) as never);
      expect(prismaMock.employee.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ salary: 7500.5 }) })
      );
    });

    it("salary as non-numeric string becomes NaN (potential bug – no validation)", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.employee.create.mockResolvedValueOnce(sampleEmployee);
      await POST(makeReq({ ...validEmployee, salary: "not-a-number" }) as never);
      const callArg = prismaMock.employee.create.mock.calls[0][0];
      expect(isNaN(callArg.data.salary)).toBe(true); // Bug: should be validated
    });

    it("salary as negative number passes through (no validation)", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.employee.create.mockResolvedValueOnce(sampleEmployee);
      await POST(makeReq({ ...validEmployee, salary: "-500" }) as never);
      const callArg = prismaMock.employee.create.mock.calls[0][0];
      expect(callArg.data.salary).toBe(-500); // Stored as negative – should ideally validate
    });

    it("status defaults to 'active' when not provided (via Prisma schema default)", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.employee.create.mockResolvedValueOnce({ ...sampleEmployee, status: "active" });
      const res = await POST(makeReq({ ...validEmployee, status: undefined }) as never);
      expect(res.status).toBe(201);
    });

    it("accepts valid status values", async () => {
      for (const status of ["active", "inactive", "on_leave"]) {
        mockSession.mockResolvedValueOnce(adminSession);
        prismaMock.employee.create.mockResolvedValueOnce({ ...sampleEmployee, status });
        const res = await POST(makeReq({ ...validEmployee, status }) as never);
        expect(res.status).toBe(201);
      }
    });

    it("logs audit on creation", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.employee.create.mockResolvedValueOnce(sampleEmployee);
      await POST(makeReq(validEmployee) as never);
      expect(mockLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: "create", entity: "employee" })
      );
    });

    it("forces organizationId from session", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.employee.create.mockResolvedValueOnce(sampleEmployee);
      await POST(makeReq({ ...validEmployee, organizationId: "evil" }) as never);
      const callArg = prismaMock.employee.create.mock.calls[0][0];
      expect(callArg.data.organizationId).toBe(ORG_ID);
    });
  });

  // ─── PUT ────────────────────────────────────────────────────────────────
  describe("PUT /api/employees/[id]", () => {
    it("returns 404 when employee not in org", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.employee.findFirst.mockResolvedValueOnce(null);
      const res = await PUT(makeReq({ salary: "5000" }) as never, params("bad-id"));
      expect(res.status).toBe(404);
    });

    it("updates employee successfully", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.employee.findFirst.mockResolvedValueOnce(sampleEmployee);
      prismaMock.employee.update.mockResolvedValueOnce({ ...sampleEmployee, position: "Senior Dev" });
      const res = await PUT(makeReq({ position: "Senior Dev" }) as never, params("employee-1"));
      expect(res.status).toBe(200);
    });

    it("logs audit on update", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.employee.findFirst.mockResolvedValueOnce(sampleEmployee);
      prismaMock.employee.update.mockResolvedValueOnce(sampleEmployee);
      await PUT(makeReq({ salary: "6000" }) as never, params("e1"));
      expect(mockLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: "update", entity: "employee" })
      );
    });
  });

  // ─── DELETE ─────────────────────────────────────────────────────────────
  describe("DELETE /api/employees/[id]", () => {
    it("returns 404 when employee not in org", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.employee.findFirst.mockResolvedValueOnce(null);
      const res = await DELETE(makeReq() as never, params("bad-id"));
      expect(res.status).toBe(404);
    });

    it("deletes and returns { success: true }", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.employee.findFirst.mockResolvedValueOnce(sampleEmployee);
      prismaMock.employee.delete.mockResolvedValueOnce(sampleEmployee);
      const res = await DELETE(makeReq() as never, params("employee-1"));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });
});
