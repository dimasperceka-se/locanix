import { NextResponse } from "next/server";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { dataDir } from "@/lib/server/dataDir";
import { PASSWORD_DIGEST, passwordDigest } from "@/lib/server/euis/wsse";
import { NS } from "@/lib/server/euis/client";
import { child, childText, esc, find, parseXml, type XmlNode } from "@/lib/server/euis/xml";

/**
 * A stand-in for the EUIS acceptance web services, for local runs and e2e tests.
 * It exists only with EUIS_MOCK=1 outside production; point the client at it with
 * EUIS_BASE_URL=http://localhost:<port>/api/euis-mock.
 *
 * It checks what the real service documents: the WS-Security UsernameToken digest
 * (any username, authentication key = EUIS_MOCK_AUTH_KEY, default "locanix-mock-key"),
 * a fresh timestamp, a single-use nonce and the WebServiceClientId header. A DDS is
 * SUBMITTED, then AVAILABLE (or REJECTED) after EUIS_MOCK_ANALYSIS_MS (default 3 s).
 *
 * Test hooks in the description of goods: MOCK-FAULT (validation fault, nothing stored),
 * MOCK-REJECT (rejected after analysis), MOCK-TIMEOUT (stored, then a gateway error page).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const enabled = () => process.env.EUIS_MOCK === "1" && process.env.NODE_ENV !== "production";
const mockKey = () => process.env.EUIS_MOCK_AUTH_KEY || "locanix-mock-key";
const analysisMs = () => Number(process.env.EUIS_MOCK_ANALYSIS_MS ?? 3000);
const ERR_NS = "http://ec.europa.eu/sanco/tracesnt/error/v01";

type MockRecord = {
  uuid: string;
  user: string;
  internalReference: string;
  country: string;
  description: string;
  createdAt: number;
  status: "SUBMITTED" | "AVAILABLE" | "REJECTED" | "WITHDRAWN";
  reject: boolean;
  referenceNumber?: string;
  verificationNumber?: string;
  updatedAt: number;
};
type MockState = { records: MockRecord[] };

const stateFile = () => path.join(dataDir("euis-mock"), "state.json");
async function load(): Promise<MockState> {
  try {
    return JSON.parse(await readFile(stateFile(), "utf8"));
  } catch {
    return { records: [] };
  }
}
async function save(state: MockState) {
  await mkdir(dataDir("euis-mock"), { recursive: true });
  await writeFile(stateFile(), JSON.stringify(state));
}

declare global {
  // eslint-disable-next-line no-var
  var _euisMockNonces: Map<string, number> | undefined;
}
const nonces = () => (global._euisMockNonces ??= new Map());

const xml = (body: string, status = 200) =>
  new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><S:Envelope xmlns:S="${NS.soap}"><S:Body>${body}</S:Body></S:Envelope>`, {
    status,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
const fault = (faultstring: string, detail = "") =>
  xml(`<S:Fault><faultcode>S:Server</faultcode><faultstring>${esc(faultstring)}</faultstring>${detail ? `<detail>${detail}</detail>` : ""}</S:Fault>`, 500);
const ruleFault = (name: "BusinessRulesValidationException" | "NotFoundException", id: string, message: string, field = "") =>
  fault(
    name === "NotFoundException" ? id : name,
    `<ns5:${name} xmlns:ns5="${NS.dds}" xmlns:err="${ERR_NS}"><err:Error><err:ID>${esc(id)}</err:ID><err:Message>${esc(message)}</err:Message><err:Field>${esc(field)}</err:Field></err:Error></ns5:${name}>`,
  );

function authenticate(doc: XmlNode): { user: string } | NextResponse {
  const header = child(doc, "Header");
  const security = child(header, "Security");
  const token = child(security, "UsernameToken");
  const password = child(token, "Password");
  const username = childText(token, "Username");
  const nonce = childText(token, "Nonce");
  const created = childText(token, "Created");
  // The real service answers a failed WS-Security check with a bare InternalSystemException.
  if (!security || !child(security, "Timestamp") || !username || !nonce || !created || password?.attrs.Type !== PASSWORD_DIGEST) {
    return fault("InternalSystemException");
  }
  if (Math.abs(Date.now() - Date.parse(created)) > 5 * 60 * 1000) return fault("InternalSystemException");
  const expected = Buffer.from(passwordDigest(Buffer.from(nonce, "base64"), created, mockKey()));
  const given = Buffer.from(password.text.trim());
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return fault("InternalSystemException");
  const seen = nonces();
  if (seen.has(nonce)) return fault("InternalSystemException");
  seen.set(nonce, Date.now());
  for (const [n, at] of seen) if (Date.now() - at > 10 * 60 * 1000) seen.delete(n);
  if (!childText(header, "WebServiceClientId")) return fault("WebServiceClientId header is missing");
  return { user: username };
}

const code = (n: number, alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789") =>
  Array.from(randomBytes(n), (b) => alphabet[b % alphabet.length]).join("");

/** SUBMITTED → AVAILABLE/REJECTED once the mock "risk analysis" has run. */
function advance(r: MockRecord) {
  if (r.status !== "SUBMITTED" || Date.now() - r.createdAt < analysisMs()) return false;
  if (r.reject) r.status = "REJECTED";
  else {
    r.status = "AVAILABLE";
    r.referenceNumber = `${String(new Date().getUTCFullYear()).slice(2)}${r.country || "BE"}${code(10)}`;
    r.verificationNumber = code(8);
  }
  r.updatedAt = Date.now();
  return true;
}

function overview(r: MockRecord): string {
  const c = (name: string, value: string | number | undefined) => (value === undefined ? "" : `<ns3:${name}>${esc(String(value))}</ns3:${name}>`);
  return (
    `<ns5:ddsOverviewList>` +
    c("uuid", r.uuid) +
    c("internalReferenceNumber", r.internalReference) +
    c("referenceNumber", r.status === "AVAILABLE" || r.status === "WITHDRAWN" ? r.referenceNumber : undefined) +
    c("referenceNumberInfo", r.status === "SUBMITTED" ? "Under system analysis" : r.status === "AVAILABLE" ? "Assigned" : undefined) +
    c("verificationNumber", r.status === "AVAILABLE" || r.status === "WITHDRAWN" ? r.verificationNumber : undefined) +
    c("status", r.status) +
    c("rejectionReason", r.status === "REJECTED" ? "Mock rejection requested in the description of goods." : undefined) +
    c("date", new Date(r.updatedAt).toISOString()) +
    c("updatedBy", "Mock EUIS") +
    c("version", 1) +
    `</ns5:ddsOverviewList>`
  );
}

const overviewResponse = (name: string, records: MockRecord[]) =>
  xml(`<ns5:${name} xmlns:ns5="${NS.dds}" xmlns:ns3="${NS.common}">${records.map(overview).join("")}</ns5:${name}>`);

async function dds(op: XmlNode, user: string): Promise<NextResponse> {
  const state = await load();
  const mine = state.records.filter((r) => r.user === user);

  if (op.local === "SubmitDdsRequest") {
    const statement = child(op, "statement");
    const commodity = child(statement, "commodities");
    const description = find(commodity, "descriptionOfGoods")?.text.trim() ?? "";
    const hs = childText(commodity, "hsHeading") ?? "";
    const activity = childText(statement, "activityType") ?? "";
    if (childText(op, "operatorRole") !== "OPERATOR" && childText(op, "operatorRole") !== "REPRESENTATIVE_OPERATOR") return ruleFault("BusinessRulesValidationException", "EUDR_ROLE", "Invalid operator role.", "operatorRole");
    if (!["IMPORT", "EXPORT", "DOMESTIC"].includes(activity)) return ruleFault("BusinessRulesValidationException", "EUDR_ACTIVITY", "Invalid activity type.", "activityType");
    if (!/^[0-9]{2,10}$/.test(hs)) return ruleFault("BusinessRulesValidationException", "EUDR_HS", "Invalid HS heading.", "hsHeading");
    if (!description || description.length > 150) return ruleFault("BusinessRulesValidationException", "EUDR_DESCRIPTION", "Description of goods is mandatory.", "descriptionOfGoods");
    const geo = find(commodity, "geometryGeojson")?.text.trim();
    try {
      const fc = JSON.parse(Buffer.from(geo ?? "", "base64").toString("utf8"));
      if (fc.type !== "FeatureCollection" || !Array.isArray(fc.features) || !fc.features.length) throw new Error();
      for (const f of fc.features) {
        const ring = f.geometry?.coordinates?.[0];
        if (f.geometry?.type !== "Polygon" || !Array.isArray(ring) || ring.length < 4 || JSON.stringify(ring[0]) !== JSON.stringify(ring[ring.length - 1])) throw new Error();
        if (ring.some((p: number[]) => p.some((n) => (String(n).split(".")[1] ?? "").length > 6))) throw new Error();
      }
    } catch {
      return ruleFault("BusinessRulesValidationException", "EUDR_GEOLOCATION", "The geolocation data is not valid GeoJSON.", "geometryGeojson");
    }
    if (description.includes("MOCK-FAULT")) return ruleFault("BusinessRulesValidationException", "EUDR_MOCK_RULE", "Mock validation error requested in the description of goods.", "descriptionOfGoods");
    const record: MockRecord = {
      uuid: randomUUID(),
      user,
      internalReference: childText(statement, "internalReferenceNumber") || code(14),
      country: childText(statement, "countryOfActivity") ?? "",
      description,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: "SUBMITTED",
      reject: description.includes("MOCK-REJECT"),
    };
    state.records.push(record);
    await save(state);
    if (description.includes("MOCK-TIMEOUT")) {
      return new NextResponse("<html><body><h1>504 Gateway Time-out</h1></body></html>", { status: 504, headers: { "Content-Type": "text/html" } });
    }
    return xml(`<ns5:SubmitDdsResponse xmlns:ns5="${NS.dds}"><ns5:uuid>${record.uuid}</ns5:uuid></ns5:SubmitDdsResponse>`);
  }

  if (op.local === "GetDdsRequest" || op.local === "GetDdsByInternalReferenceRequest") {
    const byRef = op.local === "GetDdsByInternalReferenceRequest";
    const wanted = byRef ? [childText(op, "internalReference")] : op.children.filter((c) => c.local === "uuidList").map((c) => c.text.trim());
    const found = mine.filter((r) => (byRef ? wanted.includes(r.internalReference) : wanted.includes(r.uuid)));
    if (!found.length) return ruleFault("NotFoundException", "EUDR_WEBSERVICE_DDS_NOT_FOUND_OR_NO_ACCESS", "Statement not found.");
    if (found.map(advance).some(Boolean)) await save(state);
    return overviewResponse(byRef ? "GetDdsByInternalReferenceResponse" : "GetDdsResponse", found);
  }

  if (op.local === "WithdrawDdsRequest") {
    const record = mine.find((r) => r.uuid === childText(op, "uuid"));
    if (!record) return ruleFault("NotFoundException", "EUDR_WEBSERVICE_DDS_NOT_FOUND_OR_NO_ACCESS", "Statement not found.");
    advance(record);
    if (record.status !== "AVAILABLE") {
      await save(state);
      return ruleFault("BusinessRulesValidationException", "EUDR_WITHDRAW_NOT_AVAILABLE", "Only a DDS in AVAILABLE status can be withdrawn.");
    }
    record.status = "WITHDRAWN";
    record.updatedAt = Date.now();
    await save(state);
    return xml(`<ns5:WithdrawDdsResponse xmlns:ns5="${NS.dds}"><ns5:uuid>${record.uuid}</ns5:uuid><ns5:status>WITHDRAWN</ns5:status></ns5:WithdrawDdsResponse>`);
  }

  return fault(`Operation ${op.local} is not supported by the mock.`);
}

export async function POST(req: Request, { params }: { params: Promise<{ service: string }> }) {
  if (!enabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { service } = await params;
  let doc: XmlNode;
  try {
    doc = parseXml((await req.text()).trim());
  } catch {
    return fault("Malformed SOAP message");
  }
  const auth = authenticate(doc);
  if (auth instanceof NextResponse) return auth;
  const op = child(doc, "Body")?.children[0];
  if (!op) return fault("Empty SOAP body");
  if (service === "EudrEchoService" && op.local === "EudrEchoRequest") {
    return xml(`<ns2:EudrEchoResponse xmlns:ns2="${NS.echo}"><ns2:status>OK</ns2:status></ns2:EudrEchoResponse>`);
  }
  if (service === "EUDRDueDiligenceStatementServiceV4") return dds(op, auth.user);
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
