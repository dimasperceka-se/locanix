"use client";

import { useEffect } from "react";
import Logo from "@/components/Logo";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Home, KeyRound, LogOut } from "lucide-react";
import { usePlotStore } from "@/lib/plotStore";

export default function EudrSidebar() {
  const router = useRouter();
  const { userName, userEmail, clear, refreshUser } = usePlotStore();

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const initials =
    userName
      .replace(/[[\]]/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0]?.toUpperCase())
      .slice(0, 2)
      .join("") || "UN";

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore */
    }
    clear();
    router.push("/");
  };

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-ink-gradient p-5 text-white md:flex">
      <Link href="/" className="px-1" aria-label="Locanix home">
        <Logo size={26} tone="light" />
      </Link>

      <nav className="mt-8 space-y-1">
        <Link
          href="/dashboard"
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:bg-white/10"
        >
          <Home className="h-4 w-4" aria-hidden="true" />
          Overview
        </Link>
      </nav>

      <div className="mt-auto space-y-3">
        {/* User card */}
        <div className="flex items-center gap-3 rounded-xl bg-white/10 p-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-ink-deep">
            {initials}
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-sm font-semibold">{userName}</span>
            <span className="block truncate text-[11px] text-slate-300">
              {userEmail}
            </span>
          </span>
        </div>

        <div className="space-y-1 border-t border-white/10 pt-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:bg-white/10"
          >
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            Change Password
          </Link>
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:bg-white/10"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Logout
          </button>
        </div>
      </div>
    </aside>
  );
}
