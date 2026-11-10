import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { dataDir } from "@/lib/server/dataDir";

/**
 * A stand-in for Duitku POP, for local runs and e2e tests. It exists only with
 * DUITKU_MOCK=1 outside production; point the client at it with
 * DUITKU_BASE_URL=http://localhost:<port>/api/duitku-mock.
 *
 * It checks what Duitku documents: the HMAC-SHA256 header signature and a fresh
 * timestamp on createInvoice, Rp10.000 minimum, itemDetails adding up to the amount,
 * the same response for a repeated order ID, and signed status requests. Its payment
 * page offers Pay, Pay without callback (only the return redirect) and Cancel; the
 * callback is signed with the merchant's API key like Duitku's.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const enabled = () => process.env.DUITKU_MOCK === "1" && process.env.NODE_ENV !== "production";
const code = () => process.env.DUITKU_MERCHANT_CODE || "";
const key = () => process.env.DUITKU_API_KEY || "";
const sign = (text: string) => createHmac("sha256", key()).update(text, "utf8").digest("hex");
const same = (a: string, b: string) => {
  const x = Buffer.from(a.toLowerCase());
  const y = Buffer.from(b.toLowerCase());
  return x.length === y.length && timingSafeEqual(x, y);
};

type Invoice = {
  reference: string;
  merchantOrderId: string;
  amount: number;
  productDetails: string;
  email: string;
  returnUrl: string;
  callbackUrl: string;
  status: "00" | "01" | "02";
  createdAt: number;
  callbackStatus?: number;
};
type MockState = { invoices: Record<string, Invoice> };

const dir = () => dataDir("duitku-mock");
async function load(): Promise<MockState> {
  try {
    return JSON.parse(await readFile(path.join(dir(), "state.json"), "utf8"));
  } catch {
    return { invoices: {} };
  }
}
async function save(state: MockState) {
  await mkdir(dir(), { recursive: true });
  const temp = path.join(dir(), `state.${randomBytes(4).toString("hex")}.tmp`);
  await writeFile(temp, JSON.stringify(state));
  await rename(temp, path.join(dir(), "state.json"));
}

const fail = (status: number, message: string) => Response.json({ Message: message }, { status });
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const rupiah = (n: number) => "Rp" + n.toLocaleString("id-ID");

export async function POST(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  if (!enabled()) return new Response("Not found", { status: 404 });
  const route = (await ctx.params).path.join("/");
  const url = new URL(req.url);

  if (route === "api/merchant/createInvoice") {
    const merchant = req.headers.get("x-duitku-merchantcode") ?? "";
    const timestamp = req.headers.get("x-duitku-timestamp") ?? "";
    const signature = req.headers.get("x-duitku-signature") ?? "";
    if (merchant !== code() || !signature || !same(sign(merchant + timestamp), signature)) return fail(401, "Invalid signature");
    if (!/^\d{13}$/.test(timestamp) || Math.abs(Date.now() - Number(timestamp)) > 5 * 60_000) return fail(401, "Invalid timestamp");
    const body = await req.json().catch(() => null);
    if (!body) return fail(400, "Invalid request");
    const amount = body.paymentAmount;
    if (!Number.isInteger(amount)) return fail(400, "paymentAmount is mandatory");
    if (amount < 10000) return fail(400, "Minimum Payment 10000 IDR");
    if (typeof body.merchantOrderId !== "string" || !body.merchantOrderId) return fail(400, "merchantOrderId is mandatory");
    if (body.merchantOrderId.length > 50) return fail(400, "length of merchantOrderId can't > 50");
    if (typeof body.email !== "string" || !body.email.includes("@") || body.email.length > 50) return fail(400, "Invalid Email Address");
    for (const field of ["productDetails", "returnUrl", "callbackUrl"]) if (typeof body[field] !== "string" || !body[field]) return fail(400, `${field} is mandatory`);
    const items = Array.isArray(body.itemDetails) ? body.itemDetails : [];
    if (items.length && items.reduce((s: number, i: { price: number; quantity: number }) => s + i.price * i.quantity, 0) !== amount) return fail(400, "Amount is different with itemDetails");

    const state = await load();
    const existing = state.invoices[body.merchantOrderId];
    if (existing && existing.amount !== amount) return fail(400, "Amount is different please try again later");
    const invoice: Invoice = existing ?? {
      reference: "DMOCK" + randomBytes(8).toString("hex").toUpperCase().slice(0, 15),
      merchantOrderId: body.merchantOrderId,
      amount,
      productDetails: body.productDetails,
      email: body.email,
      returnUrl: body.returnUrl,
      callbackUrl: body.callbackUrl,
      status: "01",
      createdAt: Date.now(),
    };
    state.invoices[invoice.merchantOrderId] = invoice;
    await save(state);
    return Response.json({
      merchantCode: code(),
      reference: invoice.reference,
      paymentUrl: `${url.origin}/api/duitku-mock/pay?reference=${invoice.reference}`,
      statusCode: "00",
      statusMessage: "SUCCESS",
    });
  }

  if (route === "webapi/api/merchant/transactionStatus") {
    const body = await req.json().catch(() => null);
    if (!body || body.merchantCode !== code() || typeof body.merchantOrderId !== "string" || typeof body.signature !== "string") return fail(400, "Invalid request");
    if (!same(sign(body.merchantCode + body.merchantOrderId), body.signature)) return fail(401, "Invalid signature");
    const invoice = (await load()).invoices[body.merchantOrderId];
    if (!invoice) return fail(400, "Transaction not found");
    return Response.json({
      merchantOrderId: invoice.merchantOrderId,
      reference: invoice.reference,
      amount: String(invoice.amount),
      fee: "0.00",
      statusCode: invoice.status,
      statusMessage: { "00": "SUCCESS", "01": "PROCESS", "02": "FAILED" }[invoice.status],
    });
  }

  if (route === "pay") {
    const form = new URLSearchParams(await req.text());
    const action = form.get("action");
    const state = await load();
    const invoice = Object.values(state.invoices).find((i) => i.reference === url.searchParams.get("reference"));
    if (!invoice) return new Response("Unknown payment", { status: 404 });
    if (invoice.status === "01") invoice.status = action === "cancel" ? "02" : "00";
    await save(state);
    if (action !== "nocallback") {
      const fields = {
        merchantCode: code(),
        amount: String(invoice.amount),
        merchantOrderId: invoice.merchantOrderId,
        productDetail: invoice.productDetails,
        additionalParam: "",
        paymentCode: "BC",
        resultCode: invoice.status === "00" ? "00" : "01",
        merchantUserId: invoice.email,
        reference: invoice.reference,
        signature: sign(code() + invoice.amount + invoice.merchantOrderId),
        publisherOrderId: "MOCK" + invoice.reference.slice(5),
        settlementDate: new Date().toISOString().slice(0, 10),
      };
      const response = await fetch(invoice.callbackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(fields).toString(),
        signal: AbortSignal.timeout(30000),
      }).catch(() => null);
      const fresh = await load();
      if (fresh.invoices[invoice.merchantOrderId]) fresh.invoices[invoice.merchantOrderId].callbackStatus = response?.status ?? 0;
      await save(fresh);
    }
    const back = new URL(invoice.returnUrl);
    back.searchParams.set("merchantOrderId", invoice.merchantOrderId);
    back.searchParams.set("resultCode", invoice.status === "00" ? "00" : "02");
    back.searchParams.set("reference", invoice.reference);
    return Response.redirect(back.toString(), 303);
  }

  return new Response("Not found", { status: 404 });
}

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  if (!enabled()) return new Response("Not found", { status: 404 });
  const route = (await ctx.params).path.join("/");
  if (route !== "pay") return new Response("Not found", { status: 404 });
  const reference = new URL(req.url).searchParams.get("reference") ?? "";
  const invoice = Object.values((await load()).invoices).find((i) => i.reference === reference);
  if (!invoice) return new Response("Unknown payment", { status: 404 });
  const button = (action: string, label: string) =>
    `<button name="action" value="${action}" style="font:inherit;padding:10px 16px;margin:4px;border-radius:8px;border:1px solid #333;background:${action === "pay" ? "#111;color:#fff" : "#fff"}">${label}</button>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mock Duitku payment</title></head>
<body style="font-family:system-ui,sans-serif;max-width:520px;margin:48px auto;padding:0 16px">
<h1>Mock Duitku payment</h1>
<p>Local test page. No money moves.</p>
<p>${esc(invoice.productDetails)}</p>
<p><strong data-testid="amount">${rupiah(invoice.amount)}</strong> · ${esc(invoice.reference)}</p>
<form method="post" action="/api/duitku-mock/pay?reference=${esc(invoice.reference)}">
${invoice.status === "01" ? button("pay", "Pay") + button("nocallback", "Pay without callback") + button("cancel", "Cancel") : `<p>Status: ${invoice.status}</p>${button("pay", "Back to merchant")}`}
</form></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
