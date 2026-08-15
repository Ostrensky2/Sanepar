import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

export const AUTH_PURPOSE_COOKIE = "yvae_auth_purpose";
export type AuthPurpose = "invite" | "recovery";

export function createAuthPurpose(purpose: AuthPurpose, authUserId: string) {
  const secret = getSecret(); if (!secret) return null;
  const payload = Buffer.from(JSON.stringify({ purpose, authUserId, exp: Math.floor(Date.now() / 1000) + 600 })).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyAuthPurpose(token: string | null, authUserId: string): AuthPurpose | null {
  const secret = getSecret(); if (!secret || !token) return null;
  const [payload, signature] = token.split("."); if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload, secret)); const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { purpose?: unknown; authUserId?: unknown; exp?: unknown };
    if ((value.purpose !== "invite" && value.purpose !== "recovery") || value.authUserId !== authUserId || typeof value.exp !== "number" || value.exp < Math.floor(Date.now() / 1000)) return null;
    return value.purpose;
  } catch { return null; }
}

function getSecret() { const value = process.env.AUTH_PURPOSE_SECRET?.trim(); return value && value.length >= 32 ? value : null; }
function sign(payload: string, secret: string) { return createHmac("sha256", secret).update(payload).digest("base64url"); }
