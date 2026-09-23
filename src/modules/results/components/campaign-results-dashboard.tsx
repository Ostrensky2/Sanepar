"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import type { AnalyticalSet, ResultPoint, ResultsCampaign } from "@/modules/results/types";
import type { ResultsSourcePreview } from "@/lib/results-source-preview-contract";
import type { ResultsPublicationV2 } from "@/lib/results-v2-persistence";
import { CampaignDataTable, type CampaignColumn } from "./campaign-data-table";
import { CampaignSourceTable, readCampaignPreview } from "./campaign-source-table";
import { CampaignOverview, CampaignOnlyMap, indexText, leadingCompletePoints } from "./campaign-overview";
import { CampaignMolecular, campaignControl, setNames, useCampaignAnalytics } from "./campaign-molecular";
import { CampaignPointFicha } from "./campaign-point-ficha";
import { CampaignHistory } from "./campaign-history";
import { CampaignAlertsByPoint, CampaignKpiCards, CampaignQuickRead, DomainCell, IndexBar, PriorityCards, RangeBar, SET_ORDER, SET_SHORT, SetChips } from "./campaign-story";
import { CompleteVsPartialSketch, IndexScaleBar } from "./help-visuals";
import { ResultsInterpretationHelp } from "./results-interpretation-help";
import { analyticalStatusText, samePublishedSource } from "../presentation";
import { PointReportSelection } from "./report-actions";

export const CAMPAIGN_TABS = [
  ["panorama", "Panorama"], ["priorities", "Prioridades"], ["alerts", "Associações"],
  ["cyanobacteria", "Cianobactérias"], ["bacteria", "Bactérias"], ["coi", "Eucariotos COI"], ["method", "Método"], ["history", "Evolução"],
] as const;
type Tab = typeof CAMPAIGN_TABS[number][0];
type Metric = "overall" | "environmental" | "operational" | "humanHealth";
export const resultState = (point: ResultPoint) => ({ complete: "Completo — 3/3", partial_2: "Parcial — 2/3", partial_1: "Parcial — 1/3", unavailable: "Indisponível — 0/3" })[point.completeness];
export const pointGeneral = (point: ResultPoint) => point.completeness === "unavailable" ? "Indisponível" : point.overall.value === null ? `${indexText(point.overall.lower)}–${indexText(point.overall.upper)}` : indexText(point.overall.value);
/** Texto estável (sempre Ciano · Bact · COI) usado na busca, na ordenação e na detecção de coluna constante. */
export const pointSetsText = (point: ResultPoint) => SET_ORDER.map((set) => `${SET_SHORT[set]}: ${point.components[set].included ? "usado" : "não usado"}`).join(" · ");
export function campaignReads(campaign: ResultsCampaign) {
  return (["cyanobacteria", "bacteria", "coi"] as const).map((set) => ({ set, reads: campaign.points.reduce((sum, point) => sum + point.components[set].totalReads, 0), records: campaign.points.reduce((sum, point) => sum + point.components[set].recordCount, 0) }));
}
export function campaignQualityNotices(campaign: ResultsCampaign) {
  return campaign.points.flatMap((point) => (["bacteria", "cyanobacteria", "coi"] as const).flatMap((set) => {
    const component = point.components[set];
    return component.reason ? [{ point, set, reason: component.reason, status: analyticalStatusText(component) }] : [];
  }));
}
const metricNames = { overall: "Índice geral", environmental: "Ambiental", operational: "Operacional", humanHealth: "Saúde humana" };

export function CampaignResultsDashboard({ campaign: publishedCampaign, campaignLabel, fieldPhotos = {}, publication }: { campaign: ResultsCampaign; campaignLabel: string; fieldPhotos?: Record<string, string>; publication?: Pick<ResultsPublicationV2, "publicationId" | "source"> }) {
  const [tab, setTab] = useState<Tab>("panorama");
  const [detail, setDetail] = useState<ResultPoint | null>(null);
  const [preview, setPreview] = useState<ResultsSourcePreview | null>(null);
  const [publishedSource, setPublishedSource] = useState<ResultsSourcePreview | null>(null);
  const [publishedSourceError, setPublishedSourceError] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [exportMessage, setExportMessage] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [molecularTable, setMolecularTable] = useState<"molecular" | "components" | null>(null);
  const [themesOpen, setThemesOpen] = useState(false);
  const [metric, setMetric] = useState<Metric>("overall");
  const [minimum, setMinimum] = useState("");
  const [maximum, setMaximum] = useState("");
  const [status, setStatus] = useState("");
  const currentPublishedSource = samePublishedSource(publishedSource?.source, publication ? { publicationId: publication.publicationId, sha256: publication.source.sha256 } : undefined) ? publishedSource : null;
  const consultedSource = preview ?? currentPublishedSource;
  const campaign = preview?.campaign ?? publishedCampaign;
  const sourceHash = consultedSource?.source.sha256 ?? publication?.source.sha256;
  const publicationId = preview ? undefined : publication?.publicationId;
  const leading = leadingCompletePoints(campaign.points, 5);
  // Uma consulta alimenta o Panorama (táxons distintos, cianobactéria mais lida).
  const overview = useCampaignAnalytics(campaign.campaignCode, sourceHash, "cyanobacteria", { topN: "1", pageSize: "1" }, publicationId);
  useEffect(() => {
    if (!publication?.publicationId || !publication.source.sha256) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ source: "published", campaignCode: publishedCampaign.campaignCode, publicationId: publication.publicationId, sourceHash: publication.source.sha256, section: "indices", limit: "1" });
    void readCampaignPreview(params, controller.signal).then((source) => { if (!controller.signal.aborted) { setPublishedSource(source); setPublishedSourceError(""); } }).catch((error: unknown) => { if (!controller.signal.aborted) { setPublishedSource(null); setPublishedSourceError(error instanceof Error ? error.message : "Fonte publicada indisponível."); } });
    return () => controller.abort();
  }, [publication?.publicationId, publication?.source.sha256, publishedCampaign.campaignCode]);
  const complete = campaign.points.filter((point) => point.completeness === "complete" && point.overall.value !== null);
  const partial = campaign.points.filter((point) => point.completeness !== "complete");
  const metricRange = (point: ResultPoint) => metric === "overall" ? point.overall : point.domains[metric];
  const priorityFilter = (point: ResultPoint) => {
    const range = metricRange(point);
    if (status && !Object.values(point.components).some((item) => (analyticalStatusText(item)) === status)) return false;
    if (minimum && range.lower < Number(minimum)) return false;
    if (maximum && range.upper > Number(maximum)) return false;
    return true;
  };
  const filtersActive = Boolean(minimum || maximum || status || metric !== "overall");
  function activate(next: Tab) {
    setTab(next);
    setMolecularTable(null); setThemesOpen(false);
    requestAnimationFrame(() => document.getElementById(`campaign-tab-${next}`)?.scrollIntoView({ block: "nearest", inline: "nearest" }));
  }
  async function openPreview() {
    setPreviewLoading(true); setPreviewError("");
    try {
      const source = await readCampaignPreview(new URLSearchParams({ campaignCode: publishedCampaign.campaignCode, section: "indices", limit: "1" }));
      if (!source.campaign || source.campaign.campaignCode !== publishedCampaign.campaignCode) throw new Error("A prévia não contém a campanha selecionada.");
      setPreview(source); setDetail(null);
    } catch (error) { setPreviewError(error instanceof Error ? error.message : "Prévia indisponível."); }
    finally { setPreviewLoading(false); }
  }
  async function downloadSource() {
    setExportMessage("Preparando fonte protegida…");
    try {
      const params = new URLSearchParams({ source: preview ? "local-corrected-preview" : "published", campaignCode: campaign.campaignCode });
      if (sourceHash) params.set("sourceHash", sourceHash);
      if (publicationId) params.set("publicationId", publicationId);
      const response = await fetch(`/api/imports/results/template?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error(preview ? "Download indisponível ou fonte alterada; reabra a prévia." : "O binário verificável desta publicação não está disponível. Nenhuma fonte antiga foi usada.");
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = consultedSource?.source.fileName ?? publication?.source.fileName ?? "Fonte_integral_todas_campanhas.xlsx"; anchor.click(); URL.revokeObjectURL(url);
      setExportMessage("Fonte integral baixada; contém todas as campanhas do arquivo.");
    } catch (error) { setExportMessage(error instanceof Error ? error.message : "Download indisponível."); }
  }
  const pointColumns: CampaignColumn<ResultPoint>[] = [
    { key: "sia", label: "Ponto SIA", value: (point) => point.siaCode },
    { key: "municipality", label: "Município", value: (point) => point.municipality },
    { key: "water", label: "Manancial", value: (point) => point.waterBody },
    { key: "state", label: "Completude", value: resultState },
    { key: "sets", label: "Conjuntos", value: pointSetsText, render: (point) => <SetChips point={point} statusText={(set) => analyticalStatusText(point.components[set])} /> },
    { key: "value", label: "Índice geral / faixa", value: (point) => point.overall.value ?? (point.completeness === "unavailable" ? null : point.overall.upper), render: (point) => point.completeness === "unavailable" ? "Indisponível" : point.overall.value === null ? <RangeBar lower={point.overall.lower} upper={point.overall.upper} /> : <IndexBar value={point.overall.value} /> },
  ];
  const domainColumns: CampaignColumn<ResultPoint>[] = (["environmental", "operational", "humanHealth"] as const).map((domain) => ({ key: domain, label: metricNames[domain], value: (point) => point.completeness === "unavailable" ? null : point.domains[domain].value ?? point.domains[domain].upper, render: (point) => point.completeness === "unavailable" ? "Indisponível" : <DomainCell range={point.domains[domain]} /> }));
  return <section id="campaign-results-tabs" className="min-w-0 scroll-mt-20 space-y-3" aria-label={`Dashboard: ${campaignLabel}`}>
    <header className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-1"><h2 className="heading-font type-section-title text-[var(--brand-navy-strong)]">Resultados da campanha</h2>
      <ResultsInterpretationHelp title="Como ler os resultados">
        <p><strong>O índice aponta onde olhar primeiro.</strong> Ele reúne três olhares (ambiental, operacional e saúde humana) sobre os organismos detectados e o que a literatura diz sobre eles.</p>
        <IndexScaleBar />
        <p>Os valores são comparáveis entre os pontos desta campanha. Não são comparáveis com o score do painel anterior (até 31/08/2026).</p>
        <CompleteVsPartialSketch />
        <p>Detectar o DNA de um organismo não confirma toxina nem dano. A ficha de cada ponto diz o que confirmar em laboratório. Em cada aba, o <span aria-hidden="true">?</span> ao lado do título explica aquele bloco.</p>
      </ResultsInterpretationHelp></div><button className={campaignControl} aria-expanded={exportOpen} onClick={() => setExportOpen(!exportOpen)}>Baixar planilha-fonte</button></header>
    {exportOpen && <div className="border border-[var(--line-strong)] p-3"><p className="type-metadata">{preview ? "Fonte completa da prévia (todas as campanhas do arquivo), não um recorte exclusivo da campanha selecionada." : "Download da publicação vigente depende de um binário verificável disponível. A prévia não substitui a publicação."}</p><button className={campaignControl + " mt-2"} onClick={() => void downloadSource()}>Baixar fonte consultada</button></div>}
    {exportMessage && <p role="status" className="type-metadata">{exportMessage}</p>}
    {!preview && publication && <PointReportSelection key={`${campaign.campaignCode}:${publication.publicationId}:${publication.source.sha256}`} source={{ campaign, publicationId: publication.publicationId, sourceHash: publication.source.sha256, fileName: publication.source.fileName, photos: fieldPhotos }} />}
    {/* O único aviso metodológico da tela; o detalhe de cada bloco fica no ícone "?" ao lado do título. */}
    <p className="border-l-4 border-[var(--brand-teal)] bg-[var(--surface-soft)] px-3 py-2 text-sm text-[var(--ink)]" role="note"><strong>Índice de 0 a 1 que aponta onde olhar primeiro.</strong> Provisório · não comparável ao painel anterior (até 31/08/2026). <a href="/ajuda?secao=versoes" className="font-semibold underline underline-offset-2">O que mudou</a></p>
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--ink-soft)]">
      <p>{campaignLabel} · <strong>{preview ? "Prévia local — fonte corrigida · não publicada" : "Publicação vigente"}</strong></p>
      {preview ? <button className="min-h-11 underline" onClick={() => { setPreview(null); setDetail(null); setExportMessage(""); }}>Voltar à publicação vigente</button> : process.env.NODE_ENV === "development" && <button className="min-h-11 underline disabled:opacity-50" disabled={previewLoading} onClick={() => void openPreview()}>{previewLoading ? "Validando fonte corrigida…" : "Abrir prévia local da fonte corrigida"}</button>}
      {preview && <details className="w-full"><summary className="cursor-pointer py-1 font-semibold">Origem dos dados · {preview.warnings.length} avisos</summary><p className="break-all">{preview.source.fileName} · SHA256 {sourceHash}</p><p>CacheRecovery: caches zero originais recuperados pelo leitor; nenhuma fórmula reconstruída. Publicação não alterada.</p><ul className="list-disc pl-5">{preview.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}
      {previewError && <p role="alert">{previewError}</p>}
      {!preview && publishedSourceError && <p role="alert">{publishedSourceError} Nenhuma prévia local foi usada como substituta.</p>}
      {!preview && publication && !currentPublishedSource && !publishedSourceError && <p role="status">Carregando a fonte persistida desta publicação…</p>}
      {!preview && currentPublishedSource && <details className="w-full"><summary className="cursor-pointer py-1 font-semibold">Origem dos dados</summary><p className="break-all">Arquivo publicado: {currentPublishedSource.source.fileName}</p><p className="break-all text-xs">Publicação {publicationId} · SHA-256 {sourceHash}</p><ul>{currentPublishedSource.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}
    </div>
    <div role="tablist" aria-label="Áreas do dashboard da campanha" className="flex overflow-x-auto border-b border-[var(--line-strong)]">
      {CAMPAIGN_TABS.map(([key, label], index) => <button key={key} type="button" role="tab" id={`campaign-tab-${key}`} aria-controls={`campaign-panel-${key}`} aria-selected={tab === key} tabIndex={tab === key ? 0 : -1} className="min-h-11 shrink-0 border-b-2 border-transparent px-3 text-sm font-bold aria-selected:border-[var(--brand-teal)] aria-selected:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-[var(--brand-teal)]" onClick={() => activate(key)} onKeyDown={(event) => { if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return; event.preventDefault(); const target = event.key === "Home" ? 0 : event.key === "End" ? CAMPAIGN_TABS.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + CAMPAIGN_TABS.length) % CAMPAIGN_TABS.length; activate(CAMPAIGN_TABS[target][0]); document.getElementById(`campaign-tab-${CAMPAIGN_TABS[target][0]}`)?.focus(); }}>{label}</button>)}
    </div>
    <div key={`${publicationId ?? "preview"}-${sourceHash ?? "unavailable"}-${tab}`} role="tabpanel" id={`campaign-panel-${tab}`} aria-labelledby={`campaign-tab-${tab}`} tabIndex={0} className="min-w-0 space-y-4">
      {tab === "panorama" && <>
        <CampaignKpiCards campaign={campaign} taxaCount={overview?.data?.campaignTaxa} />
        <CampaignQuickRead campaign={campaign} campaignLabel={campaignLabel} cyanoTop={!sourceHash || overview?.error ? null : overview?.data ? overview.data.topReads[0] ?? null : undefined} onPoint={setDetail} />
        <div className="flex flex-wrap gap-2"><button className={campaignControl + " font-bold"} onClick={() => activate("priorities")}>Onde olhar primeiro: prioridades e mapa</button><button className={campaignControl} onClick={() => activate("alerts")}>Associações documentadas por ponto</button></div>
        <div className="grid gap-4 lg:grid-cols-2">
          <CampaignOverview campaign={campaign} />
          <section className="app-card p-4"><h3 className="type-panel-title">Esforço molecular por conjunto</h3><p className="type-caption text-[var(--ink-soft)]">Reads de conjuntos diferentes não são biologicamente equivalentes.</p><ul className="mt-3 space-y-3">{campaignReads(campaign).map((item, _, all) => <li key={item.set}><div className="flex justify-between gap-2 text-sm"><span className="font-bold">{setNames[item.set]}</span><span className="tabular-nums">{item.reads.toLocaleString("pt-BR")} reads · {item.records.toLocaleString("pt-BR")} registros</span></div><span aria-hidden="true" className="mt-1 block h-3 bg-[var(--surface-soft)]"><span className="block h-full bg-[var(--brand-teal)]" style={{ width: `${item.reads / Math.max(1, ...all.map((row) => row.reads)) * 100}%` }} /></span></li>)}</ul></section>
        </div>
      </>}
      {tab === "priorities" && <>
        <CampaignIntro title="Onde olhar primeiro">
          <p>Os cartões são os pontos completos com maior índice geral (empates na última posição entram juntos). A posição vem só do índice geral: ordenar a tabela por um domínio não muda a posição.</p>
          <p>Abra a ficha de um ponto para ver os organismos dominantes e os que mais pesam no índice.</p>
          <p>O filtro de faixa vale para o mapa e para as duas tabelas. Um ponto parcial só aparece se a faixa inteira dele couber no filtro.</p>
        </CampaignIntro>
        <PriorityCards points={leading} onPoint={setDetail} />
        <details className="app-card p-3" open={filtersActive || undefined}><summary className="min-h-11 cursor-pointer content-center font-bold">Filtrar por faixa de índice ou situação analítica{filtersActive ? " · filtro ativo" : ""}</summary>
          <div className="mt-2 flex flex-wrap gap-2"><label className="type-label">Faixa em<select className={campaignControl + " block"} value={metric} onChange={(event) => setMetric(event.target.value as Metric)}>{Object.entries(metricNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="type-label">Mínimo<input className={campaignControl + " block w-24"} type="number" min="0" max="1" step="0.1" value={minimum} onChange={(event) => setMinimum(event.target.value)} /></label><label className="type-label">Máximo<input className={campaignControl + " block w-24"} type="number" min="0" max="1" step="0.1" value={maximum} onChange={(event) => setMaximum(event.target.value)} /></label><label className="type-label min-w-0">Situação analítica<select className={campaignControl + " block"} value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Todas</option>{[...new Set(campaign.points.flatMap((point) => Object.values(point.components).map((item) => analyticalStatusText(item))))].map((item) => <option key={item}>{item}</option>)}</select></label><button className={campaignControl + " self-end"} onClick={() => { setMetric("overall"); setMinimum(""); setMaximum(""); setStatus(""); }}>Limpar faixa e situação</button></div>
        </details>
        <CampaignDataTable title="Ranking dos completos" rows={complete.filter(priorityFilter)} population={campaign.points.length} columns={[{ key: "rank", label: "Posição na campanha", value: (point) => point.overall.rank }, ...pointColumns, ...domainColumns]} rowKey={(point) => point.key} initialSort="value" initialDescending filter={{ label: "Município", value: (point) => point.municipality ?? "Não informado" }} onDetail={setDetail} detailLabel="Ver ponto" />
        <CampaignOnlyMap points={campaign.points.filter(priorityFilter)} photos={fieldPhotos} onPoint={setDetail} />
        <CampaignDataTable title="Parciais e indisponíveis — sem ranking" rows={partial.filter(priorityFilter)} population={campaign.points.length} columns={[...pointColumns, ...domainColumns]} rowKey={(point) => point.key} filter={{ label: "Completude", value: resultState }} onDetail={setDetail} detailLabel="Ver ponto" />
      </>}
      {tab === "alerts" && <>
        <CampaignIntro title="Associações documentadas por ponto">
          <p>Uma linha por ponto, com quantos organismos detectados ali têm efeito descrito na literatura (nota 1 a 3) em cada domínio: ambiental, operacional e saúde.</p>
          <p>Mais organismos com efeito descrito não quer dizer mais risco: é um inventário, não uma classificação. A lista começa pelo índice geral e inclui os pontos parciais.</p>
          <p>“Destaque” é o organismo com a nota mais alta na literatura (no empate, o com mais reads), com o trecho da evidência. É o que a literatura diz, não uma confirmação no local.</p>
        </CampaignIntro>
        {consultedSource ? <CampaignAlertsByPoint campaign={campaign} sourceHash={sourceHash} publicationId={publicationId} onPoint={setDetail} /> : <CampaignUnavailable />}
        {consultedSource && <Reveal summary="Todas as evidências, linha a linha"><CampaignSourceTable campaign={campaign} sourceHash={sourceHash} publicationId={publicationId} section="alerts" title="Presenças com evidências documentadas" onPoint={setDetail} /></Reveal>}
        <Reveal summary={`Observações de qualidade e uso (${campaignQualityNotices(campaign).length})`}><CampaignDataTable title="Observações de qualidade e uso" rows={campaignQualityNotices(campaign)} columns={[{ key: "point", label: "Ponto", value: (row) => row.point.siaCode }, { key: "set", label: "Conjunto", value: (row) => setNames[row.set] }, { key: "status", label: "Situação informada", value: (row) => row.status }, { key: "reason", label: "Motivo informado", value: (row) => row.reason }]} rowKey={(row) => `${row.point.key}|${row.set}`} filter={{ label: "Conjunto", value: (row) => setNames[row.set] }} onDetail={(row) => setDetail(row.point)} detailLabel="Ver ponto" /></Reveal>
      </>}
      {(tab === "cyanobacteria" || tab === "bacteria" || tab === "coi") && <>
        <CampaignIntro title={setNames[tab]}>
          <p>Reads (quantas leituras de DNA), frequência (em quantos pontos o organismo apareceu) e proporção (a fatia dele no ponto) medem coisas diferentes. Buscar ou limitar a lista não muda os totais.</p>
          <CampaignThemes set={tab} />
        </CampaignIntro>
        {consultedSource ? <CampaignMolecular campaign={campaign} sourceHash={consultedSource.source.sha256} publicationId={publicationId} set={tab} onPoint={setDetail} /> : <CampaignUnavailable />}
        {consultedSource && <details open={themesOpen} onToggle={(event) => setThemesOpen(event.currentTarget.open)} className="border-y border-[var(--line-strong)] py-2"><summary className="min-h-11 cursor-pointer font-bold">{tab === "cyanobacteria" ? "Toxina ou composto — contexto bibliográfico literal" : "Associações documentadas por domínio"}</summary><p className="type-metadata">Linhas são associações, não amostras. Incluem contexto não identificado/não aplicável; nenhum texto foi convertido em etiqueta ou confirmação local.</p>{themesOpen && <CampaignSourceTable campaign={campaign} sourceHash={sourceHash} publicationId={publicationId} section="alerts" set={tab} title="Efeitos, contexto e referências" visibleColumns={["Cód. SIA", "Espécie", "Evidência: Domínio", "Evidência: Toxina ou composto", "Evidência: Efeito ou mecanismo documentado", "Evidência: Condições e limites de aplicação"]} onPoint={setDetail} />}</details>}
        {consultedSource && <><div className="flex flex-wrap gap-2"><button className={campaignControl} aria-pressed={molecularTable === "molecular"} onClick={() => setMolecularTable(molecularTable === "molecular" ? null : "molecular")}>Consulta completa de organismos e evidências</button><button className={campaignControl} aria-pressed={molecularTable === "components"} onClick={() => setMolecularTable(molecularTable === "components" ? null : "components")}>Cobertura e situação analítica</button></div>{molecularTable && <CampaignSourceTable key={molecularTable} campaign={campaign} sourceHash={sourceHash} publicationId={publicationId} section={molecularTable} set={tab} title={molecularTable === "molecular" ? "Consulta completa de organismos e evidências" : "Cobertura e situação analítica"} onPoint={setDetail} />}</>}
      </>}
      {tab === "method" && <>
        <CampaignIntro title="Método e catálogos" />
        <section className="app-card flex flex-wrap items-center justify-between gap-3 p-4"><p className="max-w-[65ch]">O passo a passo do cálculo, com os números de cada ponto desta campanha, fica em Ciência e método. Aqui estão os catálogos completos de organismos e de evidências da literatura.</p><Link className="inline-flex min-h-11 items-center rounded-lg bg-[var(--brand-navy-strong)] px-4 text-sm font-bold text-white" href="/resultados/calculos">Refazer o cálculo de um ponto</Link></section>
        {consultedSource && <><CampaignSourceTable campaign={campaign} sourceHash={sourceHash} publicationId={publicationId} section="catalog" title="Catálogo global de organismos" /><CampaignSourceTable campaign={campaign} sourceHash={sourceHash} publicationId={publicationId} section="evidence" title="Evidências bibliográficas globais" /></>}
      </>}
      {tab === "history" && (consultedSource ? <CampaignHistory campaignCode={campaign.campaignCode} sourceHash={consultedSource.source.sha256} publicationId={publicationId} /> : <p role="status">Histórico com origem comum não disponível neste payload publicado. Abra explicitamente a prévia para consultar as campanhas do mesmo arquivo, sem substituí-las na publicação.</p>)}
    </div>
    {detail && <CampaignPointFicha key={`${publicationId}:${sourceHash}:${detail.key}`} point={detail} campaign={campaign} sourceHash={sourceHash} publicationId={publicationId} photoUrl={fieldPhotos[`${detail.campaignCode}|${detail.siaCode}`]} onClose={() => setDetail(null)} />}
  </section>;
}
export function CampaignIntro({ title, children }: { title: string; children?: ReactNode }) { return <header className="flex items-center gap-1"><h3 className="heading-font type-section-title text-[var(--brand-navy-strong)]">{title}</h3>{children && <ResultsInterpretationHelp title={`Como ler: ${title.toLocaleLowerCase("pt-BR")}`}>{children}</ResultsInterpretationHelp>}</header>; }
// Conteúdo secundário só é montado (e consultado) quando o usuário abre o bloco.
function Reveal({ summary, children }: { summary: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} className="border-y border-[var(--line-strong)] py-2"><summary className="min-h-11 cursor-pointer content-center font-bold">{summary}</summary>{open && <div className="mt-2">{children}</div>}</details>;
}
function CampaignUnavailable() { return <p className="type-body" role="status">Registros moleculares completos e evidências não estão disponíveis neste payload publicado. Isso não significa ausência de organismos ou alertas. A prévia corrigida é uma origem separada, carregada somente por ação explícita.</p>; }
function CampaignThemes({ set }: { set: AnalyticalSet }) {
  return <>
    {set === "cyanobacteria" && <><p>Toxinas/compostos: o texto bibliográfico literal está no detalhe de evidências do organismo; não confirma produção ou presença química local. A fonte não fornece uma flag curada de cianotoxina.</p><p>Gosto/odor: mapeamento temático tipado não disponível. Não foram atribuídas etiquetas por gênero, score ou busca de palavras.</p></>}
    {set === "coi" && <p>Agrupamentos COI: grupo taxonômico superior/funcional, invasor/exótico e relação organismo→grupo com fonte/versão não disponíveis. “COI” é conjunto analítico, não função ecológica. Consulta por táxon e evidência continua disponível.</p>}
    <p>Associações ambientais, operacionais e de saúde são documentais; consulte o domínio, efeito, contexto, referências e limitações no detalhe do organismo ou em Alertas. Não se infere incrustação, corrosão ou obstrução automaticamente.</p>
  </>;
}
