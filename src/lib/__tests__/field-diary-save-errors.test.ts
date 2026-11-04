import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createEmptyFieldDiaryPayload,
  fieldDiarySaveFailureMessage,
  saveFieldDiaryEntry,
} from "@/lib/field-diary";

function payload() {
  return {
    ...createEmptyFieldDiaryPayload(),
    campaignId: "c1",
    campaignName: "Campanha 2",
    entryDate: "2026-11-03",
    locationName: "Ponto 1",
    sia: "SIA-1",
  };
}

function respond(status: number, body: unknown) {
  return vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

describe("mensagens quando a nuvem recusa o registro de campo", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sessão expirada pede novo login e avisa que os dados continuam no formulário", async () => {
    vi.stubGlobal("fetch", respond(401, { error: "Sessão expirada ou inexistente." }));
    const result = await saveFieldDiaryEntry(payload());
    expect(result.persistence).toBe("none");
    expect("error" in result && result.error).toMatch(/sessão expirou/i);
    expect("error" in result && result.error).toMatch(/continuam no formulário/);
  });

  it("falta de permissão mostra o motivo do servidor e a permissão necessária", async () => {
    vi.stubGlobal("fetch", respond(403, { error: "Seu perfil não tem permissão para esta operação." }));
    const result = await saveFieldDiaryEntry(payload());
    expect("error" in result && result.error).toMatch(/Seu perfil não tem permissão/);
    expect("error" in result && result.error).toMatch(/Importar planilhas/);
  });

  it("erro do banco mostra a mensagem do servidor e o código", async () => {
    vi.stubGlobal("fetch", respond(500, { error: "Não foi possível salvar o registro do Diário de campo." }));
    const result = await saveFieldDiaryEntry(payload());
    expect("error" in result && result.error).toMatch(/Não foi possível salvar o registro/);
    expect("error" in result && result.error).toMatch(/erro 500/);
  });

  it("sem internet avisa que é conexão, não erro do registro", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const result = await saveFieldDiaryEntry(payload());
    expect(result.persistence).toBe("none");
    expect("error" in result && result.error).toMatch(/Sem conexão com o servidor/);
  });

  it("413 pede para tirar uma foto", () => {
    expect(fieldDiarySaveFailureMessage(413)).toMatch(/grande demais/);
  });
});
