"use client";

import { useState } from "react";
import { CURRENCIES, pricingTiers, type CurrencyKey } from "@/lib/data";
import { FREE_QUOTA_HA } from "@/lib/quota";

const CURRENCY_KEYS: CurrencyKey[] = ["idr", "usd"];

export default function Pricing() {
  const [cur, setCur] = useState<CurrencyKey>("usd");

  return (
    <section id="pricing" className="border-t border-line bg-paper-warm text-ink">
      <div className="mx-auto flex max-w-[1360px] flex-col gap-12 px-5 py-20 sm:px-10 md:py-30">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="flex max-w-[680px] flex-col gap-4.5">
            <span className="eyebrow text-accent-deep">Pricing</span>
            <h2 className="m-0 font-display text-[clamp(36px,4.4vw,60px)] leading-[1.02] font-semibold tracking-[-0.035em]">
              Pay per hectare. Or subscribe.
            </h2>
            <p className="m-0 text-[17px] text-ink-soft">First {FREE_QUOTA_HA} ha free on every plan.</p>
          </div>
          <div role="group" aria-label="Currency" className="inline-flex gap-1 rounded-full border border-[#DAD9D2] bg-white p-1">
            {CURRENCY_KEYS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCur(c)}
                aria-pressed={cur === c}
                className={`min-h-10 cursor-pointer rounded-full border-0 px-4.5 text-[14px] ${
                  cur === c ? "bg-ink font-semibold text-paper" : "bg-transparent font-medium text-ink-soft hover:text-ink"
                }`}
              >
                {CURRENCIES[c].label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] gap-4">
          {pricingTiers.map((tier) => {
            const dark = !!tier.featured;
            const price = tier[cur];
            const muted = dark ? "text-[#B9BFBB]" : "text-ink-soft";
            return (
              <article
                key={tier.name}
                className={`flex flex-col gap-3.5 rounded-[18px] border p-8 ${
                  dark ? "border-ink bg-ink text-[#F2F2EE]" : "border-line bg-white text-ink"
                }`}
              >
                <h3 className="m-0 font-display text-[20px] font-semibold">{tier.name}</h3>
                <p className={`m-0 text-[15px] leading-[1.5] ${muted}`}>{tier.tagline}</p>
                <div className="mt-2 flex flex-wrap items-baseline gap-1.5">
                  <span className="font-display text-[44px] font-semibold tracking-[-0.03em]">{price.amount}</span>
                  <span className={`text-[15px] ${muted}`}>{price.unit}</span>
                </div>
                <p className="m-0 text-[14px] font-semibold">{tier.sub}</p>
                <a
                  href="/checkout"
                  className={`my-1.5 box-border inline-flex min-h-12 items-center justify-center rounded-full px-4.5 text-center text-[15px] font-semibold no-underline ${
                    dark ? "bg-accent text-ink hover:bg-[#5BE59A]" : "border border-line-strong text-ink hover:border-ink"
                  }`}
                >
                  {tier.cta}
                </a>
                <ul className="m-0 flex list-none flex-col gap-2.5 p-0 text-[15px]">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <span className={`mt-2 h-1.5 w-1.5 flex-none rounded-full ${dark ? "bg-accent" : "bg-ink"}`} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <p
                  className={`m-0 mt-auto border-t pt-4 text-[13px] leading-[1.5] ${
                    dark ? "border-[#2E3431] text-[#A9AFAB]" : "border-[#ECEBE5] text-muted"
                  }`}
                >
                  {tier.note[cur]}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
