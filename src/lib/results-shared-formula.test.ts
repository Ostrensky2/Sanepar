import ExcelJS from "exceljs";
import { expect, it } from "vitest";
import { buildResultsWorkbookExportModelV2 } from "@/modules/results/workbook";
async function fixture(result: number | undefined | {error: "#DIV/0!"}, parameter: number | null = 1) {
  const book = new ExcelJS.Workbook();
  for (const name of ["Metadata-C2", "Riscos_bibliografia", "Evidencias_risco", "Criterios_scores", "Indices_pontos", "Calculo_conjuntos", "Metodo_calculo"]) book.addWorksheet(name);
  const method = book.getWorksheet("Metodo_calculo")!;
  [["Expoente da gravidade",1],["Curvatura logarítmica",100],["Conjuntos exigidos",3],["Domínios",3],["Versão do cálculo","SANEPAR-INDICE-0.3"]].forEach((row,i) => { method.getRow(i+6).values=row; });
  method.getCell("B6").value = parameter === null ? null : {formula:"1",result:parameter};
  const sheet = book.getWorksheet("Indices_pontos")!;
  for (let row = 1; row <= 5; row++) sheet.getCell(row, 1).value="header";
  sheet.getCell("A6").value="C1"; sheet.getCell("A7").value="C1";
  sheet.getCell("B6").value={formula:"1+1",result:2};
  sheet.getCell("B7").value={sharedFormula:"B6",result};
  return new Uint8Array(await book.xlsx.writeBuffer());
}
it("exports the shared numeric cache unchanged", async () => {
  const model = await buildResultsWorkbookExportModelV2(await fixture(0.102545968882603), ["C1"]);
  expect(model.sheets[0].name).toBe("Metadados");
  expect(model.sheets.find(s=>s.name==="Indices_pontos")!.rows[6][1]).toBe(0.102545968882603);
});
it("recovers original zero cache omitted by cell.value and records provenance", async () => {
  const model = await buildResultsWorkbookExportModelV2(await fixture(0), ["C1"]);
  expect(model.sheets.find(s=>s.name==="Indices_pontos")!.rows[6][1]).toBe(0);
  expect(model.cacheRecovery.join(" ")).toContain("caches zero originais");
});
it("rejects absent shared cache", async () => {
  await expect(buildResultsWorkbookExportModelV2(await fixture(undefined), ["C1"])).rejects.toThrow(/cache/i);
});
it("rejects shared formula error", async () => {
  await expect(buildResultsWorkbookExportModelV2(await fixture({error:"#DIV/0!"}), ["C1"])).rejects.toThrow(/cache/i);
});
it("rejects a numeric parameter cache that diverges from the approved method", async () => {
  await expect(buildResultsWorkbookExportModelV2(await fixture(0, 2), ["C1"])).rejects.toThrow(/esperado 1, recebido 2/);
});
it("rejects a missing mandatory method input", async () => {
  await expect(buildResultsWorkbookExportModelV2(await fixture(0, null), ["C1"])).rejects.toThrow(/esperado 1/);
});
it("preserves the explicit alias in the export model and rejects both aliases", async () => {
  const book=new ExcelJS.Workbook();
  await book.xlsx.load(await fixture(0) as unknown as Parameters<typeof book.xlsx.load>[0]);
  book.getWorksheet("Metadata-C2")!.name="Metadados";
  const model=await buildResultsWorkbookExportModelV2(new Uint8Array(await book.xlsx.writeBuffer()),["C1"]);
  expect(model.sheets[0].name).toBe("Metadados");
  book.addWorksheet("Metadata-C2");
  await expect(buildResultsWorkbookExportModelV2(new Uint8Array(await book.xlsx.writeBuffer()),["C1"])).rejects.toThrow(/ambíguas/);
});
