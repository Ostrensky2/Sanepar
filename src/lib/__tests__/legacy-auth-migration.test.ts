import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "@/lib/password";

const createUser = vi.fn(); const deleteUser = vi.fn(); const from = vi.fn(); const rpc = vi.fn();
vi.mock("@/lib/supabase-auth", () => ({ createAuthAdminClient: () => ({ auth: { admin: { createUser, deleteUser } }, from, rpc }) }));
import { migrateLegacyLogin } from "@/lib/legacy-auth-migration";

describe("migração progressiva de scrypt custom", () => {
  beforeEach(() => { process.env.AUTH_LEGACY_MIGRATION_ENABLED = "true"; createUser.mockReset(); deleteUser.mockReset(); from.mockReset(); rpc.mockReset(); });
  it("vincula somente após senha sintética válida, sem importar hash", async () => {
    const syntheticPassword = "synthetic-only-Strong-42!"; const stored = await hashPassword(syntheticPassword);
    from.mockReturnValue({ select: () => ({ eq: () => ({ is: () => ({ is: () => ({ maybeSingle: async () => ({ data: { id: "profile", email: "fixture@example.invalid", name: "Fixture", password: stored, status: "ativo", auth_user_id: null, legacy_auth_disabled_at: null }, error: null }) }) }) }) }) });
    createUser.mockResolvedValue({ data: { user: { id: "auth-fixture" } }, error: null });
    rpc.mockResolvedValue({ data: true, error: null });
    await expect(migrateLegacyLogin("fixture@example.invalid", syntheticPassword)).resolves.toBe(true);
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ password: syntheticPassword }));
    expect(JSON.stringify(createUser.mock.calls)).not.toContain(stored);
    expect(rpc).toHaveBeenCalledWith("link_migrated_auth_user", { p_profile_id: "profile", p_auth_user_id: "auth-fixture" });
  });
  it("não cria conta quando a senha sintética diverge", async () => {
    const stored = await hashPassword("synthetic-correct-42!");
    from.mockReturnValue({ select: () => ({ eq: () => ({ is: () => ({ is: () => ({ maybeSingle: async () => ({ data: { id: "profile", email: "fixture@example.invalid", name: "Fixture", password: stored, status: "ativo", auth_user_id: null, legacy_auth_disabled_at: null }, error: null }) }) }) }) }) });
    await expect(migrateLegacyLogin("fixture@example.invalid", "synthetic-wrong-42!")).resolves.toBe(false);
    expect(createUser).not.toHaveBeenCalled();
  });
  it("compensa somente a conta recém-criada quando a RPC recusa o vínculo", async () => {
    const stored = await hashPassword("synthetic-correct-42!");
    from.mockReturnValue({ select: () => ({ eq: () => ({ is: () => ({ is: () => ({ maybeSingle: async () => ({ data: { id: "profile", email: "fixture@example.invalid", name: "Fixture", password: stored, status: "ativo", auth_user_id: null, legacy_auth_disabled_at: null }, error: null }) }) }) }) }) });
    createUser.mockResolvedValue({ data: { user: { id: "auth-new-only" } }, error: null });
    rpc.mockResolvedValue({ data: false, error: null });
    await expect(migrateLegacyLogin("fixture@example.invalid", "synthetic-correct-42!")).resolves.toBe(false);
    expect(deleteUser).toHaveBeenCalledWith("auth-new-only");
  });
});
