import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { env } from "../../config/env.js";
import { errorJson } from "../../api/http.js";

function readApiKeyFromRequest(req: IncomingMessage): string | null {
  const header = req.headers["x-api-key"];
  if (typeof header === "string" && header.trim()) {
    return header.trim();
  }

  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }

  return null;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** 生产环境必须配置 API_KEY；开发环境未配置时放行。 */
export function isApiKeyValid(req: IncomingMessage): boolean {
  const expected = env.apiKey;
  if (!expected) {
    return env.nodeEnv !== "production";
  }

  const provided = readApiKeyFromRequest(req);
  if (!provided) return false;
  return safeEqual(provided, expected);
}

export function requireApiKey(
  req: IncomingMessage,
  res: ServerResponse,
): boolean {
  if (isApiKeyValid(req)) return true;
  errorJson(res, 401, "Invalid or missing API key");
  return false;
}
