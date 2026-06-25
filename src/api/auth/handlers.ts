import type { IncomingMessage, ServerResponse } from "node:http";
import { readJsonBody, json, errorJson } from "../http.js";
import { createSupabaseServer } from "../../lib/supabase/server.js";
import { getCurrentCustomer } from "../../lib/auth/getCurrentCustomer.js";
import { ensureCurrentCustomer } from "../../lib/auth/ensureCurrentCustomer.js";
import { safeRedirectPath } from "../../lib/auth/safe-redirect.js";
import { readCookie, serializeCookie, appendSetCookies } from "../../lib/supabase/cookies.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function redirect(res: ServerResponse, location: string): void {
  const headers: Record<string, string | string[]> = { Location: location };
  const setCookie = res.getHeader("Set-Cookie");
  if (setCookie) headers["Set-Cookie"] = setCookie as string | string[];
  res.writeHead(302, headers);
  res.end();
}

function clearPostLoginRedirectCookie(res: ServerResponse): void {
  appendSetCookies(res, [
    serializeCookie("post_login_redirect", "", {
      path: "/",
      maxAge: 0,
      sameSite: "lax",
    }),
  ]);
}

export async function handleAuthLogin(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody<{ email?: string; password?: string }>(req);
    const email = body.email?.trim();
    const password = body.password;

    if (!email || !password) {
      errorJson(res, 400, "Email and password are required");
      return;
    }

    const supabase = createSupabaseServer(req, res);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      errorJson(res, 401, error.message);
      return;
    }
    if (!data.user) {
      errorJson(res, 401, "Sign-in failed");
      return;
    }

    await sleep(500);
    const customer = await ensureCurrentCustomer(data.user);

    json(res, 200, {
      authUser: { id: data.user.id, email: data.user.email },
      customer,
    });
  } catch (err) {
    errorJson(res, 500, err instanceof Error ? err.message : "Sign-in failed");
  }
}

export async function handleAuthLogout(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const supabase = createSupabaseServer(req, res);
    await supabase.auth.signOut();
    json(res, 200, { ok: true });
  } catch (err) {
    errorJson(res, 500, err instanceof Error ? err.message : "Sign-out failed");
  }
}

export async function handleAuthMe(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const current = await getCurrentCustomer(req, res);
    if (!current) {
      errorJson(res, 401, "Unauthorized");
      return;
    }

    json(res, 200, {
      authUser: {
        id: current.authUser.id,
        email: current.authUser.email,
      },
      customer: current.customer,
    });
  } catch (err) {
    errorJson(res, 500, err instanceof Error ? err.message : "Failed to load user profile");
  }
}

const EMAIL_OTP_TYPES = new Set([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

async function finishAuthCallback(
  req: IncomingMessage,
  res: ServerResponse,
  url?: URL,
): Promise<void> {
  const current = await getCurrentCustomer(req, res);
  if (!current) {
    await sleep(500);
  }

  const queryRedirect = url ? safeRedirectPath(url.searchParams.get("next")) : null;
  const cookieRedirect = safeRedirectPath(readCookie(req, "post_login_redirect"));
  clearPostLoginRedirectCookie(res);
  redirect(res, queryRedirect ?? cookieRedirect ?? "/");
}

export async function handleAuthCallback(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  try {
    const supabase = createSupabaseServer(req, res);
    const tokenHash = url.searchParams.get("token_hash");
    const otpType = url.searchParams.get("type");
    const code = url.searchParams.get("code");

    console.log("[auth/callback] query:", { tokenHash: !!tokenHash, otpType, code: !!code });
    console.log("[auth/callback] cookies:", req.headers.cookie || "(none)");

    if (tokenHash && otpType && EMAIL_OTP_TYPES.has(otpType)) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: otpType as "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email",
      });
      if (error) {
        console.log("[auth/callback] verifyOtp error:", error.message);
        redirect(res, `/login?error=${encodeURIComponent(error.message)}`);
        return;
      }
      await finishAuthCallback(req, res, url);
      return;
    }

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.log("[auth/callback] exchangeCodeForSession error:", error.message);
        redirect(res, `/login?error=${encodeURIComponent(error.message)}`);
        return;
      }
      await finishAuthCallback(req, res, url);
      return;
    }

    redirect(res, "/login?error=invalid_callback");
  } catch (err) {
    const message = err instanceof Error ? err.message : "callback_failed";
    console.log("[auth/callback] exception:", message);
    redirect(res, `/login?error=${encodeURIComponent(message)}`);
  }
}
