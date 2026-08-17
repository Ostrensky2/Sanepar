import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { checkRateLimit, requireTrustedOrigin } from "@/lib/api-auth";
import { createAuthAdminClient, createRequestAuthClient } from "@/lib/supabase-auth";

export const runtime = "nodejs";
const UNIFORM = { ok: true, message: "Se o endereço estiver autorizado, as instruções serão enviadas." };

export async function POST(request: Request) {
  if (!requireTrustedOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  const body = await request.json().catch(() => null) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const limit = await checkRateLimit("recovery", request, email || "invalid", 5, 3600, 3600);
  if (limit.unavailable) return NextResponse.json({ error: "Proteção de acesso indisponível." }, { status: 503 });
  if (!limit.allowed) return NextResponse.json(UNIFORM, { status: 202 });
  const response = NextResponse.json(UNIFORM, { status: 202, headers: { "Cache-Control": "no-store" } });
  const auth = createRequestAuthClient(request, response); const appOrigin = process.env.APP_ORIGIN?.trim();
  if (!auth || !appOrigin) return NextResponse.json({ error: "Recuperação indisponível." }, { status: 503 });
  const provisional = email && email.length <= 254 ? await prepareLegacyRecovery(email) : null;
  let resetFailed = false;
  if (email && email.length <= 254) {
    try {
      const { error } = await auth.client.auth.resetPasswordForEmail(email, { redirectTo: `${appOrigin}/auth/callback?type=recovery&next=/definir-senha` });
      resetFailed = Boolean(error);
    } catch {
      resetFailed = true;
    }
  }
  if (provisional) {
    if (resetFailed) {
      const discarded = await discardProvisional(provisional);
      if (!discarded) console.error("auth recovery provisional cleanup failed");
    } else {
      let linked = false;
      let safeToDiscard = true;
      try {
        const result = await provisional.admin.rpc("link_migrated_auth_user", { p_profile_id: provisional.profileId, p_auth_user_id: provisional.authUserId });
        linked = !result.error && result.data === true;
      } catch {
        const linkState = await readAuthoritativeLink(provisional);
        linked = linkState === true;
        safeToDiscard = linkState === false;
        if (!linked && !safeToDiscard) console.error("auth recovery link state uncertain");
      }
      if (!linked) {
        resetFailed = true;
        if (safeToDiscard) {
          const discarded = await discardProvisional(provisional);
          if (!discarded) console.error("auth recovery provisional cleanup failed");
        }
      }
    }
  }
  return auth.applyCookies(
    response,
    { expireCodeVerifier: resetFailed },
  );
}

async function prepareLegacyRecovery(email: string) {
  try {
    const admin = createAuthAdminClient(); if (!admin) return null;
    const { data: profile } = await admin.from("auth_users").select("id,email,password,status,auth_user_id,legacy_auth_disabled_at")
      .eq("email", email).is("auth_user_id", null).is("legacy_auth_disabled_at", null).maybeSingle();
    if (!profile || profile.status !== "ativo" || typeof profile.password !== "string") return null;

    let authUserId: string | null = null;
    for (let page = 1; ; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) return null;
      authUserId = data.users.find((user) => user.email?.toLowerCase() === email)?.id ?? null;
      if (authUserId || data.users.length < 1000) break;
    }
    if (authUserId) return { admin, profileId: profile.id, authUserId, created: false };

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: `${randomBytes(32).toString("base64url")}Aa1!`,
      email_confirm: true,
      user_metadata: { migrated_by_recovery: true },
    });
    return error || !data.user ? null : { admin, profileId: profile.id, authUserId: data.user.id, created: true };
  } catch { return null; }
}

async function discardProvisional(provisional: NonNullable<Awaited<ReturnType<typeof prepareLegacyRecovery>>>) {
  if (!provisional.created) return true;
  try {
    const { error } = await provisional.admin.auth.admin.deleteUser(provisional.authUserId);
    return !error;
  } catch { return false; }
}

async function readAuthoritativeLink(provisional: NonNullable<Awaited<ReturnType<typeof prepareLegacyRecovery>>>) {
  try {
    const { data, error } = await provisional.admin.from("auth_users").select("auth_user_id")
      .eq("id", provisional.profileId).maybeSingle();
    if (error || !data) return null;
    if (data.auth_user_id === provisional.authUserId) return true;
    return data.auth_user_id === null ? false : null;
  } catch { return null; }
}
