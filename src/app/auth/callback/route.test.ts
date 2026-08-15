import { beforeEach, describe, expect, it, vi } from "vitest";

const exchange = vi.fn(); const applyCookies = vi.fn((response) => response);
vi.mock("@/lib/supabase-auth", () => ({ createRequestAuthClient: () => ({ client: { auth: { exchangeCodeForSession: exchange } }, applyCookies }) }));
import { GET } from "@/app/auth/callback/route";

describe("callback PKCE", () => {
  beforeEach(() => { process.env.APP_ORIGIN = "https://app.invalid"; process.env.AUTH_PURPOSE_SECRET = "synthetic-purpose-secret-32-bytes-minimum"; exchange.mockResolvedValue({ data: { session: { user: { id: "auth-fixture" } } }, error: null }); });
  it("rejeita next externo", async () => {
    const response = await GET(new Request("https://app.invalid/auth/callback?code=fixture&type=recovery&next=https://evil.invalid"));
    expect(response.headers.get("location")).toBe("https://app.invalid/");
  });
  it.each([
    ["barra invertida simples", "%5Cevil.invalid"],
    ["barra invertida dupla", "%5C%5Cevil.invalid"],
    ["barra invertida codificada no path", "%2F%255Cevil.invalid"],
    ["host protocol-relative", "%2F%2Fevil.invalid"],
    ["URL absoluta", "https%3A%2F%2Fevil.invalid%2Fcapture"],
  ])("rejeita %s", async (_case, next) => {
    const response = await GET(new Request(`https://app.invalid/auth/callback?code=fixture&type=recovery&next=${next}`));
    expect(response.headers.get("location")).toBe("https://app.invalid/");
  });
  it("preserva destino interno de definição de senha", async () => {
    const response = await GET(new Request("https://app.invalid/auth/callback?code=fixture&type=invite&next=/definir-senha"));
    expect(response.headers.get("location")).toBe("https://app.invalid/definir-senha");
    expect(response.headers.get("set-cookie")).toContain("yvae_auth_purpose=");
    expect(response.headers.get("set-cookie")).not.toContain("yvae_auth_purpose=invite");
  });
});
