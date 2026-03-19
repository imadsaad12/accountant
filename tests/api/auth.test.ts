import { describe, it, expect, vi, beforeEach } from "vitest";
import { ORG_ID } from "../helpers";

// ─── Mocks ─────────────────────────────────────────────────────────────────
const prismaMock = vi.hoisted(() => {
  const mkFns = () => ({
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: "x" }),
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue({ id: "x" }),
    delete: vi.fn().mockResolvedValue({ id: "x" }),
  });
  return {
    user: { ...mkFns(), updateMany: vi.fn() },
    organization: { create: vi.fn().mockResolvedValue({ id: "org-id", name: "Test" }), upsert: vi.fn() },
    $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) =>
      fn({
        organization: { create: vi.fn().mockResolvedValue({ id: "test-org-id", name: "Test Org" }) },
        user: { create: vi.fn().mockResolvedValue({ id: "u1", email: "new@test.com", role: "admin", name: "Admin" }) },
      })
    ),
  };
});
vi.mock("@/lib/db", () => ({ prisma: prismaMock }));
vi.mock("@/lib/auth", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...real,
    createToken: vi.fn().mockResolvedValue("mock-jwt-token"),
  };
});

import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { makeReq } from "../helpers";

// ─── Helpers ───────────────────────────────────────────────────────────────
const validRegisterBody = {
  organizationName: "Test Corp",
  name: "Admin User",
  email: "admin@testcorp.com",
  password: "secret123",
};

describe("Auth – Register", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 400 when organizationName is missing", async () => {
    const req = makeReq({ name: "A", email: "a@b.com", password: "pw" });
    const res = await register(req as never);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/organization/i);
  });

  it("returns 400 when organizationName is blank whitespace", async () => {
    const req = makeReq({ ...validRegisterBody, organizationName: "   " });
    const res = await register(req as never);
    expect(res.status).toBe(400);
  });

  it("returns 400 when email already exists", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: "existing" });
    const req = makeReq(validRegisterBody);
    const res = await register(req as never);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/exists/i);
  });

  it("creates org + admin user in a transaction on success", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    const txOrg = { id: ORG_ID, name: "Test Corp" };
    const txUser = { id: "u1", email: "admin@testcorp.com", name: "Admin User", role: "admin" };
    prismaMock.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) =>
      fn({
        organization: { create: vi.fn().mockResolvedValue(txOrg) },
        user: { create: vi.fn().mockResolvedValue(txUser) },
      })
    );

    const req = makeReq(validRegisterBody);
    const res = await register(req as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user.role).toBe("admin");
    expect(data.organization.name).toBe("Test Corp");
  });

  it("returns 500 on unexpected error", async () => {
    prismaMock.user.findUnique.mockRejectedValueOnce(new Error("DB down"));
    const req = makeReq(validRegisterBody);
    const res = await register(req as never);
    expect(res.status).toBe(500);
  });
});

describe("Auth – Login", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when user does not exist", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    const req = makeReq({ email: "nobody@x.com", password: "pw" });
    const res = await login(req as never);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toMatch(/credentials/i);
  });

  it("returns 401 when password is wrong", async () => {
    const { hashPassword } = await import("@/lib/auth");
    const hashed = await hashPassword("correctpassword");
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "u1", email: "admin@test.com", name: "Admin", role: "admin",
      organizationId: ORG_ID, password: hashed,
    });
    const req = makeReq({ email: "admin@test.com", password: "wrongpassword" });
    const res = await login(req as never);
    expect(res.status).toBe(401);
  });

  it("returns 200 and user data on valid credentials", async () => {
    const { hashPassword } = await import("@/lib/auth");
    const hashed = await hashPassword("correct123");
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "u1", email: "admin@test.com", name: "Admin", role: "admin",
      organizationId: ORG_ID, password: hashed,
    });
    const req = makeReq({ email: "admin@test.com", password: "correct123" });
    const res = await login(req as never);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user.email).toBe("admin@test.com");
    expect(data.user.role).toBe("admin");
    expect(data.user).not.toHaveProperty("password");
  });

  it("does not expose password hash in response", async () => {
    const { hashPassword } = await import("@/lib/auth");
    const hashed = await hashPassword("pw");
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "u1", email: "a@b.com", name: "A", role: "admin",
      organizationId: ORG_ID, password: hashed,
    });
    const req = makeReq({ email: "a@b.com", password: "pw" });
    const res = await login(req as never);
    const data = await res.json();
    expect(JSON.stringify(data)).not.toContain(hashed);
  });
});
