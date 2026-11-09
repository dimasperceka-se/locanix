"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import Navbar from "@/components/Navbar";
import GoogleButton from "@/components/GoogleButton";
import TermsModal from "@/components/TermsModal";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirm: "",
  });
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const createAccount = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not create account.");
      } else {
        router.push(`/verify-sent?email=${encodeURIComponent(form.email)}`);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (form.password !== form.confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    // Require agreement to the Terms & Conditions before creating the account.
    if (!agreed) {
      setShowTerms(true);
      return;
    }
    void createAccount();
  };

  const handleAgree = () => {
    setAgreed(true);
    setShowTerms(false);
    void createAccount();
  };

  return (
    <>
      <Navbar />
      <main className="bg-gradient-to-b from-white to-slate-100 min-h-[calc(100vh-4rem)]">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h1 className="text-center text-4xl font-extrabold text-slate-900">
            Create an account
          </h1>

          <div className="mx-auto mt-10 max-w-2xl">
            <GoogleButton label="Continue with Google" />

            <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
              <span className="h-px flex-1 bg-slate-200" />
              or
              <span className="h-px flex-1 bg-slate-200" />
            </div>

            <form onSubmit={submit} className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field label="Name">
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={set("name")}
                  placeholder="Enter your name"
                  autoComplete="name"
                  className={inputCls}
                />
              </Field>
              <Field label="Email address">
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={set("email")}
                  placeholder="Enter your email address"
                  autoComplete="email"
                  className={inputCls}
                />
              </Field>
              <Field label="Password">
                <input
                  type={show ? "text" : "password"}
                  required
                  value={form.password}
                  onChange={set("password")}
                  placeholder="Enter your password"
                  autoComplete="new-password"
                  className={inputCls}
                />
              </Field>
              <Field label="Password Confirmation">
                <div className="relative">
                  <input
                    type={show ? "text" : "password"}
                    required
                    value={form.confirm}
                    onChange={set("confirm")}
                    placeholder="Re-write your password"
                    autoComplete="new-password"
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
              </Field>

              {error && (
                <p className="sm:col-span-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="sm:col-span-2 rounded-lg bg-ink py-3 text-sm font-semibold text-white transition-colors hover:bg-ink-mid disabled:opacity-60"
              >
                {busy ? "Creating account…" : "Create account"}
              </button>
            </form>

            <p className="mt-4 text-center text-xs text-slate-400">
              By creating an account you agree to our{" "}
              <button
                type="button"
                onClick={() => setShowTerms(true)}
                className="font-semibold text-ink hover:underline"
              >
                Terms &amp; Conditions
              </button>
              .
            </p>

            <p className="mt-6 text-center text-sm text-slate-500">
              Already have an account?{" "}
              <Link href="/login" className="font-semibold text-ink hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </main>

      <TermsModal
        open={showTerms}
        onClose={() => setShowTerms(false)}
        onAgree={handleAgree}
      />
    </>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-slate-400 focus:border-ink";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-ink">{label}</span>
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}
