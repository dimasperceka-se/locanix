"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { usePlotStore } from "@/lib/plotStore";
import { FREE_QUOTA_HA } from "@/lib/quota";

const icon = (children: React.ReactNode) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

const NAV = [
  { href: "/dashboard", label: "Plots", match: (p: string) => p === "/dashboard", icon: icon(<path d="M4 18 L9 5 L20 8 L17 20 Z" />) },
  {
    href: "/dashboard/eudr",
    label: "Reports & DDS",
    match: (p: string) => p.startsWith("/dashboard/eudr"),
    icon: icon(
      <>
        <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" />
        <path d="M14 3v5h5" />
      </>,
    ),
  },
  {
    href: "/checkout",
    label: "Billing",
    match: (p: string) => p.startsWith("/checkout"),
    icon: icon(
      <>
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M3 10h18" />
      </>,
    ),
  },
  {
    href: "/dashboard/settings",
    label: "Settings",
    match: (p: string) => p.startsWith("/dashboard/settings"),
    icon: icon(
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      </>,
    ),
  },
];

type Plan = { title: string; usedHa: number; quotaHa: number; caption: string; cta: string };

/** Current allowance: an active subscription's monthly quota, otherwise the free hectares. */
function usePlan(): Plan | null {
  const [plan, setPlan] = useState<Plan | null>(null);
  useEffect(() => {
    let live = true;
    const get = (url: string) => fetch(url, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    Promise.all([get("/api/paypal/checkout"), get("/api/usage")]).then(([billing, usage]) => {
      if (!live) return;
      type Sub = { plan: "regular" | "pro"; active: boolean; remainingHa: number };
      const sub = (billing?.subscriptions as Sub[] | undefined)?.find((s) => s.active);
      if (sub) {
        const quotaHa = sub.plan === "pro" ? 500 : 100;
        const usedHa = Math.max(0, quotaHa - sub.remainingHa);
        setPlan({
          title: sub.plan === "pro" ? "Professional plan" : "Regular plan",
          usedHa,
          quotaHa,
          caption: `${fmt(usedHa)} of ${quotaHa} ha used this month`,
          cta: sub.plan === "pro" ? "Manage billing →" : "Upgrade plan →",
        });
      } else {
        const usedHa = Math.min(FREE_QUOTA_HA, usage?.freeUsedHa ?? 0);
        setPlan({
          title: billing?.paid ? "Pay as you go" : "Free allowance",
          usedHa,
          quotaHa: FREE_QUOTA_HA,
          caption: `${fmt(usedHa)} of ${FREE_QUOTA_HA} free ha used`,
          cta: "Choose a plan →",
        });
      }
    });
    return () => {
      live = false;
    };
  }, []);
  return plan;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export default function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const plan = usePlan();
  const { userName, userEmail, clear, refreshUser } = usePlotStore();
  const month = new Date().toLocaleString("en", { month: "short" });

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
    router.refresh();
  };

  return (
    <div className="flex min-h-screen flex-col bg-canvas leading-[normal] text-ink lg:flex-row">
      <aside className="flex flex-col gap-4 bg-ink-deep px-4 py-4 text-[#C9CCCA] lg:sticky lg:top-0 lg:h-screen lg:w-[232px] lg:flex-none lg:gap-7 lg:py-[22px]">
        <Link href="/" aria-label="Locanix home" className="flex items-center gap-2.5 px-2 text-[#F7F7F4] no-underline">
          <LogoMark size={28} tone="light" />
          <span className="font-display text-[19px] font-bold tracking-[-0.01em]">Locanix</span>
        </Link>

        <nav aria-label="Workspace" className="-mx-1 flex gap-1 overflow-x-auto px-1 text-[15px] lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
          {NAV.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 flex-none items-center gap-3 rounded-[10px] px-3 whitespace-nowrap no-underline ${
                  active ? "bg-[#262B2F] font-semibold text-[#F7F7F4]" : "text-[#C9CCCA] hover:bg-[#20252A] hover:text-[#F7F7F4]"
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto hidden flex-col gap-3 lg:flex">
          <div className="flex flex-col gap-2.5 rounded-xl border border-[#30363B] bg-[#20252A] p-4">
            {plan ? (
              <>
                <div className="flex justify-between text-[13px]">
                  <span className="font-semibold text-[#F7F7F4]">{plan.title}</span>
                  <span>{month}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[#343A3F]">
                  <div className="h-full bg-accent" style={{ width: `${Math.min(100, (plan.usedHa / plan.quotaHa) * 100)}%` }} />
                </div>
                <span className="text-[13px]">{plan.caption}</span>
                <Link href="/checkout" className="text-[13px] font-semibold text-accent no-underline hover:text-[#5BE59A]">
                  {plan.cta}
                </Link>
              </>
            ) : (
              <span className="text-[13px]">Loading plan…</span>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 px-2 text-[13px]">
            <span className="min-w-0 truncate" title={userEmail}>
              {userName}
            </span>
            <button type="button" onClick={logout} aria-label="Log out" className="rounded-lg p-1.5 text-[#C9CCCA] hover:bg-[#20252A] hover:text-[#F7F7F4]">
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col gap-6 px-5 pt-7 pb-10 sm:px-8">{children}</main>
    </div>
  );
}
