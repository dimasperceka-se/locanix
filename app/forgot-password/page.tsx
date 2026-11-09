"use client";

import { useState } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import AuthShell, { buttonCls, inputCls } from "@/components/AuthShell";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) setError((await res.json()).error || "Could not send the reset link.");
      else setSent(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell label="Reset password">
      {sent ? (
        <>
          <MailCheck className="h-8 w-8 text-ink" aria-hidden="true" />
          <h1 className="mt-4 text-2xl font-bold text-slate-900">Check your email</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            If an Locanix account exists for <span className="font-semibold text-ink">{email}</span>, we sent a
            link to reset your password. The link expires in 1 hour. Check your spam folder if it doesn&apos;t arrive.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-bold text-slate-900">Forgot your password?</h1>
          <p className="mt-2 text-sm text-slate-600">Enter your account email and we&apos;ll send you a link to choose a new one.</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              aria-label="Email"
              className={inputCls}
            />
            {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-600">{error}</p>}
            <button type="submit" disabled={busy} className={buttonCls}>
              {busy ? "Sending…" : "Send reset link"}
            </button>
          </form>
        </>
      )}
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="font-semibold text-ink hover:underline">
          Back to log in
        </Link>
      </p>
    </AuthShell>
  );
}
