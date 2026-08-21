import "server-only";

import { NextResponse } from "next/server";
import { hasPrivilege, normalizeUserCategory, type PrivilegeKey, type UserCategory } from "@/lib/access-control";
import { createAuthAdminClient, createRequestAuthClient, opaqueRateLimitKey } from "@/lib/supabase-auth";

export type ApiSession = { userId: string; authUserId: string; email: string; name: string; role: UserCategory; localDirect?: true };
export type ApiAuthResult = { ok: true; session: ApiSession } | { ok: false; response: NextResponse };

type ProfileRow = { id: string; auth_user_id: string | null; email: string; name: string; role: string; status: string };

export async function requireApiSession(request: Request, privilege?: PrivilegeKey): Promise<ApiAuthResult> {
  if (isMutation(request) && !requireTrustedOrigin(request)) return denied(403, "Origem não autorizada.");

  const admin = createAuthAdminClient();
  if (!admin) return denied(503, "Servidor de acesso indisponível.");

  if (isLocalDirectRequest(request)) {
    const { data, error } = await admin.from("auth_users").select("id, auth_user_id, email, name, role, status")
      .eq("role", "Admin").eq("status", "ativo").limit(2);
    if (error) return denied(503, "Não foi possível validar a autorização local.");
    if (!data || data.length !== 1) return denied(403, "Acesso local sem Admin único e ativo.");
    const profile = data[0] as ProfileRow;
    const role = normalizeUserCategory(profile.role);
    if (privilege && !hasPrivilege(role, privilege)) return denied(403, "Seu perfil não tem permissão para esta operação.");
    return { ok: true, session: { userId: profile.id, authUserId: profile.auth_user_id ?? "00000000-0000-0000-0000-000000000000", email: profile.email, name: profile.name, role, localDirect: true } };
  }

  const auth = createRequestAuthClient(request);
  if (!auth) return denied(503, "Servidor de acesso indisponível.");

  const { data: { user }, error } = await auth.client.auth.getUser();
  if (error || !user) return denied(401, "Sessão expirada ou inexistente. Entre novamente no sistema.");

  const { data: profile, error: profileError } = await admin
    .from("auth_users")
    .select("id, auth_user_id, email, name, role, status")
    .eq("auth_user_id", user.id)
    .maybeSingle<ProfileRow>();

  if (profileError) return denied(503, "Não foi possível validar a autorização atual.");
  if (!profile || profile.status !== "ativo") return denied(403, "Este acesso está inativo ou sem perfil autorizado.");

  const role = normalizeUserCategory(profile.role);
  if (privilege) {
    const { data: allowed, error: permissionError } = await auth.client.rpc("has_current_permission", { p_permission: privilege });
    if (permissionError) return denied(503, "Não foi possível validar a permissão atual.");
    if (allowed !== true) return denied(403, "Seu perfil não tem permissão para esta operação.");
  }

  return { ok: true, session: { userId: profile.id, authUserId: user.id, email: profile.email, name: profile.name, role } };
}

function isLocalDirectRequest(request: Request) {
  if (process.env.NODE_ENV !== "development" || process.env.AUTH_LOCAL_DIRECT_ACCESS !== "true") return false;
  try {
    const url = new URL(request.url);
    const host = new URL(`http://${request.headers.get("host") ?? ""}`);
    const forwardedHost = request.headers.get("x-forwarded-host");
    return isLocalHostname(url.hostname)
      && isLocalHostname(host.hostname)
      && url.port === host.port
      && (!forwardedHost || isLocalHostname(new URL(`http://${forwardedHost}`).hostname));
  } catch {
    return false;
  }
}

function isLocalHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export async function checkRateLimit(scope: string, request: Request, identifier: string, maxAttempts: number, windowSeconds: number, blockSeconds = 0) {
  const admin = createAuthAdminClient();
  if (!admin) return { allowed: false, unavailable: true } as const;
  const ip = getClientKey(request).trim().toLowerCase();
  const normalizedIdentifier = identifier.trim().toLowerCase();
  const subjects = [
    ["ip", opaqueRateLimitKey("ip", ip)],
    ["identifier", opaqueRateLimitKey("identifier", normalizedIdentifier)],
    ["pair", opaqueRateLimitKey("pair", `${ip}\0${normalizedIdentifier}`)],
  ] as const;
  if (subjects.some(([, hash]) => !hash)) return { allowed: false, unavailable: true } as const;
  const results = await Promise.all(subjects.map(([dimension, hash]) => admin.rpc("consume_auth_rate_limit", {
    p_scope: `${scope}:${dimension}`, p_subject_hash: hash!, p_limit: maxAttempts,
    p_window_seconds: windowSeconds, p_block_seconds: blockSeconds,
  })));
  if (results.some(({ error, data }) => error || !Array.isArray(data) || typeof data[0]?.allowed !== "boolean")) {
    return { allowed: false, unavailable: true } as const;
  }
  return { allowed: results.every(({ data }) => data![0].allowed === true), unavailable: false } as const;
}

export function getClientKey(request: Request) {
  const vercelIp = request.headers.get("x-vercel-forwarded-for");
  const forwarded = vercelIp ?? request.headers.get("x-forwarded-for") ?? "";
  return forwarded.split(",")[0]?.trim() || "unknown";
}

export function requireTrustedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const configured = process.env.APP_ORIGIN?.trim();
  if (!origin || !configured) return false;
  try { return new URL(origin).origin === new URL(configured).origin; } catch { return false; }
}

function isMutation(request: Request) {
  return request.method === "POST" || request.method === "PUT" || request.method === "PATCH" || request.method === "DELETE";
}

export function errorDetails(detail: string | undefined) {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production" ? undefined : detail;
}

function denied(status: number, error: string): ApiAuthResult {
  return { ok: false, response: NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } }) };
}
