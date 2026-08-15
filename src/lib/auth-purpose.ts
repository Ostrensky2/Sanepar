import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { createAuthAdminClient } from "@/lib/supabase-auth";

export const AUTH_PURPOSE_COOKIE = "yvae_auth_purpose";
export type AuthPurpose = "invite" | "recovery";
export type VerifiedAuthPurpose = {
  purpose: AuthPurpose;
  expiresAt: number;
  jti: string;
};

export function createAuthPurpose(purpose: AuthPurpose, authUserId: string) {
  const secret = getSecret();
  if (!secret) return null;
  const payload = Buffer.from(JSON.stringify({
    purpose,
    authUserId,
    exp: Math.floor(Date.now() / 1000) + 600,
    jti: randomUUID(),
  })).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyAuthPurpose(token: string | null, authUserId: string): VerifiedAuthPurpose | null {
  const secret = getSecret();
  if (!secret || !token) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;
  const expected = Buffer.from(sign(payload, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      purpose?: unknown;
      authUserId?: unknown;
      exp?: unknown;
      jti?: unknown;
    };
    const now = Math.floor(Date.now() / 1000);
    if ((value.purpose !== "invite" && value.purpose !== "recovery")
      || value.authUserId !== authUserId
      || typeof value.exp !== "number"
      || !Number.isInteger(value.exp)
      || value.exp <= now
      || value.exp > now + 600
      || typeof value.jti !== "string"
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.jti)) return null;
    return { purpose: value.purpose, expiresAt: value.exp, jti: value.jti };
  } catch {
    return null;
  }
}

export async function consumeAuthPurposeOnce(claims: VerifiedAuthPurpose) {
  const secret = getSecret();
  const admin = createAuthAdminClient();
  if (!secret || !admin) return false;
  const purposeJtiHash = createHmac("sha256", secret)
    .update("auth-purpose-consumption\0")
    .update(claims.purpose)
    .update("\0")
    .update(claims.jti)
    .digest("hex");
  try {
    const { data, error } = await admin.rpc("consume_auth_purpose_once", {
      p_purpose_jti_hash: purposeJtiHash,
      p_expires_at: new Date(claims.expiresAt * 1000).toISOString(),
    });
    return !error && data === true;
  } catch {
    return false;
  }
}

function getSecret() {
  const value = process.env.AUTH_PURPOSE_SECRET?.trim();
  return value && value.length >= 32 ? value : null;
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
