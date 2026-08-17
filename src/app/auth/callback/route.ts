import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { requireTrustedOrigin } from "@/lib/api-auth";
import { createRequestAuthClient } from "@/lib/supabase-auth";
import { AUTH_PURPOSE_COOKIE, createAuthPurpose } from "@/lib/auth-purpose";

export const runtime = "nodejs";

const CSRF_COOKIE = "yvae_auth_confirm_csrf";
const USED_COOKIE = "yvae_auth_link_used";
const COOKIE_OPTIONS = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/auth/callback", maxAge: 600 };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const input = readInput(url.searchParams);
  const appOrigin = process.env.APP_ORIGIN?.trim();
  if (!input || !appOrigin || matchesCookie(request, USED_COOKIE, digest(input.tokenHash))) return invalid(appOrigin ?? url.origin);

  const csrf = randomBytes(32).toString("base64url");
  const response = new NextResponse(confirmPage(input, csrf), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
  response.cookies.set(CSRF_COOKIE, csrf, COOKIE_OPTIONS);
  return response;
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const appOrigin = process.env.APP_ORIGIN?.trim();
  if (!appOrigin || !requireTrustedOrigin(request)) return postRedirect("/?auth=invalid", appOrigin ?? url.origin);

  const form = await request.formData().catch(() => null);
  const input = form && readInput(form);
  const csrf = form?.get("csrf");
  const used = input ? digest(input.tokenHash) : "";
  if (!input || typeof csrf !== "string" || !matchesCookie(request, CSRF_COOKIE, csrf) || matchesCookie(request, USED_COOKIE, used)) return postRedirect("/?auth=invalid", appOrigin);

  const auth = createRequestAuthClient(request);
  if (!auth) return postRedirect("/?auth=unavailable", appOrigin);
  const { data, error } = await auth.client.auth.verifyOtp({ token_hash: input.tokenHash, type: input.purpose });
  const purposeToken = !error && data.session?.user.id ? createAuthPurpose(input.purpose, data.session.user.id) : null;
  const response = NextResponse.redirect(error || !purposeToken ? new URL("/?auth=invalid", appOrigin) : input.next, 303);
  response.cookies.set(CSRF_COOKIE, "", { ...COOKIE_OPTIONS, maxAge: 0 });
  if (!purposeToken) return response;

  response.cookies.set(USED_COOKIE, used, COOKIE_OPTIONS);
  response.cookies.set(AUTH_PURPOSE_COOKIE, purposeToken, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 });
  return auth.applyCookies(response);
}

type Input = { tokenHash: string; purpose: "invite" | "recovery"; next: URL };

function readInput(values: URLSearchParams | FormData): Input | null {
  const tokenHash = values.get("token_hash");
  const purpose = safePurpose(values.get("type"));
  const appOrigin = process.env.APP_ORIGIN?.trim();
  if (!appOrigin || typeof tokenHash !== "string" || !/^[a-f0-9]{64}$/i.test(tokenHash) || !purpose) return null;
  const next = values.get("next");
  return { tokenHash, purpose, next: safeUrl(typeof next === "string" ? next : null, appOrigin) };
}

function confirmPage(input: Input, csrf: string) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Confirmar acesso — Yva'E</title><style>body{font-family:system-ui,sans-serif;background:#f4f7f5;color:#17352a;display:grid;min-height:100vh;place-items:center;margin:0}.card{background:#fff;border:1px solid #d8e3dd;border-radius:16px;box-shadow:0 8px 30px #17352a18;max-width:28rem;padding:2rem}h1{margin-top:0}p{line-height:1.5}button{background:#176b4d;border:0;border-radius:8px;color:#fff;cursor:pointer;font:inherit;font-weight:700;padding:.8rem 1rem;width:100%}</style></head><body><main class="card"><h1>Yva'E</h1><p>Confirme que você deseja continuar para definir sua senha.</p><form method="post" action="/auth/callback"><input type="hidden" name="token_hash" value="${escapeHtml(input.tokenHash)}"><input type="hidden" name="type" value="${input.purpose}"><input type="hidden" name="next" value="${escapeHtml(input.next.pathname + input.next.search)}"><input type="hidden" name="csrf" value="${escapeHtml(csrf)}"><button type="submit">Confirmar e continuar</button></form></main></body></html>`;
}

function safeUrl(value: string | null, appOrigin: string) {
  const fallback = new URL("/", appOrigin);
  if (!value) return fallback;
  try {
    let normalized = value;
    for (let attempt = 0; attempt < 2; attempt += 1) { const decoded = decodeURIComponent(normalized); if (decoded === normalized) break; normalized = decoded; }
    if (!normalized.startsWith("/") || normalized.startsWith("//") || normalized.includes("\\")) return fallback;
    const resolved = new URL(normalized, fallback);
    return resolved.origin === fallback.origin ? resolved : fallback;
  } catch { return fallback; }
}

function safePurpose(value: FormDataEntryValue | string | null) { return value === "invite" || value === "recovery" ? value : null; }
function digest(value: string) { return createHash("sha256").update(value).digest("base64url"); }
function readCookie(request: Request, name: string) { return request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? null; }
function matchesCookie(request: Request, name: string, expected: string) {
  const actual = readCookie(request, name);
  if (!actual) return false;
  const left = Buffer.from(actual); const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!); }
function invalid(origin: string) { return NextResponse.redirect(new URL("/?auth=invalid", origin)); }
function postRedirect(path: string, origin: string) { return NextResponse.redirect(new URL(path, origin), 303); }
