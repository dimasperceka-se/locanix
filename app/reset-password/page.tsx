"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import AuthShell, { buttonCls, inputCls } from "@/components/AuthShell";

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordInner />
    </Suspense>
  );
}

function ResetPasswordInner() {
  const router = useRouter();
  const token = useSearchParams().get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, confirm }),
      });
      if (res.ok) {
        router.replace("/login?reset=1");
        return;
      }
      setError((await res.json()).error || "Could not reset the password.");
    } catch {
      setError("Network error. Please try again.");
    }
    setBusy(false);
  };

  return (
    <AuthShell label="Reset password">
      <h1 className="text-2xl font-bold text-slate-900">Choose a new password</h1>
      {!token ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          This reset link is incomplete. Please request a new one.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div className="relative">
            <input
              type={show ? "text" : "password"}
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password (min. 8 characters)"
              aria-label="New password"
              className={`${inputCls} pr-10`}
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
          <input
            type={show ? "text" : "password"}
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm new password"
            aria-label="Confirm new password"
            className={inputCls}
          />
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-600">{error}</p>}
          <button type="submit" disabled={busy} className={buttonCls}>
            {busy ? "Saving…" : "Save new password"}
          </button>
        </form>
      )}
      <p className="mt-6 text-center text-sm">
        <Link href="/forgot-password" className="font-semibold text-ink hover:underline">
          Request a new link
        </Link>
        <span className="mx-2 text-slate-300">|</span>
        <Link href="/login" className="font-semibold text-ink hover:underline">
          Back to log in
        </Link>
      </p>
    </AuthShell>
  );
}
