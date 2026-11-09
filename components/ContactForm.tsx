"use client";

import { useState } from "react";
import TermsModal from "./TermsModal";

const COUNTRY_CODES = ["+62", "+60", "+65", "+1", "+44", "+91", "+61"];

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-slate-400 focus:border-ink";

export default function ContactForm() {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    dialCode: "+62",
    phone: "",
    message: "",
  });
  const [agree, setAgree] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const set = (k: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!agree) {
      setError("Please agree to the Terms & Conditions.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone ? `${form.dialCode} ${form.phone}` : "",
          message: form.message,
          agree,
        }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Couldn't send your message.");
      else setSent(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <h3 className="text-lg font-bold text-emerald-800">Message sent 🎉</h3>
        <p className="mt-2 text-sm text-emerald-700">
          Thanks for reaching out — our team will get back to you shortly.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-2xl">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field label="First name" required>
          <input
            type="text"
            required
            value={form.firstName}
            onChange={set("firstName")}
            placeholder="Enter your first name"
            autoComplete="given-name"
            className={inputCls}
          />
        </Field>
        <Field label="Last name" required>
          <input
            type="text"
            required
            value={form.lastName}
            onChange={set("lastName")}
            placeholder="Enter your last name"
            autoComplete="family-name"
            className={inputCls}
          />
        </Field>
      </div>

      <div className="mt-5">
        <Field label="Email address" required>
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
      </div>

      <div className="mt-5">
        <Field label="Phone number" required>
          <div className="flex">
            <select
              value={form.dialCode}
              onChange={set("dialCode")}
              aria-label="Country code"
              className="rounded-l-lg border border-r-0 border-slate-200 bg-white px-2.5 py-2.5 text-sm text-ink outline-none focus:border-ink"
            >
              {COUNTRY_CODES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              type="tel"
              required
              value={form.phone}
              onChange={set("phone")}
              placeholder="800-0000-0000"
              autoComplete="tel"
              className={`${inputCls} rounded-l-none`}
            />
          </div>
        </Field>
      </div>

      <div className="mt-5">
        <Field label="Message">
          <textarea
            value={form.message}
            onChange={set("message")}
            placeholder="Leave us a message..."
            rows={4}
            className={`${inputCls} resize-y`}
          />
        </Field>
      </div>

      <label className="mt-5 flex items-center gap-2.5 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={agree}
          onChange={(e) => setAgree(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-ink focus:ring-ink"
        />
        <span>
          I agree to{" "}
          <button
            type="button"
            onClick={() => setShowTerms(true)}
            className="font-semibold text-ink hover:underline"
          >
            Terms &amp; Conditions
          </button>
        </span>
      </label>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="mt-6 w-full rounded-lg bg-ink py-3 text-sm font-semibold text-white transition-colors hover:bg-ink-mid disabled:opacity-60"
      >
        {busy ? "Sending…" : "Send message"}
      </button>

      <TermsModal
        open={showTerms}
        onClose={() => setShowTerms(false)}
        onAgree={() => {
          setAgree(true);
          setShowTerms(false);
        }}
      />
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-500">*</span>}
      </span>
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}
