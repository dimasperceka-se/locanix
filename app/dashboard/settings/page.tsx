"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePlotStore } from "@/lib/plotStore";
import { ui } from "@/components/workspace/ui";

export default function SettingsPage() {
  const router = useRouter();
  const { userName, userEmail, clear } = usePlotStore();
  const [reset, setReset] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const sendReset = async () => {
    setReset("sending");
    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail }),
      });
      setReset(res.ok ? "sent" : "error");
    } catch {
      setReset("error");
    }
  };

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

  const section = `${ui.card} flex flex-col gap-4 p-6`;
  const h2 = "m-0 font-display text-[20px] font-semibold";

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <span className={ui.eyebrow}>Account</span>
        <h1 className={ui.h1}>Settings</h1>
      </div>

      <div className="grid max-w-[880px] gap-4">
        <section className={section}>
          <h2 className={h2}>Profile</h2>
          <dl className="m-0 grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <dt className="text-[13px] text-muted">Name</dt>
              <dd className="m-0 font-semibold">{userName}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-[13px] text-muted">Email</dt>
              <dd className="m-0 font-semibold break-all">{userEmail}</dd>
            </div>
          </dl>
        </section>

        <section className={section}>
          <h2 className={h2}>Password</h2>
          <p className="m-0 text-[14px] leading-[1.6] text-ink-soft">
            We&apos;ll email a link to <strong className="text-ink">{userEmail}</strong> where you can choose a new password. The
            link is valid for one hour.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={sendReset} disabled={reset === "sending" || reset === "sent"} className={ui.btnOutline}>
              {reset === "sending" ? "Sending…" : "Send password reset link"}
            </button>
            {reset === "sent" && (
              <span role="status" className="text-[14px] text-clear-ink">
                Check your email for the reset link.
              </span>
            )}
            {reset === "error" && (
              <span role="alert" className="text-[14px] text-red-700">
                Couldn&apos;t send the link. Please try again.
              </span>
            )}
          </div>
        </section>

        <section className={section}>
          <h2 className={h2}>Billing</h2>
          <p className="m-0 text-[14px] leading-[1.6] text-ink-soft">Change your plan, pay for plots or cancel a subscription.</p>
          <div>
            <Link href="/checkout" className={ui.btnOutline}>
              Open billing
            </Link>
          </div>
        </section>

        <section className={section}>
          <h2 className={h2}>Session</h2>
          <div>
            <button type="button" onClick={logout} className={ui.btnDark}>
              Log out
            </button>
          </div>
        </section>
      </div>
    </>
  );
}
