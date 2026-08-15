import { NextResponse } from "next/server";
import { checkRateLimit, requireApiSession, requireTrustedOrigin } from "@/lib/api-auth";
import { createAuthAdminClient, createRequestAuthClient } from "@/lib/supabase-auth";
import { AUTH_PURPOSE_COOKIE, verifyAuthPurpose } from "@/lib/auth-purpose";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!requireTrustedOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  const session = await requireApiSession(request);
  if (!session.ok) return session.response;
  const admin = createAuthAdminClient();
  const { data: profile } = admin ? await admin.from("auth_users").select("must_change_password").eq("auth_user_id", session.session.authUserId).maybeSingle() : { data: null };
  const recovery = verifyAuthPurpose(readCookie(request, AUTH_PURPOSE_COOKIE), session.session.authUserId) === "recovery";
  if (!profile || (!profile.must_change_password && !recovery)) return NextResponse.json({ error: "Esta sessão não permite definir senha." }, { status: 403 });
  const body = await request.json().catch(() => null) as { newPassword?: unknown } | null;
  const password = typeof body?.newPassword === "string" ? body.newPassword : "";
  if (password.length < 12 || password.length > 1024) return NextResponse.json({ error: "A senha deve ter entre 12 e 1024 caracteres." }, { status: 400 });
  const limit = await checkRateLimit("password", request, session.session.authUserId, 5, 900, 900);
  if (limit.unavailable) return NextResponse.json({ error: "Proteção de acesso indisponível." }, { status: 503 });
  if (!limit.allowed) return NextResponse.json({ error: "Muitas tentativas. Aguarde e tente novamente." }, { status: 429 });
  const auth = createRequestAuthClient(request);
  if (!auth || !admin) return NextResponse.json({ error: "Servidor de acesso indisponível." }, { status: 503 });
  const { error } = await auth.client.auth.updateUser({ password });
  if (error) return NextResponse.json({ error: "Não foi possível atualizar a senha." }, { status: 400 });
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
