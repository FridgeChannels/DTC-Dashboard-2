import { env } from "../../config/env.js";

export function safeRedirectPath(path?: string | null): string | null {
  if (!path) return null;
  const decoded = decodeURIComponent(path);
  if (!decoded.startsWith("/") || decoded.startsWith("//")) return null;
  if (decoded.startsWith("/login")) return null;
  return decoded;
}

function consumerRedirectOrigins(): Set<string> {
  const origins = new Set<string>();

  for (const raw of [env.shopifyAppHost, env.publicSiteUrl]) {
    if (!raw) continue;
    try {
      origins.add(new URL(raw).origin);
    } catch {
      // ignore invalid URL
    }
  }

  const extra = process.env.CONSUMER_REDIRECT_ALLOWED_ORIGINS ?? "";
  for (const part of extra.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    try {
      origins.add(trimmed.includes("://") ? new URL(trimmed).origin : `https://${trimmed}`);
    } catch {
      // ignore invalid origin
    }
  }

  return origins;
}

/** 消费者 OAuth 登录完成后的站外回跳（如品牌自有前端 localhost:5173） */
export function safeConsumerRedirectUrl(raw?: string | null): string | null {
  if (!raw) return null;

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw.trim());
  } catch {
    return null;
  }

  const relative = safeRedirectPath(decoded);
  if (relative) return relative;

  let parsed: URL;
  try {
    parsed = new URL(decoded);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

  // 本地品牌前端联调（如 Vite localhost:5173）
  if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
    return parsed.toString();
  }

  if (consumerRedirectOrigins().has(parsed.origin)) {
    return parsed.toString();
  }

  return null;
}

export function appendQueryToUrl(
  target: string,
  params: Record<string, string | undefined>,
): string {
  const url = new URL(target);
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}
