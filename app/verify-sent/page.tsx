"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MailCheck } from "lucide-react";
import Navbar from "@/components/Navbar";

export default function VerifySentPage() {
  return (
    <Suspense>
      <VerifySentInner />
    </Suspense>
  );
}

function VerifySentInner() {
  const email = useSearchParams().get("email") || "";
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");

  const resend = async () => {
    if (state === "sending") return;
    setState("sending");
    try {
      await fetch("/api/auth/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch {
      /* ignore */
    }
    setState("sent");
  };

  return (
    <>
      <Navbar />
      <main className="bg-gradient-to-b from-white to-slate-100 min-h-[calc(100vh-4rem)]">
        <div className="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6">
          <h1 className="text-4xl font-extrabold text-slate-900">
            You&apos;re ready to go!
          </h1>
          <h2 className="mt-3 text-2xl font-bold text-slate-700">
            Check your email to begin
          </h2>

          <div className="mt-8 flex justify-center">
            <MailCheck className="h-8 w-8 text-ink" aria-hidden="true" />
          </div>

          <p className="mx-auto mt-8 max-w-lg text-slate-600">
            We sent a confirmation link to{" "}
            <span className="font-semibold text-ink">
              {email || "your email address"}
            </span>
            . Click the link to verify your account and get started.
          </p>

          <p className="mt-10 text-slate-600">Didn&apos;t receive it?</p>
          <p className="mt-1 text-slate-600">
            Check your spam folder, or{" "}
            {state === "sent" ? (
              <span className="font-semibold text-emerald-600">email sent ✓</span>
            ) : (
              <button
                type="button"
                onClick={resend}
                disabled={state === "sending"}
                className="font-semibold text-ink hover:underline disabled:opacity-60"
              >
                {state === "sending" ? "resending…" : "resend the email"}
              </button>
            )}
          </p>
        </div>
      </main>
    </>
  );
}
