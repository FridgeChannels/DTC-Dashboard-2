import type { User } from "@supabase/supabase-js";
import type { createSupabaseServer } from "../supabase/server.js";

export type CustomerProductLine = "dtc" | "asin_plus" | "both";

export interface CustomerRecord {
  id: number;
  auth_user_id: string;
  nickname: string | null;
  email: string | null;
  avatar_url: string | null;
  status: number | null;
  product_line?: CustomerProductLine | null;
}

export interface CurrentCustomer {
  authUser: User;
  customer: CustomerRecord;
  supabase: ReturnType<typeof createSupabaseServer>;
}
