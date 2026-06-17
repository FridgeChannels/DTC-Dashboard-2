import { createClient } from '@supabase/supabase-js';

let client;

function getServiceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
}

export function getSupabase() {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = getServiceKey();

  if (!url || !key) {
    throw new Error('Supabase 未配置');
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn(
      '[security] 建议在服务端 .env 中配置 SUPABASE_SERVICE_ROLE_KEY，勿将密钥暴露到前端'
    );
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return client;
}

export function isSupabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && getServiceKey());
}
