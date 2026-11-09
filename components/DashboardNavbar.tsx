"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import Logo from "@/components/Logo";
import { SHOW_AGRIPLOT, navLinks } from "@/lib/data";
import { usePlotStore } from "@/lib/plotStore";

const linkClass = "text-[15px] font-medium text-ink no-underline transition-colors hover:text-accent-deep";

export default function DashboardNavbar() {
  const router = useRouter();
  const { userName, clear, refreshUser } = usePlotStore();

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

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
    <header className="sticky top-0 z-40 border-b border-line bg-paper-header/95 leading-[normal] backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-[1360px] items-center justify-between gap-4 px-5 sm:px-8" aria-label="Primary">
        <Link href="/" className="flex items-center" aria-label="Locanix home">
          <Logo size={32} />
        </Link>

        <ul className="hidden items-center gap-8 lg:flex">
          {navLinks.map((link) => (
            <li key={link.label}>
              <Link href={link.href} className={linkClass}>
                {link.label}
              </Link>
            </li>
          ))}
          {SHOW_AGRIPLOT && (
            <li>
              <Link href="/agriplot" className={linkClass}>
                AgriPlot
              </Link>
            </li>
          )}
          <li>
            <Link href="/contact" className={linkClass}>
              Contact
            </Link>
          </li>
        </ul>

        <div className="flex items-center gap-2.5">
          <span className="hidden text-[14px] text-ink-soft sm:inline">Hi, {userName}</span>
          <Link
            href="/dashboard"
            className="inline-flex min-h-11 items-center rounded-full bg-accent px-4 text-[14px] font-semibold text-ink no-underline transition-colors hover:bg-[#5BE59A]"
          >
            Go to dashboard →
          </Link>
          <button
            type="button"
            onClick={logout}
            aria-label="Log out"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-ink hover:bg-black/5"
          >
            <LogOut className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </nav>
    </header>
  );
}
