"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationName: formData.get("organizationName"),
        name: formData.get("name"),
        email: formData.get("email"),
        password: formData.get("password"),
      }),
    });

    if (res.ok) {
      router.push("/dashboard");
    } else {
      const data = await res.json();
      setError(data.error || "Registration failed");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-bg relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-accent/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[400px] h-[400px] rounded-full bg-accent/5 blur-3xl pointer-events-none" />

      <div className="relative max-w-md w-full space-y-8 p-8 bg-dark-card border border-dark-border rounded-2xl shadow-2xl">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-text-primary">Accountant</h1>
          <p className="mt-2 text-text-muted">Create your organization</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="bg-red-500/10 text-red-400 border border-red-500/20 p-3 rounded-lg text-sm">{error}</div>
          )}

          <div>
            <label htmlFor="organizationName" className="block text-sm font-medium text-text-secondary">Organization / Company Name</label>
            <input
              id="organizationName"
              name="organizationName"
              type="text"
              required
              placeholder="e.g. Acme Corp"
              className="mt-1 block w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg shadow-sm placeholder:text-text-muted focus:ring-accent focus:border-accent focus:outline-none"
            />
          </div>

          <div className="border-t border-dark-border pt-4">
            <p className="text-xs text-text-muted mb-3">Admin Account</p>
            <div className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-text-secondary">Full Name</label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  className="mt-1 block w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg shadow-sm placeholder:text-text-muted focus:ring-accent focus:border-accent focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-text-secondary">Email</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  className="mt-1 block w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg shadow-sm placeholder:text-text-muted focus:ring-accent focus:border-accent focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-text-secondary">Password</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={6}
                  className="mt-1 block w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg shadow-sm placeholder:text-text-muted focus:ring-accent focus:border-accent focus:outline-none"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-accent hover:bg-accent-hover focus:ring-2 focus:ring-offset-2 focus:ring-accent focus:ring-offset-dark-bg disabled:opacity-50 transition-colors"
          >
            {loading ? "Creating organization..." : "Create Organization"}
          </button>

          <p className="text-center text-sm text-text-secondary">
            Already have an account?{" "}
            <Link href="/login" className="text-accent hover:text-accent-hover font-medium transition-colors">
              Sign In
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
