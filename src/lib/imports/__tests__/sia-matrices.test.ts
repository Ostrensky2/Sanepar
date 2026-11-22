import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { resolveCanonicalCampaign } from "@/lib/campaign-identity";
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { boundedInflate, matrixLimits, buildCampaignMatrixWorkbook, inspectMatrixArchive, legitimateMatrixPhotos, normalizeMatrixSia, readMatrixPackage, resolveMatrixCollection, resolveSheetCollection, SHEET_LINK, type DiarySnapshot, type MatrixPackage, type MatrixReferencePoint } from "../sia-matrices";
import type { FieldDiaryEntry } from "@/lib/field-diary";

function entry(overrides: Partial<FieldDiaryEntry> = {}): FieldDiaryEntry {
  return { id: "collection-a", campaignId: "campanha-1-verao-2026", campaignName: "1ª Campanha - Verão 2026", sia: "SIA-0011", executionStatus: "realized", entryDate: "2026-01-01", locationName: "=HYPERLINK(\"https://invalid\")", latitude: "-25", longitude: "-49", coordinateSource: "planned", photos: [], ...overrides } as FieldDiaryEntry;
}
function snapshot(entries = [entry()]): DiarySnapshot { return { entries, persistence: "cloud", complete: true, totalCount: entries.length }; }
async function file(name = "16S_C1_familias.xlsx", formula = false) {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("Famílias").addRows([["SIA", "Família"], [11, formula ? { formula: "1+1", result: 2 } : 2], [12, 0]]);
  workbook.addWorksheet("Grupos de risco").addRows([["SIA", "Toxinas", "Total de reads 16S"], [11, 1, 2], [12, 0, 0]]);
  const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
  return { name, size: bytes.length, arrayBuffer: async () => bytes.buffer };
}

describe("preparação local das matrizes SIA", () => {
  it("prévia e download partilham abas e valores, com limite apenas na prévia", async () => {
    const pkg = await readMatrixPackage([await file()]);
    const matrix = pkg.sources[0].matrix;
    matrix.headers = Array.from({ length: 18 }, (_, i) => `Táxon ${i}`);
    matrix.rows = Array.from({ length: 27 }, (_, i) => ({ sia: `SIA-${String(i + 1).padStart(4, "0")}`, values: matrix.headers.map((_, c) => i * c) }));
    const output = await buildCampaignMatrixWorkbook(pkg, snapshot(), 1);
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(output.bytes);
    expect(output.preview.map((s) => s.name)).toEqual(workbook.worksheets.map((s) => s.name));
    for (const sheet of output.preview) {
      const actual = workbook.getWorksheet(sheet.name)!;
      expect([sheet.rowCount, sheet.columnCount]).toEqual([actual.rowCount, actual.columnCount]);
      expect(sheet.rows).toEqual(Array.from({ length: Math.min(21, actual.rowCount) }, (_, r) =>
        Array.from({ length: Math.min(12, actual.columnCount) }, (_, c) => actual.getCell(r + 1, c + 1).text)));
    }
    expect(workbook.getWorksheet("16S familias")!.getCell(28, 21).value).toBe(26 * 17);
  });
  it("transporta limitação e status de referências vazias para Pendências", async () => {
    const pkg = await readMatrixPackage([await file()]);
    const result = await buildCampaignMatrixWorkbook(pkg, snapshot(), 1, undefined, [], { status: "campaign_absent_in_available_sources", source: "Fonte histórica", limitation: "Não confirma completude atual da nuvem." });
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(result.bytes);
    const pending = JSON.stringify(workbook.getWorksheet("Pendências")!.getSheetValues());
    expect(pending).toContain("campaign_absent_in_available_sources");
    expect(pending).toContain("Não confirma completude atual da nuvem.");
    expect(pending).toContain("lista vazia não comprova ausência");
    const component = readFileSync(join(process.cwd(), "src/components/sia-matrices-preparation.tsx"), "utf8");
    expect(component).toContain("references, { status, source, limitation }");
    expect(readFileSync(join(process.cwd(), "src/lib/imports/sia-matrices.worker.ts"), "utf8")).toContain("data.args[4], data.args[5]");
  });
  it("sem coleta no Diário, a data e o vínculo vêm da planilha de campanha; o Diário vale primeiro", async () => {
    const pkg = await readMatrixPackage([await file()]); // SIAs 11 e 12; o Diário de teste só tem o 11
    const ref = (sia: string, sourceDate: string, extra: Partial<MatrixReferencePoint> = {}): MatrixReferencePoint =>
      ({ campaign: 1, sia, original: { lat: -25.1, lon: -49.1 }, effective: { lat: -25.2, lon: -49.2 }, source: "campaign_imports teste", sourceDate, waterBody: "Rio de teste", municipality: "Cidade", ...extra });
    expect(resolveSheetCollection([ref("SIA-0012", "2026-02-03")], 1, "SIA-0012")?.sourceDate).toBe("2026-02-03");
    expect(resolveSheetCollection([ref("SIA-0012", "2026-02-03"), ref("SIA-0012", "2026-02-09")], 1, "SIA-0012")).toBeUndefined(); // duas datas: não escolhe por suposição
    expect(resolveSheetCollection([ref("SIA-0012", "")], 1, "SIA-0012")).toBeUndefined();
    expect(resolveSheetCollection([ref("SIA-0012", "2026-02-03", { campaign: 2 })], 1, "SIA-0012")).toBeUndefined(); // outra campanha não serve

    const without = await buildCampaignMatrixWorkbook(pkg, snapshot(), 1);
    expect([without.points, without.linkedByDiary, without.linkedBySheet, without.unresolved]).toEqual([2, 1, 0, 1]);

    const output = await buildCampaignMatrixWorkbook(pkg, snapshot(), 1, undefined, [ref("SIA-0011", "2026-09-09"), ref("SIA-0012", "2026-02-03")], { status: "published", source: "teste" });
    expect([output.points, output.linkedByDiary, output.linkedBySheet, output.unresolved]).toEqual([2, 1, 1, 0]);
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(output.bytes);
    const rows = workbook.getWorksheet("Coletas")!.getSheetValues().slice(2).map((row) => (row as unknown[]).slice(1, 8).map((cell) => String(cell ?? "")));
    expect(rows.find((row) => row[0] === "SIA-0011")!.slice(0, 4)).toEqual(["SIA-0011", "COLETA_ÚNICA", "collection-a", "2026-01-01"]); // o Diário prevalece sobre a planilha
    expect(rows.find((row) => row[0] === "SIA-0012")).toEqual(["SIA-0012", SHEET_LINK, "", "2026-02-03", "", "Rio de teste", "Cidade"]);
    const pending = workbook.getWorksheet("Pendências")!.getSheetValues().flat().join(" ");
    expect(pending).toContain("Coleta vinculada pela planilha de campanha");
    expect(pending).not.toContain("SEM_COLETA_REAL_CONFIRMADA");
  });
  it("a tela mostra o que foi integrado e avalia se a integração funcionou", () => {
    const component = readFileSync(join(process.cwd(), "src/components/sia-matrices-preparation.tsx"), "utf8");
    expect(component).toContain('aria-label="Planilhas integradas"');
    expect(component).toContain("Nenhuma planilha integrada está guardada no aplicativo.");
    expect(component).toContain("Integração funcionando na C{campaign}.");
    expect(component).toContain("Integração incompleta na C{campaign}.");
    expect(component).toContain("Abrir para conferir e baixar");
    expect(component).toContain("Isso é uma falha de consulta, não quer dizer que não haja nada guardado.");
  });
  it("normaliza somente SIA numérico completo", () => {
    expect([11, "SIA-0011", "0011"].map(normalizeMatrixSia)).toEqual(["SIA-0011", "SIA-0011", "SIA-0011"]);
    for (const value of ["nome11", "11x", "SIA", 0, 1.5]) expect(normalizeMatrixSia(value)).toBeNull();
  });
  it("não usa data, nome do ponto ou homônimo de outra campanha", () => {
    expect(resolveMatrixCollection(snapshot(), 1, "SIA-0011").status).toBe("COLETA_ÚNICA");
    expect(resolveMatrixCollection(snapshot(), 2, "SIA-0011").status).toBe("SEM_COLETA_REAL_CONFIRMADA");
    expect(resolveMatrixCollection(snapshot([entry({ entryDate: "2027-09-09" })]), 1, "SIA-0011").status).toBe("COLETA_ÚNICA");
    expect(resolveMatrixCollection(snapshot([entry({ sia: null })]), 1, "SIA-0011").entry).toBeUndefined();
  });
  it("mantém duplicatas como conflito, mesmo em datas diferentes", () => {
    expect(resolveMatrixCollection(snapshot([entry(), entry({ id: "b", entryDate: "2026-02-02" })]), 1, "SIA-0011").status).toBe("COLETA_AMBÍGUA");
    expect(resolveMatrixCollection(snapshot([entry({ executionStatus: "planned" })]), 1, "SIA-0011").entry).toBeUndefined();
    expect(resolveMatrixCollection(snapshot([entry({ campaignName: "2ª Campanha" })]), 1, "SIA-0011").status).toBe("IDENTIDADE_CONFLITANTE");
  });
  it.each([undefined, false])("não presume unicidade sem resposta completa: %s", (complete) => {
    expect(resolveMatrixCollection({ ...snapshot(), complete }, 1, "SIA-0011").status).toBe("DIÁRIO_INCOMPLETO");
  });
  it("exporta só referências internas, retirando tokens", () => {
    expect(legitimateMatrixPhotos(entry({ photos: [{ id: "a", url: "/api/documents/file?bucket=photos&path=c1%2Fa.jpg&token=secret" }, { id: "b", url: "https://remote/secret" }] }))).toBe("/api/documents/file?bucket=photos&path=c1%2Fa.jpg");
  });
  it("recusa caminho inseguro antes de descompactar", async () => {
    const zip = new JSZip(); zip.file("../evil.xlsx", "bad");
    const bytes = await zip.generateAsync({ type: "uint8array" });
    expect(() => inspectMatrixArchive(bytes)).toThrow(/Caminho/);
  });
  it("interrompe expansão real de chunks antes da concatenação, com orçamento agregado", async () => {
    const zip = new JSZip(); zip.file("a", "abcd"); zip.file("b", "efgh");
    const budget = { bytes: matrixLimits.expandedBytes - 6 };
    expect(new TextDecoder().decode(await boundedInflate(zip.file("a")!, budget))).toBe("abcd");
    await expect(boundedInflate(zip.file("b")!, budget)).rejects.toThrow(/Expansão real/);
  });
  it("avisa Diário sem matriz apenas em Pendências, uma vez e sem fabricar linhas científicas", async () => {
    const pkg = await readMatrixPackage([await file()]);
    const diary = snapshot([entry(), entry({ sia: "SIA-0099" }), entry({ sia: "SIA-0099", id: "duplicate" }), entry({ sia: "SIA-0088", campaignId: "campanha-2-outono-2026", campaignName: "2ª Campanha" })]);
    const output = await buildCampaignMatrixWorkbook(pkg, diary, 1);
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(output.bytes);
    expect(workbook.getWorksheet("16S familias")!.rowCount).toBe(3);
    expect(workbook.getWorksheet("16S familias")!.getCell("D3").value).toBe(0);
    const values = JSON.stringify(workbook.getWorksheet("Pendências")!.getSheetValues());
    expect(values.match(/SIA-0099/g)).toHaveLength(1);
    expect(values).not.toContain("SIA-0088");
    expect(JSON.stringify(workbook.getWorksheet("Coletas")!.getSheetValues())).not.toContain("SIA-0099");
  });
  it("recusa fórmulas e datasets duplicados", async () => {
    await expect(readMatrixPackage([await file(undefined, true)])).rejects.toThrow(/fórmula/);
    const source = await file();
    await expect(readMatrixPackage([source, source])).rejects.toThrow(/duplicado/);
  });
  it("preserva zero, contagens, pendências, texto inerte e coordenada planejada", async () => {
    const pkg = await readMatrixPackage([await file()]);
    expect(pkg.sources[0].matrix.rows[1].values).toEqual([0]);
    const result = await buildCampaignMatrixWorkbook(pkg, snapshot(), 1);
    expect(result.filename).toMatch(/^matrizes-SIA-C1-\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(result.unresolved).toBe(1);
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(result.bytes);
    expect(workbook.getWorksheet("16S familias")!.getCell("D3").value).toBe(0);
    const fields = workbook.getWorksheet("Coletas")!;
    expect(fields.getCell("F2").type).toBe(ExcelJS.ValueType.String);
    expect(fields.getCell("F2").value).toMatch(/^=HYPERLINK/);
    expect(fields.getCell("I2").value).toBe("-25");
    expect(fields.getCell("K2").value).toBe("");
    expect(workbook.getWorksheet("Pendências")!.rowCount).toBeGreaterThan(1);
    await expect(buildCampaignMatrixWorkbook(pkg, { ...snapshot(), complete: false }, 1)).rejects.toThrow(/incompleto/);
    await expect(buildCampaignMatrixWorkbook(pkg, snapshot(), 4)).rejects.toThrow(/nenhum dataset/);
  });
  it("interface só consulta GET e mantém o fluxo oficial separado", () => {
    const component = readFileSync("src/components/sia-matrices-preparation.tsx", "utf8");
    expect(component).toContain('method: "GET"');
    expect(component).not.toMatch(/method: "(?:POST|PUT|DELETE)"|localStorage|stageResultsWorkbook/);
    expect(component).toContain('role="alert"');
    expect(component).toContain('aria-busy={busy}');
    expect(component).toContain("Campanha disponível");
    expect(component).toContain("archiveCampaigns");
  });
});

const realPath = process.env.SIA_MATRIX_REAL_ZIP;
it.skipIf(!realPath)("ZIP real: 16 fontes e bibliotecas por campanha/marker/run, sem somar níveis", async () => {
  const bytes = readFileSync(realPath!);
  const start = performance.now();
  const pkg: MatrixPackage = await readMatrixPackage([{ name: "matrizes.zip", size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length) as ArrayBuffer }]);
  const historicalRows = process.env.SIA_MATRIX_HISTORICAL_DIARY ? readFileSync(process.env.SIA_MATRIX_HISTORICAL_DIARY, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)) : [];
  const historical = snapshot(historicalRows.map((row) => ({ id: row.id, campaignId: row.campaign_id, campaignName: row.campaign_name, sia: row.sia, executionStatus: row.execution_status, entryDate: row.entry_date, photos: row.photos ?? [], activities: row.activities, occurrenceType: row.occurrence_type, hasOccurrence: row.has_occurrence, pointAccessibility: row.point_accessibility, collectionTime: row.collection_time, samplesReplicasEdna: row.samples_replicas_edna, zooplanktonId: row.zooplankton_id, latitude: row.latitude, longitude: row.longitude, coordinateSource: row.coordinate_source, municipality: row.municipality, locationName: row.location_name, dailySummary: row.daily_summary }) as FieldDiaryEntry));
  const referenceBytes = process.env.SIA_MATRIX_REFERENCE_POINTS ? readFileSync(process.env.SIA_MATRIX_REFERENCE_POINTS) : null;
  if (referenceBytes) expect(createHash("sha256").update(referenceBytes).digest("hex").toUpperCase()).toBe("3430B70EECB413C7B162093232E448696C5704009D2D11AAEC1D131DA94B6377");
  const references = referenceBytes ? (JSON.parse(referenceBytes.toString()) as Array<{ campaign: string; code: string; original: {lat:number;lon:number}; effective:{lat:number;lon:number};date:string }>).flatMap((point) => { const campaign = Number(resolveCanonicalCampaign(point.campaign)?.id.match(/^campanha-(\d+)/)?.[1]); return campaign ? [{ campaign, sia: point.code, original: point.original, effective: point.effective, source: "Base privada hash validado", sourceDate: point.date }] : []; }) : [];
  if (process.env.SIA_MATRIX_REFERENCE_METADATA) {
    const additional = JSON.parse(readFileSync(process.env.SIA_MATRIX_REFERENCE_METADATA, "utf8")) as typeof references;
    references.push(...additional.filter((point) => !references.some((r) => r.campaign === point.campaign)));
  }
  expect(pkg.sources).toHaveLength(16);
  expect(pkg.sources.filter((s) => s.rank === "familias").map((s) => [s.campaign, s.marker, s.matrix.rows.length])).toEqual([[1, "16S", 73], [2, "16S", 75], [3, "16S", 76], [3, "16S", 76], [1, "COI", 59], [2, "COI", 75], [3, "COI", 50], [3, "COI", 50]]);
  const output = await buildCampaignMatrixWorkbook(pkg, snapshot(), 1);
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(output.bytes);
  expect(workbook.getWorksheet("Associações 16S")!.rowCount).toBe(74);
  expect(workbook.getWorksheet("16S generos")!.columnCount).toBe(2992);
  if (process.env.SIA_MATRIX_AUDIT_DIR) {
    mkdirSync(process.env.SIA_MATRIX_AUDIT_DIR, { recursive: true });
    const results = [];
    for (const campaign of [1, 2, 3]) {
      const result = historicalRows.length ? await buildCampaignMatrixWorkbook(pkg, historical, campaign, undefined, references) : campaign === 1 ? output : await buildCampaignMatrixWorkbook(pkg, snapshot(), campaign);
      const reopened = new ExcelJS.Workbook(); await reopened.xlsx.load(result.bytes);
      expect(reopened.getWorksheet("Resumo")!.getCell("B2").value).toContain(`${campaign}ª Campanha`);
      writeFileSync(join(process.env.SIA_MATRIX_AUDIT_DIR, result.filename), new Uint8Array(result.bytes));
      const coletas = reopened.getWorksheet("Coletas")!;
      let bothCoordinates = 0, withReplicas = 0;
      coletas.eachRow((row, index) => { if (index > 1) { if ([9,10,11,12].every((c) => row.getCell(c).value !== null && row.getCell(c).value !== "")) bothCoordinates++; if (row.getCell(17).value) withReplicas++; } });
      results.push({ campaign, filename: result.filename, points: result.points, unresolved: result.unresolved, bothCoordinates, withReplicas, bytes: result.bytes.byteLength });
    }
    writeFileSync(join(process.env.SIA_MATRIX_AUDIT_DIR, "real-module-evidence.json"), JSON.stringify({ diary: historicalRows.length ? "HISTORICAL_2026-08-21_NOT_CURRENT_PRODUCTION" : "SYNTHETIC_FIXTURE_NOT_PRODUCTION", sources: pkg.sources.map(({ matrix, associations, ...source }) => ({ ...source, libraries: matrix.rows.length, associations: associations.rows.length })), results, milliseconds: Math.round(performance.now() - start) }, null, 2));
    if (process.env.SIA_MATRIX_HISTORICAL_DIARY) {
      const entries = historical.entries;
      const counts = [1, 2, 3].map((campaign) => {
        const sias = [...new Set(pkg.sources.filter((s) => s.campaign === campaign).flatMap((s) => s.matrix.rows.map((r) => r.sia)))];
        const statuses: Record<string, number> = {};
        sias.forEach((sia) => { const result = resolveMatrixCollection(historical, campaign, sia); statuses[result.status] = (statuses[result.status] ?? 0) + 1; });
        return { campaign, matrixSias: sias.length, statuses };
      });
      writeFileSync(join(process.env.SIA_MATRIX_AUDIT_DIR, "historical-diary-aggregate.json"), JSON.stringify({ sourceDate: "2026-08-21", currentProduction: false, missingExecutionStatus: entries.filter((e) => !e.executionStatus).length, entries: entries.length, counts, limitation: "Snapshot histórico. Regra operacional legada com negativos prioritários e filtro vazio/não informado. Prova de fontes históricas, não completude Production atual." }, null, 2));
    }
  }
  console.info(JSON.stringify({ realDatasets: pkg.sources.length, C1points: output.points, milliseconds: Math.round(performance.now() - start), bytes: output.bytes.byteLength }));
}, 180000);
