import "server-only";
import { verifyPassword } from "@/lib/password";
import { createAuthAdminClient } from "@/lib/supabase-auth";

export async function migrateLegacyLogin(email: string, password: string) {
  if (process.env.AUTH_LEGACY_MIGRATION_ENABLED !== "true") return false;
  const admin = createAuthAdminClient(); if (!admin) return false;
  const { data: profile, error } = await admin.from("auth_users")
    .select("id,email,name,password,status,auth_user_id,legacy_auth_disabled_at").eq("email", email).is("auth_user_id", null).is("legacy_auth_disabled_at", null).maybeSingle();
  if (error || !profile || profile.status !== "ativo" || typeof profile.password !== "string") return false;
  if (!(await verifyPassword(password, profile.password))) return false;

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: profile.email, password, email_confirm: true, user_metadata: { display_name: profile.name, migrated: true },
  });
  if (createError || !created.user) return false;
  const { data: linked, error: linkError } = await admin.rpc("link_migrated_auth_user", {
    p_profile_id: profile.id,
    p_auth_user_id: created.user.id,
  });
  if (linkError || linked !== true) {
    await admin.auth.admin.deleteUser(created.user.id);
    return false;
  }
  return true;
}
