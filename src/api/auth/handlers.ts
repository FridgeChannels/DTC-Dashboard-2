import type { IncomingMessage, ServerResponse } from "node:http";
import { env } from "../../config/env.js";
import { readJsonBody, json, errorJson } from "../http.js";
import { createSupabaseServer } from "../../lib/supabase/server.js";
import { getCurrentCustomer } from "../../lib/auth/getCurrentCustomer.js";
import { ensureCurrentCustomer } from "../../lib/auth/ensureCurrentCustomer.js";
import { safeRedirectPath } from "../../lib/auth/safe-redirect.js";
import { readCookie, serializeCookie, appendSetCookies } from "../../lib/supabase/cookies.js";
import {
  getAuthUserEmailStatus,
  isObfuscatedExistingAuthUser,
} from "../../lib/auth/auth-user-lookup.js";
import { passwordComplexityError } from "../../lib/auth/password.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function redirect(res: ServerResponse, location: string): void {
  res.writeHead(302, { Location: location });
  res.end();
}

function siteOrigin(req: IncomingMessage): string {
  const configured = env.publicSiteUrl;
  if (configured) return configured.replace(/\/$/, "");

  const host = req.headers["x-forwarded-host"] ?? req.headers.host ?? `localhost:${env.port}`;
  const proto = req.headers["x-forwarded-proto"] ?? "http";
  return `${proto}://${host}`;
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

export async function handleAuthRegister(
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
    const passwordError = passwordComplexityError(password);
    if (passwordError) {
      errorJson(res, 400, passwordError);
      return;
    }

    const supabase = createSupabaseServer(req, res);
    const origin = siteOrigin(req);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${origin}/api/auth/callback`,
      },
    });
    if (error) {
      errorJson(res, 400, error.message);
      return;
    }

    if (!data.session?.user) {
      if (isObfuscatedExistingAuthUser(data.user)) {
        const status = await getAuthUserEmailStatus(email);
        if (status?.emailConfirmedAt) {
          json(res, 200, {
            accountAlreadyExists: true,
            alreadyVerified: true,
            message: "An account with this email already exists and is verified. Please sign in.",
          });
          return;
        }
        json(res, 200, {
          accountAlreadyExists: true,
          message: "An account with this email already exists. Check your inbox for the verification email, or sign in if you have already verified.",
        });
        return;
      }

      json(res, 200, {
        needsEmailConfirmation: true,
        message: "Sign-up successful. Check your email to verify your account, then sign in.",
      });
      return;
    }

    await sleep(500);
    const customer = await ensureCurrentCustomer(data.session.user);
    json(res, 201, {
      authUser: { id: data.session.user.id, email: data.session.user.email },
      customer,
    });
  } catch (err) {
    errorJson(res, 500, err instanceof Error ? err.message : "Sign-up failed");
  }
}

export async function handleAuthResendVerification(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody<{ email?: string }>(req);
    const email = body.email?.trim();

    if (!email) {
      errorJson(res, 400, "Email is required");
      return;
    }

    const status = await getAuthUserEmailStatus(email);
    if (status?.emailConfirmedAt) {
      json(res, 200, {
        alreadyVerified: true,
        message: "This email is already verified. Please sign in with your password.",
      });
      return;
    }

    const supabase = createSupabaseServer(req, res);
    const origin = siteOrigin(req);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: `${origin}/api/auth/callback`,
      },
    });

    if (error) {
      errorJson(res, 400, error.message);
      return;
    }

    json(res, 200, {
      message: "Verification email sent. Check your inbox and spam folder.",
    });
  } catch (err) {
    errorJson(res, 500, err instanceof Error ? err.message : "Failed to resend verification email");
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

export async function handleAuthOAuthStart(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  try {
    const provider = url.searchParams.get("provider") ?? "google";
    const redirectedFrom = safeRedirectPath(url.searchParams.get("redirectedFrom"));

    if (redirectedFrom) {
      appendSetCookies(res, [
        serializeCookie("post_login_redirect", redirectedFrom, {
          path: "/",
          maxAge: 300,
          sameSite: "lax",
          httpOnly: true,
        }),
      ]);
    }

    const supabase = createSupabaseServer(req, res);
    const origin = siteOrigin(req);
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: provider as "google",
      options: {
        redirectTo: `${origin}/api/auth/callback`,
      },
    });

    if (error || !data.url) {
      errorJson(res, 400, error?.message ?? "Failed to start OAuth sign-in");
      return;
    }

    redirect(res, data.url);
  } catch (err) {
    errorJson(res, 500, err instanceof Error ? err.message : "Failed to start OAuth");
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

    if (tokenHash && otpType && EMAIL_OTP_TYPES.has(otpType)) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: otpType as "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email",
      });
      if (error) {
        redirect(res, `/login?error=${encodeURIComponent(error.message)}`);
        return;
      }
      await finishAuthCallback(req, res, url);
      return;
    }

    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        redirect(res, `/login?error=${encodeURIComponent(error.message)}`);
        return;
      }
      await finishAuthCallback(req, res, url);
      return;
    }

    redirect(res, "/login?error=invalid_callback");
  } catch (err) {
    const message = err instanceof Error ? err.message : "callback_failed";
    redirect(res, `/login?error=${encodeURIComponent(message)}`);
  }
}
