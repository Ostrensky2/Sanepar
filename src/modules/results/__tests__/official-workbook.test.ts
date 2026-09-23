import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildResultsWorkbookExportModelV2, parseResultsWorkbookV2 } from "../workbook";

const SOURCE = "D:/Dropbox/Sanepar_única/Execução/Resultados/Banco de dados/Banco_Sanepar_C1_C2_indices_atualizados.xlsx";

describe("arquivo oficial SANEPAR-INDICE-0.3", () => {
  it.runIf(existsSync(SOURCE))("abre diretamente, audita e preserva completos e parciais", async () => {
    const bytes = readFileSync(SOURCE);
    const result = await parseResultsWorkbookV2(bytes, "Banco_Sanepar_C1_C2_indices_atualizados.xlsx");

    expect(result.source.sha256).toBe("5E00BFC569B8BC9A0299F2775BCEF249103490CA97E2BB45319A38DA14FF2EDC");
    expect(result.source.namespaceRepairApplied).toBe(true);
    expect(result.molecularRecordCount).toBe(29_460);
    expect(result.componentRecordCount).toBe(423);
    expect(result.campaigns.map((campaign) => [campaign.campaignCode, campaign.counts])).toEqual([
      ["C1", { total: 73, complete: 56, partialWithTwoSets: 17, partialWithOneSet: 0, unavailable: 0 }],
      ["C2", { total: 76, complete: 70, partialWithTwoSets: 5, partialWithOneSet: 1, unavailable: 0 }],
    ]);

    const c2 = result.campaigns.find((campaign) => campaign.campaignCode === "C2")!;
    const point = (sia: string) => c2.points.find((item) => item.siaCode === sia)!;
    expect(point("SIA-0078").domains.environmental.value).toBeCloseTo(0.577856304963, 12);
    expect(point("SIA-0078").domains.operational.value).toBeCloseTo(0.497159615141, 12);
    expect(point("SIA-0078").domains.humanHealth.value).toBeCloseTo(0.609299077625, 12);
    expect(point("SIA-0078").overall.value).toBeCloseTo(0.561438332576, 12);
    expect(point("SIA-0188").domains.environmental.value).toBeCloseTo(0.370270110891, 12);
    expect(point("SIA-0188").domains.operational.value).toBeCloseTo(0.402488693621, 12);
    expect(point("SIA-0188").domains.humanHealth.value).toBeCloseTo(0.511689054094, 12);
    expect(point("SIA-0188").overall.value).toBeCloseTo(0.428149286202, 12);
    expect(point("SIA-0188").components.coi.totalReads).toBe(13);
    expect(point("SIA-0188").components.coi.included).toBe(true);
    expect(point("SIA-0760").domains.environmental.value).toBeCloseTo(0.492566775023, 12);
    expect(point("SIA-0760").domains.operational.value).toBeCloseTo(0.427973043553, 12);
    expect(point("SIA-0760").domains.humanHealth.value).toBeCloseTo(0.441361007991, 12);
    expect(point("SIA-0760").overall.value).toBeCloseTo(0.453966942189, 12);
    expect(point("SIA-0559").overall.value).toBeNull();
    expect(point("SIA-0559").overall.lower).toBeCloseTo(0.519230121182, 12);
    expect(point("SIA-0559").overall.upper).toBeCloseTo(0.776719365641, 12);
    expect(point("SIA-0559").domains.environmental.lower).toBeCloseTo(0.484841243995, 12);
    expect(point("SIA-0559").domains.environmental.upper).toBeCloseTo(0.753925967992, 12);
    expect(point("SIA-0559").domains.operational.lower).toBeCloseTo(0.527548115238, 12);
    expect(point("SIA-0559").domains.operational.upper).toBeCloseTo(0.782074387270, 12);
    expect(point("SIA-0559").domains.humanHealth.lower).toBeCloseTo(0.545301004313, 12);
    expect(point("SIA-0559").domains.humanHealth.upper).toBeCloseTo(0.794157741660, 12);
    expect(point("SIA-0780").overall.lower).toBeCloseTo(0.531426370380, 12);
    expect(point("SIA-0780").overall.upper).toBeCloseTo(0.784985705655, 12);
    expect(point("SIA-0257").usedSetCount).toBe(1);
    expect(point("SIA-0257").overall.lower).toBeCloseTo(0.300371455651, 12);
    expect(point("SIA-0257").overall.upper).toBeCloseTo(0.875976668338, 12);
    expect(c2.points.filter((item) => item.overall.rank !== null)).toHaveLength(70);
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
