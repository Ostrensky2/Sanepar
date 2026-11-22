import { describe, expect, it } from "vitest";
import { campaignFromQuery } from "../campaign-identity";

describe("identidade de campanha em links de consulta", () => {
  it("mantém a ausência de parâmetro distinta de um endereço inválido", () => {
    expect(campaignFromQuery(undefined)).toBeUndefined();
    for (const input of ["", "C10", "campanha-3-errada", "3.0", "1e0", ["1","3"]]) {
      expect(campaignFromQuery(input)).toBeNull();
    }
  });
  it("aceita somente o código, número ou ID completo das campanhas previstas", () => {
    for (const input of ["C3","3","campanha-3"]) expect(campaignFromQuery(input)?.id).toBe("campanha-3");
    expect(campaignFromQuery("campanha-1-verao-2026")?.id).toBe("campanha-1-verao-2026");
    expect(campaignFromQuery("9")?.id).toBe("campanha-9");
  });
});
