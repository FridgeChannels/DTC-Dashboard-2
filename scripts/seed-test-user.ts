/**
 * Dev-only: create (or reset) a confirmed email+password test user so you can
 * log in inside the localhost preview without Google OAuth.
 *
 *   npx tsx scripts/seed-test-user.ts
 *
 * Credentials are printed at the end. Safe to re-run (idempotent).
 */
import { getSupabase } from "../src/clients/supabase.client.js";

const EMAIL = process.env.TEST_EMAIL ?? "preview-test@fc.dev";
const PASSWORD = process.env.TEST_PASSWORD ?? "Preview!2026dev";

async function findUserByEmail(admin: ReturnType<typeof getSupabase>, email: string) {
  // listUsers is paginated; scan a few pages to find the email.
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 1000) break;
  }
  return null;
}

async function main() {
  const admin = getSupabase();

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });

  if (!createErr && created.user) {
    console.log(`✓ created new test user: ${EMAIL}`);
  } else {
    // Most likely already exists → reset password + ensure confirmed.
    console.log(`• user may already exist (${createErr?.message ?? "no user returned"}), resetting…`);
    const existing = await findUserByEmail(admin, EMAIL);
    if (!existing) throw createErr ?? new Error("could not create or find user");
    const { error: updErr } = await admin.auth.admin.updateUserById(existing.id, {
      password: PASSWORD,
      email_confirm: true,
    });
    if (updErr) throw updErr;
    console.log(`✓ reset password for existing test user: ${EMAIL}`);
  }

  console.log("\n=== login with these in the preview's /login form ===");
  console.log(`   email:    ${EMAIL}`);
  console.log(`   password: ${PASSWORD}`);
}

main().catch((err) => {
  console.error("seed-test-user failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
