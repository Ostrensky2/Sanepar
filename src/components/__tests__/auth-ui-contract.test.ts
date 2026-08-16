import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  GENERIC_RECOVERY_MESSAGE,
  readAuthSession,
  requestPasswordRecovery,
  sendAdminAuthCommand,
  signInWithPassword,
} from "@/components/auth-ui-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Supabase Auth UI HTTP contract", () => {
  it("sends login credentials only to the login endpoint and preserves the setup flag", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      session: { userId: "user-1", name: "Pessoa", email: "pessoa@example.test", role: "ATGC" },
      mustChangePassword: true,
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await signInWithPassword(" PESSOA@EXAMPLE.TEST ", "password-only-for-request");

    expect(result).toMatchObject({ ok: true, mustSetPassword: true });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith("/api/auth-users/login", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ email: "pessoa@example.test", password: "password-only-for-request" }),
    }));
  });

  it("returns the same public recovery response on success and failure", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true }, 202))
      .mockRejectedValueOnce(new Error("network unavailable"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(requestPasswordRecovery("known@example.test")).resolves.toBe(GENERIC_RECOVERY_MESSAGE);
    await expect(requestPasswordRecovery("unknown@example.test")).resolves.toBe(GENERIC_RECOVERY_MESSAGE);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "/api/auth-users/reset-password",
      "/api/auth-users/reset-password",
    ]);
  });

  it("accepts password setup only from the server session contract", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      session: { userId: "user-1", name: "Pessoa", email: "pessoa@example.test", role: "ATGC" },
      purpose: "recovery",
      canSetPassword: true,
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(readAuthSession()).resolves.toMatchObject({ purpose: "recovery", canSetPassword: true });
    expect(fetchMock).toHaveBeenCalledWith("/api/auth-users/session", { cache: "no-store" });
  });

  it("keeps administrative commands passwordless", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await sendAdminAuthCommand({
      action: "invite",
      user: { name: "Pessoa", email: "pessoa@example.test", role: "ATGC", status: "ativo" },
    });
    await sendAdminAuthCommand({ action: "resend-invite", userId: "user-1" });

    for (const [, init] of fetchMock.mock.calls) {
      const body = JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>;
      expect(body).not.toHaveProperty("password");
      expect(JSON.stringify(body)).not.toMatch(/senha/i);
    }
  });

  it("does not persist or log authentication payloads in the browser adapter", () => {
    const source = readSource("src/components/auth-ui-client.ts");

    expect(source).not.toMatch(/localStorage|sessionStorage|document\.cookie/);
    expect(source).not.toMatch(/console\.(?:log|info|warn|error)/);
  });
});

describe("authentication screens", () => {
  it("removes the embedded user list and shared-password UI", () => {
    const sources = [
      "src/components/auth-gate.tsx",
      "src/components/access-management-panel.tsx",
      "src/components/member-activity-panel.tsx",
      "src/app/(dashboard)/ajuda/page.tsx",
      "src/app/(dashboard)/governanca/page.tsx",
    ].map(readSource).join("\n");

    expect(sources).not.toMatch(/senha provis[oó]ria|senha inicial|senha compartilhada/i);
    expect(sources).not.toMatch(/from ["']@\/lib\/auth-users["']/);
    expect(sources).not.toMatch(/loadAuthUsers|persistAuthUsers|INITIAL_PASSWORD/);
    expect(sources).not.toMatch(/reset (?:geral|em massa)|redefinição geral|redefinir todos|convidar todos/i);
    expect(sources).toContain("Convite individual");
  });

  it("guards password setup and clears password fields before the request", () => {
    const setup = readSource("src/components/password-setup-form.tsx");
    const gate = readSource("src/components/auth-gate.tsx");

    expect(setup).toContain('payload.canSetPassword && allowedPurpose ? "ready" : "invalid"');
    expect(setup).toContain('minLength={MIN_PASSWORD_LENGTH}');
    expect(setup).toContain('password.length < MIN_PASSWORD_LENGTH');
    expect(setup.indexOf('setPassword("")')).toBeLessThan(setup.indexOf("updateRecoveryPassword(submittedPassword)"));
    expect(setup).toContain("await signOutAuthSession()");
    expect(gate.indexOf('setPassword("")')).toBeLessThan(gate.indexOf("signInWithPassword(email, submittedPassword)"));
    expect(gate).toContain('router.replace("/definir-senha")');
  });

  it("keeps the login compact, responsive and keyboard accessible", () => {
    const gate = readSource("src/components/auth-gate.tsx");

    expect(gate).toContain("<YvaeMasthead compact />");
    expect(gate).toContain("min-h-[100dvh]");
    expect(gate).toContain("safe-area-inset-top");
    expect(gate).toContain("md:grid-cols-");
    expect(gate).toContain("h-11 w-11");
    expect(gate).toContain("focus-within:ring-2");
    expect(gate).toContain('aria-pressed={showPassword}');
    expect(gate).toContain('aria-live="polite"');
    expect(gate).not.toContain("sm:min-h-[420px]");
    expect(gate).not.toMatch(/senha provis[oó]ria|senha inicial|lista de usu[aá]rios/i);
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function readSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}
