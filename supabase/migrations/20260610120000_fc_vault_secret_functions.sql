-- FC 服务端密钥：通过 Supabase Vault 按 ref 名存取（仅 service_role 可调用）

CREATE OR REPLACE FUNCTION public.fc_vault_store_secret(ref_name text, secret_value text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  existing_id uuid;
BEGIN
  IF ref_name IS NULL OR btrim(ref_name) = '' OR secret_value IS NULL OR secret_value = '' THEN
    RETURN;
  END IF;

  SELECT id INTO existing_id
  FROM vault.secrets
  WHERE name = ref_name
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    PERFORM vault.update_secret(existing_id, secret_value, ref_name);
  ELSE
    PERFORM vault.create_secret(secret_value, ref_name, 'FC secret ref');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fc_vault_resolve_secret(ref_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  result text;
BEGIN
  SELECT decrypted_secret INTO result
  FROM vault.decrypted_secrets
  WHERE name = ref_name
  LIMIT 1;

  IF result IS NULL THEN
    RAISE EXCEPTION 'Secret not found for ref: %', ref_name;
  END IF;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.fc_vault_has_secret(ref_name text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, vault
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM vault.secrets WHERE name = ref_name
  );
$$;

REVOKE ALL ON FUNCTION public.fc_vault_store_secret(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fc_vault_resolve_secret(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fc_vault_has_secret(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.fc_vault_store_secret(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fc_vault_resolve_secret(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fc_vault_has_secret(text) TO service_role;
