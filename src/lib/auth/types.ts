import type { User } from "@supabase/supabase-js";
import type { createSupabaseServer } from "../supabase/server.js";

export interface CustomerRecord {
  id: number;
  auth_user_id: string;
  nickname: string | null;
  email: string | null;
  avatar_url: string | null;
  status: number | null;
}

export interface CurrentCustomer {
  authUser: User;
  customer: CustomerRecord;
  supabase: ReturnType<typeof createSupabaseServer>;
}
