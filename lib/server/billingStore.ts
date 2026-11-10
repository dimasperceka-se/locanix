import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { BillingError } from "./paypal";
import { duitkuEnvironment } from "./duitku";
import { dataDir } from "./dataDir";

export type Plan = "payg" | "regular" | "pro";
/** "card": PayPal's guest card form (no PayPal account); "paypal": PayPal login;
 *  "duitku": Duitku's hosted page in rupiah (QRIS, virtual accounts, e-wallets). */
export type PayMethod = "paypal" | "card" | "duitku";
export type BilledPlot = { key: string; areaHa: number };
export type Purchase = {
  id: string; uid: string; plan: Plan; amount: string; currency: string;
  plots: BilledPlot[]; createdAt: number; providerId?: string; approvalUrl?: string;
  planId?: string; status: string; captureId?: string; revoked?: boolean;
  periodId?: string; expiresAt?: number; used: Record<string, number>;
  method?: PayMethod; // absent on records from before card payments (= "paypal")
  provider?: "paypal" | "duitku"; // absent = "paypal"
  providerEnv?: string; paidAt?: number; checkedAt?: number;
};

/**
 * One ledger per environment, so test payments never unlock live access. PayPal
 * and Duitku must agree: both sandbox, or PayPal live with Duitku production.
 */
export function billingEnvironment(): "sandbox" | "live" {
  const paypal = process.env.PAYPAL_ENV;
  const duitku = duitkuEnvironment();
  const fromDuitku = duitku === "production" ? "live" : duitku;
  if (paypal === "sandbox" || paypal === "live") {
    if (fromDuitku && fromDuitku !== paypal) throw new BillingError("Payments are misconfigured: PayPal and Duitku must both be sandbox, or live and production.", 503);
    return paypal;
  }
  if (fromDuitku) return fromDuitku;
  throw new BillingError("Payments are not configured.", 503);
}
export type BillingState = {
  purchases: Record<string, Purchase>;
  events: Record<string, number>;
  free: Record<string, Record<string, number>>;
};

// Local single-host storage. Cross-process lock + atomic replacement prevent lost
// updates between callbacks, webhook deliveries and concurrent analysis requests.
// Fail closed on corruption; never replace an unreadable ledger with an empty one.
export async function billingTransaction<T>(fn: (state: BillingState) => Promise<T> | T): Promise<T> {
  const dir = dataDir("billing", billingEnvironment());
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const lock = path.join(dir, "lock");
  const deadline = Date.now() + 45000;
  while (true) {
    try { await mkdir(lock); break; } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      if (Date.now() > deadline) throw new BillingError("Billing is busy. Please retry.", 503);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  const file = path.join(dir, "ledger.json");
  const temp = path.join(dir, `${randomUUID()}.tmp`);
  try {
    let state: BillingState;
    try { state = JSON.parse(await readFile(file, "utf8")); }
    catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      state = { purchases: {}, events: {}, free: {} };
    }
    const result = await fn(state);
    await writeFile(temp, JSON.stringify(state), { mode: 0o600 });
    await rename(temp, file);
    return result;
  } finally {
    await rm(temp, { force: true });
    await rm(lock, { recursive: true, force: true });
  }
}
