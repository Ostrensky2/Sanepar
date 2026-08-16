import "server-only";

import { createHmac } from "crypto";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { NextResponse } from "next/server";

export type PendingAuthCookie = { name: string; value: string; options: CookieOptions };
export type ApplyAuthCookieOptions = { expireCodeVerifier?: boolean };

function env(name: string) {
  const value = process.env[name]?.trim();
  return value || null;
}

export function getAuthConfiguration() {
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const publishableKey = env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ?? env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const secretKey = env("SUPABASE_SECRET_KEY") ?? env("SUPABASE_SERVICE_ROLE_KEY");
  return { url, publishableKey, secretKey, ready: Boolean(url && publishableKey && secretKey) };
}

export function createRequestAuthClient(request: Request) {
  const { url, publishableKey } = getAuthConfiguration();
  if (!url || !publishableKey) return null;

  const pending: PendingAuthCookie[] = [];
  const cookies = parseCookies(request.headers.get("cookie") ?? "");
  const client = createServerClient(url, publishableKey, {
    auth: { flowType: "pkce" },
    cookies: {
      getAll: () => [...cookies.entries()].map(([name, value]) => ({ name, value })),
      setAll: (items) => { pending.push(...items); },
    },
  });

  return {
    client,
    applyCookies<T extends NextResponse>(response: T, options: ApplyAuthCookieOptions = {}): T {
      return applyPendingAuthCookies(response, pending, options);
    },
  };
}

export function applyPendingAuthCookies<T extends NextResponse>(response: T, pending: PendingAuthCookie[], options: ApplyAuthCookieOptions = {}): T {
  for (const cookie of pending) {
    if (options.expireCodeVerifier && isCodeVerifierCookie(cookie.name)) {
      response.cookies.set(cookie.name, "", { ...cookie.options, expires: new Date(0), maxAge: 0 });
    } else {
      response.cookies.set(cookie.name, cookie.value, cookie.options);
    }
  }
  return response;
}

export function createAuthAdminClient() {
  const { url, secretKey } = getAuthConfiguration();
  if (!url || !secretKey) return null;
  return createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function opaqueRateLimitKey(kind: "ip" | "identifier" | "pair", value: string) {
  const pepper = env("AUTH_RATE_LIMIT_PEPPER");
  if (!pepper || pepper.length < 32) return null;
  return createHmac("sha256", pepper).update(`${kind}\0${value}`).digest("hex");
}

function parseCookies(header: string) {
  const values = new Map<string, string>();
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    const raw = part.slice(separator + 1).trim();
    try { values.set(name, decodeURIComponent(raw)); } catch { values.set(name, raw); }
  }
  return values;
}

function isCodeVerifierCookie(name: string) {
  return /-code-verifier(?:\.\d+)?$/.test(name);
}
