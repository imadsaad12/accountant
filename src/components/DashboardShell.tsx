"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import Sidebar from "@/components/Sidebar";

export default function DashboardShell({
  children,
  orgName,
  user,
}: {
  children: React.ReactNode;
  orgName: string;
  user: { name: string; email: string; role?: string };
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen bg-dark-bg">
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <Sidebar
        user={user}
        orgName={orgName}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <main className="flex-1 overflow-auto min-w-0">
        {/* Mobile top bar */}
        <div className="md:hidden sticky top-0 z-30 flex items-center gap-3 px-4 py-3 bg-dark-sidebar border-b border-dark-border">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-dark-card"
          >
            <Menu size={20} />
          </button>
          <span className="text-sm font-semibold text-text-primary truncate">{orgName}</span>
        </div>

        {children}
      </main>
    </div>
  );
}
