import { componentLabels as catalogComponentLabels } from "./effect-catalog";
import "server-only";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatCaptureIndex, formatCaptureShare } from "./format";
import { distribution } from "./distribution";
import { captureRiskProfiles } from "./risk-profiles";

/** Índice de triagem de risco da biota na captação, metodologia 3.0 (IR-CAPTACAO-3.0).
 * As leituras e fichas vêm de `indice-captacao.json`; as notas, de `pontos-0.8.json`.
 * Painel e exportações consomem a MESMA visão: os textos são formatados uma única vez, aqui. */
export const captureDomains = ["Ambiental", "Operacional", "Saúde humana"] as const;
export const captureDomainLabels: Record<Domain, string> = {
  Ambiental: "Danos físicos e ambientais", Operacional: "Riscos operacionais", "Saúde humana": "Perigo potencial à saúde, na captação" };
export const captureComponents = ["16S", "ALGAS", "COI"] as const;

const componentLabels: Record<string,string> = catalogComponentLabels;
type Domain = (typeof captureDomains)[number];
type ComponentName = (typeof captureComponents)[number];
type Contribution = { taxon: string; rank: string; reads: number; gravidade: number; aplicabilidade: number; ficha: string; fonte: string; q: number; component: string; base?: number };
type Score = { score: number; floor: number; ceiling: number; component: string | null; evaluated: number; evaluatedByComponent?: Record<string, number | null>; confidence: "A" | "B" | "C"; contributions: Contribution[] };
type Alert = { dominio: Domain | ""; taxon: string; reads: number; gravidade: number | null; aplicabilidade: number | null; ficha: string; motivo: string; componente: string;
  participacao?: number; referencia?: number; vezes?: number };
type ComponentState = { status: string; run: string; observedReads: number; validReads: number; identifiedReads: number };
export type CaptureIndexRow = { campaign: number; sia: string; general: number | null; generalFloor: number | null; generalCeiling: number | null;
  estimate?: "estimado" | "sem estimativa" | "sem medição"; predominant: Domain | null; elevated: number; generalRms: number | null; rank: number | null; ranked: number; band: string | null; components: Record<ComponentName, ComponentState>;
  scores: Record<Domain, Score | null>; alerts: Alert[]; descriptors: { run16S: string; chloroplastShare: number | null; cyanobacteriaShare: number | null; diatomShare: number | null; chloroplastNamedShare: number | null; coiExcludedReads: number; coiReassignedReads: number; exotics: { species: string; reads: number }[] } };
type CampaignSummary = { pontos: number; medidos: number; media: number | null; mediana: number | null; p90: number | null; faixas: Record<string, number>; dominios?: Record<Domain, number> };
type Ficha = { taxon: string; level: string; domain: string; code: string; severity: number | null; applicability: number | null; contested: boolean; source: string; rationale: string };
type CaptureIndexDocument = { schema: string; version: string; status: string; parameters: Record<string, unknown>; inputs: Record<string, string>;
  fichasTotal: number; blindSpots: { tema: string; caso: string; situacao: string }[]; maturity: Record<Domain, { nivel: string; texto: string }>; campaigns: Record<string, CampaignSummary>; fichas: Record<string, Ficha>;
  rowsSha256: string; rows: CaptureIndexRow[] };

// Read the canonical decimal literals directly: the dev bundler's JSON module
// can change the last IEEE-754 bit before either the API or Excel sees a score.
const read = (name: string) => readFileSync(join(process.cwd(), "src/lib/capture-index", name), "utf8");
const data = JSON.parse(read("indice-captacao.json")) as CaptureIndexDocument;
if (data.schema !== "yvae-capture-index/4") throw new Error(`Esquema de índice não suportado: ${data.schema}`);

/** Metodologia 3.0: as notas por campanha + SIA vêm de `pontos-0.8.json` (scripts/indice-08/gerar_pontos_08.py),
 * calculadas pelo núcleo `results-08-core.ts` e conferidas contra a fonte agregada oficial. O arquivo-base fornece
 * apenas as leituras, fichas e alertas de cada observação; nenhuma nota 0.7 é exibida, exportada ou usada em reserva. */
type Point08 = { campaign: number; sia: string; geral: number | null; ambiental: number | null; operacional: number | null; saude: number | null };
const pointsText = read("pontos-0.8.json");
const points08 = JSON.parse(pointsText) as { schema: string; version: string; policy: string; rows: Point08[] };
if (points08.schema !== "yvae-capture-index-08/1" || points08.version !== "0.8") throw new Error("Notas do método 3.0 por ponto incompatíveis.");
const unit = (value: unknown): value is number | null => value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1);
const pointKey = (campaign: number, sia: string) => `${campaign}|${sia}`;
const byPoint = new Map<string, Point08>();
for (const point of points08.rows) {
  const key = pointKey(point.campaign, point.sia);
  if (byPoint.has(key) || ![point.geral, point.ambiental, point.operacional, point.saude].every(unit)) throw new Error("Nota do método 3.0 duplicada ou inválida.");
  byPoint.set(key, point);
}
if (byPoint.size !== data.rows.length) throw new Error("Notas do método 3.0 não cobrem exatamente as observações do índice.");
const field08 = { Ambiental: "ambiental", Operacional: "operacional", "Saúde humana": "saude" } as const;
export const CAPTURE_BANDS = ["< 0,05", "0,05 a 0,15", "0,15 a 0,35", "0,35 a 0,70", ">= 0,70"] as const;
const bandOf = (value: number) => CAPTURE_BANDS[[0.05, 0.15, 0.35, 0.7].filter(limit => value >= limit).length];
for (const row of data.rows) {
  // Campanha e SIA formam a chave: uma nota nunca é emprestada de outra campanha.
  const point = byPoint.get(pointKey(row.campaign, row.sia));
  if (!point) throw new Error(`Observação C${row.campaign} · SIA ${row.sia} sem nota do método 3.0.`);
  const libraries = captureComponents.some(name => row.components[name]?.status === "disponível");
  for (const domain of captureDomains) {
    const value = point[field08[domain]], score = row.scores[domain];
    if (value === null) row.scores[domain] = null;
    else if (score) score.score = value;
    else throw new Error(`Categoria sem leitura de origem em C${row.campaign} · SIA ${row.sia}.`);
  }
  row.general = point.geral;
  row.estimate = point.geral !== null ? "estimado" : libraries ? "sem estimativa" : "sem medição";
  // Piso, teto e média quadrática pertenciam ao índice anterior e não são publicados no método 3.0.
  row.generalFloor = row.generalCeiling = row.generalRms = null;
  const scored = captureDomains.map(domain => ({ domain, value: row.scores[domain]?.score ?? null })).filter((item): item is { domain: Domain; value: number } => item.value !== null);
  const top = scored.reduce<{ domain: Domain; value: number } | null>((best, item) => !best || item.value > best.value ? item : best, null);
  row.predominant = point.geral !== null && top && top.value > 0 ? top.domain : null;
  row.elevated = scored.filter(item => item.value >= 0.15).length;
  row.band = point.geral === null ? null : bandOf(point.geral);
}
const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
for (const code of Object.keys(data.campaigns)) {
  // Cada campanha é ordenada e resumida somente com as suas próprias observações.
  const rows = data.rows.filter(row => row.campaign === Number(code));
  const estimated = rows.filter(row => row.general !== null).sort((a, b) => b.general! - a.general! || Number(a.sia) - Number(b.sia));
  for (const row of rows) { row.rank = null; row.ranked = estimated.length; }
  estimated.forEach((row, index) => { row.rank = index + 1; });
  const values = estimated.map(row => row.general!).sort((a, b) => a - b);
  data.campaigns[code] = { pontos: rows.length, medidos: estimated.length, media: mean(values),
    mediana: values[Math.ceil(0.5 * values.length) - 1] ?? null, p90: values[Math.ceil(0.9 * values.length) - 1] ?? null,
    faixas: Object.fromEntries(CAPTURE_BANDS.map(band => [band, estimated.filter(row => row.band === band).length])),
    dominios: Object.fromEntries(captureDomains.map(domain => [domain, mean(rows.flatMap(row => row.scores[domain] ? [row.scores[domain]!.score] : []))])) as Record<Domain, number> };
}
data.version = "IR-CAPTACAO-3.0";
data.status = "metodologia 3.0 (sinal documentado); notas por campanha e SIA, sem mistura entre campanhas";
data.parameters = { ...data.parameters, bands: [0.05, 0.15, 0.35, 0.7],
  aggregation: "índice geral do método 3.0 = maior das três notas, reforçada por dano distinto e documentado das outras categorias; nota da categoria = marcador vencedor" };
data.rowsSha256 = createHash("sha256").update(pointsText, "utf8").digest("hex");
export const captureIndexMeta = { schema: data.schema, version: data.version, status: data.status, parameters: data.parameters, inputs: data.inputs,
  fichasTotal: data.fichasTotal, rowsSha256: data.rowsSha256, blindSpots: data.blindSpots,
  maturity: captureDomains.map(domain => ({ label: captureDomainLabels[domain], level: data.maturity[domain].nivel, text: data.maturity[domain].texto })) };

export function captureIndexRows(campaign?: number): CaptureIndexRow[] {
  return campaign === undefined ? data.rows : data.rows.filter(row => row.campaign === campaign);
}

const runLabel = (run: string) => run ? run.replace(/^C\d_/, "") : "sem biblioteca";
const confidenceLabel = { A: "A, metade ou mais dos reads avaliados", B: "B, de 20% a 50% dos reads avaliados", C: "C, menos de 20% dos reads avaliados" } as const;
const alertReason = (alert: Alert) => alert.motivo === "baixo suporte" ? "ocorrência de baixo suporte: atenção, sem elevar a nota"
  : alert.motivo === "dominância anômala" ? `dominância fora do padrão: ${formatCaptureShare(alert.participacao)} dos reads de ${componentLabels[alert.componente] ?? alert.componente}, ${Math.round(alert.vezes ?? 0).toLocaleString("pt-BR")} vezes a referência do próprio organismo na rede (${formatCaptureShare(alert.referencia)}); proporção de reads não mede quantidade, por isso não entra na nota`
  : alert.motivo === "qualidade da amostra" ? `possível problema na amostra: ${formatCaptureShare(alert.participacao)} de Escherichia-Shigella sem as bactérias de intestino que acompanham esgoto (${formatCaptureShare(alert.referencia)}); pode ser crescimento no transporte ou armazenamento; conferir com o laboratório`
  : alert.motivo === "sinal exploratório" ? `diatomáceas em ${formatCaptureShare(alert.participacao)} do 16S, acima da base da rede (${formatCaptureShare(alert.referencia)}); leitura exploratória pelo cloroplasto, que os marcadores não permitem monitorar; não entra na nota`
  : "medição contestada: aguarda conferência do laboratório";
const applicabilityLabel = (value: number | null) => value === null ? "indeterminada" : value === 1 ? "todo o táxon (1)" : value === 0.5 ? "parte substancial (0,5)" : value === 0.1 ? "minoria (0,1)" : "sem efeito sustentado (0)";

export type CaptureIndexView = ReturnType<typeof captureIndexView>;
/** Visão única por ponto e campanha. Zero só aparece como "0,00" quando é zero calculado; sem biblioteca, "sem medição". */
export function captureIndexView(row: CaptureIndexRow) {
  const measured = row.general !== null;
  // Três estados distintos: nota (inclusive zero), sem estimativa (há biblioteca, a nota não pode ser afirmada) e sem medição.
  const state = measured ? "estimado" : row.estimate === "sem estimativa" ? "sem estimativa" : "sem medição";
  const noEstimate = state === "sem estimativa";
  const coi = row.components.COI;
  const s16 = row.components["16S"];
  // Diz o que foi efetivamente medido: os dois marcadores, só um deles, ou nenhum.
  const coverage = !measured && !noEstimate ? "sem medição"
    : s16.status === "disponível" && coi.status === "disponível" ? "16S e COI"
    : s16.status === "disponível" ? `só 16S (COI ${coi.status})`
    : coi.status === "disponível" ? `só COI (16S ${s16.status})` : "sem medição";
  return {
    campaign: `C${row.campaign}`, sia: row.sia, measured, state,
    // Perfis de risco biológico da captação (operacional e sanitário), desta campanha e deste SIA.
    profiles: captureRiskProfiles(row),
    // Numeric source values for workbook consumers; no display rounding or recalculation.
    exact: { general: row.general, domains: Object.fromEntries(captureDomains.map(domain => [domain, row.scores[domain]?.score ?? null])) },
    general: noEstimate ? "sem estimativa" : formatCaptureIndex(row.general),
    position: measured && row.rank ? `${row.rank}º de ${row.ranked}` : "",
    band: row.band ?? "",
    predominant: row.predominant ? captureDomainLabels[row.predominant] : measured ? "nenhuma contribuição pontuada" : "",
    coverage,
    elevated: !measured ? "" : row.elevated === 0 ? "nenhuma categoria na faixa de referência (0,15)" : `${row.elevated} de 3 categorias na faixa de referência (0,15)`,
    domains: captureDomains.map(domain => {
      const score = row.scores[domain];
      // O principal é o maior contribuinte DENTRO do marcador que determinou a nota, não o maior entre todos os marcadores.
      const main = score?.contributions.find(item => item.component === score.component) ?? score?.contributions[0];
      return {
        key: domain, label: captureDomainLabels[domain], maturity: data.maturity[domain].nivel,
        score: !score && state !== "sem medição" ? "sem estimativa" : formatCaptureIndex(score?.score),
        confidence: score ? confidenceLabel[score.confidence] : "", confidenceGrade: score?.confidence ?? "", evaluated: score ? formatCaptureShare(score.evaluated) : "",
        evaluatedBy: score?.evaluatedByComponent ? Object.entries(score.evaluatedByComponent).map(([name, value]) => `${componentLabels[name] ?? name} ${formatCaptureShare(value)}`).join(" · ") : "",
        componentCode: score?.component ?? null, component: score?.component ? componentLabels[score.component] : "",
        main: main ? `${main.taxon}: ${main.reads.toLocaleString("pt-BR")} reads, gravidade ${main.gravidade}, aplicabilidade ${applicabilityLabel(main.aplicabilidade)}` : score ? "nenhum organismo com ficha pontuada" : "",
        contributions: (score?.contributions ?? []).map(item => ({ positive: item.q > 0, componentCode: item.component, taxon: item.taxon, reads: item.reads.toLocaleString("pt-BR"), component: componentLabels[item.component] ?? item.component,
          severity: String(item.gravidade), applicability: applicabilityLabel(item.aplicabilidade), ficha: item.ficha, source: item.fonte, rationale: data.fichas[item.ficha]?.rationale ?? "" })),
      };
    }),
    components: captureComponents.map(name => ({ name: componentLabels[name], status: row.components[name].status, run: runLabel(row.components[name].run),
      observedReads: row.components[name].observedReads.toLocaleString("pt-BR"), validReads: row.components[name].validReads.toLocaleString("pt-BR") })),
    chloroplast: formatCaptureShare(row.descriptors.chloroplastShare), cyanobacteria: formatCaptureShare(row.descriptors.cyanobacteriaShare), diatoms: formatCaptureShare(row.descriptors.diatomShare),
    coiExcluded: row.descriptors.coiExcludedReads ? `${row.descriptors.coiExcludedReads.toLocaleString("pt-BR")} reads de organismos marinhos retirados do COI` : "",
    exotics: row.descriptors.exotics.map(item => `${item.species} (${item.reads.toLocaleString("pt-BR")} reads)`).join(", "),
    dominance: row.alerts.filter(alert => alert.motivo === "dominância anômala").map(alert => `${alert.taxon} ${formatCaptureShare(alert.participacao)}`).join(", "),
    alerts: row.alerts.map(alert => ({ domain: alert.dominio ? captureDomainLabels[alert.dominio] : "", taxon: alert.taxon, reads: alert.reads.toLocaleString("pt-BR"),
      domainCode: alert.dominio, componentCode: alert.componente, lowSupport: alert.motivo === "baixo suporte", reason: alertReason(alert), ficha: alert.ficha })),
  };
}

export function captureIndexCampaigns() {
  return Object.entries(data.campaigns).map(([code, summary]) => {
    const stats = distribution(captureIndexRows(Number(code)).map(row => row.general));
    return {
    campaign: `C${code}`, number: Number(code), points: summary.pontos, measured: stats.count,
    mean: formatCaptureIndex(summary.media), median: formatCaptureIndex(stats.median), p90: formatCaptureIndex(stats.p90),
    bands: Object.entries(summary.faixas).sort(([a], [b]) => bandOrder(a) - bandOrder(b)).map(([band, count]) => ({ band, count })),
    domains: captureDomains.map(domain => ({ label: captureDomainLabels[domain], mean: formatCaptureIndex(summary.dominios?.[domain]) })),
    };
  });
}
const bandOrder = (band: string) => CAPTURE_BANDS.indexOf(band as typeof CAPTURE_BANDS[number]);

const row_excluded = (view: CaptureIndexView) => data.rows.find(row => `C${row.campaign}` === view.campaign && row.sia === view.sia)?.descriptors.coiExcludedReads ?? 0;
const text = (value: string) => /[";\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
const csv = (lines: string[][]) => "﻿" + lines.map(line => line.map(text).join(";")).join("\r\n") + "\r\n";
const raw = (value: number | null | undefined) => value === null || value === undefined ? "" : String(value);

/** CSV de leitura: exatamente os textos do painel, uma linha por campanha e ponto. Nota ausente não vira zero: a coluna `estado` diz por quê. */
export function captureIndexCsv(rows: CaptureIndexRow[]): string {
  const header = ["versao", "campanha", "SIA", "estado", "indice_geral", "posicao_na_campanha", "predominante", "categorias_na_faixa", "cobertura",
    ...captureDomains.flatMap(domain => [`${domain}_nota`, `${domain}_cobertura_da_curadoria`, `${domain}_reads_avaliados`, `${domain}_principal`]),
    "corrida_16S", "corrida_COI", "COI_situacao", "cloroplasto_no_16S", "cianobacterias_no_16S", "diatomaceas_no_16S", "COI_reads_marinhos_retirados", "alertas", "dominancia_fora_do_padrao", "exoticas_presentes",
    "perfil_risco_operacional", "perfil_risco_sanitario"];
  return csv([header, ...rows.map(captureIndexView).map(view => [captureIndexMeta.version, view.campaign, view.sia, view.state, view.general, view.position, view.predominant, view.elevated, view.coverage,
    ...view.domains.flatMap(domain => [domain.score, domain.confidenceGrade, domain.evaluated, domain.main]),
    view.components[0].run, view.components[2].run, view.components[2].status, view.chloroplast, view.cyanobacteria, view.diatoms, String(row_excluded(view)), String(view.alerts.length), view.dominance, view.exotics, ...view.profiles.map(profile => profile.summary)])]);
}

/** CSV de auditoria: valores sem arredondar e uma linha por contribuição (ponto, domínio, táxon, ficha), para refazer cada nota. */
export function captureIndexAuditCsv(rows: CaptureIndexRow[]): string {
  const header = ["versao", "linhas_sha256", "campanha", "SIA", "tipo", "dominio", "componente", "corrida", "taxon", "reads", "reads_validos_componente", "gravidade", "aplicabilidade",
    "ficha", "fonte", "q", "nota_dominio", "fracao_avaliada", "cobertura_da_curadoria", "geral", "estado_da_nota", "posicao", "situacao", "reads_observados", "base_do_grupo", "participacao", "referencia_na_rede"];
  const lines: string[][] = [];
  for (const row of rows) {
    const base = [captureIndexMeta.version, captureIndexMeta.rowsSha256, `C${row.campaign}`, row.sia];
    const tail = [raw(row.general), row.estimate ?? "", raw(row.rank)];
    for (const name of captureComponents) {
      const component = row.components[name];
      lines.push([...base, "biblioteca", "", name, component.run, "", "", raw(component.validReads), "", "", "", "", "", "", "", "", ...tail, component.status, raw(component.observedReads), "", "", ""]);
    }
    for (const domain of captureDomains) {
      const score = row.scores[domain];
      if (!score) continue;
      const scoreCells = [raw(score.score), raw(score.evaluated), score.confidence];
      lines.push([...base, "nota", domain, score.component ?? "", "", "", "", "", "", "", "", "", "", ...scoreCells, ...tail, "", "", "", "", ""]);
      for (const item of score.contributions) {
        lines.push([...base, "contribuicao", domain, item.component, row.components[item.component as ComponentName]?.run ?? "", item.taxon, raw(item.reads),
          raw(row.components[item.component as ComponentName]?.validReads), raw(item.gravidade), raw(item.aplicabilidade), item.ficha, item.fonte, raw(item.q), ...scoreCells, ...tail, "", "", raw(item.base), "", ""]);
      }
    }
    for (const alert of row.alerts) {
      lines.push([...base, `alerta: ${alert.motivo}`, alert.dominio, alert.componente, "", alert.taxon, raw(alert.reads), "", raw(alert.gravidade), raw(alert.aplicabilidade), alert.ficha, "", "", "", "", "", ...tail, "", "", "", raw(alert.participacao), raw(alert.referencia)]);
    }
  }
  return csv([header, ...lines]);
}

export const captureIndexExportName = (kind: "leitura" | "auditoria", campaign?: number) =>
  `indice-captacao-${captureIndexMeta.version.replace(/[^A-Za-z0-9.]+/g, "-")}-${campaign ? `C${campaign}` : "todas"}-${kind}.csv`;
export const sha256Hex = (content: string) => createHash("sha256").update(content, "utf8").digest("hex");
