import { getSupabase } from './supabase.js';

const DEFAULT_CUSTOMER_ID = Number(process.env.SHOPIFY_CUSTOMER_ID || 5);

export async function getShopifyConfig(customerId = DEFAULT_CUSTOMER_ID) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('customer_shopify_config')
    .select(
      'customer_id, shop_domain, shopify_shop_id, auth_type, access_token_ref, scopes, api_version, status'
    )
    .eq('customer_id', customerId)
    .eq('status', 'active')
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error(`未找到 customer_id=${customerId} 的 Shopify 配置`);
  }

  return data;
}

export async function resolveSecretRef(ref) {
  if (!ref?.trim()) {
    throw new Error('Shopify 凭证引用为空');
  }

  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('fc_vault_resolve_secret', {
    ref_name: ref.trim(),
  });

  if (error) {
    throw new Error(`读取 Shopify 凭证失败: ${error.message}`);
  }

  if (!data) {
    throw new Error(`Supabase Vault 中未找到凭证: ${ref}`);
  }

  return data;
}
