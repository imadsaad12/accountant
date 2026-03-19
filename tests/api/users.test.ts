import { describe, it, expect, vi, beforeEach } from "vitest";
import { adminSession, employeeSession, makeReq, ORG_ID } from "../helpers";
import { DEFAULT_EMPLOYEE_PERMISSIONS } from "@/lib/permissions";

// ─── Mocks ─────────────────────────────────────────────────────────────────
const { prismaMock, mockSession } = vi.hoisted(() => {
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
  };
});

vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...real,
    getSession: mockSession,
    hashPassword: vi.fn().mockImplementation((pw: string) => Promise.resolve(`hashed_${pw}`)),
  };
});

import { GET, POST } from "@/app/api/users/route";
import { PUT, DELETE } from "@/app/api/users/[id]/route";

const params = (id: string) => ({ params: Promise.resolve({ id }) });

const sampleUser = {
  id: "user-2",
  name: "Employee One",
  email: "emp@test.com",
  role: "employee",
  permissions: JSON.stringify(DEFAULT_EMPLOYEE_PERMISSIONS),
  createdAt: new Date(),
  organizationId: ORG_ID,
};

describe("Users / Team Management API", () => {
  beforeEach(() => vi.clearAllMocks());

  // ─── GET /api/users ─────────────────────────────────────────────────────
  describe("GET /api/users", () => {
    it("returns 401 when unauthenticated", async () => {
      mockSession.mockResolvedValueOnce(null);
      const res = await GET();
      expect(res.status).toBe(401);
    });

    it("returns 403 for non-admin role", async () => {
      mockSession.mockResolvedValueOnce({ ...employeeSession(), role: "employee" });
      const res = await GET();
      expect(res.status).toBe(403);
    });

    it("returns user list for admin", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.user.findMany.mockResolvedValueOnce([sampleUser]);
      const res = await GET();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveLength(1);
      expect(data[0].email).toBe("emp@test.com");
    });

    it("scopes query to current organization", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.user.findMany.mockResolvedValueOnce([]);
      await GET();
      expect(prismaMock.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: ORG_ID }) })
      );
    });

    it("does NOT return passwords in response", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.user.findMany.mockResolvedValueOnce([
        { ...sampleUser, password: "hashed_secret" },
      ]);
      const res = await GET();
      const data = await res.json();
      // Route uses select: excludes password
      expect(prismaMock.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ select: expect.not.objectContaining({ password: true }) })
      );
    });
  });

  // ─── POST /api/users ─────────────────────────────────────────────────────
  describe("POST /api/users", () => {
    const validUser = {
      name: "New Employee",
      email: "new@test.com",
      password: "secret123",
      permissions: DEFAULT_EMPLOYEE_PERMISSIONS,
    };

    it("returns 401 when unauthenticated", async () => {
      mockSession.mockResolvedValueOnce(null);
      const res = await POST(makeReq(validUser) as never);
      expect(res.status).toBe(401);
    });

    it("returns 403 for non-admin", async () => {
      mockSession.mockResolvedValueOnce({ ...employeeSession(), role: "employee" });
      const res = await POST(makeReq(validUser) as never);
      expect(res.status).toBe(403);
    });

    it("returns 400 when email missing", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      const res = await POST(makeReq({ ...validUser, email: undefined }) as never);
      expect(res.status).toBe(400);
    });

    it("returns 400 when password missing", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      const res = await POST(makeReq({ ...validUser, password: undefined }) as never);
      expect(res.status).toBe(400);
    });

    it("returns 400 when name missing", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      const res = await POST(makeReq({ ...validUser, name: undefined }) as never);
      expect(res.status).toBe(400);
    });

    it("returns 400 when email already exists", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.user.findUnique.mockResolvedValueOnce({ id: "existing" });
      const res = await POST(makeReq(validUser) as never);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/exists/i);
    });

    it("creates user with role 'employee' (not admin)", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.user.findUnique.mockResolvedValueOnce(null);
      prismaMock.user.create.mockResolvedValueOnce({ ...sampleUser, role: "employee" });
      await POST(makeReq(validUser) as never);
      expect(prismaMock.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ role: "employee" }) })
      );
    });

    it("hashes password before storing", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.user.findUnique.mockResolvedValueOnce(null);
      prismaMock.user.create.mockResolvedValueOnce(sampleUser);
      await POST(makeReq(validUser) as never);
      const callArg = prismaMock.user.create.mock.calls[0][0];
      // Password should be hashed, not plain text
      expect(callArg.data.password).toBe("hashed_secret123");
      expect(callArg.data.password).not.toBe("secret123");
    });

    it("assigns to current org", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.user.findUnique.mockResolvedValueOnce(null);
      prismaMock.user.create.mockResolvedValueOnce(sampleUser);
      await POST(makeReq(validUser) as never);
      const callArg = prismaMock.user.create.mock.calls[0][0];
      expect(callArg.data.organizationId).toBe(ORG_ID);
    });

    it("serializes permissions as JSON string", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.user.findUnique.mockResolvedValueOnce(null);
      prismaMock.user.create.mockResolvedValueOnce(sampleUser);
      await POST(makeReq(validUser) as never);
      const callArg = prismaMock.user.create.mock.calls[0][0];
      expect(typeof callArg.data.permissions).toBe("string");
    });

    it("returns 201 on success", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.user.findUnique.mockResolvedValueOnce(null);
      prismaMock.user.create.mockResolvedValueOnce(sampleUser);
      const res = await POST(makeReq(validUser) as never);
      expect(res.status).toBe(201);
    });
  });

  // ─── PUT /api/users/[id] ─────────────────────────────────────────────────
  describe("PUT /api/users/[id]", () => {
    it("returns 403 for non-admin", async () => {
      mockSession.mockResolvedValueOnce({ ...employeeSession(), role: "employee" });
      const res = await PUT(makeReq({ name: "X" }) as never, params("u1"));
      expect(res.status).toBe(403);
    });

    it("returns 404 when user not in org", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.user.findFirst.mockResolvedValueOnce(null);
      const res = await PUT(makeReq({ name: "X" }) as never, params("bad-id"));
      expect(res.status).toBe(404);
    });

    it("updates user name and email", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.user.findFirst.mockResolvedValueOnce(sampleUser);
      prismaMock.user.update.mockResolvedValueOnce({ ...sampleUser, name: "Updated Name" });
      const res = await PUT(makeReq({ name: "Updated Name", email: "new@x.com" }) as never, params("u2"));
      expect(res.status).toBe(200);
    });

    it("hashes new password when provided", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.user.findFirst.mockResolvedValueOnce(sampleUser);
      prismaMock.user.update.mockResolvedValueOnce(sampleUser);
      await PUT(makeReq({ password: "newpassword" }) as never, params("u2"));
      const callArg = prismaMock.user.update.mock.calls[0][0];
      expect(callArg.data.password).toBe("hashed_newpassword");
    });

    it("serializes permissions to JSON string", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.user.findFirst.mockResolvedValueOnce(sampleUser);
      prismaMock.user.update.mockResolvedValueOnce(sampleUser);
      const newPerms = { clients: { view: true, edit: true } };
      await PUT(makeReq({ permissions: newPerms }) as never, params("u2"));
      const callArg = prismaMock.user.update.mock.calls[0][0];
      expect(typeof callArg.data.permissions).toBe("string");
      expect(JSON.parse(callArg.data.permissions)).toEqual(newPerms);
    });
  });

  // ─── DELETE /api/users/[id] ──────────────────────────────────────────────
  describe("DELETE /api/users/[id]", () => {
    it("returns 403 for non-admin", async () => {
      mockSession.mockResolvedValueOnce({ ...employeeSession(), role: "employee" });
      const res = await DELETE(makeReq() as never, params("u1"));
      expect(res.status).toBe(403);
    });

    it("returns 400 when trying to delete yourself", async () => {
      mockSession.mockResolvedValueOnce(adminSession); // userId = "admin-user-id"
      const res = await DELETE(makeReq() as never, params("admin-user-id"));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/own/i);
    });

    it("returns 404 when user not in org", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.user.findFirst.mockResolvedValueOnce(null);
      const res = await DELETE(makeReq() as never, params("other-user"));
      expect(res.status).toBe(404);
    });

    it("deletes user and returns { success: true }", async () => {
      mockSession.mockResolvedValueOnce(adminSession);
      prismaMock.user.findFirst.mockResolvedValueOnce(sampleUser);
      prismaMock.user.delete.mockResolvedValueOnce(sampleUser);
      const res = await DELETE(makeReq() as never, params("user-2"));
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });
});
