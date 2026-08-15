import { beforeEach, describe, expect, it, vi } from "vitest";

const signIn = vi.fn(); const applyCookies = vi.fn((response) => response); const from = vi.fn();
vi.mock("@/lib/api-auth", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, unavailable: false })), getClientKey: () => "redacted", requireTrustedOrigin: () => true,
}));
vi.mock("@/lib/supabase-auth", () => ({
  createRequestAuthClient: () => ({ client: { auth: { signInWithPassword: signIn, signOut: vi.fn() } }, applyCookies }),
  createAuthAdminClient: () => ({ from }),
}));

import { POST } from "@/app/api/auth-users/login/route";

describe("POST /api/auth-users/login", () => {
  beforeEach(() => { signIn.mockReset(); from.mockReset(); applyCookies.mockClear(); });
  it("retorna 401 sem revelar ausência ou senha divergente", async () => {
    signIn.mockResolvedValue({ data: { user: null }, error: { message: "invalid" } });
    const response = await POST(request("wrong"));
    expect(response.status).toBe(401); expect(JSON.stringify(await response.json())).not.toMatch(/hash|password/i);
  });
  it("autentica somente usuário Supabase com perfil ativo", async () => {
    signIn.mockResolvedValue({ data: { user: { id: "auth-redacted" } }, error: null });
    from.mockReturnValueOnce({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "profile", name: "Pessoa", email: "redacted@example.invalid", institution: "ATGC", role: "ATGC", status: "ativo", must_change_password: false, created_at_label: "2026-01-01", last_access: "" }, error: null }) }) }) })
      .mockReturnValueOnce({ update: () => ({ eq: async () => ({ error: null }) }) });
    const response = await POST(request("valid")); const body = await response.json();
    expect(response.status).toBe(200); expect(body.session.userId).toBe("profile"); expect(body).not.toHaveProperty("password");
    expect(response.headers.get("set-cookie")).toContain("yvae_auth_purpose=");
  });
});

function request(password: string) { return new Request("https://app.invalid/api/auth-users/login", { method: "POST", headers: { origin: "https://app.invalid", "content-type": "application/json" }, body: JSON.stringify({ email: "redacted@example.invalid", password }) }); }
