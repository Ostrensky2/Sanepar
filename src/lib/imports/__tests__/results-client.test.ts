import { describe, expect, it } from "vitest";
import {
  formatResultsImportError,
  readResultsApiPayload,
} from "@/lib/imports/results-client";

describe("results API client", () => {
  it("preserva JSON válido", async () => {
    const response = new Response(JSON.stringify({ rowCount: 74 }), {
      headers: { "content-type": "application/json" },
    });

    await expect(readResultsApiPayload(response, "falha")).resolves.toEqual({ rowCount: 74 });
  });

  it("converte erro textual do runtime em mensagem acionável", async () => {
    const response = new Response("An error occurred while processing your request", { status: 500 });

    await expect(readResultsApiPayload(response, "A importação foi interrompida pelo servidor.")).resolves.toEqual({
      error: "A importação foi interrompida pelo servidor.",
    });
  });

  it("classifica 409/422 como validação da planilha, sem orientação de rede", () => {
    const message = formatResultsImportError(
      422,
      "Banco_consolidado, linha 2, Identificação da amostra: valor obrigatório ausente.",
    );

    expect(message).toBe(
      "A planilha não foi importada. Banco_consolidado, linha 2, Identificação da amostra: valor obrigatório ausente. Preencha o campo indicado ou use o arquivo correto.",
    );
    expect(message).not.toMatch(/internet|nuvem|conexão/i);
  });
});
