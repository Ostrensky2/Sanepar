import { afterEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { createRequestAuthClient } from "@/lib/supabase-auth";

describe("Supabase PKCE response binding", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("serializa o verifier na própria resposta durante resetPasswordForEmail", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "fixture-publishable-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));
    const response = NextResponse.json({ ok: true }, { status: 202 });
    const auth = createRequestAuthClient(new Request("https://app.example.test/api/reset"), response);

    expect(auth).not.toBeNull();
    const { error } = await auth!.client.auth.resetPasswordForEmail("fixture@example.test", {
      redirectTo: "https://app.example.test/auth/callback?type=recovery&next=/definir-senha",
    });

    expect(error).toBeNull();
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("sb-fixture-auth-token-code-verifier=");
    expect(cookie).toContain("Max-Age=");
    expect(cookie).not.toContain("Max-Age=0");
  });
});
