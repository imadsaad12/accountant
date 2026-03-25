import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "accountant-secret-key-change-in-production"
);

const AUTH_ROUTES = ["/login", "/register"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get("token")?.value;

  const isAuthRoute = AUTH_ROUTES.some((r) => pathname.startsWith(r));

  if (isAuthRoute && token) {
    try {
      await jwtVerify(token, SECRET);
      // Valid session — redirect to dashboard instead of showing login
      return NextResponse.redirect(new URL("/dashboard", req.url));
    } catch {
      // Invalid/expired token — let them through to login
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/login", "/register"],
};
