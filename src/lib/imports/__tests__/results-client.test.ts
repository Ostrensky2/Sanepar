import { describe, expect, it } from "vitest";
import { readResultsApiPayload } from "@/lib/imports/results-client";

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
});
