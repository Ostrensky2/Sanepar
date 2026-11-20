import "server-only";
import { createHash } from "node:crypto";
import document from "./indice-captacao.json";
import { formatCaptureIndex, formatCaptureShare } from "./format";

/** Saída imutável do índice de triagem de risco da biota na captação (IR-CAPTACAO-0.7-piloto).
 * O cálculo é feito fora do aplicativo (audit/.../indice_v07) e materializado em `indice-captacao.json`.
 * Painel e exportações consomem a MESMA visão: os textos são formatados uma única vez, aqui. */
export const captureDomains = ["Ambiental", "Operacional", "Saúde humana"] as const;
export const captureDomainLabels: Record<Domain, string> = {
  Ambiental: "Danos físicos e ambientais", Operacional: "Riscos operacionais", "Saúde humana": "Perigo potencial à saúde, na captação" };
export const captureComponents = ["16S", "ALGAS", "COI"] as const;
const componentLabels: Record<string, string> = { "16S": "16S (bactérias)", ALGAS: "16S (cloroplasto de algas)", COI: "COI" };
type Domain = (typeof captureDomains)[number];
type ComponentName = (typeof captureComponents)[number];
type Contribution = { taxon: string; rank: string; reads: number; gravidade: number; aplicabilidade: number; ficha: string; fonte: string; q: number; component: string; base?: number };
type Score = { score: number; floor: number; ceiling: number; component: string | null; evaluated: number; evaluatedByComponent?: Record<string, number | null>; confidence: "A" | "B" | "C"; contributions: Contribution[] };
type Alert = { dominio: Domain | ""; taxon: string; reads: number; gravidade: number | null; aplicabilidade: number | null; ficha: string; motivo: string; componente: string;
  participacao?: number; referencia?: number; vezes?: number };
type ComponentState = { status: string; run: string; observedReads: number; validReads: number; identifiedReads: number };
export type CaptureIndexRow = { campaign: number; sia: string; general: number | null; generalFloor: number | null; generalCeiling: number | null;
  predominant: Domain | null; elevated: number; generalRms: number | null; rank: number | null; ranked: number; band: string | null; components: Record<ComponentName, ComponentState>;
  scores: Record<Domain, Score | null>; alerts: Alert[]; descriptors: { run16S: string; chloroplastShare: number | null; cyanobacteriaShare: number | null; diatomShare: number | null; chloroplastNamedShare: number | null; coiExcludedReads: number; coiReassignedReads: number; exotics: { species: string; reads: number }[] } };
type CampaignSummary = { pontos: number; medidos: number; media: number | null; mediana: number | null; p90: number | null; faixas: Record<string, number>; dominios?: Record<Domain, number> };
type Ficha = { taxon: string; level: string; domain: string; code: string; severity: number | null; applicability: number | null; contested: boolean; source: string; rationale: string };
type CaptureIndexDocument = { schema: string; version: string; status: string; parameters: Record<string, unknown>; inputs: Record<string, string>;
  fichasTotal: number; blindSpots: { tema: string; caso: string; situacao: string }[]; maturity: Record<Domain, { nivel: string; texto: string }>; campaigns: Record<string, CampaignSummary>; fichas: Record<string, Ficha>;
  rowsSha256: string; rows: CaptureIndexRow[] };

const data = document as unknown as CaptureIndexDocument;
if (data.schema !== "yvae-capture-index/4") throw new Error(`Esquema de índice não suportado: ${data.schema}`);
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
  const coi = row.components.COI;
  const coverage = !measured ? "sem medição" : coi.status === "disponível" ? "16S e COI" : `só 16S (COI ${coi.status})`;
  return {
    campaign: `C${row.campaign}`, sia: row.sia, measured,
    general: formatCaptureIndex(row.general),
    range: measured ? `${formatCaptureIndex(row.generalFloor)} a ${formatCaptureIndex(row.generalCeiling)}` : "",
    position: measured && row.rank ? `${row.rank}º de ${row.ranked}` : "",
    band: row.band ?? "",
    predominant: row.predominant ? captureDomainLabels[row.predominant] : measured ? "nenhuma contribuição pontuada" : "",
    coverage,
    elevated: !measured ? "" : row.elevated === 0 ? "nenhuma categoria na faixa de referência (0,15)" : `${row.elevated} de 3 categorias na faixa de referência (0,15)`,
    domains: captureDomains.map(domain => {
      const score = row.scores[domain];
      const main = score?.contributions[0];
      return {
        key: domain, label: captureDomainLabels[domain], maturity: data.maturity[domain].nivel,
        score: formatCaptureIndex(score?.score), range: score ? `${formatCaptureIndex(score.floor)} a ${formatCaptureIndex(score.ceiling)}` : "",
        confidence: score ? confidenceLabel[score.confidence] : "", confidenceGrade: score?.confidence ?? "", evaluated: score ? formatCaptureShare(score.evaluated) : "",
        evaluatedBy: score?.evaluatedByComponent ? Object.entries(score.evaluatedByComponent).map(([name, value]) => `${componentLabels[name] ?? name} ${formatCaptureShare(value)}`).join(" · ") : "",
        component: score?.component ? componentLabels[score.component] : "",
        main: main ? `${main.taxon}: ${main.reads.toLocaleString("pt-BR")} reads, gravidade ${main.gravidade}, aplicabilidade ${applicabilityLabel(main.aplicabilidade)}` : score ? "nenhum organismo com ficha pontuada" : "",
        contributions: (score?.contributions ?? []).map(item => ({ taxon: item.taxon, reads: item.reads.toLocaleString("pt-BR"), component: componentLabels[item.component] ?? item.component,
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
      reason: alertReason(alert), ficha: alert.ficha })),
  };
}

export function captureIndexCampaigns() {
  return Object.entries(data.campaigns).map(([code, summary]) => ({
    campaign: `C${code}`, number: Number(code), points: summary.pontos, measured: summary.medidos,
    mean: formatCaptureIndex(summary.media), median: formatCaptureIndex(summary.mediana), p90: formatCaptureIndex(summary.p90),
    bands: Object.entries(summary.faixas).sort(([a], [b]) => bandOrder(a) - bandOrder(b)).map(([band, count]) => ({ band, count })),
    domains: captureDomains.map(domain => ({ label: captureDomainLabels[domain], mean: formatCaptureIndex(summary.dominios?.[domain]) })),
  }));
}
const bandOrder = (band: string) => band.startsWith("<") ? 0 : band.startsWith(">=") ? 9 : Number(band.slice(0, 4).replace(",", "."));

const row_excluded = (view: CaptureIndexView) => data.rows.find(row => `C${row.campaign}` === view.campaign && row.sia === view.sia)?.descriptors.coiExcludedReads ?? 0;
const text = (value: string) => /[";\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
const csv = (lines: string[][]) => "﻿" + lines.map(line => line.map(text).join(";")).join("\r\n") + "\r\n";
const raw = (value: number | null | undefined) => value === null || value === undefined ? "" : String(value);

/** CSV de leitura: exatamente os textos do painel, uma linha por ponto. */
export function captureIndexCsv(rows: CaptureIndexRow[]): string {
  const header = ["versao", "campanha", "SIA", "indice_geral", "piso_a_teto", "posicao_na_campanha", "predominante", "categorias_na_faixa", "cobertura",
    ...captureDomains.flatMap(domain => [`${domain}_nota`, `${domain}_piso_a_teto`, `${domain}_confianca`, `${domain}_reads_avaliados`, `${domain}_principal`]),
    "corrida_16S", "corrida_COI", "COI_situacao", "cloroplasto_no_16S", "cianobacterias_no_16S", "diatomaceas_no_16S", "COI_reads_marinhos_retirados", "alertas", "dominancia_fora_do_padrao", "exoticas_presentes"];
  return csv([header, ...rows.map(captureIndexView).map(view => [captureIndexMeta.version, view.campaign, view.sia, view.general, view.range, view.position, view.predominant, view.elevated, view.coverage,
    ...view.domains.flatMap(domain => [domain.score, domain.range, domain.confidenceGrade, domain.evaluated, domain.main]),
    view.components[0].run, view.components[2].run, view.components[2].status, view.chloroplast, view.cyanobacteria, view.diatoms, String(row_excluded(view)), String(view.alerts.length), view.dominance, view.exotics])]);
}

/** CSV de auditoria: valores sem arredondar e uma linha por contribuição (ponto, domínio, táxon, ficha), para refazer cada nota. */
export function captureIndexAuditCsv(rows: CaptureIndexRow[]): string {
  const header = ["versao", "linhas_sha256", "campanha", "SIA", "tipo", "dominio", "componente", "corrida", "taxon", "reads", "reads_validos_componente", "gravidade", "aplicabilidade",
    "ficha", "fonte", "q", "nota_dominio", "piso_dominio", "teto_dominio", "fracao_avaliada", "confianca", "geral", "geral_piso", "geral_teto", "geral_rms_v05", "posicao", "situacao", "reads_observados", "base_do_grupo", "participacao", "referencia_na_rede"];
  const lines: string[][] = [];
  for (const row of rows) {
    const base = [captureIndexMeta.version, captureIndexMeta.rowsSha256, `C${row.campaign}`, row.sia];
    const tail = [raw(row.general), raw(row.generalFloor), raw(row.generalCeiling), raw(row.generalRms), raw(row.rank)];
    for (const name of captureComponents) {
      const component = row.components[name];
      lines.push([...base, "biblioteca", "", name, component.run, "", "", raw(component.validReads), "", "", "", "", "", "", "", "", "", "", ...tail, component.status, raw(component.observedReads), "", "", ""]);
    }
    for (const domain of captureDomains) {
      const score = row.scores[domain];
      if (!score) continue;
      const scoreCells = [raw(score.score), raw(score.floor), raw(score.ceiling), raw(score.evaluated), score.confidence];
      lines.push([...base, "nota", domain, score.component ?? "", "", "", "", "", "", "", "", "", "", ...scoreCells, ...tail, "", "", "", "", ""]);
      for (const item of score.contributions) {
        lines.push([...base, "contribuicao", domain, item.component, row.components[item.component as ComponentName]?.run ?? "", item.taxon, raw(item.reads),
          raw(row.components[item.component as ComponentName]?.validReads), raw(item.gravidade), raw(item.aplicabilidade), item.ficha, item.fonte, raw(item.q), ...scoreCells, ...tail, "", "", raw(item.base), "", ""]);
      }
    }
    for (const alert of row.alerts) {
      lines.push([...base, `alerta: ${alert.motivo}`, alert.dominio, alert.componente, "", alert.taxon, raw(alert.reads), "", raw(alert.gravidade), raw(alert.aplicabilidade), alert.ficha, "", "", "", "", "", "", "", ...tail, "", "", "", raw(alert.participacao), raw(alert.referencia)]);
    }
  }
  return csv([header, ...lines]);
}

export const captureIndexExportName = (kind: "leitura" | "auditoria", campaign?: number) =>
  `indice-captacao-${captureIndexMeta.version.replace(/[^A-Za-z0-9.]+/g, "-")}-${campaign ? `C${campaign}` : "todas"}-${kind}.csv`;
export const sha256Hex = (content: string) => createHash("sha256").update(content, "utf8").digest("hex");
