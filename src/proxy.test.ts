import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextRequest } from "next/server";
import nextConfig from "../next.config";
import { proxy } from "@/proxy";

const baselineImages = "img-src 'self' blob: data: https://tile.openstreetmap.org https://drive.google.com https://lh3.googleusercontent.com";

async function cspFor(supabaseUrl?: string) {
  if (supabaseUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl;
  const response = await proxy(new NextRequest("https://app.invalid/dashboard"));
  return response.headers.get("Content-Security-Policy") ?? "";
}

async function proxyResponse() {
  return proxy(new NextRequest("https://app.invalid/recuperar-senha"));
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

  it("propaga o mesmo nonce na CSP da requisição e da resposta", async () => {
    const first = await proxyResponse();
    const second = await proxyResponse();
    const responseCsp = first.headers.get("Content-Security-Policy") ?? "";
    const requestCsp = first.headers.get("x-middleware-request-content-security-policy") ?? "";
    const requestNonce = first.headers.get("x-middleware-request-x-nonce") ?? "";
    const nonce = responseCsp.match(/'nonce-([^']+)'/)?.[1] ?? "";
    const secondNonce = (second.headers.get("Content-Security-Policy") ?? "").match(/'nonce-([^']+)'/)?.[1] ?? "";

    expect(nonce).not.toBe("");
    expect(requestNonce).toBe(nonce);
    expect(requestCsp).toBe(responseCsp);
    expect(secondNonce).not.toBe(nonce);
    expect(directive(responseCsp, "script-src")).toBe(`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`);
    expect(directive(responseCsp, "script-src")).not.toContain("'unsafe-inline'");
  });

  it("libera somente o dashboard auditado com hash e frame same-origin", async () => {
    const response = await proxy(new NextRequest("https://app.invalid/dashboards/Painel_eDNA_Campanha1_Sanepar.html"));
    const csp = response.headers.get("Content-Security-Policy") ?? "";
    const html = readFileSync(resolve(process.cwd(), "public/dashboards/Painel_eDNA_Campanha1_Sanepar.html"), "utf8");
    const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1] ?? "";
    const scriptHash = createHash("sha256").update(script.replace(/\r\n/g, "\n")).digest("base64");
    expect(directive(csp, "script-src")).toBe(`script-src 'self' 'sha256-${scriptHash}'`);
    expect(directive(csp, "script-src")).not.toContain("'unsafe-inline'");
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'self'");
  });

  it("mantém XFO global DENY e sobrescreve somente o dashboard exato", async () => {
    const rules = await nextConfig.headers?.();
    expect(rules?.find((rule) => rule.source === "/(.*)")?.headers).toContainEqual({ key: "X-Frame-Options", value: "DENY" });
    expect(rules?.find((rule) => rule.source === "/dashboards/Painel_eDNA_Campanha1_Sanepar.html")?.headers).toEqual([{ key: "X-Frame-Options", value: "SAMEORIGIN" }]);
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
