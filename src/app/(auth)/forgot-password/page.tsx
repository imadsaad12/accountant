"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, ArrowLeft, Mail, KeyRound, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import CashentLogo from "@/components/CashentLogo";

type Step = "email" | "code" | "done";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    if (res.ok) {
      setStep("code");
    } else {
      const data = await res.json();
      setError(data.error || "Something went wrong");
    }
    setLoading(false);
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code, password }),
    });

    if (res.ok) {
      setStep("done");
    } else {
      const data = await res.json();
      setError(data.error || "Something went wrong");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-bg relative overflow-hidden p-4">
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-accent/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[400px] h-[400px] rounded-full bg-accent/5 blur-3xl pointer-events-none" />

      <div className="relative max-w-md w-full space-y-8 p-5 sm:p-8 bg-dark-card border border-dark-border rounded-2xl shadow-2xl">
        <div className="text-center">
          <CashentLogo className="text-4xl" />
          <p className="mt-2 text-text-muted">
            {step === "email" && "Enter your email to receive a reset code"}
            {step === "code" && "Enter the code and your new password"}
            {step === "done" && "Your password has been reset"}
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 text-red-400 border border-red-500/20 p-3 rounded-lg text-sm">{error}</div>
        )}

        {/* Step 1: Email */}
        {step === "email" && (
          <form onSubmit={handleSendCode} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-text-secondary">Email address</label>
              <div className="relative mt-1">
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="block w-full px-3 py-2 pl-10 bg-dark-input border border-dark-border text-text-primary rounded-lg shadow-sm placeholder:text-text-muted focus:ring-accent focus:border-accent focus:outline-none"
                />
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium text-white bg-accent hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {loading ? "Sending..." : "Send Reset Code"}
            </button>

            <p className="text-center text-sm text-text-muted">
              <Link href="/login" className="text-accent hover:text-accent-hover font-medium inline-flex items-center gap-1">
                <ArrowLeft size={14} /> Back to Sign In
              </Link>
            </p>
          </form>
        )}

        {/* Step 2: Code + New Password */}
        {step === "code" && (
          <form onSubmit={handleResetPassword} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-text-secondary">Verification Code</label>
              <div className="relative mt-1">
                <input
                  type="text"
                  required
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="6-digit code"
                  maxLength={6}
                  className="block w-full px-3 py-2 pl-10 bg-dark-input border border-dark-border text-text-primary rounded-lg shadow-sm placeholder:text-text-muted focus:ring-accent focus:border-accent focus:outline-none text-center tracking-[0.3em] text-lg font-mono"
                />
                <KeyRound size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              </div>
              <p className="mt-1.5 text-xs text-text-muted">Check your email for the 6-digit code</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary">New Password</label>
              <div className="relative mt-1">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  minLength={6}
                  className="block w-full px-3 py-2 pr-10 bg-dark-input border border-dark-border text-text-primary rounded-lg shadow-sm placeholder:text-text-muted focus:ring-accent focus:border-accent focus:outline-none"
                />
                <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute inset-y-0 right-0 flex items-center pr-3 text-text-muted hover:text-text-secondary" tabIndex={-1}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary">Confirm Password</label>
              <input
                type={showPassword ? "text" : "password"}
                required
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="mt-1 block w-full px-3 py-2 bg-dark-input border border-dark-border text-text-primary rounded-lg shadow-sm placeholder:text-text-muted focus:ring-accent focus:border-accent focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium text-white bg-accent hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {loading ? "Resetting..." : "Reset Password"}
            </button>

            <button
              type="button"
              onClick={() => { setStep("email"); setError(""); setCode(""); }}
              className="w-full text-center text-sm text-text-muted hover:text-accent transition-colors"
            >
              Didn&apos;t receive the code? Send again
            </button>
          </form>
        )}

        {/* Step 3: Done */}
        {step === "done" && (
          <div className="text-center space-y-5">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 size={32} className="text-emerald-400" />
              </div>
            </div>
            <p className="text-text-secondary">Your password has been successfully reset. You can now sign in with your new password.</p>
            <button
              onClick={() => router.push("/login")}
              className="w-full py-2.5 px-4 rounded-lg text-sm font-medium text-white bg-accent hover:bg-accent-hover transition-colors"
            >
              Go to Sign In
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
