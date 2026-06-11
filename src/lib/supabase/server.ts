import { createServerClient } from "@supabase/ssr";
import type { IncomingMessage, ServerResponse } from "node:http";
import { env } from "../../config/env.js";
import { appendSetCookies, parseCookies, serializeCookie } from "./cookies.js";

export function createSupabaseServer(req: IncomingMessage, res: ServerResponse) {
  return createServerClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    cookies: {
      getAll() {
        return parseCookies(req.headers.cookie);
      },
      setAll(cookiesToSet) {
        appendSetCookies(
          res,
          cookiesToSet.map(({ name, value, options }) =>
            serializeCookie(name, value, options),
          ),
        );
      },
    },
  });
}
