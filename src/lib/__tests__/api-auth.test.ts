import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const { rpc, getUser, maybeSingle, createRequestAuthClient, createAuthAdminClient } = vi.hoisted(() => ({
  rpc: vi.fn(),
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
  createRequestAuthClient: vi.fn(),
  createAuthAdminClient: vi.fn(),
}));
vi.mock("@/lib/supabase-auth", () => ({
  createAuthAdminClient,
  createRequestAuthClient,
  opaqueRateLimitKey: (kind: string) => (kind === "ip" ? "a" : kind === "identifier" ? "b" : "c").repeat(64),
}));

import { checkRateLimit, requireApiSession, requireTrustedOrigin } from "@/lib/api-auth";

const protectedMutations = {
  "src/app/api/campaign-management/route.ts": ["PUT"],
  "src/app/api/import-conflicts/route.ts": ["PATCH"],
  "src/app/api/documents/route.ts": ["PUT", "DELETE"],
  "src/app/api/documents/upload/route.ts": ["POST"],
  "src/app/api/field-diary/route.ts": ["POST", "PUT"],
  "src/app/api/field-diary/consolidate/route.ts": ["POST"],
  "src/app/api/field-diary/import/route.ts": ["POST"],
  "src/app/api/imports/campaigns/route.ts": ["POST", "DELETE"],
  "src/app/api/imports/preview/route.ts": ["POST"],
  "src/app/api/imports/results/route.ts": ["POST"],
  "src/app/api/photos/upload/route.ts": ["POST"],
  "src/app/api/point-actions/route.ts": ["PUT"],
  "src/app/api/point-actions/import/route.ts": ["POST"],
  "src/app/api/roads/route/route.ts": ["POST"],
  "src/app/api/support-requests/route.ts": ["PUT"],
  "src/app/api/support-requests/notify/route.ts": ["POST"],
} as const;

describe("proteções de API auth", () => {
  beforeEach(() => {
    rpc.mockReset(); getUser.mockReset(); maybeSingle.mockReset();
    createRequestAuthClient.mockReset(); createAuthAdminClient.mockReset();
    process.env.APP_ORIGIN = "https://app.invalid";
    getUser.mockResolvedValue({ data: { user: { id: "auth-fixture" } }, error: null });
    maybeSingle.mockResolvedValue({ data: { id: "profile", auth_user_id: "auth-fixture", email: "redacted@example.invalid", name: "Pessoa", role: "ATGC", status: "ativo" }, error: null });
    createRequestAuthClient.mockReturnValue({ client: { auth: { getUser }, rpc } });
    createAuthAdminClient.mockReturnValue({ rpc, from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) });
  });

  it("exige origem canônica", () => {
    expect(requireTrustedOrigin(new Request("https://app.invalid/api", { headers: { origin: "https://app.invalid" } }))).toBe(true);
    expect(requireTrustedOrigin(new Request("https://app.invalid/api", { headers: { origin: "https://evil.invalid" } }))).toBe(false);
  });

  it.each(["POST", "PUT", "PATCH", "DELETE"])("protege mutação %s antes da sessão", async (method) => {
    const missing = await requireApiSession(new Request("https://app.invalid/api", { method }));
    const foreign = await requireApiSession(new Request("https://app.invalid/api", { method, headers: { origin: "https://evil.invalid" } }));
    expect(missing.ok ? 200 : missing.response.status).toBe(403);
    expect(foreign.ok ? 200 : foreign.response.status).toBe(403);
    expect(createRequestAuthClient).not.toHaveBeenCalled();

    await expect(requireApiSession(new Request("https://app.invalid/api", { method, headers: { origin: "https://app.invalid" } }))).resolves.toMatchObject({ ok: true });
  });

  it("comprova o inventário mutante 19/19 no guard central de sessão", () => {
    let count = 0;
    for (const [file, methods] of Object.entries(protectedMutations)) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source, file).toContain("requireApiSession(");
      for (const method of methods) {
        expect(source, `${method} ${file}`).toMatch(new RegExp(`export\\s+async\\s+function\\s+${method}\\s*\\(`));
        count += 1;
      }
    }
    expect(count).toBe(19);
  });

  it("exige aprovação nas três dimensões sem enviar identificador claro", async () => {
    rpc.mockResolvedValue({ data: [{ allowed: true, remaining: 1, retry_after_seconds: 0 }], error: null });
    const result = await checkRateLimit("login", new Request("https://app.invalid", { headers: { "x-forwarded-for": "192.0.2.1" } }), "person@example.invalid", 5, 60);
    expect(result).toEqual({ allowed: true, unavailable: false });
    expect(rpc).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("person@example.invalid");
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("192.0.2.1");
  });

  it("falha fechado se uma dimensão falhar", async () => {
    rpc.mockResolvedValueOnce({ data: [{ allowed: true }], error: null }).mockResolvedValueOnce({ data: null, error: { message: "unavailable" } }).mockResolvedValueOnce({ data: [{ allowed: true }], error: null });
    await expect(checkRateLimit("login", new Request("https://app.invalid"), "identifier", 5, 60)).resolves.toEqual({ allowed: false, unavailable: true });
  });
});
