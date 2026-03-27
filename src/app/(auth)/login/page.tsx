"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import CashentLogo from "@/components/CashentLogo";
import { canView } from "@/lib/permissions";
import type { Feature, Permissions } from "@/lib/permissions";

const FEATURE_ROUTES: { feature: Feature; route: string }[] = [
  { feature: "dashboard", route: "/dashboard" },
  { feature: "clients", route: "/dashboard/clients" },
  { feature: "suppliers", route: "/dashboard/suppliers" },
  { feature: "products", route: "/dashboard/products" },
  { feature: "employees", route: "/dashboard/employees" },
  { feature: "invoices", route: "/dashboard/invoices" },
  { feature: "expenses", route: "/dashboard/expenses" },
  { feature: "salary_advances", route: "/dashboard/salary-advances" },
  { feature: "reports", route: "/dashboard/reports" },
  { feature: "ai", route: "/dashboard/ai" },
  { feature: "activity_log", route: "/dashboard/activity-log" },
  { feature: "tax", route: "/dashboard/tax" },
  { feature: "settings", route: "/dashboard/settings" },
];

function getRedirectRoute(role: string, permissions: Permissions): string {
  if (role === "admin") return "/dashboard";
  const first = FEATURE_ROUTES.find(({ feature }) => canView(permissions, feature));
  return first ? first.route : "/no-access";
}

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: formData.get("email"),
        password: formData.get("password"),
      }),
    });

    if (res.ok) {
      const data = await res.json();
      router.push(getRedirectRoute(data.role, data.permissions));
    } else {
      const data = await res.json();
      setError(data.error || "Login failed");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-bg relative overflow-hidden p-4">
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-accent/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[400px] h-[400px] rounded-full bg-accent/5 blur-3xl pointer-events-none" />

      <div className="relative max-w-md w-full space-y-8 p-5 sm:p-8 bg-dark-card border border-dark-border rounded-2xl shadow-2xl">
        <div className="text-center">
          <CashentLogo className="text-4xl" />
          <p className="mt-2 text-text-muted">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-500/10 text-red-400 border border-red-500/20 p-3 rounded-lg text-sm">{error}</div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-text-secondary">Email or Username</label>
            <input
              id="email"
              name="email"
              type="text"
              required
              placeholder="your@email.com or username"
              className="mt-1 block w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg shadow-sm placeholder:text-text-muted focus:ring-accent focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-text-secondary">Password</label>
            <div className="relative mt-1">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                className="block w-full px-3 py-2 pr-10 bg-dark-input border border-dark-border text-text-primary rounded-lg shadow-sm placeholder:text-text-muted focus:ring-accent focus:border-accent focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-text-muted hover:text-text-secondary"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <Link href="/forgot-password" className="text-sm text-accent hover:text-accent-hover transition-colors">
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-accent hover:bg-accent-hover focus:ring-2 focus:ring-offset-2 focus:ring-accent focus:ring-offset-dark-bg disabled:opacity-50 transition-colors"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? "Signing in..." : "Sign In"}
          </button>

          <p className="text-center text-sm text-text-secondary">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="text-accent hover:text-accent-hover font-medium transition-colors">
              Register
            </Link>
          </p>
        </form>
        <p className="mt-6 text-center text-xs text-text-muted">
          By signing in, you agree to our{" "}
          <Link href="/privacy" className="text-accent hover:underline">Privacy Policy</Link>
        </p>
      </div>
    </div>
  );
}
