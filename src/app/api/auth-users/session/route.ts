import { NextResponse } from "next/server";
import { requireApiSession, requireTrustedOrigin } from "@/lib/api-auth";
import { createRequestAuthClient } from "@/lib/supabase-auth";
import { createAuthAdminClient } from "@/lib/supabase-auth";
import { AUTH_PURPOSE_COOKIE, verifyAuthPurpose } from "@/lib/auth-purpose";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  const admin = createAuthAdminClient();
  const { data: profile } = admin ? await admin.from("auth_users").select("must_change_password").eq("auth_user_id", auth.session.authUserId).maybeSingle() : { data: null };
  const signedPurpose = verifyAuthPurpose(readCookie(request, AUTH_PURPOSE_COOKIE), auth.session.authUserId);
  const purpose = profile?.must_change_password ? "invite" : signedPurpose === "recovery" ? "recovery" : "authenticated";
  const response = NextResponse.json({ active: true, session: auth.session, purpose,
    canSetPassword: purpose === "invite" || purpose === "recovery" }, { headers: { "Cache-Control": "no-store" } });
  if (readCookie(request, AUTH_PURPOSE_COOKIE) && !signedPurpose) response.cookies.set(AUTH_PURPOSE_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}

function readCookie(request: Request, name: string) {
  return (request.headers.get("cookie") ?? "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;
}

export async function DELETE(request: Request) {
  if (!requireTrustedOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  const auth = createRequestAuthClient(request);
  if (!auth) return NextResponse.json({ error: "Servidor de acesso indisponível." }, { status: 503 });
  await auth.client.auth.signOut({ scope: "global" });
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(AUTH_PURPOSE_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  return auth.applyCookies(response);
}
