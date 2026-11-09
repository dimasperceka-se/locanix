import type { Plot } from "./geo";
import { FREE_QUOTA_HA } from "./quota";
export type Usage = {
  freeUsedHa: number;
  paid: boolean;
  quotaHa: number;
  remainingHa: number;
};

const FALLBACK: Usage = { freeUsedHa: 0, paid: false, quotaHa: FREE_QUOTA_HA, remainingHa: FREE_QUOTA_HA };

export type Decision = "paid" | "survey" | "report" | "payment";

/** Server-authoritative routing decision. Returns null on error (caller fails closed). */
export async function authorize(
  plots: Plot[],
): Promise<{ decision: Decision } & Usage | null> {
  try {
    const res = await fetch("/api/usage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "authorize", plots: plots.map(p => ({ ring: p.ring })) }),
    });
    if (!res.ok) return null;
    return (await res.json()) as { decision: Decision } & Usage;
  } catch {
    return null;
  }
}

export async function getUsage(): Promise<Usage> {
  try {
    const res = await fetch("/api/usage", { cache: "no-store" });
    if (!res.ok) return FALLBACK;
    return (await res.json()) as Usage;
  } catch {
    return FALLBACK;
  }
}

export async function consumeQuota(area: number): Promise<Usage> {
  try {
    const res = await fetch("/api/usage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "consume", area }),
    });
    return (await res.json()) as Usage;
  } catch {
    return FALLBACK;
  }
}
