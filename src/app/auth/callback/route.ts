import { NextResponse } from "next/server";
import { createRequestAuthClient } from "@/lib/supabase-auth";
import { AUTH_PURPOSE_COOKIE, createAuthPurpose } from "@/lib/auth-purpose";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url); const code = url.searchParams.get("code"); const tokenHash = url.searchParams.get("token_hash");
  const purpose = safePurpose(url.searchParams.get("type")); const appOrigin = process.env.APP_ORIGIN?.trim();
  if ((!code && !tokenHash) || (code && tokenHash) || !purpose || !appOrigin) return NextResponse.redirect(new URL("/?auth=invalid", appOrigin ?? url.origin));
  const next = safeUrl(url.searchParams.get("next"), appOrigin);
  const auth = createRequestAuthClient(request);
  if (!auth) return NextResponse.redirect(new URL("/?auth=unavailable", appOrigin));
  const { data, error } = code
    ? await auth.client.auth.exchangeCodeForSession(code)
    : await auth.client.auth.verifyOtp({ token_hash: tokenHash!, type: purpose });
  const response = NextResponse.redirect(error ? new URL("/?auth=invalid", appOrigin) : next);
  const purposeToken = !error && purpose && data.session?.user.id ? createAuthPurpose(purpose, data.session.user.id) : null;
  if (purposeToken) response.cookies.set(AUTH_PURPOSE_COOKIE, purposeToken, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 });
  return auth.applyCookies(response);
}

function safeUrl(value: string | null, appOrigin: string) {
  const fallback = new URL("/", appOrigin);
  if (!value) return fallback;
  try {
    let normalized = value;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const decoded = decodeURIComponent(normalized);
      if (decoded === normalized) break;
      normalized = decoded;
    }
    if (!normalized.startsWith("/") || normalized.startsWith("//") || normalized.includes("\\")) return fallback;
    const resolved = new URL(normalized, fallback);
    return resolved.origin === fallback.origin ? resolved : fallback;
  } catch { return fallback; }
}
function safePurpose(value: string | null) { return value === "invite" || value === "recovery" ? value : null; }
