import { NextResponse } from "next/server";
import { checkRateLimit, requireApiSession, requireTrustedOrigin } from "@/lib/api-auth";
import { createAuthAdminClient, createRequestAuthClient } from "@/lib/supabase-auth";
import { AUTH_PURPOSE_COOKIE, consumeAuthPurposeOnce, createAuthPurpose, verifyAuthPurpose } from "@/lib/auth-purpose";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth-policy";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!requireTrustedOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  const session = await requireApiSession(request);
  if (!session.ok) return session.response;
  const admin = createAuthAdminClient();
  const { data: profile } = admin ? await admin.from("auth_users").select("must_change_password").eq("auth_user_id", session.session.authUserId).maybeSingle() : { data: null };
  const purposeToken = readCookie(request, AUTH_PURPOSE_COOKIE);
  const signedPurpose = verifyAuthPurpose(purposeToken, session.session.authUserId);
  if (purposeToken && !signedPurpose) return NextResponse.json({ error: "Esta sessão não permite definir senha." }, { status: 403 });
  const recovery = signedPurpose?.purpose === "recovery";
  if (!profile || (!profile.must_change_password && !recovery)) return NextResponse.json({ error: "Esta sessão não permite definir senha." }, { status: 403 });
  const body = await request.json().catch(() => null) as { newPassword?: unknown } | null;
  const password = typeof body?.newPassword === "string" ? body.newPassword : "";
  if (password.length < MIN_PASSWORD_LENGTH || password.length > 1024) return NextResponse.json({ error: `A senha deve ter entre ${MIN_PASSWORD_LENGTH} e 1024 caracteres.` }, { status: 400 });
  const limit = await checkRateLimit("password", request, session.session.authUserId, 5, 900, 900);
  if (limit.unavailable) return NextResponse.json({ error: "Proteção de acesso indisponível." }, { status: 503 });
  if (!limit.allowed) return NextResponse.json({ error: "Muitas tentativas. Aguarde e tente novamente." }, { status: 429 });
  const auth = createRequestAuthClient(request);
  if (!auth || !admin) return NextResponse.json({ error: "Servidor de acesso indisponível." }, { status: 503 });
  if (signedPurpose && !await consumeAuthPurposeOnce(signedPurpose)) return NextResponse.json({ error: "Esta sessão não permite definir senha." }, { status: 403 });
  const { error } = await auth.client.auth.updateUser({ password });
  if (error) {
    const response = NextResponse.json({ error: error.code === "same_password" ? "A nova senha deve ser diferente da senha atual." : "Não foi possível atualizar a senha. Tente uma senha diferente." }, { status: 400 });
    const replacementPurpose = signedPurpose && createAuthPurpose(signedPurpose.purpose, session.session.authUserId);
    if (replacementPurpose) response.cookies.set(AUTH_PURPOSE_COOKIE, replacementPurpose, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 });
    return auth.applyCookies(response);
  }
  const now = new Date().toISOString();
  const { error: profileError } = await admin.from("auth_users").update({ must_change_password: false, updated_at: now }).eq("auth_user_id", session.session.authUserId);
  if (profileError) return NextResponse.json({ error: "Senha atualizada; perfil pendente de sincronização." }, { status: 503 });
  await auth.client.auth.signOut({ scope: "global" });
  const response = NextResponse.json({ ok: true, requiresLogin: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(AUTH_PURPOSE_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  return auth.applyCookies(response);
}

function readCookie(request: Request, name: string) {
  return (request.headers.get("cookie") ?? "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;
}
