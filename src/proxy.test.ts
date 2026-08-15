import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

const baselineImages = "img-src 'self' blob: data: https://tile.openstreetmap.org https://drive.google.com https://lh3.googleusercontent.com";

async function cspFor(supabaseUrl?: string) {
  if (supabaseUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl;
  const response = await proxy(new NextRequest("https://app.invalid/dashboard"));
  return response.headers.get("Content-Security-Policy") ?? "";
}

function directive(csp: string, name: string) {
  return csp.split("; ").find((part) => part.startsWith(`${name} `)) ?? "";
}

describe("CSP do proxy", () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  it("inclui somente a origin Supabase validada em img-src e preserva connect-src", async () => {
    const csp = await cspFor("https://project.supabase.co");
    expect(directive(csp, "img-src")).toBe(`${baselineImages} https://project.supabase.co`);
    expect(directive(csp, "connect-src")).toBe("connect-src 'self' https://project.supabase.co");
  });

  it.each([
    ["ausente", undefined],
    ["vazio", "   "],
    ["malformado", "não-é-url"],
    ["credenciais", "https://user:secret@project.supabase.co"],
    ["protocolo não HTTP", "ftp://project.supabase.co"],
    ["path", "https://project.supabase.co/storage/v1"],
    ["query", "https://project.supabase.co?redirect=https://evil.invalid"],
    ["hash", "https://project.supabase.co#fragment"],
  ])("não injeta valor %s nem cria token vazio", async (_case, value) => {
    const csp = await cspFor(value);
    expect(directive(csp, "img-src")).toBe(baselineImages);
    expect(directive(csp, "connect-src")).toBe("connect-src 'self'");
    expect(csp).not.toMatch(/\s{2,}/);
  });
});
