import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { RESULTS_SHEETS, MOLECULAR_SHEET, LEGACY_MOLECULAR_SHEET, molecularSheetName, canonicalSheetName } from "./sheet-names";

import { calculateAggregates, calculateComponentIndex, competitionRanks } from "./calculation";
import {
  ANALYTICAL_SETS,
  RESULT_DOMAINS,
  RESULTS_CALCULATION_VERSION,
  RESULTS_CATALOG_VERSION,
  RESULTS_CONTRACT_VERSION,
  RESULTS_NUMERIC_TOLERANCE,
  type AnalyticalSet,
  type AnalyticalStatus,
  type ResultComponent,
  type ResultDomain,
  type ResultPoint,
  type ResultsCampaign,
  type ResultsWorkbookExportModel,
  type ResultsWorkbookImport,
} from "./types";

type WorkbookBinary = Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0];
type DomainNumbers = Record<ResultDomain, number | null>;
type MutableMolecularGroup = {
  totalReads: number;
  recordCount: number;
  scoredReads: Record<ResultDomain, number>;
  weightedReads: Record<ResultDomain, number>;
};

const REQUIRED_SHEETS = RESULTS_SHEETS;

const INDEX_HEADERS = [
  "Campanha", "Ponto", "Manancial / Corpo Hídrico", "Município", "Índice ambiental",
  "Índice operacional", "Índice saúde humana", "Índice geral", "Posição na campanha",
  "Cobertura ambiental", "Cobertura operacional", "Cobertura saúde", "Conjuntos disponíveis",
  "Situação", "Registros com impacto", "Observações", "Versão do cálculo",
  "Limite inferior ambiental", "Limite superior ambiental", "Limite inferior operacional",
  "Limite superior operacional", "Limite inferior saúde", "Limite superior saúde",
  "Limite inferior geral", "Limite superior geral", "Conjuntos utilizados",
  "Conjuntos indisponíveis", "Condição de uso", "Situação Bactérias",
  "Situação Cianobactérias", "Situação COI",
] as const;

const COMPONENT_HEADERS = [
  "Chave do cálculo", "Campanha", "Ponto", "Conjunto", "Total de reads", "Registros",
  "Reads score 1 ambiental", "Reads score 2 ambiental", "Reads score 3 ambiental",
  "Reads sem score ambiental", "Cobertura ambiental", "Sinal ponderado ambiental",
  "Índice ambiental", "Reads score 1 operacional", "Reads score 2 operacional",
  "Reads score 3 operacional", "Reads sem score operacional", "Cobertura operacional",
  "Sinal ponderado operacional", "Índice operacional", "Reads score 1 saúde",
  "Reads score 2 saúde", "Reads score 3 saúde", "Reads sem score saúde", "Cobertura saúde",
  "Sinal ponderado saúde", "Índice saúde", "Situação analítica", "Motivo / observação analítica",
  "Incluir na síntese (0/1)", "Componente ambiental utilizado",
  "Componente operacional utilizado", "Componente saúde utilizado",
] as const;

const METADATA_HEADERS = [
  "Cód. SIA", "Data", "Hora", "Manancial / Corpo Hídrico", "Município",
  "Latitude Original", "Longitude Original", "Latitude efetiva", "Longitude Efetiva",
  "Marcador", "Conjunto analisado", "Espécie", "Número de Reads", "% Reads", "Campanha",
] as const;

const CATALOG_HEADERS = [
  "ID organismo", "Organismo do banco", "Score ambiental", "Score operacional",
  "Score saúde humana", "Versão do catálogo",
] as const;

export async function parseResultsWorkbookV2(
  buffer: ArrayBuffer | Uint8Array,
  fileName: string,
): Promise<ResultsWorkbookImport> {
  const bytes = Buffer.from(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer));
  const { workbook, repaired } = await loadWorkbook(bytes);
  return parseLoadedWorkbook(workbook, repaired, bytes, fileName);
}

function parseLoadedWorkbook(workbook: ExcelJS.Workbook, repaired: boolean, bytes: Buffer, fileName: string): ResultsWorkbookImport {
  validateSheetSet(workbook);

  const warnings = new Set<string>();
  if (workbook.getWorksheet(LEGACY_MOLECULAR_SHEET)) warnings.add("Aba legada Metadata-C2 reconhecida; nome canônico Metadados. Fonte original preservada.");
  for (const warning of cachedZeroProvenance(workbook)) warnings.add(warning);
  if (repaired) warnings.add("Namespaces OpenXML incompatíveis com ExcelJS foram normalizados somente em memória.");

  const parameters = parseParameters(requiredSheet(workbook, "Metodo_calculo"));
  const evidenceScores = parseEvidenceScores(requiredSheet(workbook, "Evidencias_risco"));
  const catalog = parseCatalog(requiredSheet(workbook, "Riscos_bibliografia"), evidenceScores, warnings);
  const metadata = parseMolecularRows(requiredSheet(workbook, MOLECULAR_SHEET), catalog);
  const components = parseComponents(
    requiredSheet(workbook, "Calculo_conjuntos"),
    metadata.groups,
    warnings,
  );
  const points = parsePoints(
    requiredSheet(workbook, "Indices_pontos"),
    components,
    metadata.coordinates,
    warnings,
  );
  const campaigns = buildCampaigns(points, requiredSheet(workbook, "Indices_pontos"), warnings);

  return {
    contractVersion: RESULTS_CONTRACT_VERSION,
    calculationVersion: RESULTS_CALCULATION_VERSION,
    catalogVersion: RESULTS_CATALOG_VERSION,
    parameters,
    source: {
      fileName,
      sha256: createHash("sha256").update(bytes).digest("hex").toUpperCase(),
      namespaceRepairApplied: repaired,
    },
    molecularRecordCount: metadata.recordCount,
    componentRecordCount: components.size,
    campaigns,
    warnings: [...warnings],
  };
}

export async function buildResultsWorkbookExportModelV2(
  buffer: ArrayBuffer | Uint8Array,
  campaignCodes: readonly string[],
): Promise<ResultsWorkbookExportModel & { cacheRecovery: string[] }> {
  if (campaignCodes.length === 0) throw new Error("Selecione ao menos uma campanha para exportar.");
  const bytes = Buffer.from(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer));
  const { workbook: source } = await loadWorkbook(bytes);
  const model = exportLoadedWorkbook(source, campaignCodes);
  // A generated model uses canonical terminology; persisted source models/raw binaries stay untouched.
  return { ...model, sheets: model.sheets.map(sheet => ({ name: canonicalSheetName(sheet.name), rows: sheet.rows.map(row => row.map(value => typeof value === "string" ? value.replaceAll("Metadata-C2", "Metadados") : value)) })) };
}

// One decode for the local audited preview; scientific validation remains identical.
export async function parseResultsWorkbookWithModelV2(buffer: Uint8Array, fileName: string) {
  const bytes = Buffer.from(buffer);
  const { workbook, repaired } = await loadWorkbook(bytes);
  const parsed = parseLoadedWorkbook(workbook, repaired, bytes, fileName);
  const model = exportLoadedWorkbook(workbook, parsed.campaigns.map(campaign => campaign.campaignCode));
  return { parsed, model };
}

function exportLoadedWorkbook(source: ExcelJS.Workbook, campaignCodes: readonly string[]): ResultsWorkbookExportModel & { cacheRecovery: string[] } {
  validateSheetSet(source);
  parseParameters(requiredSheet(source, "Metodo_calculo"));
  const selected = new Set(campaignCodes);
  const indexSheet = requiredSheet(source, "Indices_pontos");
  const available = new Set<string>();
  for (let rowNumber = 6; rowNumber <= indexSheet.actualRowCount; rowNumber += 1) {
    const campaign = textValue(indexSheet.getRow(rowNumber).getCell(1));
    if (campaign) available.add(campaign);
  }
  for (const campaign of selected) if (!available.has(campaign)) throw new Error(`Campanha ausente do arquivo: ${campaign}.`);

  const sheets: ResultsWorkbookExportModel["sheets"] = [];

  for (const name of REQUIRED_SHEETS) {
    const sourceSheet = requiredSheet(source, name);
    const campaignColumn = name === MOLECULAR_SHEET ? 17 : name === "Indices_pontos" ? 1 : name === "Calculo_conjuntos" ? 2 : null;
    const firstDataRow = name === MOLECULAR_SHEET ? 2 : name === "Indices_pontos" || name === "Calculo_conjuntos" ? 6 : null;
    const rows: ResultsWorkbookExportModel["sheets"][number]["rows"] = [];
    const rowCount = sourceSheet.rowCount;
    const columnCount = sourceSheet.columnCount;
    for (let rowNumber = 1; rowNumber <= rowCount; rowNumber += 1) {
      const sourceRow = sourceSheet.getRow(rowNumber);
      if (campaignColumn && firstDataRow && rowNumber >= firstDataRow) {
        const campaign = textValue(sourceRow.getCell(campaignColumn));
        if (!selected.has(campaign)) continue;
      }
      const sourceValues = sourceRow.values as ExcelJS.CellValue[];
      rows.push(Array.from(
        { length: columnCount },
        (_, index) => exportRawValue(sourceValues[index + 1], sourceRow.getCell(index + 1).result),
      ));
    }
    sheets.push({ name: sourceSheet.name, rows });
  }
  return {
    contractVersion: RESULTS_CONTRACT_VERSION,
    calculationVersion: RESULTS_CALCULATION_VERSION,
    catalogVersion: RESULTS_CATALOG_VERSION,
    campaignCodes: [...selected],
    cacheRecovery: cachedZeroProvenance(source),
    sheets,
  };
}

async function loadWorkbook(bytes: Buffer) {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as unknown as WorkbookBinary, { ignoreNodes: ["extLst", "tableParts"] });
    return { workbook, repaired: false };
  } catch (error) {
    if (!(error instanceof Error) || !/Unexpected xml node|sheetNo|table/i.test(error.message)) throw error;
  }

  const zip = await JSZip.loadAsync(bytes);
  for (const path of Object.keys(zip.files)) {
    if (!path.endsWith(".xml")) continue;
    const entry = zip.file(path);
    if (!entry) continue;
    let xml = await entry.async("string");
    if (xml.includes("<x:")) {
      xml = xml
        .replace(/(<\/?)(?:x:)/g, "$1")
        .replace(
          'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
          'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
        );
    }
    if (xml.includes('xmlns:ns1="http://schemas.openxmlformats.org/officeDocument/2006/relationships"')) {
      xml = xml
        .replace(
          'xmlns:ns1="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
          'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
        )
        .replace(/\bns1:/g, "r:");
    }
    zip.file(path, xml);
  }
  const repairedBytes = await zip.generateAsync({ type: "nodebuffer" });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(repairedBytes as unknown as WorkbookBinary, { ignoreNodes: ["extLst", "tableParts"] });
  return { workbook, repaired: true };
}

/** Same decoder/cache rules as full imports; partial sheets are never promoted by this read. */
export async function readResultsPreparationModel(bytes: Uint8Array): Promise<{ sheets: ResultsWorkbookExportModel["sheets"] }> {
  const {workbook}=await loadWorkbook(Buffer.from(bytes));
  const names=workbook.worksheets.map(s=>s.name);
  if(names.some(name=>!(RESULTS_SHEETS as readonly string[]).includes(canonicalSheetName(name))))throw new Error("Fragmento contém aba desconhecida.");
  if(names.some(name=>canonicalSheetName(name)===MOLECULAR_SHEET))molecularSheetName(names);
  const sheets=workbook.worksheets.map(sheet=>({name:sheet.name,rows:Array.from({length:sheet.rowCount},(_,i)=>Array.from({length:sheet.columnCount},(_,j)=>{
    const cell=sheet.getCell(i+1,j+1);return exportRawValue(cell.value,cell.result);
  }))}));
  return {sheets};
}

export function validateResultsPreparationModel(sheets:ResultsWorkbookExportModel["sheets"], kind:"bibliography"|"campaign_fragment") {
  const workbook=new ExcelJS.Workbook();
  for(const source of sheets){const sheet=workbook.addWorksheet(source.name);source.rows.forEach(row=>sheet.addRow(row));}
  const warnings=new Set<string>();
  const evidence=parseEvidenceScores(requiredSheet(workbook,"Evidencias_risco"));
  parseCatalog(requiredSheet(workbook,"Riscos_bibliografia"),evidence,warnings);
  const catalogSheet=requiredSheet(workbook,"Riscos_bibliografia"), evidenceSheet=requiredSheet(workbook,"Evidencias_risco"), criteria=requiredSheet(workbook,"Criterios_scores");
  const catalogHeaders=headerMap(catalogSheet,5,["ID organismo","Organismo do banco"]);
  const evidenceHeaders=headerMap(evidenceSheet,5,["ID organismo","Organismo do banco","Código do efeito","Domínio"]);
  const names=new Map<string,string>();
  for(let i=6;i<=catalogSheet.rowCount;i++) {const row=catalogSheet.getRow(i);const id=textValue(row.getCell(catalogHeaders.get("ID organismo")!));if(id)names.set(id,textValue(row.getCell(catalogHeaders.get("Organismo do banco")!)));}
  const effects=new Map<string,string>();for(let i=33;i<=criteria.rowCount;i++){const row=criteria.getRow(i);const code=textValue(row.getCell(1));if(/^[AOS]\d+$/.test(code))effects.set(code,textValue(row.getCell(2)));}
  for(let i=6;i<=evidenceSheet.rowCount;i++) {
    const row=evidenceSheet.getRow(i),id=textValue(row.getCell(evidenceHeaders.get("ID organismo")!));
    if(names.get(id)!==textValue(row.getCell(evidenceHeaders.get("Organismo do banco")!)))throw new Error("Nome/ID conflitante na revisão bibliográfica.");
    if(effects.get(textValue(row.getCell(evidenceHeaders.get("Código do efeito")!)))!==textValue(row.getCell(evidenceHeaders.get("Domínio")!)))throw new Error("Código de efeito/domínio incompatível.");
  }
  if(kind==="campaign_fragment")parseLoadedWorkbook(workbook,false,Buffer.from("isolated-preparation-validation"),"preparation-validation.xlsx");
}

function parseParameters(worksheet: ExcelJS.Worksheet): ResultsWorkbookImport["parameters"] {
  const expected = [
    ["Expoente da gravidade", 1],
    ["Curvatura logarítmica", 100],
    ["Conjuntos exigidos", 3],
    ["Domínios", 3],
    ["Versão do cálculo", RESULTS_CALCULATION_VERSION],
  ] as const;
  expected.forEach(([label, value], offset) => {
    const row = 6 + offset;
    requireEqual(textValue(worksheet.getCell(row, 1)), label, `${worksheet.name}!A${row}`);
    requireEqual(primitiveValue(worksheet.getCell(row, 2)), value, `${worksheet.name}!B${row}`);
  });
  return { severityExponent: 1, alpha: 100, requiredSetCount: 3, domainCount: 3 };
}

function parseEvidenceScores(worksheet: ExcelJS.Worksheet) {
  const columns = headerMap(worksheet, 5, [
    "ID organismo", "Domínio", "Score bibliográfico", "Versão do catálogo",
  ]);
  const evidence = new Map<string, number | null>();
  for (let rowNumber = 6; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const organismId = requiredText(row.getCell(columns.get("ID organismo")!), worksheet, rowNumber, "ID organismo");
    const domain = evidenceDomain(row.getCell(columns.get("Domínio")!), worksheet, rowNumber);
    const key = `${organismId}|${domain}`;
    if (evidence.has(key)) fail(worksheet, rowNumber, "Domínio", `evidência duplicada: ${key}`);
    requireEqual(
      textValue(row.getCell(columns.get("Versão do catálogo")!)),
      RESULTS_CATALOG_VERSION,
      `${worksheet.name}, linha ${rowNumber}, Versão do catálogo`,
    );
    evidence.set(key, scoreValue(row.getCell(columns.get("Score bibliográfico")!), worksheet, rowNumber));
  }
  return evidence;
}

function parseCatalog(
  worksheet: ExcelJS.Worksheet,
  evidence: Map<string, number | null>,
  warnings: Set<string>,
) {
  const columns = headerMap(worksheet, 5, CATALOG_HEADERS);
  const catalog = new Map<string, DomainNumbers>();
  for (let rowNumber = 6; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const organismId = textValue(row.getCell(columns.get("ID organismo")!));
    if (!organismId) continue;
    const organism = textValue(row.getCell(columns.get("Organismo do banco")!));
    if (!organism) continue;
    if (catalog.has(organism)) fail(worksheet, rowNumber, "Organismo do banco", `organismo duplicado: ${organism}`);
    const version = textValue(row.getCell(columns.get("Versão do catálogo")!));
    requireEqual(version, RESULTS_CATALOG_VERSION, `${worksheet.name}, linha ${rowNumber}, Versão do catálogo`);
    const scores = {} as DomainNumbers;
    for (const domain of RESULT_DOMAINS) {
      const reconstructed = evidence.get(`${organismId}|${domain}`) ?? null;
      const cell = row.getCell(columns.get(catalogScoreHeader(domain))!);
      const cached = numericValue(cell);
      if (cached === null && reconstructed !== null) {
        warnings.add("Caches do catálogo ausentes foram reconstruídos a partir de Evidencias_risco.");
      } else if (cached !== reconstructed) {
        fail(worksheet, rowNumber, catalogScoreHeader(domain), `cache ${cached} diverge da evidência ${reconstructed}`);
      }
      scores[domain] = reconstructed;
    }
    catalog.set(organism, scores);
  }
  return catalog;
}

function parseMolecularRows(worksheet: ExcelJS.Worksheet, catalog: Map<string, DomainNumbers>) {
  const columns = headerMap(worksheet, 1, METADATA_HEADERS);
  const groups = new Map<string, MutableMolecularGroup>();
  const coordinateSets = new Map<string, Set<string>>();
  let recordCount = 0;

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const campaign = requiredText(row.getCell(columns.get("Campanha")!), worksheet, rowNumber, "Campanha");
    const sia = requiredSia(row.getCell(columns.get("Cód. SIA")!), worksheet, rowNumber, "Cód. SIA");
    const set = analyticalSet(row.getCell(columns.get("Conjunto analisado")!), worksheet, rowNumber);
    const organism = requiredText(row.getCell(columns.get("Espécie")!), worksheet, rowNumber, "Espécie");
    const reads = requiredNonNegativeNumber(row.getCell(columns.get("Número de Reads")!), worksheet, rowNumber, "Número de Reads");
    const scores = catalog.get(organism);
    if (!scores) fail(worksheet, rowNumber, "Espécie", `organismo ausente do catálogo: ${organism}`);

    const key = componentKey(campaign, sia, set);
    const group = groups.get(key) ?? emptyMolecularGroup();
    group.totalReads += reads;
    group.recordCount += 1;
    for (const domain of RESULT_DOMAINS) {
      const score = scores[domain];
      if (score === null) continue;
      group.scoredReads[domain] += reads;
      group.weightedReads[domain] += reads * (score / 3);
    }
    groups.set(key, group);
    recordCount += 1;

    const latitude = optionalCoordinate(row, columns, "Latitude efetiva", "Latitude Original");
    const longitude = optionalCoordinate(row, columns, "Longitude Efetiva", "Longitude Original");
    if (latitude !== null && longitude !== null) {
      const pointKey = resultKey(campaign, sia);
      const values = coordinateSets.get(pointKey) ?? new Set<string>();
      values.add(`${latitude}|${longitude}`);
      coordinateSets.set(pointKey, values);
    }
  }

  const coordinates = new Map<string, { latitude: number; longitude: number } | null>();
  for (const [key, values] of coordinateSets) {
    if (values.size !== 1) coordinates.set(key, null);
    else {
      const [latitude, longitude] = [...values][0].split("|").map(Number);
      coordinates.set(key, { latitude, longitude });
    }
  }
  return { groups, coordinates, recordCount };
}

function parseComponents(
  worksheet: ExcelJS.Worksheet,
  molecular: Map<string, MutableMolecularGroup>,
  warnings: Set<string>,
) {
  const columns = headerMap(worksheet, 5, COMPONENT_HEADERS);
  const components = new Map<string, ResultComponent>();
  for (let rowNumber = 6; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const campaign = requiredText(row.getCell(columns.get("Campanha")!), worksheet, rowNumber, "Campanha");
    const sia = requiredSia(row.getCell(columns.get("Ponto")!), worksheet, rowNumber, "Ponto");
    const set = analyticalSet(row.getCell(columns.get("Conjunto")!), worksheet, rowNumber);
    const key = componentKey(campaign, sia, set);
    if (components.has(key)) fail(worksheet, rowNumber, "Chave do cálculo", `chave duplicada: ${key}`);
    requireEqual(textValue(row.getCell(columns.get("Chave do cálculo")!)), key, `${worksheet.name}, linha ${rowNumber}, Chave do cálculo`);
    const source = molecular.get(key);
    if (!source) fail(worksheet, rowNumber, "Chave do cálculo", `sem registros moleculares para ${key}`);

    const calculated = {} as DomainNumbers;
    const coverage = {} as DomainNumbers;
    for (const domain of RESULT_DOMAINS) {
      const signal = source.totalReads > 0 ? source.weightedReads[domain] / source.totalReads : null;
      calculated[domain] = signal === null ? null : calculateComponentIndex(signal);
      coverage[domain] = source.totalReads > 0 ? source.scoredReads[domain] / source.totalReads : null;
      auditCell(row.getCell(columns.get(componentIndexHeader(domain))!), calculated[domain], worksheet, rowNumber, componentIndexHeader(domain), warnings);
      auditCell(row.getCell(columns.get(componentCoverageHeader(domain))!), coverage[domain], worksheet, rowNumber, componentCoverageHeader(domain), warnings);
      auditCell(row.getCell(columns.get(componentSignalHeader(domain))!), signal, worksheet, rowNumber, componentSignalHeader(domain), warnings);
    }
    auditCell(row.getCell(columns.get("Total de reads")!), source.totalReads, worksheet, rowNumber, "Total de reads", warnings, true);
    auditCell(row.getCell(columns.get("Registros")!), source.recordCount, worksheet, rowNumber, "Registros", warnings, true);

    const sourceStatus = requiredText(row.getCell(columns.get("Situação analítica")!), worksheet, rowNumber, "Situação analítica");
    const status = analyticalStatus(sourceStatus);
    const eligible = status === "approved" || status === "available_unassessed";
    const included = eligible && RESULT_DOMAINS.every((domain) => calculated[domain] !== null);
    const cachedIncluded = requiredNonNegativeNumber(row.getCell(columns.get("Incluir na síntese (0/1)")!), worksheet, rowNumber, "Incluir na síntese (0/1)");
    requireEqual(cachedIncluded, included ? 1 : 0, `${worksheet.name}, linha ${rowNumber}, Incluir na síntese (0/1)`);
    const used = {} as DomainNumbers;
    for (const domain of RESULT_DOMAINS) {
      used[domain] = included ? calculated[domain] : null;
      auditCell(row.getCell(columns.get(componentUsedHeader(domain))!), used[domain], worksheet, rowNumber, componentUsedHeader(domain), warnings);
    }

    components.set(key, {
      set,
      status,
      sourceStatus,
      reason: nullableText(row.getCell(columns.get("Motivo / observação analítica")!)),
      totalReads: source.totalReads,
      recordCount: source.recordCount,
      included,
      calculated,
      used,
      bibliographicCoverage: coverage,
    });
  }
  if (components.size !== molecular.size) {
    throw new Error(`Calculo_conjuntos possui ${components.size} chaves, mas Metadados possui ${molecular.size}.`);
  }
  return components;
}

function parsePoints(
  worksheet: ExcelJS.Worksheet,
  components: Map<string, ResultComponent>,
  coordinates: Map<string, { latitude: number; longitude: number } | null>,
  warnings: Set<string>,
) {
  const columns = headerMap(worksheet, 5, INDEX_HEADERS);
  const points: ResultPoint[] = [];
  const seen = new Set<string>();
  for (let rowNumber = 6; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const campaign = requiredText(row.getCell(columns.get("Campanha")!), worksheet, rowNumber, "Campanha");
    const sia = requiredSia(row.getCell(columns.get("Ponto")!), worksheet, rowNumber, "Ponto");
    const key = resultKey(campaign, sia);
    if (seen.has(key)) fail(worksheet, rowNumber, "Ponto", `resultado duplicado: ${key}`);
    seen.add(key);

    const pointComponents = Object.fromEntries(ANALYTICAL_SETS.map((set) => [
      set,
      components.get(componentKey(campaign, sia, set)) ?? missingComponent(set),
    ])) as Record<AnalyticalSet, ResultComponent>;
    const aggregate = calculateAggregates(Object.fromEntries(ANALYTICAL_SETS.map((set) => [set, pointComponents[set].used])) as Record<AnalyticalSet, DomainNumbers>);
    const availableSetCount = ANALYTICAL_SETS.filter((set) => pointComponents[set].status !== "missing_records").length;
    const bibliographicCoverage = Object.fromEntries(RESULT_DOMAINS.map((domain) => [
      domain,
      aggregate.usedSetCount === 3
        ? ANALYTICAL_SETS.reduce((sum, set) => sum + (pointComponents[set].bibliographicCoverage[domain] as number), 0) / 3
        : null,
    ])) as DomainNumbers;

    auditCell(row.getCell(columns.get("Conjuntos disponíveis")!), availableSetCount, worksheet, rowNumber, "Conjuntos disponíveis", warnings, true);
    auditCell(row.getCell(columns.get("Conjuntos utilizados")!), aggregate.usedSetCount, worksheet, rowNumber, "Conjuntos utilizados", warnings, true);
    auditCell(row.getCell(columns.get("Índice ambiental")!), aggregate.domains.environmental.value, worksheet, rowNumber, "Índice ambiental", warnings);
    auditCell(row.getCell(columns.get("Índice operacional")!), aggregate.domains.operational.value, worksheet, rowNumber, "Índice operacional", warnings);
    auditCell(row.getCell(columns.get("Índice saúde humana")!), aggregate.domains.humanHealth.value, worksheet, rowNumber, "Índice saúde humana", warnings);
    auditCell(row.getCell(columns.get("Índice geral")!), aggregate.overall.value, worksheet, rowNumber, "Índice geral", warnings);
    for (const domain of RESULT_DOMAINS) {
      auditCell(row.getCell(columns.get(pointLowerHeader(domain))!), aggregate.domains[domain].lower, worksheet, rowNumber, pointLowerHeader(domain), warnings);
      auditCell(row.getCell(columns.get(pointUpperHeader(domain))!), aggregate.domains[domain].upper, worksheet, rowNumber, pointUpperHeader(domain), warnings);
      auditCell(row.getCell(columns.get(pointCoverageHeader(domain))!), bibliographicCoverage[domain], worksheet, rowNumber, pointCoverageHeader(domain), warnings);
    }
    auditCell(row.getCell(columns.get("Limite inferior geral")!), aggregate.overall.lower, worksheet, rowNumber, "Limite inferior geral", warnings);
    auditCell(row.getCell(columns.get("Limite superior geral")!), aggregate.overall.upper, worksheet, rowNumber, "Limite superior geral", warnings);
    requireEqual(textValue(row.getCell(columns.get("Versão do cálculo")!)), RESULTS_CALCULATION_VERSION, `${worksheet.name}, linha ${rowNumber}, Versão do cálculo`);

    const coordinate = coordinates.get(key);
    if (coordinate === null) warnings.add(`Coordenadas conflitantes em ${key}; o resultado permanece sem localização.`);
    points.push({
      key,
      campaignCode: campaign,
      siaCode: sia,
      waterBody: nullableText(row.getCell(columns.get("Manancial / Corpo Hídrico")!)),
      municipality: nullableText(row.getCell(columns.get("Município")!)),
      coordinates: coordinate ? { ...coordinate, source: "workbook_metadata" } : null,
      calculationVersion: RESULTS_CALCULATION_VERSION,
      catalogVersion: RESULTS_CATALOG_VERSION,
      completeness: aggregate.completeness,
      availableSetCount,
      usedSetCount: aggregate.usedSetCount,
      unavailableSets: ANALYTICAL_SETS.filter((set) => !pointComponents[set].included),
      conditionOfUse: nullableText(row.getCell(columns.get("Condição de uso")!)),
      impactedRecordCount: optionalInteger(row.getCell(columns.get("Registros com impacto")!)) ?? 0,
      observations: nullableText(row.getCell(columns.get("Observações")!)),
      domains: aggregate.domains,
      overall: { ...aggregate.overall, rank: null },
      bibliographicCoverage,
      components: pointComponents,
    });
  }
  return points;
}

function buildCampaigns(points: ResultPoint[], worksheet: ExcelJS.Worksheet, warnings: Set<string>) {
  const rankColumn = headerMap(worksheet, 5, INDEX_HEADERS).get("Posição na campanha")!;
  const campaigns = [...new Set(points.map((point) => point.campaignCode))].sort().map((campaignCode) => {
    const campaignPoints = points.filter((point) => point.campaignCode === campaignCode);
    const complete = campaignPoints.filter((point) => point.overall.value !== null);
    const ranks = competitionRanks(complete, (point) => point.overall.value as number);
    for (const point of complete) point.overall.rank = ranks.get(point)!;
    for (const point of campaignPoints) {
      const rowNumber = 6 + points.indexOf(point);
      auditCell(worksheet.getRow(rowNumber).getCell(rankColumn), point.overall.rank, worksheet, rowNumber, "Posição na campanha", warnings, true);
    }
    return {
      campaignCode,
      points: campaignPoints,
      counts: {
        total: campaignPoints.length,
        complete: complete.length,
        partialWithTwoSets: campaignPoints.filter((point) => point.usedSetCount === 2).length,
        partialWithOneSet: campaignPoints.filter((point) => point.usedSetCount === 1).length,
        unavailable: campaignPoints.filter((point) => point.usedSetCount === 0).length,
      },
    } satisfies ResultsCampaign;
  });
  return campaigns;
}

function validateSheetSet(workbook: ExcelJS.Workbook) {
  molecularSheetName(workbook.worksheets.map(sheet => sheet.name));
  const actual = workbook.worksheets.map((sheet) => canonicalSheetName(sheet.name));
  if (new Set(actual).size !== actual.length) throw new Error("Abas moleculares ambíguas: envie somente Metadados ou Metadata-C2.");
  const missing = REQUIRED_SHEETS.filter((name) => !actual.includes(name));
  const extra = actual.filter((name) => !(REQUIRED_SHEETS as readonly string[]).includes(name));
  if (missing.length || extra.length) {
    throw new Error(`Abas incompatíveis. Ausentes: ${missing.join(", ") || "nenhuma"}. Extras: ${extra.join(", ") || "nenhuma"}.`);
  }
}

function headerMap(worksheet: ExcelJS.Worksheet, rowNumber: number, required: readonly string[]) {
  const map = new Map<string, number>();
  worksheet.getRow(rowNumber).eachCell({ includeEmpty: false }, (cell, column) => {
    const header = textValue(cell);
    if (!header) return;
    if (map.has(header)) fail(worksheet, rowNumber, header, "cabeçalho duplicado");
    map.set(header, column);
  });
  for (const header of required) if (!map.has(header)) fail(worksheet, rowNumber, header, "cabeçalho obrigatório ausente");
  return map;
}

function primitiveValue(cell: ExcelJS.Cell): unknown {
  const value = cell.value;
  if (value && typeof value === "object" && "sharedFormula" in value) {
    const cached = value.result ?? cell.result;
    if (cached === undefined) throw new Error(`${cell.worksheet.name}!${cell.address}: fórmula compartilhada sem cache.`);
    if (typeof cached === "number" && !Number.isFinite(cached)) throw new Error("Cache numérico não finito.");
    if (typeof cached === "object") throw new Error(`${cell.worksheet.name}!${cell.address}: cache de fórmula compartilhada inválido.`);
    return cached;
  }
  if (value && typeof value === "object" && "formula" in value) return value.result ?? cell.result;
  if (value && typeof value === "object" && "error" in value) throw new Error(`${cell.worksheet.name}!${cell.address}: erro de fórmula ${value.error}.`);
  if (value && typeof value === "object" && "richText" in value) return value.richText.map((part) => part.text).join("");
  return value;
}

function exportRawValue(raw: ExcelJS.CellValue | undefined, originalCache?: ExcelJS.CellFormulaValue["result"]): string | number | boolean | Date | null {
  let value: unknown = raw;
  if (raw && typeof raw === "object" && "sharedFormula" in raw) {
    const cached = raw.result ?? originalCache;
    if (cached === undefined || typeof cached === "object") throw new Error("Cache de fórmula compartilhada ausente ou inválido.");
    if (typeof cached === "number" && !Number.isFinite(cached)) throw new Error("Cache numérico não finito.");
    value = cached;
  }
  if (value && typeof value === "object" && "formula" in value) value = (value as ExcelJS.CellFormulaValue).result ?? originalCache;
  if (value && typeof value === "object" && "error" in value) throw new Error(`Erro de fórmula na exportação: ${(value as ExcelJS.CellErrorValue).error}.`);
  if (value && typeof value === "object" && "richText" in value) {
    value = (value as ExcelJS.CellRichTextValue).richText.map((part: ExcelJS.RichText) => part.text).join("");
  }
  if (value === undefined || value === null) return null;
  if (value instanceof Date || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}

function cachedZeroProvenance(workbook: ExcelJS.Workbook) {
  let count = 0;
  workbook.eachSheet((sheet) => sheet.eachRow((row) => row.eachCell((cell) => {
    const value = cell.value;
    if (value && typeof value === "object" && ("formula" in value || "sharedFormula" in value) &&
        value.result === undefined && cell.result === 0) count++;
  })));
  return count ? [`${count} caches zero originais recuperados por cell.result; cell.value do ExcelJS omite valores falsy. Fonte preservada.`] : [];
}

function textValue(cell: ExcelJS.Cell) {
  const value = primitiveValue(cell);
  return value === null || value === undefined ? "" : String(value).trim();
}

function nullableText(cell: ExcelJS.Cell) {
  const value = textValue(cell);
  return value ? value : null;
}

function numericValue(cell: ExcelJS.Cell) {
  const value = primitiveValue(cell);
  if (value === null || value === undefined || value === "" || normalizeText(String(value)) === "na") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new Error(`${cell.worksheet.name}!${cell.address}: valor numérico inválido (${String(value)}).`);
}

function auditCell(
  cell: ExcelJS.Cell,
  reconstructed: number | null,
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  field: string,
  warnings: Set<string>,
  exact = false,
) {
  const cached = numericValue(cell);
  if (cached === null && reconstructed !== null) {
    warnings.add("Caches derivados ausentes foram reconstruídos a partir dos insumos autoritativos.");
    return;
  }
  if (cached === null || reconstructed === null) {
    if (cached !== reconstructed) fail(worksheet, rowNumber, field, `cache ${cached} diverge do valor reconstruído ${reconstructed}`);
    return;
  }
  const differs = exact ? cached !== reconstructed : Math.abs(cached - reconstructed) > RESULTS_NUMERIC_TOLERANCE;
  if (differs) fail(worksheet, rowNumber, field, `cache ${cached} diverge do valor reconstruído ${reconstructed}`);
}

function scoreValue(cell: ExcelJS.Cell, worksheet: ExcelJS.Worksheet, rowNumber: number) {
  const value = numericValue(cell);
  if (value === null) return null;
  if (![1, 2, 3].includes(value)) fail(worksheet, rowNumber, cell.address, `score bibliográfico inválido: ${value}`);
  return value;
}

function requiredText(cell: ExcelJS.Cell, worksheet: ExcelJS.Worksheet, rowNumber: number, field: string) {
  const value = textValue(cell);
  if (!value) fail(worksheet, rowNumber, field, "valor obrigatório ausente");
  return value;
}

function requiredSia(cell: ExcelJS.Cell, worksheet: ExcelJS.Worksheet, rowNumber: number, field: string) {
  const raw = primitiveValue(cell);
  const value = typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0
    ? `SIA-${String(raw).padStart(4, "0")}`
    : requiredText(cell, worksheet, rowNumber, field);
  if (!/^SIA-\d+$/.test(value)) fail(worksheet, rowNumber, field, `código SIA inválido: ${value}`);
  return value;
}

function requiredNonNegativeNumber(cell: ExcelJS.Cell, worksheet: ExcelJS.Worksheet, rowNumber: number, field: string) {
  const value = numericValue(cell);
  if (value === null || value < 0) fail(worksheet, rowNumber, field, "use número não negativo");
  return value;
}

function optionalInteger(cell: ExcelJS.Cell) {
  const value = numericValue(cell);
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 0) throw new Error(`${cell.worksheet.name}!${cell.address}: inteiro não negativo esperado.`);
  return value;
}

function analyticalSet(cell: ExcelJS.Cell, worksheet: ExcelJS.Worksheet, rowNumber: number): AnalyticalSet {
  const value = normalizeText(requiredText(cell, worksheet, rowNumber, "Conjunto"));
  if (value === "bacterias") return "bacteria";
  if (value === "cianobacterias") return "cyanobacteria";
  if (value === "coi") return "coi";
  fail(worksheet, rowNumber, "Conjunto", `conjunto desconhecido: ${textValue(cell)}`);
}

function analyticalStatus(value: string): AnalyticalStatus {
  const normalized = normalizeText(value);
  if (normalized === "aprovado") return "approved";
  if (normalized === "disponivel; qualidade nao informada") return "available_unassessed";
  if (normalized === "inconclusivo") return "inconclusive";
  if (normalized === "falha confirmada") return "confirmed_failure";
  if (normalized === "nao realizado") return "not_performed";
  return "unknown";
}

function evidenceDomain(cell: ExcelJS.Cell, worksheet: ExcelJS.Worksheet, rowNumber: number): ResultDomain {
  const value = normalizeText(requiredText(cell, worksheet, rowNumber, "Domínio"));
  if (value === "ambiental") return "environmental";
  if (value === "operacional") return "operational";
  if (value === "saude humana" || value === "saude") return "humanHealth";
  fail(worksheet, rowNumber, "Domínio", `domínio desconhecido: ${textValue(cell)}`);
}

function optionalCoordinate(
  row: ExcelJS.Row,
  columns: Map<string, number>,
  preferred: string,
  fallback: string,
) {
  const first = numericValue(row.getCell(columns.get(preferred)!));
  return first ?? numericValue(row.getCell(columns.get(fallback)!));
}

function emptyMolecularGroup(): MutableMolecularGroup {
  return {
    totalReads: 0,
    recordCount: 0,
    scoredReads: { environmental: 0, operational: 0, humanHealth: 0 },
    weightedReads: { environmental: 0, operational: 0, humanHealth: 0 },
  };
}

function missingComponent(set: AnalyticalSet): ResultComponent {
  const empty = { environmental: null, operational: null, humanHealth: null };
  return {
    set,
    status: "missing_records",
    sourceStatus: null,
    reason: null,
    totalReads: 0,
    recordCount: 0,
    included: false,
    calculated: { ...empty },
    used: { ...empty },
    bibliographicCoverage: { ...empty },
  };
}

function componentKey(campaign: string, sia: string, set: AnalyticalSet) {
  return `${campaign}|${sia}|${setLabel(set)}`;
}

function resultKey(campaign: string, sia: string) {
  return `${campaign}|${sia}`;
}

function setLabel(set: AnalyticalSet) {
  return set === "bacteria" ? "Bactérias" : set === "cyanobacteria" ? "Cianobactérias" : "COI";
}

function componentIndexHeader(domain: ResultDomain) {
  return domain === "environmental" ? "Índice ambiental" : domain === "operational" ? "Índice operacional" : "Índice saúde";
}

function catalogScoreHeader(domain: ResultDomain) {
  return domain === "environmental" ? "Score ambiental" : domain === "operational" ? "Score operacional" : "Score saúde humana";
}

function componentCoverageHeader(domain: ResultDomain) {
  return domain === "environmental" ? "Cobertura ambiental" : domain === "operational" ? "Cobertura operacional" : "Cobertura saúde";
}

function componentSignalHeader(domain: ResultDomain) {
  return domain === "environmental" ? "Sinal ponderado ambiental" : domain === "operational" ? "Sinal ponderado operacional" : "Sinal ponderado saúde";
}

function componentUsedHeader(domain: ResultDomain) {
  return domain === "environmental" ? "Componente ambiental utilizado" : domain === "operational" ? "Componente operacional utilizado" : "Componente saúde utilizado";
}

function pointLowerHeader(domain: ResultDomain) {
  return domain === "environmental" ? "Limite inferior ambiental" : domain === "operational" ? "Limite inferior operacional" : "Limite inferior saúde";
}

function pointUpperHeader(domain: ResultDomain) {
  return domain === "environmental" ? "Limite superior ambiental" : domain === "operational" ? "Limite superior operacional" : "Limite superior saúde";
}

function pointCoverageHeader(domain: ResultDomain) {
  return domain === "environmental" ? "Cobertura ambiental" : domain === "operational" ? "Cobertura operacional" : "Cobertura saúde";
}

function normalizeText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function requireEqual(actual: unknown, expected: unknown, location: string) {
  if (actual !== expected) throw new Error(`${location}: esperado ${String(expected)}, recebido ${String(actual)}.`);
}

function requiredSheet(workbook: ExcelJS.Workbook, name: string) {
  const worksheet = workbook.getWorksheet(name === MOLECULAR_SHEET ? molecularSheetName(workbook.worksheets.map(sheet => sheet.name)) : name);
  if (!worksheet) throw new Error(`Aba obrigatória ausente: ${name}.`);
  return worksheet;
}

function fail(worksheet: ExcelJS.Worksheet, row: number, field: string, reason: string): never {
  throw new Error(`${worksheet.name}, linha ${row}, ${field}: ${reason}.`);
}
