import type { IncomingMessage, ServerResponse } from "node:http";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServer } from "../supabase/server.js";
import { getSupabase } from "../supabase/admin.js";
import { ensureCurrentCustomer } from "./ensureCurrentCustomer.js";
import type { CurrentCustomer, CustomerRecord } from "./types.js";

const CUSTOMER_SELECT = "id, auth_user_id, nickname, email, avatar_url, status";
const AUTH_CACHE_TTL_MS = 20_000;
const SESSION_REFRESH_SKEW_MS = 15_000;

type CachedIdentity = {
  authUser: User;
  customer: CustomerRecord;
  expiresAt: number;
};

const identityCache = new Map<string, CachedIdentity>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sessionCookieKey(req: IncomingMessage): string {
  return String(req.headers.cookie ?? "");
}

function cachedIdentity(req: IncomingMessage): CachedIdentity | null {
  const key = sessionCookieKey(req);
  if (!key) return null;
  const hit = identityCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    identityCache.delete(key);
    return null;
  }
  return hit;
}

function rememberIdentity(req: IncomingMessage, authUser: User, customer: CustomerRecord) {
  const key = sessionCookieKey(req);
  if (!key) return;
  identityCache.set(key, {
    authUser,
    customer,
    expiresAt: Date.now() + AUTH_CACHE_TTL_MS,
  });
}

async function loadCustomer(authUserId: string): Promise<CustomerRecord | null> {
  if (!authUserId) return null;

  const { data, error } = await getSupabase()
    .from("customer")
    .select(CUSTOMER_SELECT)
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error) throw error;
  return data as CustomerRecord | null;
}

async function resolveAuthUser(
  supabase: ReturnType<typeof createSupabaseServer>,
): Promise<User | null> {
  const { data: { session } } = await supabase.auth.getSession();
  const expiresAtMs = (session?.expires_at ?? 0) * 1000;
  if (session?.user?.id && expiresAtMs > Date.now() + SESSION_REFRESH_SKEW_MS) {
    return session.user;
  }
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user?.id) return null;
  return user;
}

/**
 * 服务端唯一用户入口：从 Session Cookie 解析 auth user，并关联 customer。
 */
export async function getCurrentCustomer(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<CurrentCustomer | null> {
  const supabase = createSupabaseServer(req, res);
  const cached = cachedIdentity(req);
  if (cached) {
    return {
      authUser: cached.authUser,
      customer: cached.customer,
      supabase,
    };
  }

  const user = await resolveAuthUser(supabase);
  if (!user?.id) return null;

  let customer = await loadCustomer(user.id);
  if (!customer) {
    await sleep(150);
    customer = await loadCustomer(user.id);
  }
  if (!customer) {
    customer = await ensureCurrentCustomer(user);
  }

  if (customer.auth_user_id !== user.id) {
    throw new Error("Customer record does not match authenticated user");
  }

  rememberIdentity(req, user, customer);
  return {
    authUser: user,
    customer,
    supabase,
  };
}
