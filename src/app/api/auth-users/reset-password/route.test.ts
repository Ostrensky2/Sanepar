import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextResponse } from "next/server";
import type { ApplyAuthCookieOptions, PendingAuthCookie } from "@/lib/supabase-auth";

const checkRateLimit = vi.fn();
const requireTrustedOrigin = vi.fn();
const resetPasswordForEmail = vi.fn();
const pending = vi.hoisted(() => [] as PendingAuthCookie[]);
const applyCookies = vi.fn();

vi.mock("@/lib/api-auth", () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
  requireTrustedOrigin: (...args: unknown[]) => requireTrustedOrigin(...args),
}));
vi.mock("@/lib/supabase-auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase-auth")>();
  return {
    ...actual,
    createRequestAuthClient: () => ({
      client: { auth: { resetPasswordForEmail } },
      applyCookies: (response: NextResponse, options?: ApplyAuthCookieOptions) => {
        applyCookies(response, options);
        return actual.applyPendingAuthCookies(response, pending, options);
      },
    }),
  };
});

import { POST } from "@/app/api/auth-users/reset-password/route";

describe("recovery PKCE", () => {
  beforeEach(() => {
    process.env.APP_ORIGIN = "https://app.invalid";
    checkRateLimit.mockReset(); requireTrustedOrigin.mockReset(); resetPasswordForEmail.mockReset(); applyCookies.mockClear(); pending.length = 0;
    checkRateLimit.mockResolvedValue({ allowed: true, unavailable: false });
    requireTrustedOrigin.mockReturnValue(true);
    resetPasswordForEmail.mockImplementation(async () => {
      pending.push(verifierCookie());
      return { data: {}, error: null };
    });
  });

  it("propaga o cookie do code verifier e preserva a resposta anti-enumeração", async () => {
    const response = await POST(request("known@example.test"));
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
    expect(resetPasswordForEmail).toHaveBeenCalledWith("known@example.test", {
      redirectTo: "https://app.invalid/auth/callback?type=recovery&next=/definir-senha",
    });
    expect(applyCookies).toHaveBeenCalledOnce();
    expect(applyCookies).toHaveBeenCalledWith(response, { expireCodeVerifier: false });
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("sb-project-auth-token-code-verifier=pkce-fixture");
    expect(cookie).toContain("Max-Age=600");
    expect(cookie).not.toContain("Max-Age=0");
  });

  it("expira somente o verifier criado pela chamada quando o provedor retorna erro", async () => {
    resetPasswordForEmail.mockImplementation(async () => {
      pending.push(verifierCookie());
      pending.push({ name: "sb-project-auth-token", value: "session-fixture", options: { path: "/", httpOnly: true, sameSite: "lax", maxAge: 3600 } } satisfies PendingAuthCookie);
      return { data: null, error: new Error("synthetic provider failure") };
    });
    const response = await POST(request("known@example.test"));
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
    expect(applyCookies).toHaveBeenCalledWith(response, { expireCodeVerifier: true });
    const cookies = response.headers.get("set-cookie") ?? "";
    const expiredVerifier = cookies.split(", sb-project-auth-token=")[0];
    expect(expiredVerifier).toContain("sb-project-auth-token-code-verifier=");
    expect(expiredVerifier).toContain("Path=/");
    expect(expiredVerifier).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    expect(expiredVerifier).toContain("Max-Age=0");
    expect(expiredVerifier).toContain("HttpOnly");
    expect(expiredVerifier.toLowerCase()).toContain("samesite=lax");
    expect(cookies).not.toContain("sb-project-auth-token-code-verifier=pkce-fixture");
    expect(cookies).toContain("sb-project-auth-token=session-fixture");
    expect(cookies).toContain("Max-Age=3600");
  });

  it("rejeita Origin divergente antes de gerar PKCE", async () => {
    requireTrustedOrigin.mockReturnValue(false);
    const response = await POST(request("known@example.test"));
    expect(response.status).toBe(403);
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
    expect(applyCookies).not.toHaveBeenCalled();
  });
});

function request(email: string) {
  return new Request("https://app.invalid/api/auth-users/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://app.invalid" },
    body: JSON.stringify({ email }),
  });
}

function verifierCookie(): PendingAuthCookie {
  return {
    name: "sb-project-auth-token-code-verifier",
    value: "pkce-fixture",
    options: { path: "/", httpOnly: true, sameSite: "lax", maxAge: 600 },
  };
}
