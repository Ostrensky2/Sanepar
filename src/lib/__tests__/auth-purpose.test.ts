import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase-auth", () => ({ createAuthAdminClient: () => ({ rpc }) }));

import { consumeAuthPurposeOnce, createAuthPurpose, verifyAuthPurpose } from "@/lib/auth-purpose";

describe("purpose de autenticação single-use", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-15T12:00:00.000Z"));
    process.env.AUTH_PURPOSE_SECRET = "synthetic-purpose-secret-32-bytes-minimum";
    rpc.mockReset();
  });

  it.each(["invite", "recovery"] as const)("assina %s com JTI, usuário e TTL máximo", (purpose) => {
    const token = createAuthPurpose(purpose, "auth-fixture");
    const claims = verifyAuthPurpose(token, "auth-fixture");
    expect(claims).toMatchObject({ purpose, expiresAt: Math.floor(Date.now() / 1000) + 600 });
    expect(claims?.jti).toMatch(/^[0-9a-f-]{36}$/i);
    expect(verifyAuthPurpose(token, "outro-usuário")).toBeNull();
  });

  it("rejeita adulteração, expiração e token sem JTI", () => {
    const token = createAuthPurpose("recovery", "auth-fixture");
    expect(verifyAuthPurpose(`${token}x`, "auth-fixture")).toBeNull();
    vi.advanceTimersByTime(601_000);
    expect(verifyAuthPurpose(token, "auth-fixture")).toBeNull();
  });

  it("envia à RPC somente digest 64hex e expiração assinada", async () => {
    const token = createAuthPurpose("recovery", "auth-fixture");
    const claims = verifyAuthPurpose(token, "auth-fixture");
    expect(claims).not.toBeNull();
    rpc.mockResolvedValue({ data: true, error: null });
    await expect(consumeAuthPurposeOnce(claims!)).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("consume_auth_purpose_once", {
      p_purpose_jti_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_expires_at: "2026-08-15T12:10:00.000Z",
    });
    const serializedCall = JSON.stringify(rpc.mock.calls[0]);
    expect(serializedCall).not.toContain(claims!.jti);
    expect(serializedCall).not.toContain("auth-fixture");
  });

  it("falha fechado em replay, erro e exceção da RPC", async () => {
    const claims = verifyAuthPurpose(createAuthPurpose("invite", "auth-fixture"), "auth-fixture")!;
    rpc.mockResolvedValueOnce({ data: false, error: null });
    await expect(consumeAuthPurposeOnce(claims)).resolves.toBe(false);
    rpc.mockResolvedValueOnce({ data: null, error: { code: "22023" } });
    await expect(consumeAuthPurposeOnce(claims)).resolves.toBe(false);
    rpc.mockRejectedValueOnce(new Error("unavailable"));
    await expect(consumeAuthPurposeOnce(claims)).resolves.toBe(false);
  });
});
