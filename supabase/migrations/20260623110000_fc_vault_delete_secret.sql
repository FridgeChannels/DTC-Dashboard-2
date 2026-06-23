CREATE OR REPLACE FUNCTION public.fc_vault_delete_secret(ref_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
BEGIN
  IF ref_name IS NULL OR btrim(ref_name) = '' THEN
    RETURN;
  END IF;

  DELETE FROM vault.secrets WHERE name = ref_name;
END;
$$;

REVOKE ALL ON FUNCTION public.fc_vault_delete_secret(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fc_vault_delete_secret(text) TO service_role;
