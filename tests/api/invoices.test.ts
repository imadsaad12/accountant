import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  adminSession, viewOnlySession, makeReq, makeReqWithUrl,
  sampleClient, sampleProduct, sampleInvoice, ORG_ID,
} from "../helpers";

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

import { GET, POST } from "@/app/api/invoices/route";
import { GET as GET_ONE, PUT, DELETE } from "@/app/api/invoices/[id]/route";

const params = (id: string) => ({ params: Promise.resolve({ id }) });

const baseInvoiceBody = {
  clientId: "client-1",
  date: "2026-01-15",
  dueDate: "2026-02-15",
  taxRate: 19,
  language: "fr",
  notes: "",
  status: "draft",
  items: [
    { description: "Item A", quantity: 2, unitPrice: 100, productId: "product-1" },
    { description: "Item B", quantity: 1, unitPrice: 50 },
  ],
};

describe("Invoices API", () => {
  beforeEach(() => vi.resetAllMocks());

  // ─── GET /api/invoices ──────────────────────────────────────────────────
  describe("GET /api/invoices", () => {
    it("returns 401 when unauthenticated", async () => {
      mockSession.mockResolvedValueOnce(null);
      const res = await GET(makeReqWithUrl("http://localhost/api/invoices") as never);
      expect(res.status).toBe(401);
    });

    it("returns 403 with no view permission", async () => {
      mockSession.mockResolvedValueOnce(viewOnlySession("clients")); // has clients view but not invoices
      const res = await GET(makeReqWithUrl("http://localhost/api/invoices") as never);
      expect(res.status).toBe(403);
    });

    it("returns invoice list for admin", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.invoice.findMany.mockResolvedValueOnce([sampleInvoice]);
      const res = await GET(makeReqWithUrl("http://localhost/api/invoices") as never);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveLength(1);
    });

    it("filters by status query param", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.invoice.findMany.mockResolvedValueOnce([]);
      await GET(makeReqWithUrl("http://localhost/api/invoices?status=paid") as never);
      expect(prismaMock.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: "paid" }) })
      );
    });

    it("filters by date range (from/to)", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.invoice.findMany.mockResolvedValueOnce([]);
      await GET(makeReqWithUrl("http://localhost/api/invoices?from=2026-01-01&to=2026-01-31") as never);
      const call = prismaMock.invoice.findMany.mock.calls[0][0];
      expect(call.where.date).toBeDefined();
      expect(call.where.date.gte).toBeInstanceOf(Date);
      expect(call.where.date.lte).toBeInstanceOf(Date);
    });

    it("filters by clientId", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.invoice.findMany.mockResolvedValueOnce([]);
      await GET(makeReqWithUrl("http://localhost/api/invoices?clientId=client-1") as never);
      const call = prismaMock.invoice.findMany.mock.calls[0][0];
      expect(call.where.clientId).toBe("client-1");
    });
  });

  // ─── POST /api/invoices ─────────────────────────────────────────────────
  describe("POST /api/invoices – totals calculation", () => {
    it("returns 401 when unauthenticated", async () => {
      mockSession.mockResolvedValueOnce(null);
      const res = await POST(makeReq(baseInvoiceBody) as never);
      expect(res.status).toBe(401);
    });

    it("returns 403 for view-only on invoices", async () => {
      mockSession.mockResolvedValueOnce(viewOnlySession("invoices"));
      const res = await POST(makeReq(baseInvoiceBody) as never);
      expect(res.status).toBe(403);
    });

    it("calculates subtotal = sum of (qty × unitPrice)", async () => {
      // items: 2×100 + 1×50 = 250
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.invoice.count.mockResolvedValueOnce(5);
      prismaMock.invoice.create.mockResolvedValueOnce({ ...sampleInvoice, subtotal: 250, total: 297.5 });
      await POST(makeReq(baseInvoiceBody) as never);
      const call = prismaMock.invoice.create.mock.calls[0][0];
      expect(call.data.subtotal).toBe(250);
    });

    it("calculates tax = subtotal × taxRate/100", async () => {
      // subtotal=250, taxRate=19 → tax=47.5
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.invoice.count.mockResolvedValueOnce(0);
      prismaMock.invoice.create.mockResolvedValueOnce(sampleInvoice);
      await POST(makeReq(baseInvoiceBody) as never);
      const call = prismaMock.invoice.create.mock.calls[0][0];
      expect(call.data.tax).toBeCloseTo(47.5, 2);
    });

    it("calculates total = subtotal + tax", async () => {
      // 250 + 47.5 = 297.5
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.invoice.count.mockResolvedValueOnce(0);
      prismaMock.invoice.create.mockResolvedValueOnce(sampleInvoice);
      await POST(makeReq(baseInvoiceBody) as never);
      const call = prismaMock.invoice.create.mock.calls[0][0];
      expect(call.data.total).toBeCloseTo(297.5, 2);
    });

    it("defaults taxRate to 19 when not provided", async () => {
      const body = { ...baseInvoiceBody, taxRate: undefined };
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.invoice.count.mockResolvedValueOnce(0);
      prismaMock.invoice.create.mockResolvedValueOnce(sampleInvoice);
      await POST(makeReq(body) as never);
      const call = prismaMock.invoice.create.mock.calls[0][0];
      expect(call.data.taxRate).toBe(19);
    });

    it("generates sequential invoice number (INV-00006 when 5 already exist)", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.invoice.count.mockResolvedValueOnce(5);
      prismaMock.invoice.create.mockResolvedValueOnce(sampleInvoice);
      await POST(makeReq(baseInvoiceBody) as never);
      const call = prismaMock.invoice.create.mock.calls[0][0];
      expect(call.data.number).toBe("INV-00006");
    });

    it("decrements stock for items with productId", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.invoice.count.mockResolvedValueOnce(0);
      prismaMock.invoice.create.mockResolvedValueOnce(sampleInvoice);
      await POST(makeReq(baseInvoiceBody) as never);
      // item[0] has productId, item[1] does not
      expect(prismaMock.product.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "product-1" },
          data: { quantity: { decrement: 2 } },
        })
      );
    });

    it("does NOT decrement stock for items without productId", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.invoice.count.mockResolvedValueOnce(0);
      prismaMock.invoice.create.mockResolvedValueOnce(sampleInvoice);
      await POST(makeReq(baseInvoiceBody) as never);
      // Only 1 product.update call (for item[0]), not for item[1]
      expect(prismaMock.product.update).toHaveBeenCalledTimes(1);
    });

    it("creates invoice with correct date parsing", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.invoice.count.mockResolvedValueOnce(0);
      prismaMock.invoice.create.mockResolvedValueOnce(sampleInvoice);
      await POST(makeReq({ ...baseInvoiceBody, date: "2026-03-01", dueDate: "2026-04-01" }) as never);
      const call = prismaMock.invoice.create.mock.calls[0][0];
      expect(call.data.date).toBeInstanceOf(Date);
      expect(call.data.dueDate).toBeInstanceOf(Date);
    });

    it("logs audit on creation", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.invoice.count.mockResolvedValueOnce(0);
      prismaMock.invoice.create.mockResolvedValueOnce({
        ...sampleInvoice, client: { name: "Acme" }, total: 297.5,
      });
      await POST(makeReq(baseInvoiceBody) as never);
      expect(mockLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: "create", entity: "invoice" })
      );
    });

    it("passes dueDate: null when not provided", async () => {
      const body = { ...baseInvoiceBody, dueDate: "" };
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.invoice.count.mockResolvedValueOnce(0);
      prismaMock.invoice.create.mockResolvedValueOnce(sampleInvoice);
      await POST(makeReq(body) as never);
      const call = prismaMock.invoice.create.mock.calls[0][0];
      expect(call.data.dueDate).toBeNull();
    });
  });

  // ─── Business logic: date validation ────────────────────────────────────
  describe("Date / dueDate business rules", () => {
    it("allows dueDate after date (valid range)", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.invoice.count.mockResolvedValueOnce(0);
      prismaMock.invoice.create.mockResolvedValueOnce(sampleInvoice);
      const body = { ...baseInvoiceBody, date: "2026-01-01", dueDate: "2026-02-01" };
      const res = await POST(makeReq(body) as never);
      expect(res.status).toBe(201);
    });

    it("currently allows dueDate BEFORE date (no server-side validation – known gap)", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.invoice.count.mockResolvedValueOnce(0);
      prismaMock.invoice.create.mockResolvedValueOnce(sampleInvoice);
      // dueDate before date – should ideally return 400 but currently passes
      const body = { ...baseInvoiceBody, date: "2026-03-01", dueDate: "2026-01-01" };
      const res = await POST(makeReq(body) as never);
      // Document current behavior: no server validation
      expect(res.status).toBe(201); // Bug: should validate
    });

    it("allows same date and dueDate (same day payment)", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.invoice.count.mockResolvedValueOnce(0);
      prismaMock.invoice.create.mockResolvedValueOnce(sampleInvoice);
      const body = { ...baseInvoiceBody, date: "2026-01-15", dueDate: "2026-01-15" };
      const res = await POST(makeReq(body) as never);
      expect(res.status).toBe(201);
    });
  });

  // ─── GET /api/invoices/[id] ─────────────────────────────────────────────
  describe("GET /api/invoices/[id]", () => {
    it("returns 404 for cross-org invoice", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.invoice.findFirst.mockResolvedValueOnce(null);
      const res = await GET_ONE(makeReq() as never, params("other-org-inv"));
      expect(res.status).toBe(404);
    });

    it("returns invoice with client + items", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.invoice.findFirst.mockResolvedValueOnce(sampleInvoice);
      const res = await GET_ONE(makeReq() as never, params("invoice-1"));
      expect(res.status).toBe(200);
    });
  });

  // ─── PUT /api/invoices/[id] ─────────────────────────────────────────────
  describe("PUT /api/invoices/[id] – status changes", () => {
    it("returns 404 for cross-org invoice", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.invoice.findFirst.mockResolvedValueOnce(null);
      const res = await PUT(makeReq({ status: "paid" }) as never, params("bad-id"));
      expect(res.status).toBe(404);
    });

    it("triggers email when status changes to 'sent' and client has email", async () => {
      const { sendInvoiceEmail } = await import("@/lib/email");
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.invoice.findFirst.mockResolvedValueOnce(sampleInvoice);
      prismaMock.invoice.update.mockResolvedValueOnce({
        ...sampleInvoice,
        status: "sent",
        client: { name: "Acme", email: "info@acme.com" },
      });
      await PUT(makeReq({ status: "sent" }) as never, params("invoice-1"));
      expect(sendInvoiceEmail).toHaveBeenCalled();
    });

    it("does NOT trigger email when status changes to 'paid'", async () => {
      const { sendInvoiceEmail } = await import("@/lib/email");
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.invoice.findFirst.mockResolvedValueOnce(sampleInvoice);
      prismaMock.invoice.update.mockResolvedValueOnce({
        ...sampleInvoice,
        status: "paid",
        client: { name: "Acme", email: "info@acme.com" },
      });
      await PUT(makeReq({ status: "paid" }) as never, params("invoice-1"));
      expect(sendInvoiceEmail).not.toHaveBeenCalled();
    });

    it("does NOT trigger email when client has no email", async () => {
      const { sendInvoiceEmail } = await import("@/lib/email");
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.invoice.findFirst.mockResolvedValueOnce(sampleInvoice);
      prismaMock.invoice.update.mockResolvedValueOnce({
        ...sampleInvoice,
        status: "sent",
        client: { name: "Acme", email: null },
      });
      await PUT(makeReq({ status: "sent" }) as never, params("invoice-1"));
      expect(sendInvoiceEmail).not.toHaveBeenCalled();
    });

    it("re-calculates totals when items are updated", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.invoice.findFirst.mockResolvedValueOnce(sampleInvoice);
      prismaMock.invoiceItem.deleteMany.mockResolvedValueOnce({ count: 2 });
      prismaMock.invoice.update.mockResolvedValueOnce({
        ...sampleInvoice, subtotal: 500, tax: 95, total: 595,
      });
      const updatedItems = [{ description: "New Item", quantity: 5, unitPrice: 100 }];
      const res = await PUT(makeReq({ items: updatedItems, taxRate: 19 }) as never, params("inv-1"));
      expect(res.status).toBe(200);
      const call = prismaMock.invoice.update.mock.calls[0][0];
      expect(call.data.subtotal).toBe(500);
    });

    it("logs audit on status update", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.invoice.findFirst.mockResolvedValueOnce(sampleInvoice);
      prismaMock.invoice.update.mockResolvedValueOnce({ ...sampleInvoice, status: "paid" });
      await PUT(makeReq({ status: "paid" }) as never, params("i1"));
      expect(mockLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: "update", entity: "invoice" })
      );
    });
  });

  // ─── DELETE /api/invoices/[id] ──────────────────────────────────────────
  describe("DELETE /api/invoices/[id]", () => {
    it("returns 404 for non-existent invoice", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.invoice.findFirst.mockResolvedValueOnce(null);
      const res = await DELETE(makeReq() as never, params("bad-id"));
      expect(res.status).toBe(404);
    });

    it("deletes invoice and returns success", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.invoice.findFirst.mockResolvedValueOnce(sampleInvoice);
      prismaMock.invoice.delete.mockResolvedValueOnce(sampleInvoice);
      const res = await DELETE(makeReq() as never, params("invoice-1"));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it("returns 403 for view-only employee", async () => {
      mockSession.mockResolvedValueOnce(viewOnlySession("invoices"));
      const res = await DELETE(makeReq() as never, params("i1"));
      expect(res.status).toBe(403);
    });
  });

  // ─── Cross-feature: invoice references client and product ────────────────
  describe("Cross-feature: invoice ↔ client ↔ product", () => {
    it("invoice includes client name in response", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.invoice.findMany.mockResolvedValueOnce([
        { ...sampleInvoice, client: { id: "c1", name: "Acme Corp" } },
      ]);
      const res = await GET(makeReqWithUrl("http://localhost/api/invoices") as never);
      const data = await res.json();
      expect(data[0].client.name).toBe("Acme Corp");
    });

    it("invoice items include product info", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.invoice.findMany.mockResolvedValueOnce([
        {
          ...sampleInvoice,
          items: [{ id: "i1", description: "Widget", quantity: 2, unitPrice: 50, total: 100, product: sampleProduct }],
        },
      ]);
      const res = await GET(makeReqWithUrl("http://localhost/api/invoices") as never);
      const data = await res.json();
      expect(data[0].items[0].product.sku).toBe("TEST-001");
    });

    it("stock is decremented by invoice item quantity", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.invoice.count.mockResolvedValueOnce(0);
      prismaMock.invoice.create.mockResolvedValueOnce(sampleInvoice);
      await POST(makeReq({
        ...baseInvoiceBody,
        items: [{ description: "Widget", quantity: 5, unitPrice: 20, productId: "product-1" }],
      }) as never);
      expect(prismaMock.product.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { quantity: { decrement: 5 } } })
      );
    });
  });
});
