import "server-only";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseResultsWorkbookWithModelV2 } from "@/modules/results";
import type { ResultsWorkbookExportModel, ResultsWorkbookImport } from "@/modules/results/types";
import type { ResultsSourcePreview, SourcePreviewRow, SourcePreviewSection } from "./results-source-preview-contract";
import { evidenceDto, catalogDto } from "./results-evidence-dto";
import { MOLECULAR_SHEET, molecularSheetName } from "@/modules/results/sheet-names";

const SOURCE = "D:/Dropbox/Sanepar_única/Execução/Resultados/Banco de dados/Banco_Sanepar_C1_C2_indices_atualizados_corrigido.xlsx";
const HASH = "4c9be948601a5b37e4d954ad2c2a08ebb6266a0e7ebec5d80dd6b987005ffa52";
const sheets = { molecular: MOLECULAR_SHEET, catalog: "Riscos_bibliografia", evidence: "Evidencias_risco", components: "Calculo_conjuntos", indices: "Indices_pontos", alerts: MOLECULAR_SHEET } as const;
let loaded: Promise<{ model: ResultsWorkbookExportModel; parsed: ResultsWorkbookImport }> | undefined;

async function loadSource() {
  // Windows readFile shares the existing file; no Excel close, copy or write.
  const bytes = await readFile(SOURCE);
  if (createHash("sha256").update(bytes).digest("hex") !== HASH) throw new Error("Fonte corrigida diverge do hash autorizado.");
  const { parsed, model } = await parseResultsWorkbookWithModelV2(bytes, SOURCE.split("/").at(-1)!);
  return { model, parsed };
}

export function localSourcePreviewAllowed(request: Request) {
  if (process.env.NODE_ENV !== "development") return false;
  try {
    const url = new URL(request.url);
    const host = request.headers.get("host");
    if (!host) return false;
    const authority = new URL(`http://${host}`);
    if (!["localhost", "127.0.0.1"].includes(url.hostname) ||
        !["localhost", "127.0.0.1"].includes(authority.hostname) || authority.port !== url.port) return false;
    const forwarded = request.headers.get("x-forwarded-host");
    return (!forwarded || forwarded === host) && !request.headers.has("forwarded") &&
      (!request.headers.get("origin") || request.headers.get("origin") === authority.origin);
  } catch { return false; }
}

export async function getResultsSourcePreview(query: URLSearchParams) {
  const { model, parsed } = await getAuditedSource();
  if(query.has("sourceHash") && query.get("sourceHash")?.toLowerCase() !== parsed.source.sha256.toLowerCase()) throw new Error("Fonte alterada.");
  return { ...selectSourcePreview(model, query),
    campaign: parsed.campaigns.find((item) => item.campaignCode === query.get("campaignCode"))!,
    warnings: parsed.warnings };
}

export async function getAuditedSource() {
  if (!loaded) loaded = loadSource().catch((error) => { loaded = undefined; throw error; });
  else if (createHash("sha256").update(await readFile(SOURCE)).digest("hex") !== HASH) throw new Error("Fonte alterada.");
  return loaded;
}

export async function readExactPreviewDownload(hash: string, campaignCode: string) {
  if (hash !== HASH) throw new Error("Versão solicitada diverge da fonte consultada.");
  const { parsed } = await getAuditedSource();
  if (!parsed.campaigns.some((campaign) => campaign.campaignCode === campaignCode)) throw new Error("Campanha ausente.");
  const bytes = await readFile(SOURCE);
  if (createHash("sha256").update(bytes).digest("hex") !== hash) throw new Error("Fonte alterada; atualize a prévia.");
  return { bytes, fileName: SOURCE.split("/").at(-1)!, sha256: hash };
}

export function selectSourcePreview(model: ResultsWorkbookExportModel, query: URLSearchParams): ResultsSourcePreview {
  const campaignCode = query.get("campaignCode") ?? "";
  const section = (query.get("section") ?? "molecular") as SourcePreviewSection;
  const set = query.get("set");
  const sia = query.get("sia");
  const offset = Number(query.get("offset") ?? 0);
  const limit = Number(query.get("limit") ?? 100);
  const search = (query.get("q") ?? "").toLocaleLowerCase("pt-BR");
  const organism = query.get("organism");
  const organismId = query.get("organismId");
  const sort = query.get("sort");
  const direction = query.get("direction") ?? "asc";
  const groupBy = query.get("groupBy");
  if (!model.campaignCodes.includes(campaignCode) || !Object.hasOwn(sheets, section) ||
      (groupBy && (groupBy !== "point" || section !== "alerts" || sort)) ||
      !Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 500 ||
      (set && !["bacteria", "cyanobacteria", "coi"].includes(set)) ||
      (sia && !/^SIA-\d+$/.test(sia)) || search.length > 200 || !["asc", "desc"].includes(direction)) throw new Error("Filtros de prévia inválidos.");
  const global = section === "catalog" || section === "evidence";
  if ((global || section === "indices") && set || global && sia) throw new Error("Filtro não aplicável à seção.");
  const resolvedName = sheets[section] === MOLECULAR_SHEET ? molecularSheetName(model.sheets.map(sheet => sheet.name)) : sheets[section];
  const sheet = model.sheets.find((item) => item.name === resolvedName);
  if (!sheet) throw new Error("Seção ausente na fonte.");
  const headerIndex = section === "molecular" || section === "alerts" ? 0 : 4;
  let { columns, rows: all } = tableRows(sheet, headerIndex);
  if (section === "alerts") {
    const catalog = model.sheets.find((item) => item.name === sheets.catalog);
    const evidence = model.sheets.find((item) => item.name === sheets.evidence);
    if (!catalog || !evidence) throw new Error("Referências ausentes.");
    const reference = tableRows(catalog, 4).rows;
    const evidenceRows = tableRows(evidence, 4).rows;
    const byTaxon = new Map<string, SourcePreviewRow[]>();
    for (const row of reference) {
      const key = String(row["Organismo do banco"]);
      byTaxon.set(key, [...(byTaxon.get(key) ?? []), row]);
    }
    all = all.flatMap((row) => {
      const matches = byTaxon.get(String(row["Espécie"])) ?? [];
      if (matches.length !== 1) return [];
      const id = matches[0]["ID organismo"];
      return evidenceRows.filter((item) => item["ID organismo"] === id &&
        typeof item["Score bibliográfico"] === "number" && [1, 2, 3].includes(item["Score bibliográfico"] as number))
        .map((item) => ({ ...row, "ID organismo": id, ...Object.fromEntries(Object.entries(item).map(([key, value]) => [`Evidência: ${key}`, value])) }));
    });
    columns = [...new Set(all.flatMap((row) => Object.keys(row)))];
  }
  if (sort && !columns.includes(sort)) throw new Error("Ordenação inválida.");
  const population = global ? all : all.filter((row) => row.Campanha === campaignCode);
  const filtered = population.filter((row) => (!sia || siaCode(row["Cód. SIA"] ?? row.Ponto) === sia) &&
    (!set || setCode(row["Conjunto analisado"] ?? row.Conjunto) === set) &&
    (!organism || (row["Espécie"] ?? row["Organismo do banco"]) === organism) &&
    (!organismId || String(row["ID organismo"]) === organismId) &&
    (!search || Object.values(row).some((value) => String(value ?? "").toLocaleLowerCase("pt-BR").includes(search))));
  if (sort) filtered.sort((a, b) => {
    const x = a[sort], y = b[sort];
    const comparison = typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""), "pt-BR", { numeric: true });
    return direction === "desc" ? -comparison : comparison;
  });
  const readsBySet: Record<string, number> = {};
  if (section === "molecular") for (const row of filtered) {
    const key = setCode(row["Conjunto analisado"]);
    const reads = row["Número de Reads"];
    if (!key || typeof reads !== "number" || !Number.isFinite(reads) || reads < 0) throw new Error("Reads/conjunto inválidos.");
    readsBySet[key] = (readsBySet[key] ?? 0) + reads;
  }
  const listed = groupBy ? alertsByPoint(filtered) : filtered;
  const rows = listed.slice(offset, offset + limit);
  return { source: { kind: "local-corrected-preview", fileName: SOURCE.split("/").at(-1)!, sha256: HASH, published: false },
    calculationVersion: model.calculationVersion, catalogVersion: model.catalogVersion, warnings: [],
    campaignCode, section, scope: global ? "global-reference" : "campaign", columns: columns.filter(Boolean), rows,
    counts: { population: groupBy ? new Set(population.map((row) => siaCode(row["Cód. SIA"]))).size : population.length, filtered: listed.length, returned: rows.length }, readsBySet, offset, limit,
    evidence: section === "evidence" ? rows.map(evidenceDto) : undefined,
    catalog: section === "catalog" ? rows.map(catalogDto) : undefined };
}

// One row per point: organisms with documented association per domain and the literal evidence of
// the strongest (highest bibliographic score, then most reads) organism. No text is inferred.
function alertsByPoint(rows: SourcePreviewRow[]): SourcePreviewRow[] {
  const groups = new Map<string, SourcePreviewRow[]>();
  for (const row of rows) { const key = String(siaCode(row["Cód. SIA"])); groups.set(key, [...(groups.get(key) ?? []), row]); }
  return [...groups].map(([sia, items]) => {
    const organisms = (domain?: string) => new Set(items.filter((row) => !domain || row["Evidência: Domínio"] === domain).map((row) => `${row["Conjunto analisado"]}|${row["Espécie"]}`)).size;
    const lead = items.map((row, index) => ({ row, index })).sort((a, b) => Number(b.row["Evidência: Score bibliográfico"]) - Number(a.row["Evidência: Score bibliográfico"]) || Number(b.row["Número de Reads"] ?? 0) - Number(a.row["Número de Reads"] ?? 0) || a.index - b.index)[0].row;
    return { "Cód. SIA": sia, "Município": items[0]["Município"] ?? null, "Manancial / Corpo Hídrico": items[0]["Manancial / Corpo Hídrico"] ?? null,
      "Organismos com associação": organisms(), "Ambiental": organisms("Ambiental"), "Operacional": organisms("Operacional"), "Saúde humana": organisms("Saúde humana"),
      "Maior score bibliográfico": lead["Evidência: Score bibliográfico"] ?? null, "Organismo em destaque": lead["Espécie"] ?? null, "Conjunto do destaque": lead["Conjunto analisado"] ?? null,
      "Reads do destaque": lead["Número de Reads"] ?? null, "Efeito documentado": lead["Evidência: Efeito ou mecanismo documentado"] ?? null, "Toxina ou composto": lead["Evidência: Toxina ou composto"] ?? null };
  });
}

function siaCode(value: unknown) { return typeof value === "number" && Number.isSafeInteger(value) ? `SIA-${String(value).padStart(4, "0")}` : value; }
export function tableRows(sheet: ResultsWorkbookExportModel["sheets"][number], headerIndex: number) {
  const columns = sheet.rows[headerIndex].map((cell) => String(cell ?? ""));
  const rows = sheet.rows.slice(headerIndex + 1).flatMap((row, index) => row.some((cell) => cell !== null && cell !== "") ? [{
    ...Object.fromEntries(columns.flatMap((column, i) => column ? [[column, row[i] instanceof Date ? row[i].toISOString() : row[i] ?? null]] : [])),
    _sourceRow: headerIndex + index + 2,
  } as SourcePreviewRow] : []);
  return { columns: [...columns, "_sourceRow"], rows };
}
function setCode(value: unknown) {
  const label = String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return ({ bacterias: "bacteria", cianobacterias: "cyanobacteria", coi: "coi" } as Record<string, string>)[label] ?? "";
}
