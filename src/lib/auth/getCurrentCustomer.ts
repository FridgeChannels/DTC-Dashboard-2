import type { IncomingMessage, ServerResponse } from "node:http";
import { createSupabaseServer } from "../supabase/server.js";
import { getSupabase } from "../supabase/admin.js";
import { ensureCurrentCustomer } from "./ensureCurrentCustomer.js";
import type { CurrentCustomer, CustomerRecord } from "./types.js";

const CUSTOMER_SELECT = "id, auth_user_id, nickname, email, avatar_url, status";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

/**
 * 服务端唯一用户入口：从 Session Cookie 解析 auth user，并关联 customer。
 */
export async function getCurrentCustomer(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<CurrentCustomer | null> {
  const supabase = createSupabaseServer(req, res);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.id) return null;

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

  return {
    authUser: user,
    customer,
    supabase,
  };
}
