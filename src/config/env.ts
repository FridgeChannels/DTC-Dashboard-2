import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/** 加载 .env（零依赖，进程启动时执行一次） */
function loadDotEnv(): void {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadDotEnv();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env: ${key}`);
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 8080),
  nodeEnv: process.env.NODE_ENV ?? "development",
  defaultCustomerId: Number(process.env.DEFAULT_CUSTOMER_ID ?? 1),
  supabaseUrl: () => requireEnv("SUPABASE_URL"),
  supabaseAnonKey: () => requireEnv("SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: () => requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  publicSiteUrl: process.env.PUBLIC_SITE_URL ?? process.env.SITE_URL ?? "",
  shopifyApiVersion: process.env.SHOPIFY_API_VERSION ?? "2025-04",
  shopifyAppHost:
    process.env.SHOPIFY_APP_HOST ??
    `http://localhost:${process.env.PORT ?? 8080}`,
  secretsProvider: process.env.SECRETS_PROVIDER ?? "supabase_vault",
  /** 内部 M2M 接口密钥；生产环境必填 */
  apiKey: process.env.API_KEY ?? "",
  /** 品牌信息收集：默认 Shopify customer_id（商品同步） */
  shopifyCustomerId: Number(process.env.SHOPIFY_CUSTOMER_ID ?? process.env.DEFAULT_CUSTOMER_ID ?? 1),
  /** Dify 品牌色分析 */
  difyApiUrl: process.env.DIFY_API_URL ?? "",
  difyApiKey: process.env.DIFY_API_KEY ?? "",
} as const;
