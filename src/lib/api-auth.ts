import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import {
  categoryPrivileges,
  normalizeUserCategory,
  type PrivilegeKey,
  type UserCategory,
} from "@/lib/access-control";
import { getCloudRuntimeMode } from "@/lib/supabase";

export const SESSION_COOKIE_NAME = "yvae_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type ApiSession = {
  userId: string;
  email: string;
  name: string;
  role: UserCategory;
  exp: number;
};

type SessionInput = Omit<ApiSession, "exp">;

function getSessionSecret(): string | null {
  const secret = process.env.AUTH_SESSION_SECRET?.trim();
  return secret && secret.length >= 16 ? secret : null;
}

function isEnforcementActive() {
  return getCloudRuntimeMode() !== "modo local";
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSessionToken(input: SessionInput): string | null {
  const secret = getSessionSecret();

  if (!secret) {
    return null;
  }

  const session: ApiSession = {
    ...input,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  };
  const payload = base64UrlEncode(JSON.stringify(session));

  return `${payload}.${signPayload(payload, secret)}`;
}

export function verifySessionToken(token: string): ApiSession | null {
  const secret = getSessionSecret();

  if (!secret || !token) {
    return null;
  }

  const [payload, signature] = token.split(".");

  if (!payload || !signature) {
    return null;
  }

  const expected = Buffer.from(signPayload(payload, secret));
  const received = Buffer.from(signature);

  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return null;
  }

  try {
    const session = JSON.parse(base64UrlDecode(payload)) as ApiSession;

    if (!session.userId || !session.email || typeof session.exp !== "number") {
      return null;
    }

    if (session.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return { ...session, role: normalizeUserCategory(session.role) };
  } catch {
    return null;
  }
}

export function readSessionFromRequest(request: Request): ApiSession | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`));

  if (!match) {
    return null;
  }

  return verifySessionToken(decodeURIComponent(match.slice(SESSION_COOKIE_NAME.length + 1)));
}

export function applySessionCookie(response: NextResponse, token: string) {
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return response;
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
}

export type ApiAuthResult =
  | { ok: true; session: ApiSession | null }
  | { ok: false; response: NextResponse };

export function requireApiSession(request: Request, privilege?: PrivilegeKey): ApiAuthResult {
  // Em modo local (sem Supabase) o app roda como ferramenta de máquina única,
  // sem servidor de acesso disponível para emitir sessões.
  if (!isEnforcementActive()) {
    return { ok: true, session: null };
  }

  if (!getSessionSecret()) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Sessão indisponível: AUTH_SESSION_SECRET não configurada no servidor." },
        { status: 503 },
      ),
    };
  }

  const session = readSessionFromRequest(request);

  if (!session) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Sessão expirada ou inexistente. Entre novamente no sistema." },
        { status: 401 },
      ),
    };
  }

  if (privilege && !categoryPrivileges[session.role]?.includes(privilege)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Seu perfil não tem permissão para esta operação." },
        { status: 403 },
      ),
    };
  }

  return { ok: true, session };
}

const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, maxAttempts: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  bucket.count += 1;
  return bucket.count <= maxAttempts;
}

export function clearRateLimit(key: string) {
  rateLimitBuckets.delete(key);
}

export function getClientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  return forwarded.split(",")[0]?.trim() || "local";
}

export function errorDetails(detail: string | undefined): string | undefined {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    return undefined;
  }

  return detail;
}
