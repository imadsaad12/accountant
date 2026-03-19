import { describe, it, expect, vi, beforeEach } from "vitest";
import { adminSession, employeeSession, viewOnlySession, makeReq, sampleProduct, ORG_ID } from "../helpers";

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

import { GET, POST } from "@/app/api/products/route";
import { GET as GET_ONE, PUT, DELETE } from "@/app/api/products/[id]/route";

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("Products / Stock API", () => {
  beforeEach(() => vi.clearAllMocks());

  // ─── GET ────────────────────────────────────────────────────────────────
  describe("GET /api/products", () => {
    it("returns 401 when unauthenticated", async () => {
      mockSession.mockResolvedValueOnce(null);
      const res = await GET();
      expect(res.status).toBe(401);
    });

    it("returns 403 when no view permission", async () => {
      mockSession.mockResolvedValueOnce(employeeSession());
      const res = await GET();
      expect(res.status).toBe(403);
    });

    it("returns product list scoped to org", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.product.findMany.mockResolvedValueOnce([sampleProduct]);
      const res = await GET();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data[0].sku).toBe("TEST-001");
    });

    it("applies organizationId filter in query", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.product.findMany.mockResolvedValueOnce([]);
      await GET();
      expect(prismaMock.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: ORG_ID }) })
      );
    });
  });

  // ─── POST ───────────────────────────────────────────────────────────────
  describe("POST /api/products", () => {
    it("returns 401 when unauthenticated", async () => {
      mockSession.mockResolvedValueOnce(null);
      const res = await POST(makeReq({ name: "X" }) as never);
      expect(res.status).toBe(401);
    });

    it("returns 403 for view-only employee", async () => {
      mockSession.mockResolvedValueOnce(viewOnlySession("products"));
      const res = await POST(makeReq({ name: "X" }) as never);
      expect(res.status).toBe(403);
    });

    it("creates product and returns 201", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.product.create.mockResolvedValueOnce(sampleProduct);
      const res = await POST(makeReq({
        name: "Test Product", sku: "TEST-001", price: 99.99,
        quantity: 10, minStock: 5, unit: "piece",
      }) as never);
      expect(res.status).toBe(201);
    });

    it("forces organizationId from session (ignores body value)", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.product.create.mockResolvedValueOnce(sampleProduct);
      await POST(makeReq({ name: "X", sku: "Y", organizationId: "evil-org" }) as never);
      expect(prismaMock.product.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ organizationId: ORG_ID }) })
      );
    });

    it("logs audit on creation", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.product.create.mockResolvedValueOnce(sampleProduct);
      await POST(makeReq({ name: "P", sku: "P-001" }) as never);
      expect(mockLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: "create", entity: "product" })
      );
    });

    it("accepts price as a float (normal case)", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.product.create.mockResolvedValueOnce({ ...sampleProduct, price: 49.99 });
      const res = await POST(makeReq({ name: "P", sku: "S", price: 49.99 }) as never);
      expect(res.status).toBe(201);
    });

    it("passes string price to Prisma as-is (DB will coerce or error – known behavior)", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.product.create.mockResolvedValueOnce(sampleProduct);
      await POST(makeReq({ name: "P", sku: "S", price: "not-a-number" }) as never);
      // Route does NOT validate price type – Prisma/DB handles it
      const callArg = prismaMock.product.create.mock.calls[0][0];
      expect(callArg.data.price).toBe("not-a-number");
    });

    it("accepts quantity=0 (valid: out of stock)", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.product.create.mockResolvedValueOnce({ ...sampleProduct, quantity: 0 });
      const res = await POST(makeReq({ name: "P", sku: "S", quantity: 0 }) as never);
      expect(res.status).toBe(201);
    });

    it("accepts negative quantity (no current validation – potential bug)", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.product.create.mockResolvedValueOnce({ ...sampleProduct, quantity: -5 });
      const res = await POST(makeReq({ name: "P", sku: "S", quantity: -5 }) as never);
      // Should ideally return 400, but currently returns 201 – documented behavior
      expect(res.status).toBe(201);
    });
  });

  // ─── PUT ────────────────────────────────────────────────────────────────
  describe("PUT /api/products/[id]", () => {
    it("returns 404 for cross-org access", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.product.findFirst.mockResolvedValueOnce(null);
      const res = await PUT(makeReq({ price: 10 }) as never, params("other-org-product"));
      expect(res.status).toBe(404);
    });

    it("updates product and returns 200", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.product.findFirst.mockResolvedValueOnce(sampleProduct);
      prismaMock.product.update.mockResolvedValueOnce({ ...sampleProduct, price: 199 });
      const res = await PUT(makeReq({ price: 199 }) as never, params("product-1"));
      expect(res.status).toBe(200);
    });

    it("logs audit on update", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.product.findFirst.mockResolvedValueOnce(sampleProduct);
      prismaMock.product.update.mockResolvedValueOnce(sampleProduct);
      await PUT(makeReq({ price: 200 }) as never, params("p1"));
      expect(mockLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: "update", entity: "product" })
      );
    });
  });

  // ─── DELETE ─────────────────────────────────────────────────────────────
  describe("DELETE /api/products/[id]", () => {
    it("returns 403 for view-only", async () => {
      mockSession.mockResolvedValueOnce(viewOnlySession("products"));
      const res = await DELETE(makeReq() as never, params("p1"));
      expect(res.status).toBe(403);
    });

    it("returns 404 when product not in org", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.product.findFirst.mockResolvedValueOnce(null);
      const res = await DELETE(makeReq() as never, params("bad-id"));
      expect(res.status).toBe(404);
    });

    it("deletes and returns success", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.product.findFirst.mockResolvedValueOnce(sampleProduct);
      prismaMock.product.delete.mockResolvedValueOnce(sampleProduct);
      const res = await DELETE(makeReq() as never, params("product-1"));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });
});
