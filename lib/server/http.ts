/**
 * Reject cross-site state-changing requests (defense-in-depth alongside the
 * SameSite=Lax session cookie). Same-origin fetch() always sends an Origin
 * header; requests that omit it entirely (some same-origin navigations) are
 * allowed through.
 */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const host = req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Canonical public base URL for building links (e.g. email verification).
 * Behind a reverse proxy `req.url` reflects the internal host/scheme
 * (http://localhost:PORT), so prefer the explicit APP_URL env, then the
 * X-Forwarded-* / Host headers set by nginx, and only fall back to req.url.
 */
export function appBaseUrl(req: Request): string {
  const env = process.env.APP_URL;
  if (env) return env.replace(/\/+$/, "");
  const u = new URL(req.url);
  const host =
    req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? u.host;
  const proto =
    req.headers.get("x-forwarded-proto") ?? u.protocol.replace(":", "");
  return `${proto}://${host}`;
}
