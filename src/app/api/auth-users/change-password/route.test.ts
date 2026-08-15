import { beforeEach, describe, expect, it, vi } from "vitest";

const maybeSingle = vi.fn(); const updateUser = vi.fn(); const signOut = vi.fn(); const verifyPurpose = vi.fn(); const consumePurpose = vi.fn();
vi.mock("@/lib/api-auth", () => ({
  requireApiSession: vi.fn(async () => ({ ok: true, session: { userId: "profile", authUserId: "auth-fixture", name: "Fixture", email: "fixture@example.invalid", role: "ATGC" } })),
  requireTrustedOrigin: () => true, checkRateLimit: vi.fn(async () => ({ allowed: true, unavailable: false })), getClientKey: () => "redacted",
}));
vi.mock("@/lib/auth-purpose", () => ({ AUTH_PURPOSE_COOKIE: "yvae_auth_purpose", verifyAuthPurpose: (...args: unknown[]) => verifyPurpose(...args), consumeAuthPurposeOnce: (...args: unknown[]) => consumePurpose(...args) }));
vi.mock("@/lib/supabase-auth", () => ({
  createAuthAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }), update: () => ({ eq: async () => ({ error: null }) }) }) }),
  createRequestAuthClient: () => ({ client: { auth: { updateUser, signOut } }, applyCookies: (response: Response) => response }),
}));
import { POST } from "@/app/api/auth-users/change-password/route";

describe("definição de senha por capability", () => {
  beforeEach(() => { maybeSingle.mockReset(); updateUser.mockReset(); signOut.mockReset(); verifyPurpose.mockReset(); consumePurpose.mockReset(); updateUser.mockResolvedValue({ error: null }); signOut.mockResolvedValue({ error: null }); consumePurpose.mockResolvedValue(true); });
  it("nega sessão comum", async () => { maybeSingle.mockResolvedValue({ data: { must_change_password: false } }); verifyPurpose.mockReturnValue(null); expect((await POST(request())).status).toBe(403); expect(updateUser).not.toHaveBeenCalled(); });
  it("aceita recovery somente após consumo distribuído e limpa sessão/cookie", async () => { const claims = { purpose: "recovery", expiresAt: 1_800_000_000, jti: "00000000-0000-4000-8000-000000000001" }; maybeSingle.mockResolvedValue({ data: { must_change_password: false } }); verifyPurpose.mockReturnValue(claims); const response = await POST(request("yvae_auth_purpose=signed")); expect(response.status).toBe(200); expect(consumePurpose).toHaveBeenCalledWith(claims); expect(consumePurpose.mock.invocationCallOrder[0]).toBeLessThan(updateUser.mock.invocationCallOrder[0]); expect(signOut).toHaveBeenCalledWith({ scope: "global" }); expect(response.headers.get("set-cookie")).toContain("yvae_auth_purpose="); });
  it("falha fechado em replay ou indisponibilidade do consumo", async () => { maybeSingle.mockResolvedValue({ data: { must_change_password: false } }); verifyPurpose.mockReturnValue({ purpose: "recovery", expiresAt: 1_800_000_000, jti: "00000000-0000-4000-8000-000000000001" }); consumePurpose.mockResolvedValue(false); expect((await POST(request("yvae_auth_purpose=signed"))).status).toBe(403); expect(updateUser).not.toHaveBeenCalled(); });
  it("consome purpose de invite assinado antes de definir senha", async () => { maybeSingle.mockResolvedValue({ data: { must_change_password: true } }); verifyPurpose.mockReturnValue({ purpose: "invite", expiresAt: 1_800_000_000, jti: "00000000-0000-4000-8000-000000000002" }); expect((await POST(request("yvae_auth_purpose=signed"))).status).toBe(200); expect(consumePurpose).toHaveBeenCalledOnce(); });
  it("rejeita cookie purpose inválido mesmo com convite pendente", async () => { maybeSingle.mockResolvedValue({ data: { must_change_password: true } }); verifyPurpose.mockReturnValue(null); expect((await POST(request("yvae_auth_purpose=invalid"))).status).toBe(403); expect(updateUser).not.toHaveBeenCalled(); });
  it("aceita convite pendente", async () => { maybeSingle.mockResolvedValue({ data: { must_change_password: true } }); verifyPurpose.mockReturnValue(null); expect((await POST(request())).status).toBe(200); });
});

function request(cookie = "") { return new Request("https://app.invalid/api/auth-users/change-password", { method: "POST", headers: { origin: "https://app.invalid", "content-type": "application/json", cookie }, body: JSON.stringify({ newPassword: "Synthetic-Strong-Password-42!" }) }); }
