export const RESULTS_SCHEMA_VERSION = "yvae-results/1.0";

export const RESULTS_WORKSHEETS = {
  instructions: "Instruções",
  dictionary: "Dicionário",
  molecular: "Banco_consolidado",
  ranking: "Ranking_score_pontos",
  dashboard: "Dashboard_publicado",
} as const;

export const RESULTS_INSTRUCTION_HEADERS = ["Chave", "Valor"] as const;
export const RESULTS_DICTIONARY_HEADERS = [
  "Aba",
  "Coluna",
  "Campo canônico",
  "Tipo",
  "Unidade",
  "Obrigatoriedade",
  "Validação",
  "Uso",
] as const;

export const RESULTS_DASHBOARD_HEADERS = [
  "Seção",
  "Payload JSON",
  "Origem metodológica",
  "Versão metodológica",
] as const;

export const RESULTS_DASHBOARD_SECTIONS = [
  "meta",
  "points",
  "ptaxa",
  "municipios",
  "top_ciano",
  "top_bact",
  "top_coi",
  "freq_ciano",
  "freq_bact",
  "freq_coi",
  "tox",
  "odor",
  "invasores",
  "heat_ciano",
  "heat_bact",
  "heat_coi",
  "coi_all",
  "coi_groups",
  "alerts",
] as const;

export type ResultsFieldDefinition = {
  key: string;
  header: string;
  type: "text" | "identifier" | "date" | "integer" | "decimal" | "coordinate" | "enum";
  unit: string;
  requirement: "required" | "conditional" | "optional";
  validation: string;
  usage: string;
};

export const RESULTS_INSTRUCTION_FIELDS = [
  { key: "schema_version", label: "Versão do schema", validation: RESULTS_SCHEMA_VERSION },
  { key: "campaign_id", label: "ID da campanha", validation: "2–80 caracteres: letras, números, ponto, hífen ou sublinhado" },
  { key: "campaign_number", label: "Número da campanha", validation: "inteiro positivo" },
  { key: "campaign_title", label: "Título da campanha", validation: "texto não vazio" },
  { key: "publication_status", label: "Estado da publicação", validation: "draft ou published" },
  { key: "methodology_origin", label: "Origem metodológica", validation: "texto não vazio" },
  { key: "methodology_version", label: "Versão metodológica", validation: "texto não vazio" },
] as const;

export const RESULTS_MOLECULAR_FIELDS = [
  field("sampleId", "Identificação da amostra", "identifier", "—", "required", "texto não vazio; zeros à esquerda preservados", "chave da amostra e vínculo com ranking"),
  field("siaId", "Cód. SIA", "identifier", "—", "required", "texto não vazio; zeros à esquerda preservados", "identificação do ponto SIA"),
  field("sampleDate", "Data", "date", "YYYY-MM-DD", "required", "data civil válida", "data de coleta"),
  field("waterBody", "Manancial / Corpo Hídrico", "text", "—", "required", "texto não vazio", "identificação do manancial"),
  field("municipality", "Município", "text", "—", "required", "texto não vazio", "filtro e agrupamento territorial"),
  field("originalLatitude", "Latitude original", "coordinate", "graus decimais", "conditional", "-90 a 90; par completo com longitude", "coordenada informada em campo"),
  field("originalLongitude", "Longitude original", "coordinate", "graus decimais", "conditional", "-180 a 180; par completo com latitude", "coordenada informada em campo"),
  field("effectiveLatitude", "Latitude efetiva", "coordinate", "graus decimais", "conditional", "-90 a 90; par completo com longitude", "coordenada efetiva de coleta"),
  field("effectiveLongitude", "Longitude efetiva", "coordinate", "graus decimais", "conditional", "-180 a 180; par completo com latitude", "coordenada efetiva de coleta"),
  field("accessibility", "Acessibilidade do Ponto", "text", "—", "optional", "texto", "metadado de campo"),
  field("turbidity", "Turbidez", "text", "—", "optional", "valor bruto preservado", "metadado de campo"),
  field("description", "Descrição", "text", "—", "optional", "texto", "observação de campo"),
  field("weatherConditions", "Condições climáticas", "text", "—", "optional", "valor bruto preservado", "metadado de campo"),
  field("marker", "Marcador", "enum", "—", "required", "16S ou COI", "segmentação molecular"),
  field("analyzedSet", "Conjunto analisado", "enum", "—", "required", "Cianobactérias, Bactérias ou COI", "segmentação analítica"),
  field("taxon", "Espécie", "text", "—", "required", "rótulo taxonômico bruto não vazio", "táxon detectado"),
  field("taxonomicGroup", "Grupo taxonômico", "text", "—", "conditional", "grupo explícito; obrigatório para agregação por grupo", "grupo importado; nunca inferido"),
  field("attentionTags", "Tags de atenção", "enum", "—", "optional", "lista separada por ponto e vírgula: TOX, ODOR, INV", "associações explícitas; nunca inferidas"),
  field("associationNote", "Nota de associação", "text", "—", "conditional", "texto de origem da associação", "justificativa explícita de TOX/ODOR/INV"),
  field("invasiveExotic", "Exótico/invasor", "enum", "—", "conditional", "Sim, Não ou vazio", "sinal explícito; nunca inferido pelo nome"),
  field("reads", "Número de Reads", "integer", "reads", "required", "inteiro maior ou igual a zero", "contagem importada; sem inferência"),
  field("readsPercent", "% Reads", "decimal", "% por amostra e marcador", "required", "0 a 100", "percentual importado; sem recálculo"),
] as const satisfies readonly ResultsFieldDefinition[];

export const RESULTS_RANKING_FIELDS = [
  field("position", "Posição", "integer", "ordem", "optional", "inteiro positivo", "ordenação importada"),
  field("sampleId", "Amostra", "identifier", "—", "required", "deve existir no Banco_consolidado", "vínculo por amostra"),
  field("pointName", "Ponto de coleta", "text", "—", "required", "texto não vazio", "identificação do ponto"),
  field("waterBody", "Manancial/corpo hídrico", "text", "—", "required", "texto não vazio", "identificação do manancial"),
  field("municipality", "Município", "text", "—", "required", "texto não vazio", "filtro territorial"),
  field("campaignDate", "Campanha/Data", "text", "—", "required", "texto não vazio", "rótulo importado da campanha/data"),
  field("turbidity", "Turbidez", "text", "—", "optional", "valor bruto preservado", "metadado de campo"),
  field("weatherCondition", "Condição climática", "text", "—", "optional", "valor bruto preservado", "metadado de campo"),
  field("mainOrganisms", "Principais organismos", "text", "—", "optional", "texto", "síntese importada"),
  field("mainDrivers", "Principais drivers de risco", "text", "—", "optional", "texto", "drivers importados"),
  field("environmentalRisk", "Risco ambiental", "enum", "—", "optional", "Baixo, Baixo a moderado, Moderado ou Alto", "componente importado"),
  field("operationalRisk", "Risco operacional", "enum", "—", "optional", "Baixo, Baixo a moderado, Moderado ou Alto", "componente importado"),
  field("sanitaryRisk", "Risco sanitário", "enum", "—", "optional", "Baixo, Baixo a moderado, Moderado ou Alto", "componente importado"),
  field("classification", "Classificação integrada", "enum", "—", "conditional", "vazia ou Baixo, Baixo a moderado, Moderado ou Alto; exige score e metodologia", "resultado integrado importado"),
  field("score", "Score integrado", "decimal", "0–1", "conditional", "0 a 1; exige classificação e metodologia", "resultado integrado importado"),
  field("cianoReads", "Ciano reads", "integer", "reads", "optional", "inteiro maior ou igual a zero", "total importado"),
  field("cianoPriorityPercent", "Ciano prioritárias %", "decimal", "%", "optional", "0 a 100", "percentual importado"),
  field("sanitaryBacteriaReads", "Bact. sanitárias reads", "integer", "reads", "optional", "inteiro maior ou igual a zero", "total importado"),
  field("sanitaryBacteriaPercent", "Bact. sanitárias %", "decimal", "%", "optional", "0 a 100", "percentual importado"),
  field("invasiveCoiReads", "COI invasores reads", "integer", "reads", "optional", "inteiro maior ou igual a zero", "total importado"),
  field("technicalJustification", "Justificativa técnica", "text", "—", "conditional", "obrigatória quando há resultado integrado", "justificativa importada"),
  field("confidence", "Nível de confiança", "enum", "—", "conditional", "Baixa, Média ou Alta quando há resultado integrado", "confiança importada"),
  field("recommendations", "Recomendações", "text", "—", "conditional", "obrigatória quando há resultado integrado", "recomendação importada"),
  field("invasiveCoiPercent", "COI invasores % calculado", "decimal", "%", "optional", "0 a 100", "percentual importado; nenhum cálculo no Yva'e"),
  field("alert", "Alerta", "enum", "—", "required", "Sim ou Não", "alerta explícito; nenhum limiar inferido"),
  field("alertTags", "Tags do alerta", "enum", "—", "conditional", "lista separada por ponto e vírgula: TOX, ODOR, INV", "semântica explícita do alerta"),
  field("alertReasons", "Motivos do alerta", "text", "—", "conditional", "obrigatório quando Alerta=Sim", "motivos explícitos separados por ponto e vírgula"),
] as const satisfies readonly ResultsFieldDefinition[];

export type ResultsWorkbookMetadata = {
  schemaVersion: typeof RESULTS_SCHEMA_VERSION;
  campaignId: string;
  campaignNumber: number;
  campaignTitle: string;
  publicationStatus: "draft" | "published";
  methodology: ResultsMethodology;
};

export type ResultsMethodology = { origin: string; version: string };

export type MolecularResultRow = {
  sampleId: string;
  siaId: string;
  sampleDate: string;
  waterBody: string;
  municipality: string;
  originalLatitude: number | null;
  originalLongitude: number | null;
  effectiveLatitude: number | null;
  effectiveLongitude: number | null;
  accessibility: string;
  turbidity: string;
  description: string;
  weatherConditions: string;
  marker: "16S" | "COI";
  analyzedSet: "Cianobactérias" | "Bactérias" | "COI";
  taxon: string;
  taxonomicGroup: string;
  attentionTags: Array<"TOX" | "ODOR" | "INV">;
  associationNote: string;
  invasiveExotic: boolean | null;
  reads: number;
  readsPercent: number;
};

export type RankingResultRow = {
  position: number | null;
  sampleId: string;
  pointName: string;
  waterBody: string;
  municipality: string;
  campaignDate: string;
  turbidity: string;
  weatherCondition: string;
  mainOrganisms: string;
  mainDrivers: string;
  environmentalRisk: string;
  operationalRisk: string;
  sanitaryRisk: string;
  classification: string | null;
  score: number | null;
  cianoReads: number | null;
  cianoPriorityPercent: number | null;
  sanitaryBacteriaReads: number | null;
  sanitaryBacteriaPercent: number | null;
  invasiveCoiReads: number | null;
  technicalJustification: string;
  confidence: string;
  recommendations: string;
  invasiveCoiPercent: number | null;
  alert: boolean;
  alertTags: Array<"TOX" | "ODOR" | "INV">;
  alertReasons: string[];
};

export type ResultsViewModel = {
  meta: {
    campanha: string | number;
    amostras: number;
    municipios: number;
    mananciais: number;
    especies: number;
    linhas: number;
    reads_total: number;
    reads_ciano: number;
    reads_bact: number;
    reads_coi: number;
    coi_amostras: number;
    coi_taxa: number;
    classes: Record<string, number>;
    score_min: number | null;
    score_max: number | null;
    score_med: number | null;
  };
  points: Array<{
    pos: number;
    amostra: number;
    ponto: string;
    municipio: string;
    manancial: string;
    lat: number;
    lon: number;
    sia: number | string;
    score: number | null;
    classe: string | null;
    confianca: string;
    turbidez: string;
    clima: string;
    organismos: string;
    drivers: string;
    r_amb: string;
    r_op: string;
    r_san: string;
    just: string;
    rec: string;
    ciano_reads: number;
    ciano_pct: number;
    bact_reads: number;
    bact_pct: number;
    coi_inv_reads: number;
    tox_reads: number;
    odor_reads: number;
    inv_reads: number;
  }>;
  ptaxa: Record<string, {
    ciano: ResultsDashboardTaxon[];
    bact: ResultsDashboardTaxon[];
    coi: ResultsDashboardTaxon[];
  }>;
  municipios: Array<{ municipio: string; n: number; score_max: number | null; score_med: number | null }>;
  top_ciano: ResultsDashboardTaxonSummary[];
  top_bact: ResultsDashboardTaxonSummary[];
  top_coi: ResultsDashboardTaxonSummary[];
  freq_ciano: ResultsDashboardFrequency[];
  freq_bact: ResultsDashboardFrequency[];
  freq_coi: ResultsDashboardFrequency[];
  tox: ResultsDashboardFlaggedTaxon[];
  odor: ResultsDashboardFlaggedTaxon[];
  invasores: ResultsDashboardFlaggedTaxon[];
  heat_ciano: ResultsDashboardHeatmap;
  heat_bact: ResultsDashboardHeatmap;
  heat_coi: ResultsDashboardHeatmap;
  coi_all: Array<{ sp: string; reads: number; amostras: number; grupo: string; inv: string }>;
  coi_groups: Array<{ grupo: string; reads: number; taxa: number; amostras: number }>;
  alerts: Array<{
    pos: number;
    amostra: number;
    ponto: string;
    municipio: string;
    score: number | null;
    classe: string | null;
    tags: string[];
    reasons: string[];
  }>;
};

export type ResultsDashboardTaxon = { sp: string; reads: number; pct: number };
export type ResultsDashboardTaxonSummary = { sp: string; reads: number; amostras: number; pctmax: number };
export type ResultsDashboardFrequency = { sp: string; amostras: number; reads: number };
export type ResultsDashboardFlaggedTaxon = ResultsDashboardFrequency & { nota: string };
export type ResultsDashboardHeatmap = {
  taxa: string[];
  rows: Array<{ amostra: number; ponto: string; score: number | null; vals: number[] }>;
};

export type ResultsPublication = {
  campaignId: string;
  campaignNumber: number;
  campaignTitle: string;
  importedAt: string;
  schemaVersion: typeof RESULTS_SCHEMA_VERSION;
  fileName: string;
  methodology: ResultsMethodology;
  molecularRows: MolecularResultRow[];
  rankingRows: RankingResultRow[];
  viewModel: ResultsViewModel;
};

export type ResultsPublicationResponse =
  | { status: "published"; publication: ResultsPublication; viewModel: ResultsViewModel }
  | { status: "empty"; publication: null; viewModel: null };

export function isResultsPublication(value: unknown): value is ResultsPublication {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ResultsPublication>;
  return candidate.schemaVersion === RESULTS_SCHEMA_VERSION &&
    typeof candidate.campaignId === "string" &&
    Number.isInteger(candidate.campaignNumber) &&
    typeof candidate.importedAt === "string" &&
    Array.isArray(candidate.molecularRows) &&
    Array.isArray(candidate.rankingRows) &&
    isResultsViewModel(candidate.viewModel);
}

export function isResultsViewModel(value: unknown): value is ResultsViewModel {
  if (!value || typeof value !== "object") return false;
  const model = value as Partial<ResultsViewModel>;
  if (!model.meta || typeof model.meta !== "object") return false;
  if (!RESULTS_DASHBOARD_SECTIONS.every((section) => section in model)) return false;
  const meta = model.meta as Record<string, unknown>;
  const metaCounts = ["amostras", "municipios", "mananciais", "especies", "linhas", "reads_total", "reads_ciano", "reads_bact", "reads_coi", "coi_amostras", "coi_taxa"];
  if (!(isText(meta.campanha) || isFiniteNumber(meta.campanha)) || !metaCounts.every((key) => isFiniteNumber(meta[key])) ||
    !nullableNumber(meta.score_min) || !nullableNumber(meta.score_max) || !nullableNumber(meta.score_med) ||
    !isRecord(meta.classes) || !Object.values(meta.classes).every(isFiniteNumber)) return false;
  if (!Array.isArray(model.points) || !model.points.every(isDashboardPoint)) return false;
  if (!model.ptaxa || typeof model.ptaxa !== "object") return false;
  if (!Object.values(model.ptaxa).every((value) =>
    value && [value.ciano, value.bact, value.coi].every((rows) =>
      Array.isArray(rows) && rows.every(isDashboardTaxon)))) return false;
  if (!Array.isArray(model.alerts) || !model.alerts.every((alert) =>
    isRecord(alert) && isFiniteNumber(alert.pos) && isFiniteNumber(alert.amostra) &&
    isText(alert.ponto) && isText(alert.municipio) && nullableNumber(alert.score) &&
    nullableText(alert.classe) && stringArray(alert.tags) && stringArray(alert.reasons))) return false;
  if (!Array.isArray(model.coi_all) || !model.coi_all.every((row) =>
    isRecord(row) && isText(row.sp) && isFiniteNumber(row.reads) && isFiniteNumber(row.amostras) &&
    isText(row.grupo) && typeof row.inv === "string")) return false;
  if (!Array.isArray(model.municipios) || !model.municipios.every((row) =>
    isRecord(row) && isText(row.municipio) && isFiniteNumber(row.n) &&
    nullableNumber(row.score_max) && nullableNumber(row.score_med))) return false;
  if (![model.top_ciano, model.top_bact, model.top_coi].every((rows) =>
    Array.isArray(rows) && rows.every(isTaxonSummary))) return false;
  if (![model.freq_ciano, model.freq_bact, model.freq_coi].every((rows) =>
    Array.isArray(rows) && rows.every(isFrequency))) return false;
  if (![model.tox, model.odor, model.invasores].every((rows) =>
    Array.isArray(rows) && rows.every((row) => isFrequency(row) && isText(row.nota)))) return false;
  if (!Array.isArray(model.coi_groups) || !model.coi_groups.every((row) =>
    isRecord(row) && isText(row.grupo) && isFiniteNumber(row.reads) &&
    isFiniteNumber(row.taxa) && isFiniteNumber(row.amostras))) return false;
  return [model.heat_ciano, model.heat_bact, model.heat_coi].every(isHeatmap);
}

function field(
  key: string,
  header: string,
  type: ResultsFieldDefinition["type"],
  unit: string,
  requirement: ResultsFieldDefinition["requirement"],
  validation: string,
  usage: string,
): ResultsFieldDefinition {
  return { key, header, type, unit, requirement, validation, usage };
}

function isDashboardPoint(value: unknown) {
  if (!isRecord(value)) return false;
  const numeric = ["pos", "amostra", "lat", "lon", "ciano_reads", "ciano_pct", "bact_reads", "bact_pct", "coi_inv_reads", "tox_reads", "odor_reads", "inv_reads"];
  const textual = ["ponto", "municipio", "manancial", "confianca", "turbidez", "clima", "organismos", "drivers", "r_amb", "r_op", "r_san", "just", "rec"];
  return numeric.every((key) => isFiniteNumber(value[key])) && (isFiniteNumber(value.sia) || isText(value.sia)) && textual.every((key) => typeof value[key] === "string") &&
    nullableNumber(value.score) && nullableText(value.classe);
}

function isDashboardTaxon(value: unknown) {
  return isRecord(value) && isText(value.sp) && isFiniteNumber(value.reads) && isFiniteNumber(value.pct);
}

function isTaxonSummary(value: unknown) {
  return isRecord(value) && isText(value.sp) && isFiniteNumber(value.reads) &&
    isFiniteNumber(value.amostras) && isFiniteNumber(value.pctmax);
}

function isFrequency(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && isText(value.sp) && isFiniteNumber(value.amostras) && isFiniteNumber(value.reads);
}

function isHeatmap(value: unknown) {
  if (!isRecord(value) || !stringArray(value.taxa) || !Array.isArray(value.rows)) return false;
  const taxa = value.taxa;
  return value.rows.every((row) =>
    isRecord(row) && isFiniteNumber(row.amostra) && isText(row.ponto) && nullableNumber(row.score) &&
    Array.isArray(row.vals) && row.vals.length === taxa.length && row.vals.every(isFiniteNumber));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function nullableText(value: unknown) {
  return value === null || isText(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function nullableNumber(value: unknown) {
  return value === null || isFiniteNumber(value);
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
