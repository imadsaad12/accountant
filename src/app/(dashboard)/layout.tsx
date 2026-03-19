import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Sidebar from "@/components/Sidebar";
import { ThemeProvider } from "@/components/ThemeProvider";
import { LanguageProvider } from "@/components/LanguageProvider";
import { OrgSettingsProvider } from "@/components/OrgSettingsProvider";
import type { Lang } from "@/lib/i18n";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { theme: true, language: true },
  });

  const theme = user?.theme ?? "dark";
  const language = (user?.language ?? "en") as Lang;

  return (
    <LanguageProvider lang={language}>
      <OrgSettingsProvider>
      <ThemeProvider theme={theme} />
      <div className="flex h-screen bg-dark-bg">
        <Sidebar user={session} />
        <main className="flex-1 overflow-auto">
          <div className="p-6 lg:p-8">{children}</div>
        </main>
      </div>
      </OrgSettingsProvider>
    </LanguageProvider>
  );
}
