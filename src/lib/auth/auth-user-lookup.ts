import { getSupabase } from "../supabase/admin.js";

export interface AuthUserEmailStatus {
  emailConfirmedAt: string | null;
}

export async function getAuthUserEmailStatus(
  email: string,
): Promise<AuthUserEmailStatus | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const { data, error } = await getSupabase().auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) throw error;

  const user = data.users.find(
    (row) => row.email?.trim().toLowerCase() === normalized,
  );
  if (!user) return null;

  return {
    emailConfirmedAt: user.email_confirmed_at ?? null,
  };
}

export function isObfuscatedExistingAuthUser(
  user: { identities?: Array<{ id: string }> } | null | undefined,
): boolean {
  return Boolean(
    user &&
    Array.isArray(user.identities) &&
    user.identities.length === 0,
  );
}
