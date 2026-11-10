"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { checkoutHref } from "@/lib/checkoutSelection";

type Confirm = { paid: boolean; status: string; paymentUrl?: string };

// Duitku's resultCode in the URL is only a hint (it can be edited); the server
// asks Duitku for the real status. Virtual accounts can be paid hours later.
export default function DuitkuReturn() {
  const [message, setMessage] = useState("Checking your payment with Duitku…");
  const [busy, setBusy] = useState(true);
  const [paymentUrl, setPaymentUrl] = useState("");
  const [back, setBack] = useState("/checkout");

  const confirm = async () => {
    setBusy(true);
    try {
      const id = new URLSearchParams(window.location.search).get("merchantOrderId");
      if (!id) throw new Error("Missing checkout reference. Please return to checkout.");
      for (let attempt = 0; ; attempt++) {
        const response = await fetch("/api/paypal/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "confirm", id }),
        });
        const data = (await response.json()) as Confirm & { error?: string };
        if (!response.ok) throw new Error(response.status === 401 ? "Please sign in, then return to this page to check your payment." : data.error);
        // A paid or dead invoice must not be reused by the next checkout.
        if (data.paid || data.status === "FAILED") {
          for (const key of Object.keys(sessionStorage)) if (key.startsWith("locanix.checkout.") && sessionStorage.getItem(key) === id) sessionStorage.removeItem(key);
        }
        if (data.paid) {
          window.location.replace("/dashboard");
          return;
        }
        if (data.status === "FAILED") {
          setPaymentUrl("");
          setMessage("This payment was cancelled or has expired. Nothing was charged. You can start a new payment from checkout.");
          break;
        }
        setPaymentUrl(data.paymentUrl ?? "");
        if (attempt >= 5) {
          setMessage(
            "We haven’t received your payment yet. If you chose a virtual account or QRIS, finish paying in your banking or e-wallet app; access starts automatically once Duitku confirms it.",
          );
          break;
        }
        setMessage("Waiting for Duitku to confirm your payment…");
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    } catch (e) {
      setMessage((e as Error).message);
    }
    setBusy(false);
  };

  useEffect(() => {
    setBack(checkoutHref());
    void confirm();
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <section className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-ink">Rupiah payment</h1>
        <p role="status" className="mt-4 text-slate-600">
          {message}
        </p>
        {!busy && (
          <div className="mt-6 flex flex-wrap gap-3">
            {paymentUrl && (
              <a href={paymentUrl} className="rounded-lg bg-ink px-5 py-3 font-semibold text-white no-underline">
                Continue payment
              </a>
            )}
            <button onClick={confirm} className={`rounded-lg px-5 py-3 font-semibold ${paymentUrl ? "border border-ink bg-white text-ink" : "bg-ink text-white"}`}>
              Check payment again
            </button>
          </div>
        )}
        <Link href={back} className="mt-5 block text-sm text-ink underline">
          Return to checkout
        </Link>
      </section>
    </main>
  );
}
