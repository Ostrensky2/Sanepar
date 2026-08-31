import { describe, expect, it } from "vitest";
import {
  isCloudConnectionError,
  toActionableErrorMessage,
} from "@/components/operational-feedback";

describe("operational feedback error classification", () => {
  it("não confunde a aba Banco_consolidado com falha de conectividade", () => {
    const error = new Error(
      "Banco_consolidado, linha 2, Identificação da amostra: valor obrigatório ausente.",
    );

    expect(isCloudConnectionError(error)).toBe(false);
    expect(toActionableErrorMessage(error)).not.toMatch(/internet|nuvem/i);
  });

  it("mantém sinais reais de rede classificados como conectividade", () => {
    expect(isCloudConnectionError(new Error("Supabase indisponível"))).toBe(true);
    expect(isCloudConnectionError(new Error("Banco de dados inacessível"))).toBe(true);
    expect(isCloudConnectionError(new TypeError("Failed to fetch"))).toBe(true);
  });
});
