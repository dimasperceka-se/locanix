import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { BillingError, paypalEnvironment } from "./paypal";
import { dataDir } from "./dataDir";

export type Plan = "payg" | "regular" | "pro";
/** "card": PayPal's guest card form (no PayPal account); "paypal": PayPal login. */
export type PayMethod = "paypal" | "card";
export type BilledPlot = { key: string; areaHa: number };
export type Purchase = {
  id: string; uid: string; plan: Plan; amount: string; currency: string;
  plots: BilledPlot[]; createdAt: number; providerId?: string; approvalUrl?: string;
  planId?: string; status: string; captureId?: string; revoked?: boolean;
  periodId?: string; expiresAt?: number; used: Record<string, number>;
  method?: PayMethod; // absent on records from before card payments (= "paypal")
};
export type BillingState = {
  purchases: Record<string, Purchase>;
  events: Record<string, number>;
  free: Record<string, Record<string, number>>;
};

// Local single-host storage. Cross-process lock + atomic replacement prevent lost
// updates between callbacks, webhook deliveries and concurrent analysis requests.
// Fail closed on corruption; never replace an unreadable ledger with an empty one.
export async function billingTransaction<T>(fn: (state: BillingState) => Promise<T> | T): Promise<T> {
  const dir = dataDir("billing", paypalEnvironment());
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
