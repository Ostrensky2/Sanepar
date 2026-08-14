import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUserRow } from "@/lib/auth-users-server";
import { hashPassword } from "@/lib/password";

const mocks = vi.hoisted(() => ({
  applySessionCookie: vi.fn(),
  checkRateLimit: vi.fn(() => true),
  clearRateLimit: vi.fn(),
  createOptionalSupabaseClient: vi.fn(),
  createSessionToken: vi.fn(() => null),
  update: vi.fn(),
  updateEq: vi.fn(async () => ({ error: null })),
  upsert: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  applySessionCookie: mocks.applySessionCookie,
  checkRateLimit: mocks.checkRateLimit,
  clearRateLimit: mocks.clearRateLimit,
  createSessionToken: mocks.createSessionToken,
  errorDetails: (message: string) => message,
  getClientKey: () => "test-client",
}));

vi.mock("@/lib/supabase", () => ({
  createOptionalSupabaseClient: mocks.createOptionalSupabaseClient,
}));

import { POST } from "@/app/api/auth-users/login/route";

const VALID_PASSWORD = "senha-valida-123";
const WRONG_PASSWORD = "senha-incorreta-123";
const INITIAL_PASSWORD = "ATGC26";
let validHash = "";

beforeAll(async () => {
  validHash = await hashPassword(VALID_PASSWORD);
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.checkRateLimit.mockReturnValue(true);
  mocks.createSessionToken.mockReturnValue(null);
});

describe("POST /api/auth-users/login", () => {
  it("autentica conta ativa pelo hash sem alterar senha ou must_change_password", async () => {
    useAuthRows([authRow()]);

    const response = await login(VALID_PASSWORD);

    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.update).toHaveBeenCalledWith({
      last_access: expect.any(String),
      updated_at: expect.any(String),
    });
    expect(mocks.update.mock.calls[0][0]).not.toHaveProperty("password");
    expect(mocks.update.mock.calls[0][0]).not.toHaveProperty("must_change_password");
  });

  it("autentica senha provisoria já cadastrada e mantém troca obrigatória", async () => {
    const provisionalHash = await hashPassword(INITIAL_PASSWORD);
    useAuthRows([authRow({ password: provisionalHash, must_change_password: true })]);

    const response = await login(INITIAL_PASSWORD);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.mustChangePassword).toBe(true);
    expect(body.user.mustChangePassword).toBe(true);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejeita conta ausente com senha provisoria sem criar registro", async () => {
    useAuthRows([]);

    const response = await login(INITIAL_PASSWORD);

    expect(response.status).toBe(401);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejeita senha divergente sem atualizar registro", async () => {
    useAuthRows([authRow()]);

    const response = await login(WRONG_PASSWORD);

    expect(response.status).toBe(401);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("não redefine a conta antes excepcionada", async () => {
    useAuthRows([
      authRow({
        id: "usr-adriana-de-souza-trigo",
        email: "adrianast@sanepar.com.br",
        must_change_password: true,
      }),
    ]);

    const response = await login(INITIAL_PASSWORD, "adrianast@sanepar.com.br");

    expect(response.status).toBe(401);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("não inclui password nem hash na resposta", async () => {
    useAuthRows([authRow()]);

    const response = await login(VALID_PASSWORD);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user).not.toHaveProperty("password");
    expect(body.user).not.toHaveProperty("hash");
    expect(JSON.stringify(body)).not.toContain(validHash);
  });
});

function useAuthRows(rows: AuthUserRow[]) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    returns: vi.fn(async () => ({ data: rows, error: null })),
    update: mocks.update,
    upsert: mocks.upsert,
  };

  mocks.update.mockReturnValue({ eq: mocks.updateEq });
  mocks.createOptionalSupabaseClient.mockReturnValue({
    from: vi.fn(() => builder),
  });
}

function authRow(overrides: Partial<AuthUserRow> = {}): AuthUserRow {
  return {
    id: "usr-teste",
    name: "Pessoa Teste",
    email: "teste@example.com",
    institution: "ATGC",
    role: "ATGC",
    status: "ativo",
    password: validHash,
    must_change_password: false,
    created_at_label: "2026-08-14",
    last_access: "Primeiro acesso pendente",
    updated_at: "2026-08-14T00:00:00.000Z",
    ...overrides,
  };
}

function login(password: string, email = "teste@example.com") {
  return POST(
    new Request("http://localhost/api/auth-users/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  );
}
