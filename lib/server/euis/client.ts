import { securityHeader } from "./wsse";
import { child, childText, esc, find, findAll, parseXml, type XmlNode } from "./xml";

/**
 * SOAP client for the EUDR Information System (EUIS, on TRACES), built from public
 * EU sources only:
 * - the service WSDLs and XSDs published by the system itself
 *   (…/ws/EUDRDueDiligenceStatementServiceV4?wsdl, …?xsd=N, …/ws/EudrEchoService?wsdl);
 * - "EUDR Information System – Operator API Reference" (…/tracesnt/help/eudr-documentation/operator/),
 *   including its V4 DDS samples, Echo service page and troubleshooting page.
 *
 * Locanix talks to the ACCEPTANCE environment only. There is deliberately no
 * production endpoint in this file.
 */

export const EUIS_ACCEPTANCE_WS = "https://acceptance.eudr.webcloud.ec.europa.eu/tracesnt/ws";

export const NS = {
  soap: "http://schemas.xmlsoap.org/soap/envelope/",
  base: "http://ec.europa.eu/sanco/tracesnt/base/v4", // unchanged in V3 and V4
  body: "http://ec.europa.eu/tracesnt/body/v4",
  dds: "http://ec.europa.eu/tracesnt/certificate/eudr/due-diligence-statement/v4",
  common: "http://ec.europa.eu/tracesnt/certificate/eudr/common/v4",
  echo: "http://ec.europa.eu/tracesnt/eudr/echo",
};

const DDS_SERVICE = "EUDRDueDiligenceStatementServiceV4";
const ECHO_SERVICE = "EudrEchoService";
const ddsAction = (op: string) => `${NS.dds}/${op}`;
const ECHO_ACTION = "http://ec.europa.eu/tracesnt/eudr/echo";

export type EuisCredentials = {
  username: string;
  authKey: string;
  /** WebServiceClientId: "your client identifier, visible in the 'Web Services Access' section of your profile". */
  clientId: string;
  /** Web Service Access Identifier, only for users linked to several operators (BodyIdentity header). */
  operatorAccessId?: string;
};

/** Where requests go. EUIS_BASE_URL (a mock) is honoured outside production only. */
export function euisEndpoint(): { url: string; environment: "acceptance" | "mock" } {
  const override = process.env.EUIS_BASE_URL?.trim();
  if (override && process.env.NODE_ENV !== "production") return { url: override.replace(/\/+$/, ""), environment: "mock" };
  return { url: EUIS_ACCEPTANCE_WS, environment: "acceptance" };
}

export type EuisErrorDetail = { id?: string; message?: string; field?: string };

/** EUIS answered with a SOAP fault: the request reached the service and was refused. */
export class EuisFault extends Error {
  constructor(
    message: string,
    readonly faultName: string | undefined,
    readonly errors: EuisErrorDetail[],
    readonly httpStatus: number,
  ) {
    super(message);
  }
  /** Validation, permission and authentication faults are raised before anything is stored. */
  get definite(): boolean {
    if (this.faultName && /BusinessRulesValidation|PermissionDenied|NotFound|InvalidParameters|Unauthenticated/i.test(this.faultName)) return true;
    return /authentication|unauthenticated|InternalSystemException|timestamp|security/i.test(this.message);
  }
}

/** No usable answer (network error, timeout, gateway page): the request may or may not have been processed. */
export class EuisUnreachable extends Error {}

const TIMEOUT_MS = { submit: 90_000, default: 30_000 };

function envelope(cred: EuisCredentials, payload: string): string {
  const bodyIdentity = cred.operatorAccessId
    ? // The child element is unqualified (Operator API Reference, "Multi-Operator Support").
      `<body:BodyIdentity xmlns:body="${NS.body}"><OperatorAccessIdentifier>${esc(cred.operatorAccessId)}</OperatorAccessIdentifier></body:BodyIdentity>`
    : "";
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<soapenv:Envelope xmlns:soapenv="${NS.soap}" xmlns:base="${NS.base}">` +
    `<soapenv:Header>${securityHeader(cred.username, cred.authKey)}<base:WebServiceClientId>${esc(cred.clientId)}</base:WebServiceClientId>${bodyIdentity}</soapenv:Header>` +
    `<soapenv:Body>${payload}</soapenv:Body>` +
    `</soapenv:Envelope>`
  );
}

function faultFrom(fault: XmlNode, httpStatus: number): EuisFault {
  const faultstring = childText(fault, "faultstring") ?? find(fault, "Text")?.text.trim() ?? "EUIS returned a fault.";
  const detail = child(fault, "detail") ?? child(fault, "Detail");
  const named = detail?.children[0];
  const errors: EuisErrorDetail[] = findAll(detail, "Error").map((e) => ({
    id: childText(e, "ID"),
    message: childText(e, "Message"),
    field: childText(e, "Field"),
  }));
  const extra = [childText(named, "message"), childText(named, "errorMessage")].filter(Boolean) as string[];
  if (!errors.length && extra.length) errors.push({ message: extra[0] });
  const firstMessage = errors.find((e) => e.message)?.message;
  const message = firstMessage && firstMessage !== faultstring ? `${faultstring}: ${firstMessage}` : faultstring;
  return new EuisFault(message, named?.local ?? faultstring, errors, httpStatus);
}

type CallResult = { body: XmlNode; userMessage?: string };

async function call(service: string, action: string, payload: string, cred: EuisCredentials, timeoutMs = TIMEOUT_MS.default): Promise<CallResult> {
  const { url } = euisEndpoint();
  let response: Response;
  let text: string;
  try {
    response = await fetch(`${url}/${service}`, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: `"${action}"` },
      body: envelope(cred, payload),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    text = await response.text();
  } catch (e) {
    throw new EuisUnreachable(`EUIS did not answer (${(e as Error).name === "TimeoutError" ? "timeout" : (e as Error).message}).`);
  }
  let doc: XmlNode;
  try {
    doc = parseXml(text.trim());
  } catch {
    throw new EuisUnreachable(`EUIS answered HTTP ${response.status} without a SOAP message.`);
  }
  const body = child(doc, "Body");
  const fault = child(body, "Fault");
  if (fault) throw faultFrom(fault, response.status);
  const first = body?.children[0];
  if (!response.ok || !first) throw new EuisUnreachable(`EUIS answered HTTP ${response.status} without a result.`);
  const userMessage = find(child(doc, "Header"), "EudrUserMessage")?.text.trim() || undefined;
  return { body: first, userMessage };
}

/* -------------------------------- Operations ------------------------------- */

/** EudrEchoService.testEcho: checks credentials, headers and connectivity (acceptance only). */
export async function testEcho(cred: EuisCredentials, query = "Locanix connection test"): Promise<string> {
  const { body } = await call(ECHO_SERVICE, ECHO_ACTION, `<echo:EudrEchoRequest xmlns:echo="${NS.echo}"><echo:query>${esc(query)}</echo:query></echo:EudrEchoRequest>`, cred);
  return childText(body, "status") ?? "";
}

/** submitDds: `statementXml` is a complete dds:SubmitDdsRequest element. Returns the EUIS UUID. */
export async function submitDds(cred: EuisCredentials, requestXml: string): Promise<{ uuid: string; userMessage?: string }> {
  const { body, userMessage } = await call(DDS_SERVICE, ddsAction("submitDds"), requestXml, cred, TIMEOUT_MS.submit);
  const uuid = childText(body, "uuid");
  if (!uuid || !/^[0-9a-fA-F-]{36}$/.test(uuid)) throw new EuisUnreachable("EUIS accepted the request but returned no UUID.");
  return { uuid, userMessage };
}

export type DdsOverview = {
  uuid: string;
  internalReferenceNumber?: string;
  referenceNumber?: string;
  referenceNumberInfo?: string;
  verificationNumber?: string;
  status: string;
  rejectionReason?: string;
  communicationToOperator?: { date?: string; content?: string };
  date?: string;
  updatedBy?: string;
  version?: number;
};

function overviews(body: XmlNode): DdsOverview[] {
  return body.children
    .filter((n) => n.local === "ddsOverviewList")
    .map((o) => {
      const comm = child(o, "communicationToOperator");
      const version = Number(childText(o, "version"));
      return {
        uuid: childText(o, "uuid") ?? "",
        internalReferenceNumber: childText(o, "internalReferenceNumber"),
        referenceNumber: childText(o, "referenceNumber"),
        referenceNumberInfo: childText(o, "referenceNumberInfo"),
        verificationNumber: childText(o, "verificationNumber"),
        status: childText(o, "status") ?? "",
        rejectionReason: childText(o, "rejectionReason"),
        communicationToOperator: comm ? { date: childText(comm, "date"), content: childText(comm, "content") } : undefined,
        date: childText(o, "date"),
        updatedBy: childText(o, "updatedBy"),
        version: Number.isFinite(version) && version > 0 ? version : undefined,
      };
    })
    .filter((o) => o.uuid && o.status);
}

const notFound = (e: unknown) => e instanceof EuisFault && /NotFound|NOT_FOUND/i.test(`${e.faultName} ${e.message} ${e.errors.map((x) => x.id).join(" ")}`);

/** getDds: overview (status, reference and verification numbers) by EUIS UUID. */
export async function getDds(cred: EuisCredentials, uuids: string[]): Promise<DdsOverview[]> {
  const list = uuids.slice(0, 100).map((u) => `<dds:uuidList>${esc(u)}</dds:uuidList>`).join("");
  try {
    const { body } = await call(DDS_SERVICE, ddsAction("getDds"), `<dds:GetDdsRequest xmlns:dds="${NS.dds}">${list}</dds:GetDdsRequest>`, cred);
    return overviews(body);
  } catch (e) {
    if (notFound(e)) return [];
    throw e;
  }
}

/** getDdsByInternalReference: overview by the operator's own reference (≤ 50 characters). */
export async function getDdsByInternalReference(cred: EuisCredentials, internalReference: string): Promise<DdsOverview[]> {
  try {
    const { body } = await call(
      DDS_SERVICE,
      ddsAction("getDdsByInternalReference"),
      `<dds:GetDdsByInternalReferenceRequest xmlns:dds="${NS.dds}"><dds:internalReference>${esc(internalReference)}</dds:internalReference></dds:GetDdsByInternalReferenceRequest>`,
      cred,
    );
    return overviews(body);
  } catch (e) {
    if (notFound(e)) return [];
    throw e;
  }
}

/** withdrawDds: only for an AVAILABLE DDS inside the 72-hour amendment window. */
export async function withdrawDds(cred: EuisCredentials, uuid: string): Promise<{ uuid: string; status: string }> {
  const { body } = await call(DDS_SERVICE, ddsAction("withdrawDds"), `<dds:WithdrawDdsRequest xmlns:dds="${NS.dds}"><dds:uuid>${esc(uuid)}</dds:uuid></dds:WithdrawDdsRequest>`, cred);
  return { uuid: childText(body, "uuid") ?? uuid, status: childText(body, "status") ?? "" };
}
