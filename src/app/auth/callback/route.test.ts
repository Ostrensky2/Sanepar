import { beforeEach, describe, expect, it, vi } from "vitest";

const exchange = vi.fn(); const verifyOtp = vi.fn(); const applyCookies = vi.fn((response) => response);
vi.mock("@/lib/supabase-auth", () => ({ createRequestAuthClient: () => ({ client: { auth: { exchangeCodeForSession: exchange, verifyOtp } }, applyCookies }) }));
import { GET } from "@/app/auth/callback/route";

describe("callback PKCE", () => {
  beforeEach(() => {
    process.env.APP_ORIGIN = "https://app.invalid";
    process.env.AUTH_PURPOSE_SECRET = "synthetic-purpose-secret-32-bytes-minimum";
    exchange.mockReset(); verifyOtp.mockReset(); applyCookies.mockClear();
    exchange.mockResolvedValue({ data: { session: { user: { id: "auth-fixture" } } }, error: null });
    verifyOtp.mockResolvedValue({ data: { session: { user: { id: "auth-fixture" } } }, error: null });
  });
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
  it("troca o code PKCE produzido pela ConfirmationURL atual", async () => {
    const response = await GET(new Request("https://app.invalid/auth/callback?type=recovery&next=/definir-senha&code=pkce-fixture"));
    expect(exchange).toHaveBeenCalledWith("pkce-fixture");
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("https://app.invalid/definir-senha");
    expect(response.headers.get("set-cookie")).toContain("yvae_auth_purpose=");
    expect(applyCookies).toHaveBeenCalledOnce();
  });
  it("aceita token_hash oficial sem depender de fragmento", async () => {
    const response = await GET(new Request("https://app.invalid/auth/callback?token_hash=hash-fixture&type=recovery&next=/definir-senha"));
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "hash-fixture", type: "recovery" });
    expect(exchange).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("https://app.invalid/definir-senha");
    expect(response.headers.get("set-cookie")).toContain("yvae_auth_purpose=");
  });
  it.each([
    ["code PKCE inválido", "code=invalid", exchange],
    ["token_hash inválido", "token_hash=invalid", verifyOtp],
  ])("falha fechado para %s", async (_case, artifact, operation) => {
    operation.mockResolvedValueOnce({ data: { session: null }, error: new Error("synthetic auth failure") });
    const response = await GET(new Request(`https://app.invalid/auth/callback?${artifact}&type=recovery&next=/definir-senha`));
    expect(response.headers.get("location")).toBe("https://app.invalid/?auth=invalid");
    expect(response.headers.get("set-cookie")).toBeNull();
  });
  it.each([
    ["fragmento, que não é enviado ao servidor", "https://app.invalid/auth/callback?type=recovery&next=/definir-senha#access_token=fixture&type=recovery"],
    ["purpose ausente", "https://app.invalid/auth/callback?code=fixture&next=/definir-senha"],
    ["code e token_hash ambíguos", "https://app.invalid/auth/callback?code=fixture&token_hash=hash-fixture&type=recovery&next=/definir-senha"],
  ])("rejeita %s", async (_case, href) => {
    const response = await GET(new Request(href));
    expect(response.headers.get("location")).toBe("https://app.invalid/?auth=invalid");
    expect(exchange).not.toHaveBeenCalled();
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});
