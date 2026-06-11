import type { User } from "@supabase/supabase-js";
import { getSupabase } from "../supabase/admin.js";
import type { CustomerRecord } from "./types.js";

/**
 * Trigger 未及时创建 customer 时，用 service role 兜底插入。
 */
export async function ensureCurrentCustomer(authUser: User): Promise<CustomerRecord> {
  const admin = getSupabase();
  const { data: existing, error: existingError } = await admin
    .from("customer")
    .select("id, auth_user_id, nickname, email, avatar_url, status")
    .eq("auth_user_id", authUser.id)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing as CustomerRecord;

  const meta = authUser.user_metadata ?? {};
  const { data, error } = await admin
    .from("customer")
    .insert({
      auth_user_id: authUser.id,
      email: authUser.email,
      nickname:
        meta.nickname ??
        meta.name ??
        meta.full_name ??
        authUser.email?.split("@")[0] ??
        null,
      avatar_url: meta.avatar_url ?? null,
      status: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("id, auth_user_id, nickname, email, avatar_url, status")
    .single();

  if (error) throw error;
  return data as CustomerRecord;
}
