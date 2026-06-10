import { getSupabase } from "./supabase.client.js";

export async function vaultStoreSecret(ref: string, value: string): Promise<void> {
  const { error } = await getSupabase().rpc("fc_vault_store_secret", {
    ref_name: ref,
    secret_value: value,
  });
  if (error) throw new Error(`Vault store failed for ${ref}: ${error.message}`);
}

export async function vaultResolveSecret(ref: string): Promise<string> {
  const { data, error } = await getSupabase().rpc("fc_vault_resolve_secret", {
    ref_name: ref,
  });
  if (error) throw new Error(`Vault resolve failed for ${ref}: ${error.message}`);
  if (!data) throw new Error(`Secret not found for ref: ${ref}`);
  return data as string;
}

export async function vaultHasSecret(ref: string): Promise<boolean> {
  const { data, error } = await getSupabase().rpc("fc_vault_has_secret", {
    ref_name: ref,
  });
  if (error) throw new Error(`Vault lookup failed for ${ref}: ${error.message}`);
  return Boolean(data);
}
