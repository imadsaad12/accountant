import { vi } from "vitest";

// ─── Mock next/server ──────────────────────────────────────────────────────
vi.mock("next/server", () => {
  class MockNextResponse {
    _data: unknown;
    status: number;
    cookies = { set: vi.fn(), get: vi.fn() };

    constructor(data: unknown, init?: { status?: number }) {
      this._data = data;
      this.status = init?.status ?? 200;
    }

    async json() {
      return this._data;
    }

    static json(data: unknown, init?: { status?: number }) {
      return new MockNextResponse(data, init);
    }
  }

  class MockNextRequest {
    url: string;
    method: string;
    private _body: unknown;

    constructor(url: string, init?: { method?: string; body?: unknown }) {
      this.url = url ?? "http://localhost/api/test";
      this.method = init?.method ?? "GET";
      this._body = init?.body ?? null;
    }

    async json() {
      return this._body;
    }
  }

  return { NextRequest: MockNextRequest, NextResponse: MockNextResponse };
});

// ─── Mock next/headers ─────────────────────────────────────────────────────
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({
    get: vi.fn().mockReturnValue(undefined),
    set: vi.fn(),
  }),
}));

// ─── Mock email & PDF (side-effect-only) ──────────────────────────────────
vi.mock("@/lib/email", () => ({
  sendInvoiceEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/generate-invoice-pdf", () => ({
  generateInvoicePDF: vi.fn().mockReturnValue(Buffer.from("pdf")),
}));
