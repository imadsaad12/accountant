import { describe, it, expect, vi, beforeEach } from "vitest";
import { adminSession, employeeSession, viewOnlySession, makeReq, sampleClient, ORG_ID, OTHER_ORG_ID } from "../helpers";

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

import { GET, POST } from "@/app/api/clients/route";
import { GET as GET_ONE, PUT, DELETE } from "@/app/api/clients/[id]/route";

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("Clients API", () => {
  beforeEach(() => vi.clearAllMocks());

  // ─── GET /api/clients ───────────────────────────────────────────────────
  describe("GET /api/clients", () => {
    it("returns 401 when not authenticated", async () => {
      mockSession.mockResolvedValueOnce(null);
      const res = await GET();
      expect(res.status).toBe(401);
    });

    it("returns 403 when user has no view permission", async () => {
      mockSession.mockResolvedValueOnce(employeeSession());
      const res = await GET();
      expect(res.status).toBe(403);
    });

    it("returns 200 with clients list for admin", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.client.findMany.mockResolvedValueOnce([sampleClient]);
      const res = await GET();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveLength(1);
      expect(data[0].name).toBe("Acme Corp");
    });

    it("returns 200 for employee with view permission", async () => {
      mockSession.mockResolvedValueOnce(viewOnlySession("clients"));
      prismaMock.client.findMany.mockResolvedValueOnce([sampleClient]);
      const res = await GET();
      expect(res.status).toBe(200);
    });

    it("queries only the current organization", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.client.findMany.mockResolvedValueOnce([]);
      await GET();
      expect(prismaMock.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: ORG_ID }) })
      );
    });
  });

  // ─── POST /api/clients ──────────────────────────────────────────────────
  describe("POST /api/clients", () => {
    it("returns 401 when not authenticated", async () => {
      mockSession.mockResolvedValueOnce(null);
      const res = await POST(makeReq({ name: "New Client" }) as never);
      expect(res.status).toBe(401);
    });

    it("returns 403 for view-only employee", async () => {
      mockSession.mockResolvedValueOnce(viewOnlySession("clients"));
      const res = await POST(makeReq({ name: "New Client" }) as never);
      expect(res.status).toBe(403);
    });

    it("creates client and returns 201", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.client.create.mockResolvedValueOnce(sampleClient);
      const res = await POST(makeReq({ name: "Acme Corp", email: "info@acme.com" }) as never);
      expect(res.status).toBe(201);
    });

    it("injects organizationId from session (not from body)", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.client.create.mockResolvedValueOnce(sampleClient);
      await POST(makeReq({ name: "Client", organizationId: OTHER_ORG_ID }) as never);
      expect(prismaMock.client.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ organizationId: ORG_ID }) })
      );
    });

    it("logs audit entry on successful creation", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.client.create.mockResolvedValueOnce(sampleClient);
      await POST(makeReq({ name: "Acme" }) as never);
      expect(mockLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: "create", entity: "client" })
      );
    });

    it("stores XSS attempt in name as plain string (no sanitization needed – escaped by React)", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      const xssName = '<script>alert("xss")</script>';
      prismaMock.client.create.mockResolvedValueOnce({ ...sampleClient, name: xssName });
      const res = await POST(makeReq({ name: xssName }) as never);
      expect(res.status).toBe(201);
    });
  });

  // ─── GET /api/clients/[id] ──────────────────────────────────────────────
  describe("GET /api/clients/[id]", () => {
    it("returns 401 when not authenticated", async () => {
      mockSession.mockResolvedValueOnce(null);
      const res = await GET_ONE(makeReq() as never, params("client-1"));
      expect(res.status).toBe(401);
    });

    it("returns 404 when client not found in same org", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.client.findFirst.mockResolvedValueOnce(null);
      const res = await GET_ONE(makeReq() as never, params("nonexistent"));
      expect(res.status).toBe(404);
    });

    it("returns 404 when client belongs to different org", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.client.findFirst.mockResolvedValueOnce(null); // scoped query returns null
      const res = await GET_ONE(makeReq() as never, params("other-org-client"));
      expect(res.status).toBe(404);
    });

    it("returns 200 with client data", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.client.findFirst.mockResolvedValueOnce(sampleClient);
      const res = await GET_ONE(makeReq() as never, params("client-1"));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.name).toBe("Acme Corp");
    });
  });

  // ─── PUT /api/clients/[id] ──────────────────────────────────────────────
  describe("PUT /api/clients/[id]", () => {
    it("returns 401 when not authenticated", async () => {
      mockSession.mockResolvedValueOnce(null);
      const res = await PUT(makeReq({ name: "X" }) as never, params("c1"));
      expect(res.status).toBe(401);
    });

    it("returns 403 for view-only employee", async () => {
      mockSession.mockResolvedValueOnce(viewOnlySession("clients"));
      const res = await PUT(makeReq({ name: "X" }) as never, params("c1"));
      expect(res.status).toBe(403);
    });

    it("returns 404 when client not found", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.client.findFirst.mockResolvedValueOnce(null);
      const res = await PUT(makeReq({ name: "X" }) as never, params("bad-id"));
      expect(res.status).toBe(404);
    });

    it("updates and returns 200", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.client.findFirst.mockResolvedValueOnce(sampleClient);
      prismaMock.client.update.mockResolvedValueOnce({ ...sampleClient, name: "Updated" });
      const res = await PUT(makeReq({ name: "Updated" }) as never, params("client-1"));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.name).toBe("Updated");
    });

    it("logs audit on update", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.client.findFirst.mockResolvedValueOnce(sampleClient);
      prismaMock.client.update.mockResolvedValueOnce({ ...sampleClient, name: "Updated" });
      await PUT(makeReq({ name: "Updated" }) as never, params("c1"));
      expect(mockLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: "update", entity: "client" })
      );
    });
  });

  // ─── DELETE /api/clients/[id] ───────────────────────────────────────────
  describe("DELETE /api/clients/[id]", () => {
    it("returns 401 when not authenticated", async () => {
      mockSession.mockResolvedValueOnce(null);
      const res = await DELETE(makeReq() as never, params("c1"));
      expect(res.status).toBe(401);
    });

    it("returns 403 for view-only employee", async () => {
      mockSession.mockResolvedValueOnce(viewOnlySession("clients"));
      const res = await DELETE(makeReq() as never, params("c1"));
      expect(res.status).toBe(403);
    });

    it("returns 404 when client not found", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.client.findFirst.mockResolvedValueOnce(null);
      const res = await DELETE(makeReq() as never, params("bad-id"));
      expect(res.status).toBe(404);
    });

    it("deletes and returns { success: true }", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.client.findFirst.mockResolvedValueOnce(sampleClient);
      prismaMock.client.delete.mockResolvedValueOnce(sampleClient);
      const res = await DELETE(makeReq() as never, params("client-1"));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it("logs audit on delete", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.client.findFirst.mockResolvedValueOnce(sampleClient);
      prismaMock.client.delete.mockResolvedValueOnce(sampleClient);
      await DELETE(makeReq() as never, params("c1"));
      expect(mockLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: "delete", entity: "client" })
      );
    });
  });
});
