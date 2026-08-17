import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireTrustedOrigin: vi.fn(), requireApiSession: vi.fn(), createUser: vi.fn(), deleteUser: vi.fn(),
  resetPasswordForEmail: vi.fn(), insert: vi.fn(), removeProfile: vi.fn(), maybeSingle: vi.fn() }));
const { requireTrustedOrigin, requireApiSession, createUser, deleteUser, resetPasswordForEmail, insert, removeProfile, maybeSingle } = mocks;

vi.mock("@/lib/api-auth", () => ({ requireTrustedOrigin: mocks.requireTrustedOrigin, requireApiSession: mocks.requireApiSession }));
vi.mock("@/lib/supabase-auth", () => ({ createAuthAdminClient: () => ({
  auth: { admin: { createUser: mocks.createUser, deleteUser: mocks.deleteUser }, resetPasswordForEmail: mocks.resetPasswordForEmail },
  from: () => ({ insert: mocks.insert, select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }), delete: () => ({ eq: mocks.removeProfile }) }),
}) }));

import { PUT } from "./route";

const request = (body: unknown) => new Request("https://app.invalid/api/auth-users", { method: "PUT", headers: { "Content-Type": "application/json", Origin: "https://app.invalid" }, body: JSON.stringify(body) });

describe("convites entregues pelo canal transacional", () => {
  beforeEach(() => {
    process.env.APP_ORIGIN = "https://app.invalid";
    requireTrustedOrigin.mockReset().mockReturnValue(true); requireApiSession.mockReset().mockResolvedValue({ ok: true, session: { role: "Admin", userId: "actor" } });
    createUser.mockReset().mockResolvedValue({ data: { user: { id: "auth-new" } }, error: null }); deleteUser.mockReset().mockResolvedValue({ error: null });
    resetPasswordForEmail.mockReset().mockResolvedValue({ data: {}, error: null }); insert.mockReset().mockResolvedValue({ error: null }); removeProfile.mockReset().mockResolvedValue({ error: null }); maybeSingle.mockReset().mockResolvedValue({ data: null, error: null });
  });

  it("cria identidade confirmada e só conclui após enviar o link de definição", async () => {
    const response = await PUT(request({ action: "invite", user: { name: "Pessoa", email: "person@example.test", role: "Admin", status: "ativo" } }));
    expect(response.status).toBe(201);
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ email: "person@example.test", email_confirm: true }));
    expect(resetPasswordForEmail).toHaveBeenCalledWith("person@example.test", { redirectTo: "https://app.invalid/auth/callback?type=recovery&next=/definir-senha" });
    expect(insert.mock.invocationCallOrder[0]).toBeLessThan(resetPasswordForEmail.mock.invocationCallOrder[0]);
  });

  it("compensa perfil e identidade quando a entrega falha", async () => {
    resetPasswordForEmail.mockResolvedValue({ data: null, error: new Error("provider") });
    expect((await PUT(request({ action: "invite", user: { name: "Pessoa", email: "person@example.test", role: "Admin", status: "ativo" } }))).status).toBe(502);
    expect(removeProfile).toHaveBeenCalledWith("auth_user_id", "auth-new"); expect(deleteUser).toHaveBeenCalledWith("auth-new");
  });

  it("mantém falha controlada e compensa quando operações rejeitam", async () => {
    insert.mockRejectedValueOnce(new Error("database"));
    expect((await PUT(request({ action: "invite", user: { name: "Pessoa", email: "person@example.test", role: "Admin", status: "ativo" } }))).status).toBe(503);
    expect(deleteUser).toHaveBeenCalledWith("auth-new");
    insert.mockResolvedValue({ error: null }); resetPasswordForEmail.mockRejectedValueOnce(new Error("provider"));
    expect((await PUT(request({ action: "invite", user: { name: "Pessoa", email: "person@example.test", role: "Admin", status: "ativo" } }))).status).toBe(502);
    expect(removeProfile).toHaveBeenCalledWith("auth_user_id", "auth-new");
  });

  it("preserva Auth se o insert efetiva o perfil e perde a resposta", async () => {
    insert.mockRejectedValue(new Error("response lost")); maybeSingle.mockResolvedValue({ data: { id: "profile-created" }, error: null });
    expect((await PUT(request({ action: "invite", user: { name: "Pessoa", email: "person@example.test", role: "Admin", status: "ativo" } }))).status).toBe(503);
    expect(removeProfile).toHaveBeenCalledWith("auth_user_id", "auth-new"); expect(deleteUser).not.toHaveBeenCalled();
  });

  it("não apaga Auth quando não consegue confirmar a remoção do perfil", async () => {
    resetPasswordForEmail.mockResolvedValue({ data: null, error: new Error("provider") }); removeProfile.mockResolvedValue({ error: new Error("delete") });
    maybeSingle.mockResolvedValue({ data: { id: "profile-created" }, error: null });
    expect((await PUT(request({ action: "invite", user: { name: "Pessoa", email: "person@example.test", role: "Admin", status: "ativo" } }))).status).toBe(502);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("não reenvia convite para conta já ativa", async () => {
    maybeSingle.mockResolvedValue({ data: { id: "profile", email: "person@example.test", role: "Admin", must_change_password: false }, error: null });
    expect((await PUT(request({ action: "resend-invite", userId: "profile" }))).status).toBe(400);
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("não reenvia convite pendente sem identidade Auth", async () => {
    maybeSingle.mockResolvedValue({ data: { id: "profile", email: "person@example.test", role: "Admin", must_change_password: true, auth_user_id: null }, error: null });
    expect((await PUT(request({ action: "resend-invite", userId: "profile" }))).status).toBe(400);
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });
});
