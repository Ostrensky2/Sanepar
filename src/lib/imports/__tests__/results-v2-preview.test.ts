import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { previewResultsWorkbook } from "@/lib/imports/results";

const SOURCE = "D:/Dropbox/Sanepar_única/Execução/Resultados/Banco de dados/Banco_Sanepar_C1_C2_indices_atualizados.xlsx";

describe("prévia do banco oficial de resultados", () => {
  it.runIf(existsSync(SOURCE))("expõe C1/C2 e as contagens auditadas sem publicar", async () => {
    const bytes = readFileSync(SOURCE);
    const preview = await previewResultsWorkbook(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      "Banco_Sanepar_C1_C2_indices_atualizados.xlsx",
    );

    expect(preview).toMatchObject({
      contractVersion: "yvae-results/2.0",
      sourceSha256: "5E00BFC569B8BC9A0299F2775BCEF249103490CA97E2BB45319A38DA14FF2EDC",
      molecularRecordCount: 29_460,
      totalPointCount: 149,
      completePointCount: 126,
      partialPointCount: 23,
      unavailablePointCount: 0,
    });
    expect(preview.campaigns).toEqual([
      {
        code: "C1",
        publicationKey: expect.stringMatching(/^[A-F0-9]{64}$/),
        canonicalId: "campanha-1-verao-2026",
        canonicalName: "1ª Campanha - Verão 2026",
        totalPointCount: 73,
        completePointCount: 56,
        partialPointCount: 17,
        unavailablePointCount: 0,
      },
      {
        code: "C2",
        publicationKey: expect.stringMatching(/^[A-F0-9]{64}$/),
        canonicalId: "campanha-2-outono-2026",
        canonicalName: "2ª Campanha - Outono 2026",
        totalPointCount: 76,
        completePointCount: 70,
        partialPointCount: 6,
        unavailablePointCount: 0,
      },
    ]);
    expect(preview.campaigns[0].publicationKey).not.toBe(preview.campaigns[1].publicationKey);
  }, 60_000);
});
