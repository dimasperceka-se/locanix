"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";
import Logo from "@/components/Logo";
import { SHOW_AGRIPLOT, navLinks } from "@/lib/data";
import { usePlotStore } from "@/lib/plotStore";

// No display class here: each use sets `inline-flex` or `hidden sm:inline-flex`.
const pill = "min-h-11 items-center whitespace-nowrap rounded-full px-4 text-[14px] font-semibold transition-colors";
const accentPill = `${pill} bg-accent text-ink hover:bg-[#5BE59A]`;
const outlinePill = `${pill} border border-[#A9A8A0] text-ink hover:border-ink`;

/**
 * Site header from the v2 design. `hero` renders the rounded card that sits on the
 * landing page's dark hero; `page` is the sticky bar used on every other page.
 */
export default function Navbar({
  authed = false,
  userName,
  variant = "page",
}: {
  authed?: boolean;
  userName?: string;
  variant?: "hero" | "page";
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { clear } = usePlotStore();

  const logout = async () => {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) return; // keep UI as-is if the server didn't clear the session
    } catch {
      return; // network error — don't optimistically show logged-out
    }
    clear();
    router.push("/");
    router.refresh();
  };

  const links = [...navLinks, ...(authed && SHOW_AGRIPLOT ? [{ label: "AgriPlot", href: "/agriplot" }] : [])];

  const bar = (
    <nav
      aria-label="Main"
      className={
        variant === "hero"
          ? "flex items-center justify-between gap-3.5 rounded-2xl bg-paper-header py-3 pr-3.5 pl-5.5 text-ink"
          : "mx-auto flex h-16 max-w-[1360px] items-center justify-between gap-3.5 px-5 text-ink sm:px-8"
      }
    >
      <Link href="/" aria-label="Locanix home" className="flex items-center">
        <Logo size={26} />
      </Link>

      <ul className="hidden items-center gap-9 text-[16px] font-medium lg:flex">
        {links.map((link) => (
          <li key={link.label}>
            <a href={link.href} className="text-ink no-underline hover:text-accent-deep">
              {link.label}
            </a>
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-2.5">
        {authed ? (
          <>
            {userName && <span className="hidden text-[14px] text-ink-soft xl:inline">Hi, {userName}</span>}
            <Link href="/dashboard" className={`${accentPill} hidden sm:inline-flex`}>
              Go to dashboard →
            </Link>
            <button
              type="button"
              onClick={logout}
              aria-label="Log out"
              className="hidden h-11 w-11 items-center justify-center rounded-full text-ink hover:bg-black/5 lg:inline-flex"
            >
              <LogOut className="h-5 w-5" aria-hidden="true" />
            </button>
          </>
        ) : (
          <>
            <a href="/login" className={`${outlinePill} hidden sm:inline-flex`}>
              Log in
            </a>
            <a href="/register" className={`${accentPill} inline-flex text-[15px] max-[379px]:hidden`}>
              Try Locanix →
            </a>
          </>
        )}
        <button
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full text-ink hover:bg-black/5 lg:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>
    </nav>
  );

  const menu = open && (
    <div
      id="mobile-menu"
      className={`lg:hidden ${variant === "hero" ? "mt-2 rounded-2xl bg-paper-header" : "border-t border-line bg-paper-header"}`}
    >
      <ul className="space-y-1 px-4 py-3 text-ink">
        {links.map((link) => (
          <li key={link.label}>
            <a href={link.href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 text-[16px] font-medium hover:bg-black/5">
              {link.label}
            </a>
          </li>
        ))}
        <li>
          <Link href="/contact" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 text-[16px] font-medium hover:bg-black/5">
            Contact
          </Link>
        </li>
        {authed ? (
          <>
            <li className="sm:hidden">
              <Link href="/dashboard" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 text-[16px] font-medium hover:bg-black/5">
                Go to dashboard
              </Link>
            </li>
            <li>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  logout();
                }}
                className="block w-full rounded-lg px-3 py-2.5 text-left text-[16px] font-medium hover:bg-black/5"
              >
                Log out
              </button>
            </li>
          </>
        ) : (
          <>
            <li className="sm:hidden">
              <a href="/login" className="block rounded-lg px-3 py-2.5 text-[16px] font-medium hover:bg-black/5">
                Log in
              </a>
            </li>
            <li className="min-[380px]:hidden">
              <a href="/register" className="block rounded-lg px-3 py-2.5 text-[16px] font-medium hover:bg-black/5">
                Try Locanix
              </a>
            </li>
          </>
        )}
      </ul>
    </div>
  );

  if (variant === "hero") {
    return (
      <header className="relative z-20 leading-[normal]">
        {bar}
        {menu}
      </header>
    );
  }
  return (
    <header className="sticky top-0 z-50 leading-[normal] border-b border-line bg-paper-header/95 backdrop-blur">
      {bar}
      {menu}
    </header>
  );
}
