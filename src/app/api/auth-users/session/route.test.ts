import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-auth", () => ({ requireApiSession: vi.fn(async () => ({ ok: true, session: { userId: "profile", authUserId: "auth", name: "Pessoa", email: "redacted@example.invalid", role: "ATGC" } })), requireTrustedOrigin: () => true }));
const maybeSingle = vi.fn();
vi.mock("@/lib/supabase-auth", () => ({
  createAuthAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) }),
  createRequestAuthClient: () => ({ client: { auth: { signOut: vi.fn() } }, applyCookies: (response: Response) => response }),
}));
vi.mock("@/lib/auth-purpose", () => ({ AUTH_PURPOSE_COOKIE: "yvae_auth_purpose", verifyAuthPurpose: (token: string | null) => token === "signed-recovery" ? "recovery" : null }));
import { DELETE, GET } from "@/app/api/auth-users/session/route";

describe("purpose da sessão", () => {
  it("marca convite pendente", async () => { maybeSingle.mockResolvedValue({ data: { must_change_password: true } }); expect(await (await GET(new Request("https://app.invalid"))).json()).toMatchObject({ purpose: "invite", canSetPassword: true }); });
  it("marca recuperação pelo cookie HttpOnly curto", async () => { maybeSingle.mockResolvedValue({ data: { must_change_password: false } }); expect(await (await GET(new Request("https://app.invalid", { headers: { cookie: "yvae_auth_purpose=signed-recovery" } }))).json()).toMatchObject({ purpose: "recovery", canSetPassword: true }); });
  it("sessão comum não pode definir senha", async () => { maybeSingle.mockResolvedValue({ data: { must_change_password: false } }); expect(await (await GET(new Request("https://app.invalid"))).json()).toMatchObject({ purpose: "authenticated", canSetPassword: false }); });
  it("logout limpa purpose", async () => { const response = await DELETE(new Request("https://app.invalid", { method: "DELETE", headers: { origin: "https://app.invalid" } })); expect(response.headers.get("set-cookie")).toContain("yvae_auth_purpose="); });
});
