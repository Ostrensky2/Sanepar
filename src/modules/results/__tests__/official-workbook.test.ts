import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildResultsWorkbookExportModelV2, parseResultsWorkbookV2 } from "../workbook";

// Arquivo real do laboratório; fora do repositório. Informe o caminho em RESULTS_OFFICIAL_WORKBOOK para rodar.
const SOURCE = process.env.RESULTS_OFFICIAL_WORKBOOK ?? "D:/Dropbox/Sanepar_única/Execução/Resultados/Banco de dados/Banco_Sanepar_C1_C2_indices_atualizados.xlsx";

describe("planilha do laboratório (formato com abas do índice anterior)", () => {
  it.runIf(existsSync(SOURCE))("abre, lê pontos, leituras e situação dos conjuntos, sem ler nem guardar o índice anterior", async () => {
    const bytes = readFileSync(SOURCE);
    const result = await parseResultsWorkbookV2(bytes, "Banco_Sanepar_C1_C2_indices_atualizados.xlsx");

    expect(result.source.sha256).toMatch(/^[0-9A-F]{64}$/);
    expect(result.molecularRecordCount).toBe(29_460);
    expect(result.componentRecordCount).toBe(423);
    expect(result.campaigns.map((campaign) => [campaign.campaignCode, campaign.counts])).toEqual([
      ["C1", { total: 73, complete: 56, partialWithTwoSets: 17, partialWithOneSet: 0, unavailable: 0 }],
      ["C2", { total: 76, complete: 70, partialWithTwoSets: 5, partialWithOneSet: 1, unavailable: 0 }],
    ]);

    const c2 = result.campaigns.find((campaign) => campaign.campaignCode === "C2")!;
    const point = (sia: string) => c2.points.find((item) => item.siaCode === sia)!;
    // Nenhuma nota, limite ou posição do índice anterior é lida, recalculada ou guardada.
    for (const campaign of result.campaigns) for (const item of campaign.points) {
      expect(item.overall).toEqual({ value: null, lower: 0, upper: 0, rank: null });
      for (const range of Object.values(item.domains)) expect(range).toEqual({ value: null, lower: 0, upper: 0 });
      for (const component of Object.values(item.components)) {
        expect(Object.values(component.calculated)).toEqual([null, null, null]);
        expect(Object.values(component.used)).toEqual([null, null, null]);
      }
    }
    expect("parameters" in result).toBe(false);
    // Identificação, leituras e disponibilidade dos conjuntos continuam íntegras.
    expect(point("SIA-0188").components.coi.totalReads).toBe(13);
    expect(point("SIA-0188").components.coi.included).toBe(true);
    expect(point("SIA-0257").usedSetCount).toBe(1);
    expect(point("SIA-0078").usedSetCount).toBe(3);
    expect(point("SIA-0078").waterBody).toBeTruthy();
  }, 60_000);

  it.runIf(existsSync(SOURCE))("produz modelo serializável das sete abas recortado para C2", async () => {
    const bytes = readFileSync(SOURCE);
    const model = await buildResultsWorkbookExportModelV2(bytes, ["C2"]);
    expect(model.campaignCodes).toEqual(["C2"]);
    expect(model.sheets.map((sheet) => sheet.name)).toEqual([
      "Metadados", "Riscos_bibliografia", "Evidencias_risco", "Criterios_scores",
      "Indices_pontos", "Calculo_conjuntos", "Metodo_calculo",
    ]);
    expect(model.sheets.find((sheet) => sheet.name === "Indices_pontos")!.rows).toHaveLength(81);
    expect(model.sheets.find((sheet) => sheet.name === "Calculo_conjuntos")!.rows).toHaveLength(226);
  }, 60_000);
});
