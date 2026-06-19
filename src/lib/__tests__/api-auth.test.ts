import { beforeEach, describe, expect, it } from "vitest";

const SECRET = "segredo-de-teste-com-tamanho-suficiente";

function freshEnv() {
  process.env.AUTH_SESSION_SECRET = SECRET;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "sb_publishable_teste";
  delete process.env.NEXT_PUBLIC_DISABLE_DB;
  delete process.env.VERCEL;
}

async function loadApiAuth() {
  // Reimporta o módulo a cada teste para que as mudanças de env tenham efeito
  // nas constantes derivadas em lib/supabase.
  const mod = await import("@/lib/api-auth");
  return mod;
}

const sampleSession = {
  userId: "usr-teste",
  email: "teste@exemplo.com",
  name: "Pessoa Teste",
  role: "ATGC" as const,
};

function requestWithCookie(cookie?: string) {
  return new Request("http://localhost/api/teste", {
    headers: cookie ? { cookie } : {},
  });
}

describe("api-auth", () => {
  beforeEach(() => {
    freshEnv();
  });

  it("emite token e o verifica com sucesso", async () => {
    const { createSessionToken, verifySessionToken } = await loadApiAuth();
    const token = createSessionToken(sampleSession);

    expect(token).toBeTruthy();

    const session = verifySessionToken(token as string);

    expect(session?.userId).toBe("usr-teste");
    expect(session?.role).toBe("ATGC");
    expect(session && session.exp > Date.now() / 1000).toBe(true);
  });

  it("rejeita token adulterado", async () => {
    const { createSessionToken, verifySessionToken } = await loadApiAuth();
    const token = createSessionToken(sampleSession) as string;
    const [payload, signature] = token.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ ...sampleSession, role: "Admin", exp: Math.floor(Date.now() / 1000) + 3600 }),
      "utf8",
    ).toString("base64url");

    expect(verifySessionToken(`${forgedPayload}.${signature}`)).toBeNull();
    expect(verifySessionToken(`${payload}.assinatura-falsa`)).toBeNull();
    expect(verifySessionToken("lixo-sem-formato")).toBeNull();
  });

  it("não emite token sem segredo configurado", async () => {
    const { createSessionToken } = await loadApiAuth();
    delete process.env.AUTH_SESSION_SECRET;

    expect(createSessionToken(sampleSession)).toBeNull();
  });

  it("requireApiSession exige cookie e privilégio", async () => {
    const { createSessionToken, requireApiSession, SESSION_COOKIE_NAME } = await loadApiAuth();

    const semCookie = requireApiSession(requestWithCookie());
    expect(semCookie.ok).toBe(false);

    const token = createSessionToken(sampleSession) as string;
    const comCookie = requireApiSession(
      requestWithCookie(`${SESSION_COOKIE_NAME}=${token}`),
    );
    expect(comCookie.ok).toBe(true);

    // ATGC não tem gestão de permissões
    const semPrivilegio = requireApiSession(
      requestWithCookie(`${SESSION_COOKIE_NAME}=${token}`),
      "permissions.manage",
    );
    expect(semPrivilegio.ok).toBe(false);

    // ATGC tem data.import
    const comPrivilegio = requireApiSession(
      requestWithCookie(`${SESSION_COOKIE_NAME}=${token}`),
      "data.import",
    );
    expect(comPrivilegio.ok).toBe(true);
  });

  it("aplica rate limit por chave", async () => {
    const { checkRateLimit, clearRateLimit } = await loadApiAuth();
    const key = `teste:${Math.random()}`;

    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(key, 5, 60_000)).toBe(true);
    }

    expect(checkRateLimit(key, 5, 60_000)).toBe(false);

    clearRateLimit(key);
    expect(checkRateLimit(key, 5, 60_000)).toBe(true);
  });
});
