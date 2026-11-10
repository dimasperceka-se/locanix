import { createHash, randomBytes } from "node:crypto";
import { esc } from "./xml";

/**
 * WS-Security header for EUIS calls.
 *
 * EUIS requirement (EUDR Information System – Operator API Reference, "Authentication",
 * and the WS-SecurityPolicy in the service WSDLs): HTTPS transport, a wsu:Timestamp,
 * and a UsernameToken with a hashed password (sp:HashPassword, WssUsernameToken10).
 * The username is the EU Login username and the password is the "Authentication Key"
 * from the "Web Services Access" section of the EUDR profile.
 *
 * Digest, per OASIS Web Services Security UsernameToken Profile 1.0, section 3.1:
 *   Password_Digest = Base64( SHA-1( nonce + created + password ) )
 * where nonce is the raw (decoded) nonce bytes and created is the exact wsu:Created text.
 *
 * Base64 values must be single-line (the EUIS troubleshooting page: wrapped Base64 makes
 * authentication fail with a bare InternalSystemException); Node's encoder never wraps.
 */

export const WSSE_NS = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd";
export const WSU_NS = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd";
export const PASSWORD_DIGEST =
  "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest";
export const BASE64_BINARY =
  "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary";

/** wsu:Created must be within 5 minutes of server time; the samples use a 5-minute window. */
const TIMESTAMP_TTL_MS = 5 * 60 * 1000;

export function passwordDigest(nonce: Buffer, created: string, password: string): string {
  return createHash("sha1").update(Buffer.concat([nonce, Buffer.from(created, "utf8"), Buffer.from(password, "utf8")])).digest("base64");
}

export function securityHeader(username: string, authKey: string, now = new Date()): string {
  const created = now.toISOString();
  const expires = new Date(now.getTime() + TIMESTAMP_TTL_MS).toISOString();
  const nonce = randomBytes(16);
  const digest = passwordDigest(nonce, created, authKey);
  return (
    `<wsse:Security xmlns:wsse="${WSSE_NS}" xmlns:wsu="${WSU_NS}">` +
    `<wsu:Timestamp wsu:Id="TS-1"><wsu:Created>${created}</wsu:Created><wsu:Expires>${expires}</wsu:Expires></wsu:Timestamp>` +
    `<wsse:UsernameToken wsu:Id="UT-1">` +
    `<wsse:Username>${esc(username)}</wsse:Username>` +
    `<wsse:Password Type="${PASSWORD_DIGEST}">${digest}</wsse:Password>` +
    `<wsse:Nonce EncodingType="${BASE64_BINARY}">${nonce.toString("base64")}</wsse:Nonce>` +
    `<wsu:Created>${created}</wsu:Created>` +
    `</wsse:UsernameToken>` +
    `</wsse:Security>`
  );
}
