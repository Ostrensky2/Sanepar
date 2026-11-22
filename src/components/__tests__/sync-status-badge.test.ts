import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { SyncStatusBadge } from "../sync-status-badge";
import type { SyncState } from "@/lib/sync-status";

afterEach(() => vi.unstubAllEnvs());
function badge(url: string, state: SyncState = "synced") {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url);
  return renderToStaticMarkup(createElement(SyncStatusBadge, {
    snapshot: { state, reason: "Estado registrado.", updatedAt: "", lastSyncedAt: null },
  }));
}
it.each(["http://127.0.0.1:56321", "http://localhost", "http://127.0.0.2", "http://[::1]"])("identifica o serviço loopback %s", url => {
  for (const state of ["checking", "synced"] as const) {
    const html = badge(url, state);
    expect(html).toContain("Banco local de teste");
    expect(html).not.toContain(url);
  }
});
it.each(["https://localhost.example.org", "https://127.0.0.1.example.org", "https://localhost@example.org", "https://example.org/localhost", "file://localhost/test", "inválido"])("mantém o rótulo anterior para %s", url => {
  expect(badge(url)).toContain("Dados na nuvem");
});
it.each(["offline", "pending"] as const)("preserva o estado %s", state => {
  expect(badge("http://localhost", state)).toContain("Dados locais: Estado registrado.");
});
