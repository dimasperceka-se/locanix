"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { checkoutHref } from "@/lib/checkoutSelection";

// PayPal activates subscriptions (and records their first payment) asynchronously.
const SETTLING = ["APPROVED", "ACTIVE", "PENDING", "UNVERIFIED"];

export default function PaymentReturn() {
  const [message, setMessage] = useState("Checking your payment with PayPal…");
  const [busy, setBusy] = useState(true);
  const [back, setBack] = useState("/checkout");
  const confirm = async () => {
    setBusy(true);
    try {
      const id = new URLSearchParams(window.location.search).get("purchase");
      if (!id) throw new Error("Missing checkout reference. Please return to checkout.");
      for (let attempt = 0; ; attempt++) {
        const response = await fetch("/api/paypal/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "confirm", id }) });
        const data = await response.json();
        if (!response.ok) throw new Error(response.status === 401 ? "Please sign in, then return to this page to verify your payment." : data.error);
        if (data.paid) {
          // Remove only the idempotency key for this completed purchase.
          for (const key of Object.keys(sessionStorage)) if (key.startsWith("locanix.checkout.") && sessionStorage.getItem(key) === id) sessionStorage.removeItem(key);
          window.location.replace("/dashboard");
          return;
        }
        if (!SETTLING.includes(data.status) || attempt >= 10) {
          setMessage("Your payment is not confirmed yet (" + data.status + "). If you approved it, wait a moment and check again. Access starts after payment is confirmed.");
          break;
        }
        setMessage("PayPal is finalising your payment…");
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    } catch (e) { setMessage((e as Error).message); }
    setBusy(false);
  };
  useEffect(() => { setBack(checkoutHref()); void confirm(); }, []);
  return <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
    <section className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-bold text-ink">PayPal payment</h1>
      <p role="status" className="mt-4 text-slate-600">{message}</p>
      {!busy && <button onClick={confirm} className="mt-6 rounded-lg bg-ink px-5 py-3 font-semibold text-white">Check payment again</button>}
      <Link href={back} className="mt-5 block text-sm text-ink underline">Return to checkout</Link>
    </section>
  </main>;
}
