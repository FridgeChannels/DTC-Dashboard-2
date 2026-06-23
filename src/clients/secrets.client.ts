import { env } from "../config/env.js";
import {
  vaultDeleteSecret,
  vaultHasSecret,
  vaultResolveSecret,
  vaultStoreSecret,
} from "./vault.client.js";

/** 开发环境内存密钥缓存（仅 SECRETS_PROVIDER=env 时使用，进程内，重启丢失） */
const devSecretStore = new Map<string, string>();

function useVault(): boolean {
  return env.secretsProvider === "supabase_vault";
}

/**
 * 按引用键换取密钥明文。
 * 生产默认走 Supabase Vault；本地可用 SECRETS_PROVIDER=env 回退到 .env / 内存。
 */
export async function resolveSecret(ref: string): Promise<string> {
  if (useVault()) {
    return vaultResolveSecret(ref);
  }

  if (env.secretsProvider === "env") {
    const fromEnv = process.env[ref];
    if (fromEnv) return fromEnv;

    const fromMemory = devSecretStore.get(ref);
    if (fromMemory) return fromMemory;

    throw new Error(`Secret not found for ref: ${ref}`);
  }

  throw new Error(`Unsupported secrets provider: ${env.secretsProvider}`);
}

/** 存储密钥。supabase_vault 时写入 Vault；env 时写入进程内存。 */
export async function storeSecret(ref: string, value: string): Promise<void> {
  if (!value) return;

  if (useVault()) {
    await vaultStoreSecret(ref, value);
    return;
  }

  if (env.secretsProvider === "env") {
    devSecretStore.set(ref, value);
    return;
  }

  throw new Error(`Unsupported secrets provider: ${env.secretsProvider}`);
}

export async function hasSecret(ref: string): Promise<boolean> {
  if (useVault()) {
    return vaultHasSecret(ref);
  }

  if (env.secretsProvider === "env") {
    return Boolean(process.env[ref] || devSecretStore.has(ref));
  }

  return false;
}

export async function deleteSecret(ref: string): Promise<void> {
  if (useVault()) {
    await vaultDeleteSecret(ref);
    return;
  }

  if (env.secretsProvider === "env") {
    devSecretStore.delete(ref);
    return;
  }

  throw new Error(`Unsupported secrets provider: ${env.secretsProvider}`);
}

export function shopifyAppClientSecretRef(customerId: number): string {
  return `SHOPIFY_APP_CLIENT_SECRET_REF_${customerId}`;
}

export function shopifyAccessTokenRef(customerId: number): string {
  return `SHOPIFY_TOKEN_REF_${customerId}`;
}

export function shopifyWebhookSecretRef(customerId: number): string {
  return `SHOPIFY_WEBHOOK_SECRET_REF_${customerId}`;
}

export function shopifyCustomerAccountClientSecretRef(customerId: number): string {
  return `SHOPIFY_CUSTOMER_ACCOUNT_CLIENT_SECRET_REF_${customerId}`;
}

export function klaviyoOauthTokenRef(customerId: number): string {
  return `KLAVIYO_OAUTH_TOKEN_REF_${customerId}`;
}

export function klaviyoOauthRefreshRef(customerId: number): string {
  return `KLAVIYO_OAUTH_REFRESH_REF_${customerId}`;
}
