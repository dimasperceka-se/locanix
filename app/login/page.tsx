"use client";

import { Suspense, useState } from "react";
import Logo from "@/components/Logo";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  Globe,
  Leaf,
} from "lucide-react";
import { legalLinks } from "@/lib/data";
import GoogleButton from "@/components/GoogleButton";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const rawNext = params.get("next") || "/";
  const next = /^\/(?![/\\])/.test(rawNext) ? rawNext : "/";
  const verified = params.get("verified");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Could not sign in.");
      else {
        // Invalidate the client router cache so the destination re-renders
        // with the new session (otherwise a prefetched logged-out page shows).
        router.push(next);
        router.refresh();
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-gradient-to-br from-paper via-paper to-paper-warm">
      <Decor />

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-5 py-4 sm:px-8">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center" aria-label="Locanix home">
            <Logo size={24} />
          </Link>
          <span className="h-5 w-px bg-slate-300" />
          <span className="text-sm font-medium text-slate-600">Log in</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-slate-600">
          <Globe className="h-4 w-4" aria-hidden="true" />
          Intl–English
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        </div>
      </header>

      {/* Content */}
      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 items-center px-5 py-8 sm:px-8">
        <div className="grid w-full items-center gap-12 lg:grid-cols-2">
          {/* Login card */}
          <div className="flex justify-center lg:justify-start">
            <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl ring-1 ring-slate-100">
              <h1 className="text-2xl font-bold text-slate-900">Log in with email</h1>

              {verified === "1" && (
                <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  Email verified — you can sign in now.
                </div>
              )}
              {params.get("reset") === "1" && (
                <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  Password updated — log in with your new password.
                </div>
              )}
              {verified === "0" && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  That verification link is invalid or expired.
                </div>
              )}

              <form onSubmit={submit} className="mt-6 space-y-4">
                <input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  aria-label="Email"
                  className="w-full rounded-md border border-slate-300 px-3.5 py-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-ink focus:ring-1 focus:ring-ink"
                />
                <div className="relative">
                  <input
                    type={show ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    aria-label="Password"
                    className="w-full rounded-md border border-slate-300 px-3.5 py-3 pr-10 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-ink focus:ring-1 focus:ring-ink"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    aria-label={show ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {error && (
                  <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-md bg-ink py-3 text-sm font-semibold text-white transition-colors hover:bg-ink-mid disabled:opacity-60"
                >
                  {busy ? "Logging in…" : "Log in"}
                </button>
              </form>

              <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
                <span className="h-px flex-1 bg-slate-200" />
                or
                <span className="h-px flex-1 bg-slate-200" />
              </div>

              <GoogleButton label="Log in with Google" />

              <p className="mt-6 text-center text-sm">
                <Link href="/register" className="font-semibold text-ink hover:underline">
                  Sign up
                </Link>
                <span className="mx-2 text-slate-300">|</span>
                <Link href="/forgot-password" className="font-semibold text-ink hover:underline">
                  Forgot password
                </Link>
              </p>
            </div>
          </div>

          {/* Marketing */}
          <div className="hidden lg:block">
            <h2 className="flex items-start gap-2 text-2xl font-bold leading-snug text-slate-800">
              <Leaf className="mt-1 h-6 w-6 shrink-0 text-accent" aria-hidden="true" />
              <span>
                EUDR compliance checks,
                <br />
                ready in minutes.
              </span>
            </h2>
            <p className="mt-4 max-w-md text-slate-500">
              Upload your plot boundaries and run deforestation + land legality
              analysis automatically — with an audit-ready report you can export in
              one click.
            </p>
            <Link
              href="/register"
              className="mt-6 inline-block rounded-md border border-ink px-6 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-ink hover:text-white"
            >
              Start Free
            </Link>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 flex flex-col items-center gap-3 px-5 py-8 text-center">
        <Logo size={22} />
        <p className="text-xs text-slate-400">
          Copyright © 2026 Locanix. All Rights Reserved.
        </p>
        <nav className="flex items-center gap-2 text-xs text-slate-400">
          {legalLinks.map((link, i) => (
            <span key={link.label} className="flex items-center gap-2">
              {i > 0 && <span className="text-slate-300">|</span>}
              <a href={link.href} className="hover:text-slate-600">
                {link.label}
              </a>
            </span>
          ))}
        </nav>
      </footer>
    </main>
  );
}

/* Decorative concentric "ribbon disc" in the bottom-right, à la Tencent Cloud. */
function Decor() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -bottom-40 -right-32 h-[36rem] w-[36rem] rounded-full bg-accent/10 blur-3xl" />
      <svg
        className="absolute bottom-0 right-0 h-[80vh] max-h-[720px] w-[60vw] max-w-[820px] opacity-70"
        viewBox="0 0 600 600"
        fill="none"
        preserveAspectRatio="xMaxYMax meet"
      >
        <defs>
          <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#C9F2DA" />
            <stop offset="100%" stopColor="#3DDC84" stopOpacity="0.5" />
          </linearGradient>
        </defs>
        <g transform="rotate(-18 560 560)">
          {[300, 250, 205, 165, 130, 100].map((rx, i) => (
            <ellipse
              key={rx}
              cx="560"
              cy="560"
              rx={rx}
              ry={rx * 0.62}
              stroke="url(#ring)"
              strokeWidth={i === 0 ? 2 : 1.25}
              strokeOpacity={0.55 - i * 0.05}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}
