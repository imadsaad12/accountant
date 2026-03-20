import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Sidebar from "@/components/Sidebar";
import { ThemeProvider } from "@/components/ThemeProvider";
import { LanguageProvider } from "@/components/LanguageProvider";
import { OrgSettingsProvider } from "@/components/OrgSettingsProvider";
import type { Lang } from "@/lib/i18n";
import { AlertTriangle, Lock } from "lucide-react";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const [user, org] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { theme: true, language: true },
    }),
    prisma.organization.findUnique({
      where: { id: session.organizationId },
      select: { status: true, plan: true, trialEndsAt: true, name: true },
    }),
  ]);

  const theme = user?.theme ?? "dark";
  const language = (user?.language ?? "en") as Lang;

  // Determine if org is blocked
  const now = new Date();
  const isInactive = org?.status === "inactive";
  const isTrialExpired =
    org?.status === "trial" && org.trialEndsAt != null && new Date(org.trialEndsAt) < now;
  const isBlocked = isInactive || isTrialExpired;

  const trialDaysLeft = org?.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(org.trialEndsAt).getTime() - now.getTime()) / 86400000))
    : null;

  return (
    <LanguageProvider lang={language}>
      <OrgSettingsProvider>
        <ThemeProvider theme={theme} />
        <div className="flex h-screen bg-dark-bg">
          <Sidebar user={session} />
          <main className="flex-1 overflow-auto">
            {isBlocked ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center max-w-md px-6">
                  <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-5">
                    <Lock size={28} className="text-red-400" />
                  </div>
                  <h1 className="text-2xl font-bold text-text-primary mb-2">
                    {isTrialExpired ? "Trial Expired" : "Account Suspended"}
                  </h1>
                  <p className="text-text-muted text-sm mb-6">
                    {isTrialExpired
                      ? "Your 15-day free trial has ended. Please contact support to upgrade your plan and restore access."
                      : "Your account has been deactivated. Please contact support to reactivate."}
                  </p>
                  <div className="bg-dark-card border border-dark-border rounded-xl p-4 text-left text-sm text-text-secondary space-y-1">
                    <div className="flex justify-between"><span className="text-text-muted">Organization</span><span>{org?.name}</span></div>
                    <div className="flex justify-between"><span className="text-text-muted">Plan</span><span className="capitalize">{org?.plan}</span></div>
                    <div className="flex justify-between"><span className="text-text-muted">Status</span><span className="text-red-400 capitalize">{isTrialExpired ? "Trial expired" : "Inactive"}</span></div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 lg:p-8">
                {/* Trial warning banner */}
                {org?.status === "trial" && trialDaysLeft !== null && trialDaysLeft <= 5 && (
                  <div className="mb-6 flex items-center gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 text-sm">
                    <AlertTriangle size={16} className="shrink-0" />
                    <span>
                      Your free trial expires in <strong>{trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""}</strong>. Contact support to upgrade.
                    </span>
                  </div>
                )}
                {children}
              </div>
            )}
          </main>
        </div>
      </OrgSettingsProvider>
    </LanguageProvider>
  );
}
