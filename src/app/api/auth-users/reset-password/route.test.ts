import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextResponse } from "next/server";
import type { ApplyAuthCookieOptions, PendingAuthCookie } from "@/lib/supabase-auth";

const checkRateLimit = vi.fn();
const requireTrustedOrigin = vi.fn();
const resetPasswordForEmail = vi.fn();
const maybeSingle = vi.fn();
const readLink = vi.fn();
const listUsers = vi.fn();
const createUser = vi.fn();
const deleteUser = vi.fn();
const linkUser = vi.fn();
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
    createAuthAdminClient: () => ({
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: readLink, is: () => ({ is: () => ({ maybeSingle }) }) }) }) }),
      auth: { admin: { listUsers, createUser, deleteUser } },
      rpc: (...args: unknown[]) => linkUser(...args),
    }),
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
    maybeSingle.mockReset(); readLink.mockReset(); listUsers.mockReset(); createUser.mockReset(); deleteUser.mockReset(); linkUser.mockReset();
    checkRateLimit.mockResolvedValue({ allowed: true, unavailable: false });
    requireTrustedOrigin.mockReturnValue(true);
    maybeSingle.mockResolvedValue({ data: null, error: null });
    readLink.mockResolvedValue({ data: { auth_user_id: null }, error: null });
    listUsers.mockResolvedValue({ data: { users: [] }, error: null });
    createUser.mockResolvedValue({ data: { user: { id: "new-auth-fixture" } }, error: null });
    deleteUser.mockResolvedValue({ error: null });
    linkUser.mockResolvedValue({ data: true, error: null });
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

  it("promove somente o perfil legacy solicitado após o recovery ser aceito", async () => {
    maybeSingle.mockResolvedValue({ data: { id: "legacy-profile", email: "legacy@example.test", password: "legacy-hash", status: "ativo", auth_user_id: null, legacy_auth_disabled_at: null }, error: null });
    const response = await POST(request("legacy@example.test"));
    expect(response.status).toBe(202);
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ email: "legacy@example.test", email_confirm: true }));
    expect(linkUser).toHaveBeenCalledWith("link_migrated_auth_user", { p_profile_id: "legacy-profile", p_auth_user_id: "new-auth-fixture" });
    expect(resetPasswordForEmail.mock.invocationCallOrder[0]).toBeLessThan(linkUser.mock.invocationCallOrder[0]);
  });

  it("reutiliza identidade Auth preexistente com o mesmo email", async () => {
    maybeSingle.mockResolvedValue({ data: { id: "legacy-profile", email: "legacy@example.test", password: "legacy-hash", status: "ativo", auth_user_id: null, legacy_auth_disabled_at: null }, error: null });
    listUsers.mockResolvedValue({ data: { users: [{ id: "existing-auth", email: "legacy@example.test" }] }, error: null });
    await POST(request("legacy@example.test"));
    expect(createUser).not.toHaveBeenCalled();
    expect(linkUser).toHaveBeenCalledWith("link_migrated_auth_user", { p_profile_id: "legacy-profile", p_auth_user_id: "existing-auth" });
  });

  it("remove identidade provisória se o envio falhar e não desabilita o login legacy", async () => {
    maybeSingle.mockResolvedValue({ data: { id: "legacy-profile", email: "legacy@example.test", password: "legacy-hash", status: "ativo", auth_user_id: null, legacy_auth_disabled_at: null }, error: null });
    resetPasswordForEmail.mockResolvedValue({ data: null, error: new Error("provider failure") });
    await POST(request("legacy@example.test"));
    expect(deleteUser).toHaveBeenCalledWith("new-auth-fixture");
    expect(linkUser).not.toHaveBeenCalled();
  });

  it("mantém 202 e tenta compensar quando a RPC rejeita", async () => {
    maybeSingle.mockResolvedValue({ data: { id: "legacy-profile", email: "legacy@example.test", password: "legacy-hash", status: "ativo", auth_user_id: null, legacy_auth_disabled_at: null }, error: null });
    linkUser.mockRejectedValue(new Error("rpc unavailable"));
    expect((await POST(request("legacy@example.test"))).status).toBe(202);
    expect(deleteUser).toHaveBeenCalledWith("new-auth-fixture");
  });

  it("preserva a identidade quando a RPC efetiva o vínculo e perde a resposta", async () => {
    maybeSingle.mockResolvedValue({ data: { id: "legacy-profile", email: "legacy@example.test", password: "legacy-hash", status: "ativo", auth_user_id: null, legacy_auth_disabled_at: null }, error: null });
    linkUser.mockRejectedValue(new Error("response lost"));
    readLink.mockResolvedValue({ data: { auth_user_id: "new-auth-fixture" }, error: null });
    expect((await POST(request("legacy@example.test"))).status).toBe(202);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("preserva a identidade quando não consegue confirmar o vínculo após resposta perdida", async () => {
    maybeSingle.mockResolvedValue({ data: { id: "legacy-profile", email: "legacy@example.test", password: "legacy-hash", status: "ativo", auth_user_id: null, legacy_auth_disabled_at: null }, error: null });
    linkUser.mockRejectedValue(new Error("response lost"));
    readLink.mockResolvedValue({ data: null, error: new Error("read unavailable") });
    expect((await POST(request("legacy@example.test"))).status).toBe(202);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("mantém 202 quando a limpeza provisória retorna erro ou rejeita", async () => {
    maybeSingle.mockResolvedValue({ data: { id: "legacy-profile", email: "legacy@example.test", password: "legacy-hash", status: "ativo", auth_user_id: null, legacy_auth_disabled_at: null }, error: null });
    resetPasswordForEmail.mockResolvedValue({ data: null, error: new Error("provider failure") });
    deleteUser.mockResolvedValueOnce({ error: new Error("delete failed") }).mockRejectedValueOnce(new Error("delete unavailable"));
    expect((await POST(request("legacy@example.test"))).status).toBe(202);
    expect((await POST(request("legacy@example.test"))).status).toBe(202);
  });

  it("mantém 202 quando a preparação legacy rejeita", async () => {
    maybeSingle.mockRejectedValue(new Error("database unavailable"));
    expect((await POST(request("legacy@example.test"))).status).toBe(202);
    expect(resetPasswordForEmail).toHaveBeenCalledOnce();
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
