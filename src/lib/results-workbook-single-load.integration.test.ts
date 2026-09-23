import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { buildResultsWorkbookExportModelV2, parseResultsWorkbookV2, parseResultsWorkbookWithModelV2 } from "@/modules/results/workbook";

it.skipIf(process.env.E5_VERIFY_CORRECTED_SOURCE !== "1")("single decode is identical to the preserved parse and export APIs", async () => {
  const fileName = "Banco_Sanepar_C1_C2_indices_atualizados_corrigido.xlsx";
  const bytes = await readFile(`D:/Dropbox/Sanepar_única/Execução/Resultados/Banco de dados/${fileName}`);
  const combined = await parseResultsWorkbookWithModelV2(bytes, fileName);
  expect(combined.parsed).toEqual(await parseResultsWorkbookV2(bytes, fileName));
  expect(combined.model).toEqual(await buildResultsWorkbookExportModelV2(bytes, combined.parsed.campaigns.map(c=>c.campaignCode)));
  expect(combined.parsed.source.sha256.toLowerCase()).toBe("4c9be948601a5b37e4d954ad2c2a08ebb6266a0e7ebec5d80dd6b987005ffa52");
}, 180000);
