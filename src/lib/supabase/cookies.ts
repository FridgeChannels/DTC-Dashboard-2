import type { CookieOptions } from "@supabase/ssr";
import type { IncomingMessage, ServerResponse } from "node:http";

export function parseCookies(cookieHeader?: string): Array<{ name: string; value: string }> {
  if (!cookieHeader) return [];
  return cookieHeader.split(";").map((part) => {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1) return { name: trimmed, value: "" };
    return {
      name: trimmed.slice(0, eq),
      value: decodeURIComponent(trimmed.slice(eq + 1)),
    };
  });
}

export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  const encoded = encodeURIComponent(value);
  const segments = [`${name}=${encoded}`];
  if (options.maxAge != null) segments.push(`Max-Age=${options.maxAge}`);
  segments.push(`Path=${options.path ?? "/"}`);
  if (options.domain) segments.push(`Domain=${options.domain}`);
  if (options.httpOnly) segments.push("HttpOnly");
  if (options.secure) segments.push("Secure");
  if (options.sameSite) segments.push(`SameSite=${options.sameSite}`);
  return segments.join("; ");
}

export function appendSetCookies(res: ServerResponse, cookies: string[]): void {
  const existing = res.getHeader("Set-Cookie");
  const merged = [
    ...(Array.isArray(existing) ? existing : existing ? [String(existing)] : []),
    ...cookies,
  ];
  res.setHeader("Set-Cookie", merged);
}

export function readCookie(req: IncomingMessage, name: string): string | undefined {
  return parseCookies(req.headers.cookie).find((c) => c.name === name)?.value;
}
