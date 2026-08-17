import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ verifyOtp: vi.fn(), applyCookies: vi.fn((response) => response), requireTrustedOrigin: vi.fn() }));
const { verifyOtp, applyCookies, requireTrustedOrigin } = mocks;
vi.mock("@/lib/api-auth", () => ({ requireTrustedOrigin: mocks.requireTrustedOrigin }));
vi.mock("@/lib/supabase-auth", () => ({ createRequestAuthClient: () => ({ client: { auth: { verifyOtp: mocks.verifyOtp } }, applyCookies: mocks.applyCookies }) }));
import { GET, POST } from "@/app/auth/callback/route";

const tokenHash = "a".repeat(56);
const href = `https://app.invalid/auth/callback?token_hash=${tokenHash}&type=invite&next=/definir-senha`;

describe("callback anti-scanner", () => {
  beforeEach(() => {
    process.env.APP_ORIGIN = "https://app.invalid";
    process.env.AUTH_PURPOSE_SECRET = "synthetic-purpose-secret-32-bytes-minimum";
    verifyOtp.mockReset().mockResolvedValue({ data: { session: { user: { id: "auth-fixture" } } }, error: null });
    applyCookies.mockClear(); requireTrustedOrigin.mockReset().mockReturnValue(true);
  });

  it("não consome token no GET do scanner nem no GET humano", async () => {
    const scanner = await GET(new Request(href));
    const human = await GET(new Request(href));
    expect(scanner.status).toBe(200); expect(human.status).toBe(200);
    expect(await human.text()).toContain("Confirmar e continuar");
    expect(scanner.headers.get("set-cookie")).toBeNull();
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("consome token somente no POST com Origin e CSRF e cria sessão/purpose", async () => {
    const get = await GET(new Request(href));
    const html = await get.text();
    const csrf = html.match(/name="csrf" value="([^"]+)"/)![1];
    const response = await confirm(csrf);
    expect(verifyOtp).toHaveBeenCalledOnce();
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: tokenHash, type: "invite" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.invalid/definir-senha");
    expect(response.headers.get("set-cookie")).toContain("yvae_auth_purpose=");
    expect(response.headers.get("set-cookie")).toContain("yvae_auth_link_used=");
    expect(applyCookies).toHaveBeenCalledOnce();
  });

  it("nega replay no POST e no GET", async () => {
    const csrf = await issueCsrf();
    const first = await confirm(csrf);
    const used = first.headers.get("set-cookie")!.match(/yvae_auth_link_used=([^;,]+)/)![1];
    const postReplay = await confirm(csrf, `yvae_auth_link_used=${used}`);
    const getReplay = await GET(new Request(href, { headers: { cookie: `yvae_auth_link_used=${used}` } }));
    expect(postReplay.headers.get("location")).toBe("https://app.invalid/?auth=invalid");
    expect(getReplay.headers.get("location")).toBe("https://app.invalid/?auth=invalid");
    expect(verifyOtp).toHaveBeenCalledOnce();
  });

  it("falha fechado para token expirado", async () => {
    verifyOtp.mockResolvedValueOnce({ data: { session: null }, error: new Error("expired") });
    const response = await confirm(await issueCsrf());
    expect(response.headers.get("location")).toBe("https://app.invalid/?auth=invalid");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(applyCookies).not.toHaveBeenCalled();
  });

  it("não persiste sessão se a criação do purpose falhar", async () => {
    const csrf = await issueCsrf(); delete process.env.AUTH_PURPOSE_SECRET;
    const response = await confirm(csrf);
    expect(response.headers.get("location")).toBe("https://app.invalid/?auth=invalid");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(applyCookies).not.toHaveBeenCalled();
  });

  it.each(["missing", "signup", "magiclink"])("rejeita purpose inválido %s", async (purpose) => {
    const value = purpose === "missing" ? "" : `&type=${purpose}`;
    const response = await GET(new Request(`https://app.invalid/auth/callback?token_hash=${tokenHash}${value}`));
    expect(response.headers.get("location")).toBe("https://app.invalid/?auth=invalid");
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("rejeita PKCE e token malformado", async () => {
    expect((await GET(new Request("https://app.invalid/auth/callback?code=pkce&type=recovery"))).headers.get("location")).toBe("https://app.invalid/?auth=invalid");
    expect((await GET(new Request("https://app.invalid/auth/callback?token_hash=short&type=recovery"))).headers.get("location")).toBe("https://app.invalid/?auth=invalid");
  });

  it("aceita token_hash canônico URL-safe não hexadecimal", async () => {
    const opaqueToken = `p_${"a".repeat(58)}`;
    const response = await GET(new Request(`https://app.invalid/auth/callback?token_hash=${opaqueToken}&type=recovery&next=/definir-senha`));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Confirmar e continuar");
  });

  it("rejeita POST sem Origin confiável ou sem CSRF", async () => {
    requireTrustedOrigin.mockReturnValueOnce(false);
    expect((await confirm(await issueCsrf())).headers.get("location")).toBe("https://app.invalid/?auth=invalid");
    expect((await confirm("invalid")).headers.get("location")).toBe("https://app.invalid/?auth=invalid");
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("aceita fallback de formulário same-origin sem header Origin", async () => {
    requireTrustedOrigin.mockReturnValueOnce(false);
    const csrf = await issueCsrf();
    const body = new URLSearchParams({ token_hash: tokenHash, type: "invite", next: "/definir-senha", csrf });
    const response = await POST(new Request("https://app.invalid/auth/callback", { method: "POST", headers: { referer: "https://app.invalid/", "sec-fetch-site": "same-origin", "content-type": "application/x-www-form-urlencoded" }, body }));
    expect(response.headers.get("location")).toBe("https://app.invalid/definir-senha");
    expect(verifyOtp).toHaveBeenCalledOnce();
  });

  it("não usa fallback quando Origin presente é divergente", async () => {
    requireTrustedOrigin.mockReturnValueOnce(false);
    const csrf = await issueCsrf();
    const body = new URLSearchParams({ token_hash: tokenHash, type: "invite", next: "/definir-senha", csrf });
    const response = await POST(new Request("https://app.invalid/auth/callback", { method: "POST", headers: { origin: "https://evil.invalid", referer: "https://app.invalid/", "sec-fetch-site": "same-origin", "content-type": "application/x-www-form-urlencoded" }, body }));
    expect(response.headers.get("location")).toBe("https://app.invalid/?auth=invalid");
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("rejeita CSRF assinado expirado", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-08-17T15:00:00Z"));
      const csrf = await issueCsrf();
      vi.setSystemTime(new Date("2026-08-17T15:10:01Z"));
      expect((await confirm(csrf)).headers.get("location")).toBe("https://app.invalid/?auth=invalid");
      expect(verifyOtp).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it("vincula o CSRF ao token, purpose e destino", async () => {
    const csrf = await issueCsrf();
    const body = new URLSearchParams({ token_hash: tokenHash, type: "invite", next: "/outro-destino", csrf });
    const response = await POST(new Request("https://app.invalid/auth/callback", { method: "POST", headers: { origin: "https://app.invalid", "content-type": "application/x-www-form-urlencoded" }, body }));
    expect(response.headers.get("location")).toBe("https://app.invalid/?auth=invalid");
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("normaliza next externo para a raiz", async () => {
    const response = await GET(new Request(`https://app.invalid/auth/callback?token_hash=${tokenHash}&type=recovery&next=https://evil.invalid`));
    expect(await response.text()).toContain('name="next" value="/"');
  });
});

async function issueCsrf() {
  const response = await GET(new Request(href)); const html = await response.text();
  return html.match(/name="csrf" value="([^"]+)"/)![1];
}
function confirm(csrf: string, cookie = "") {
  const body = new URLSearchParams({ token_hash: tokenHash, type: "invite", next: "/definir-senha", csrf });
  return POST(new Request("https://app.invalid/auth/callback", { method: "POST", headers: { origin: "https://app.invalid", cookie, "content-type": "application/x-www-form-urlencoded" }, body }));
}
