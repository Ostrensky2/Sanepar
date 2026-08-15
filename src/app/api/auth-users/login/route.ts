import { NextResponse } from "next/server";
import { checkRateLimit, requireTrustedOrigin } from "@/lib/api-auth";
import { createAuthAdminClient, createRequestAuthClient } from "@/lib/supabase-auth";
import { normalizeUserCategory } from "@/lib/access-control";
import { AUTH_PURPOSE_COOKIE } from "@/lib/auth-purpose";
import { migrateLegacyLogin } from "@/lib/legacy-auth-migration";

export const runtime = "nodejs";
const INVALID = "Email ou senha incorretos.";

export async function POST(request: Request) {
  if (!requireTrustedOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  const body = await request.json().catch(() => null) as { email?: unknown; password?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password || email.length > 254 || password.length > 1024) return NextResponse.json({ error: INVALID }, { status: 401 });

  const limit = await checkRateLimit("login", request, email, 10, 900, 900);
  if (limit.unavailable) return NextResponse.json({ error: "Proteção de acesso indisponível." }, { status: 503 });
  if (!limit.allowed) return NextResponse.json({ error: "Muitas tentativas. Aguarde e tente novamente." }, { status: 429 });

  const auth = createRequestAuthClient(request);
  const admin = createAuthAdminClient();
  if (!auth || !admin) return NextResponse.json({ error: "Servidor de acesso indisponível." }, { status: 503 });
  let result = await auth.client.auth.signInWithPassword({ email, password });
  if ((result.error || !result.data.user) && await migrateLegacyLogin(email, password)) {
    result = await auth.client.auth.signInWithPassword({ email, password });
  }
  const { data, error } = result;
  if (error || !data.user) return NextResponse.json({ error: INVALID }, { status: 401 });

  const { data: profile, error: profileError } = await admin.from("auth_users")
    .select("id,auth_user_id,name,email,institution,role,status,must_change_password,created_at_label,last_access")
    .eq("auth_user_id", data.user.id).maybeSingle();
  if (profileError || !profile) { await auth.client.auth.signOut(); return NextResponse.json({ error: "Perfil autorizado não encontrado." }, { status: 403 }); }
  if (profile.status !== "ativo") { await auth.client.auth.signOut(); return NextResponse.json({ error: "Este acesso está inativo." }, { status: 403 }); }

  const lastAccess = new Date().toISOString();
  await admin.from("auth_users").update({ last_access: lastAccess, updated_at: lastAccess }).eq("id", profile.id);
  const response = NextResponse.json({
    session: { userId: profile.id, name: profile.name, email: profile.email, role: normalizeUserCategory(profile.role) },
    mustChangePassword: Boolean(profile.must_change_password),
  }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(AUTH_PURPOSE_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  return auth.applyCookies(response);
}
