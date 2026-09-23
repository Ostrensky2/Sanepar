"use client";

import { Camera, CircleHelp, FlaskConical, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { defaultCampaigns } from "@/lib/campaign-management";
import { formatResultIndex } from "../format-index";
import { RiskPhotoModal } from "@/components/home-risk-map-section";
import { ResultsReviewDialog } from "@/components/results-review-dialog";
import {
  CampaignHydroMap,
  type CampaignHydroMapPoint,
} from "@/components/campaign-hydro-map";
import { ResultMarkerLegend } from "./result-marker-legend";
import { analyticalStatusText } from "../presentation";
import { CompleteVsPartialSketch, IndexScaleBar } from "./help-visuals";
import { ResultsInterpretationHelp } from "./results-interpretation-help";
import type {
  ResultCompleteness,
  ResultDomain,
  ResultPoint,
  ResultsCampaign,
} from "@/modules/results";

type ResultMetric = "overall" | ResultDomain;

export type ResultsIndexDashboardProps = {
  campaigns: ResultsCampaign[];
  initialCampaignCode?: string;
  campaignLabels?: Record<string, string>;
  fieldPhotos?: Record<string, string>;
  summary?: boolean;
  overview?: (campaign: ResultsCampaign) => React.ReactNode;
};

const metricOptions: Array<{ value: ResultMetric; label: string }> = [
  { value: "overall", label: "Índice geral" },
  { value: "environmental", label: "Ambiental" },
  { value: "operational", label: "Operacional" },
  { value: "humanHealth", label: "Saúde humana" },
];

const completenessOptions: Array<{ value: "all" | ResultCompleteness; label: string }> = [
  { value: "all", label: "Todos os resultados" },
  { value: "complete", label: "Completos (3/3)" },
  { value: "partial_2", label: "Parciais (2/3)" },
  { value: "partial_1", label: "Parciais (1/3)" },
  { value: "unavailable", label: "Indisponíveis (0/3)" },
];

export function ResultsIndexDashboard({
  campaigns,
  initialCampaignCode,
  campaignLabels = {},
  fieldPhotos = {},
  summary = false,
  overview,
}: ResultsIndexDashboardProps) {
  const firstCampaignCode = initialCampaignCode ?? campaigns[0]?.campaignCode ?? "";
  const [campaignCode, setCampaignCode] = useState(firstCampaignCode);
  const [metric, setMetric] = useState<ResultMetric>("overall");
  const [completeness, setCompleteness] = useState<"all" | ResultCompleteness>("all");
  const [query, setQuery] = useState("");
  const [selectedPointKey, setSelectedPointKey] = useState<string>();
  const [focusRequest, setFocusRequest] = useState<{ pointId: string; revision: number }>();
  const [mapHelpOpen, setMapHelpOpen] = useState(false);
  // No celular o mapa começa recolhido para a página não ficar longa demais.
  const [mobileMapOpen, setMobileMapOpen] = useState(false);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setCampaignCode(firstCampaignCode);
      setMetric("overall");
      setCompleteness("all");
      setQuery("");
      setSelectedPointKey(undefined);
    });
    return () => { active = false; };
  }, [firstCampaignCode]);

  useEffect(() => {
    if (summary) return;
    const params = new URLSearchParams(window.location.search);
    const point = campaigns.find((item) => item.campaignCode === firstCampaignCode)?.points
      .find((item) => item.siaCode === params.get("sia"));
    let active = true;
    queueMicrotask(() => { if (active && point) setSelectedPointKey(point.key); });
    return () => { active = false; };
  }, [campaigns, firstCampaignCode, summary]);

  const campaign = campaigns.find((item) => item.campaignCode === campaignCode) ?? campaigns[0];
  const visiblePoints = useMemo(() => {
    if (!campaign) return [];
    const normalizedQuery = normalizeText(query);
    return campaign.points.filter((point) => {
      if (completeness !== "all" && point.completeness !== completeness) return false;
      if (!normalizedQuery) return true;
      return normalizeText([point.siaCode, point.waterBody, point.municipality].join(" ")).includes(
        normalizedQuery,
      );
    });
  }, [campaign, completeness, query]);
  const selectedPoint =
    visiblePoints.find((point) => point.key === selectedPointKey) ?? visiblePoints[0] ?? null;
  const mapPoints = useMemo(
    () => buildResultMapPoints(visiblePoints, metric, campaignLabels, fieldPhotos),
    [campaignLabels, fieldPhotos, metric, visiblePoints],
  );
  const municipalityRows = useMemo(() => summarizeMunicipalities(visiblePoints), [visiblePoints]);
  const completeRanking = useMemo(
    () => visiblePoints
      .filter((point) => point.completeness === "complete" && metricRange(point, metric).value !== null)
      .sort((left, right) => {
        const leftRange = metricRange(left, metric);
        const rightRange = metricRange(right, metric);
        return (rightRange.value ?? -1) - (leftRange.value ?? -1) || left.siaCode.localeCompare(right.siaCode);
      }),
    [metric, visiblePoints],
  );

  if (!campaign) {
    return (
      <section className="app-card p-6 text-center" role="status">
        <FlaskConical className="mx-auto h-8 w-8 text-[var(--brand-teal)]" />
        <h2 className="heading-font type-section-title mt-3 text-[var(--brand-navy-strong)]">
          Nenhuma publicação de resultados
        </h2>
        <p className="type-body mt-2 text-[var(--ink-soft)]">
          Publique o modelo oficial em Central de dados para liberar esta consulta.
        </p>
      </section>
    );
  }

  return (
    <section id="results-index-dashboard" className="scroll-mt-20 space-y-4" aria-labelledby="results-index-title">
      {overview?.(campaign)}
      <header className={summary ? "sr-only" : "app-card p-4 sm:p-5"}>
        <p className="type-eyebrow text-[var(--brand-teal)]">Resultados por índices</p>
        <h2 id="results-index-title" className="heading-font type-section-title text-[var(--brand-navy-strong)]">
          Síntese integrada por ponto
        </h2>
        <div className="mt-2 flex items-center gap-1">
          <p className="type-body text-[var(--ink)]">Índices de 0 a 1 · resultado provisório.</p>
          <ResultsInterpretationHelp title="Como ler a síntese por ponto">
            <p>A cor de cada ponto no mapa é o seu índice, de 0 a 1. O anel mostra quantos dos três conjuntos foram analisados.</p>
            <IndexScaleBar />
            <p>Ponto completo tem um número. Ponto parcial tem uma faixa.</p>
            <CompleteVsPartialSketch />
            <p><strong>Provisório:</strong> o laboratório ainda não informou a qualidade de cada conjunto. Os valores podem mudar quando essa revisão chegar.</p>
          </ResultsInterpretationHelp>
        </div>
      </header>

      <div className="app-card grid gap-3 border-[var(--line-ghost)] bg-[var(--surface-panel)] p-4 md:grid-cols-4">
        <Control label="Campanha">
          <select
            value={campaign.campaignCode}
            onChange={(event) => {
              setCampaignCode(event.target.value);
              setMetric("overall");
              setCompleteness("all");
              setQuery("");
              setSelectedPointKey(undefined);
            }}
            className="min-h-11 w-full rounded-lg border border-[var(--line-strong)] bg-white px-3 text-sm font-semibold text-[var(--ink)]"
          >
            {campaigns.map((item) => (
              <option key={item.campaignCode} value={item.campaignCode}>
                {campaignLabels[item.campaignCode] ?? item.campaignCode}
              </option>
            ))}
          </select>
        </Control>
        <Control label="Índice exibido">
          <select
            value={metric}
            onChange={(event) => setMetric(event.target.value as ResultMetric)}
            className="min-h-11 w-full rounded-lg border border-[var(--line-strong)] bg-white px-3 text-sm font-semibold text-[var(--ink)]"
          >
            {metricOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </Control>
        <Control label="Completude">
          <select
            value={completeness}
            onChange={(event) => setCompleteness(event.target.value as "all" | ResultCompleteness)}
            className="min-h-11 w-full rounded-lg border border-[var(--line-strong)] bg-white px-3 text-sm font-semibold text-[var(--ink)]"
          >
            {completenessOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </Control>
        <label>
          <span className="type-label text-[var(--ink)]">Buscar ponto, SIA ou município</span>
          <span className="mt-1 flex min-h-11 items-center gap-2 rounded-lg border border-[var(--line-strong)] bg-white px-3 focus-within:ring-2 focus-within:ring-[var(--brand-teal)]">
            <Search className="h-4 w-4 text-[var(--ink-soft)]" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm text-[var(--ink)] outline-none"
            />
          </span>
        </label>
      </div>

      {!summary && <CompletenessSummary campaign={campaign} metric={metric} />}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.7fr)]">
        <div className="app-card min-w-0 overflow-hidden border-[var(--line-ghost)] bg-[var(--surface-panel)] p-0">
          <div className="border-b border-[var(--line-soft)] p-4">
            <div className="flex items-center gap-1">
              <h3 className="heading-font type-panel-title text-[var(--brand-navy-strong)]">Mapa do índice</h3>
              <button type="button" aria-label="Como ler o mapa" title="Como ler o mapa" aria-haspopup="dialog" className="-my-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--brand-teal)] transition hover:bg-[var(--surface-soft)] hover:text-[var(--brand-navy-strong)] focus-visible:outline-2 focus-visible:outline-[var(--brand-teal)]" onClick={() => setMapHelpOpen(true)}><CircleHelp aria-hidden="true" className="h-5 w-5" /></button>
            </div>
            <p className="type-metadata mt-1 text-[var(--ink-soft)]">
              {mapPoints.length} de {visiblePoints.length} resultados no mapa.
            </p>
            {mapPoints.length < visiblePoints.length && <button type="button" className="min-h-11 text-xs text-[var(--ink-soft)] underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-[var(--brand-teal)]" onClick={() => setMapHelpOpen(true)}>{visiblePoints.length - mapPoints.length} sem localização no mapa — detalhes</button>}
            <button type="button" aria-expanded={mobileMapOpen} className="mt-2 min-h-11 rounded-lg border border-[var(--line-strong)] bg-white px-4 text-sm font-bold text-[var(--brand-navy-strong)] sm:hidden" onClick={() => setMobileMapOpen((open) => !open)}>{mobileMapOpen ? "Ocultar mapa" : "Ver mapa"}</button>
            <div className={mobileMapOpen ? "" : "max-sm:hidden"}><ResultMarkerLegend /></div>
          </div>
          <div className={`relative h-[480px] bg-[var(--surface-soft)] max-sm:h-[400px] ${mobileMapOpen ? "" : "max-sm:hidden"}`}>
            <CampaignHydroMap
              points={mapPoints}
              selectedPointId={selectedPoint?.key}
              onSelectPoint={(point) => setSelectedPointKey(point.id)}
              layers={{ roadMap: true, basins: true, dailyRoutes: false, dayTransitions: false, planned: false, effective: true, displacement: false }}
              markerMode="resultIndex"
              zoomOnSelect={false}
              focusRequest={focusRequest}
              showPointTooltip
              caption={`${metricLabel(metric)} · escala fixa 0–1 · anel: conjuntos utilizados`}
            />
          </div>
        </div>
        <PointDetail points={visiblePoints} onSelect={setSelectedPointKey} point={selectedPoint} metric={metric} onFocus={() => {
          if (selectedPoint) setFocusRequest((current) => ({ pointId: selectedPoint.key, revision: (current?.revision ?? 0) + 1 }));
        }} photoUrl={
          selectedPoint ? fieldPhotos[photoKey(selectedPoint.campaignCode, selectedPoint.siaCode)] : undefined
        } />
      </div>

      {!summary && <><div className="grid gap-4 xl:grid-cols-2">
        <ResultsTable points={visiblePoints} metric={metric} onSelect={setSelectedPointKey} />
        <RankingTable points={completeRanking} metric={metric} />
      </div>
      <MunicipalityTable rows={municipalityRows} />
      <ResultsHistory campaigns={campaigns} metric={metric} campaignLabels={campaignLabels} /></>}
      {mapHelpOpen && <ResultsReviewDialog title="Como ler o mapa" closeLabel="Fechar explicação" onClose={() => setMapHelpOpen(false)}>
        <div className="space-y-4">{mapHelpSections(campaign, visiblePoints, mapPoints.map((point) => point.id), metric).map((section) => <section key={section.title}>
          <h3 className="type-label font-bold text-[var(--brand-navy-strong)]">{section.title}</h3>
          <p className="type-metadata mt-1">{section.text}</p>
        </section>)}</div>
      </ResultsReviewDialog>}
    </section>
  );
}

export function mapHelpSections(campaign: ResultsCampaign, visiblePoints: ResultPoint[], mappedIds: string[], metric: ResultMetric) {
  const missing = visiblePoints.filter((point) => !mappedIds.includes(point.key));
  const conditions = [...new Set(campaign.points.map((point) => point.conditionOfUse).filter(Boolean))];
  return [
    { title: "Índice e cores", text: `${metricLabel(metric)}: escala de 0 a 1, fixa entre campanhas. O índice não representa probabilidade, percentual de dano ou classes de risco. Cor uniforme indica valor completo.` },
    { title: "Faixas", text: "Ponto parcial aparece como faixa em gradiente: do menor valor possível (limite inferior à esquerda) ao maior (limite superior à direita), sem valor central." },
    { title: "Anel e selo", text: "Topo: Bactérias. Inferior direito: Cianobactérias. Inferior esquerdo: COI. Segmento escuro indica conjunto utilizado; vazado, não utilizado. O selo k/3 informa uso no cálculo, não sequenciamento ou aprovação analítica. 0/3 significa indisponível, não índice zero." },
    { title: "Localização", text: `${mappedIds.length} de ${visiblePoints.length} resultados filtrados no mapa. ${missing.length} sem coordenada utilizável${missing.length ? ` (${missing.map((point) => point.siaCode).join(", ")})` : ""}. Resultados sem coordenada permanecem nos totais e na tabela de resultados da campanha.` },
    { title: "Navegação", text: "Clique simples seleciona o cartão, sem zoom. Duplo clique amplia e centra o ponto no zoom máximo; repetir no mesmo ponto retorna ao enquadramento geral da campanha. Em outro ponto, amplia o novo alvo. Os botões de zoom, enquadramento e Ir para o ponto também estão disponíveis por teclado." },
    ...(conditions.length ? [{ title: "Condição de uso", text: `Condição de uso informada: ${conditions.join("; ")}.` }] : []),
  ];
}

function Control({ label, children }: { label: string; children: React.ReactNode }) {
  return <label><span className="type-label text-[var(--ink)]">{label}</span><span className="mt-1 block">{children}</span></label>;
}

function CompletenessSummary({ campaign, metric }: { campaign: ResultsCampaign; metric: ResultMetric }) {
  const completeValues = campaign.points.flatMap((point) => {
    const value = metricRange(point, metric).value;
    return point.completeness === "complete" && value !== null ? [value] : [];
  });
  const mean = completeValues.length
    ? completeValues.reduce((sum, value) => sum + value, 0) / completeValues.length
    : null;
  const items = [
    ["Completos", String(campaign.counts.complete), "3/3"],
    ["Parciais", String(campaign.counts.partialWithTwoSets + campaign.counts.partialWithOneSet), "2/3 ou 1/3"],
    ["Indisponíveis", String(campaign.counts.unavailable), "0/3"],
    ["Total", String(campaign.counts.total), "pontos"],
    ["Índice médio — pontos completos", formatValue(mean), `${completeValues.length} pontos completos`],
  ];
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Completude dos resultados">
    {items.map(([label, value, suffix]) => <article key={label} className="app-card p-4">
      <p className="type-label text-[var(--ink-soft)]">{label}</p>
      <p className="heading-font type-kpi text-[var(--brand-navy-strong)]">{value}</p>
      <p className="type-caption text-[var(--ink-soft)]">{suffix}</p>
    </article>)}
  </div>;
}

function PointDetail({ points, onSelect, point, metric, photoUrl, onFocus }: { points: ResultPoint[]; onSelect: (key: string) => void; point: ResultPoint | null; metric: ResultMetric; photoUrl?: string; onFocus: () => void }) {
  const [photoOpen, setPhotoOpen] = useState(false);
  const [failedPhoto, setFailedPhoto] = useState<string>();
  if (!point) return <aside className="app-card p-5" role="status">Nenhum ponto corresponde aos filtros.</aside>;
  const range = metricRange(point, metric);
  return <aside className="app-card overflow-hidden border-[var(--line-ghost)] bg-[var(--surface-panel)] p-0" aria-live="polite">
    <label className="block p-3 type-label text-[var(--ink)]">Ponto consultado
      <select value={point.key} onChange={(event) => onSelect(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line-strong)] bg-white px-2 text-sm">
        {points.map((item) => <option key={item.key} value={item.key}>{item.siaCode} · {item.municipality}</option>)}
      </select>
    </label>
    {photoUrl && failedPhoto !== photoUrl ? <button type="button" onClick={() => setPhotoOpen(true)} aria-label={`Ampliar foto de ${point.siaCode}`} className="relative block h-48 w-full bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-[var(--brand-teal)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photoUrl} onError={() => setFailedPhoto(photoUrl)} alt={`Foto de campo de ${point.siaCode}`} className="h-full w-full object-cover" />
      <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded bg-black/70 px-2 py-1 text-xs font-bold text-white"><Camera className="h-3.5 w-3.5" />Foto de campo</span>
    </button> : <div className="flex h-32 items-center justify-center gap-2 bg-[var(--surface-soft)] text-[var(--ink-soft)] type-metadata"><Camera aria-hidden="true" className="h-5 w-5" />Foto de campo indisponível</div>}
    {photoOpen && photoUrl && <RiskPhotoModal point={{ code: point.siaCode, municipality: point.municipality ?? "", photoUrl }} onClose={() => setPhotoOpen(false)} />}
    <div className="p-5">
      <p className="type-eyebrow text-[var(--brand-teal)]">{point.siaCode}</p>
      <h3 className="heading-font type-panel-title text-[var(--brand-navy-strong)]">{point.waterBody || "Ponto sem manancial informado"}</h3>
      <p className="type-metadata text-[var(--ink-soft)]">{point.municipality || "Município não informado"}</p>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 type-metadata">
        <dt className="font-bold text-[var(--ink-soft)]">Completude</dt><dd className="font-bold text-[var(--ink)]">{completenessLabel(point.completeness)}</dd>
        <dt className="font-bold text-[var(--ink-soft)]">{metricLabel(metric)}</dt><dd className="font-bold tabular-nums text-[var(--brand-navy-strong)]">{point.completeness === "unavailable" ? "Indisponível" : formatRange(range)}</dd>
        <dt className="font-bold text-[var(--ink-soft)]">Conjuntos utilizados</dt><dd>{point.usedSetCount}/3</dd>
        {metricOptions.filter((option) => option.value !== "overall").map((option) => <div key={option.value} className="contents"><dt className="font-bold text-[var(--ink-soft)]">{option.label}</dt><dd className="tabular-nums">{point.completeness === "unavailable" ? "Indisponível" : formatRange(metricRange(point, option.value))}</dd></div>)}
      </dl>
      <p className="type-caption mt-3 text-[var(--ink-soft)]">{point.coordinates ? `${point.coordinates.latitude.toFixed(5)}, ${point.coordinates.longitude.toFixed(5)}` : "Sem coordenadas — incluído nas contagens e resultados."}</p>
      {point.completeness.startsWith("partial") && <p className="type-metadata mt-2 text-[var(--ink)]">Intervalo possível do índice; sem estimativa pontual.</p>}
      <details className="mt-3 border-t border-[var(--line-ghost)] pt-2 type-metadata text-[var(--ink)]">
        <summary className="flex min-h-11 cursor-pointer items-center font-semibold">Situação dos conjuntos utilizados</summary>
        <ul className="space-y-2">{([['bacteria', 'Bactérias'], ['cyanobacteria', 'Cianobactérias'], ['coi', 'COI']] as const).map(([key, label]) => {
          const component = point.components[key];
          return <li key={key}><strong>{label}: {component.included ? "utilizado" : "não utilizado"}</strong><p>{analyticalStatusText(component)}</p>{component.reason && <p>Motivo informado: {component.reason}</p>}</li>;
        })}</ul>
      </details>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={!point.coordinates} onClick={onFocus} className="min-h-11 rounded-lg border border-[var(--line-strong)] px-3 type-label text-[var(--brand-navy-strong)] disabled:opacity-50">Ir para o ponto</button>
        <Link href={resultDetailHref(point.campaignCode, point.siaCode)} className="inline-flex min-h-11 items-center rounded-lg bg-[var(--brand-navy-strong)] px-3 type-label text-white">Ver resultado completo</Link>
      </div>
      {point.conditionOfUse ? <ConditionOfUseNote text={point.conditionOfUse} /> : null}
      {point.observations ? <p className="type-metadata mt-3 text-[var(--ink-soft)]">{point.observations}</p> : null}
    </div>
  </aside>;
}

/** "Provisório; qualidade não informada" → selo "Provisório" + frase em linguagem comum. */
export function conditionOfUseParts(text: string) {
  const [label, ...rest] = text.split(";").map((part) => part.trim()).filter(Boolean);
  const detail = rest.map((part) => /qualidade não informada/i.test(part) ? "o laboratório ainda não informou a qualidade dos conjuntos; os valores podem mudar" : part).join("; ");
  return { label: label ?? text, detail };
}

function ConditionOfUseNote({ text }: { text: string }) {
  const { label, detail } = conditionOfUseParts(text);
  return <p className="type-metadata mt-4 flex flex-wrap items-center gap-2 text-[var(--ink-soft)]">
    <span className="rounded-full bg-[var(--status-warning-soft)] px-2.5 py-0.5 text-xs font-bold text-[var(--status-warning-strong)]">{label}</span>
    {detail ? <span>{detail}</span> : null}
  </p>;
}

export function resultDetailHref(campaignCode: string, siaCode?: string) {
  const campaign = defaultCampaigns[Number(campaignCode.replace(/^C/, "")) - 1];
  const params = new URLSearchParams({ campaign: campaign?.id ?? campaignCode });
  if (siaCode) params.set("sia", siaCode);
  return `/campanhas/resultados?${params}#results-index-dashboard`;
}

function ResultsTable({ points, metric, onSelect }: { points: ResultPoint[]; metric: ResultMetric; onSelect: (key: string) => void }) {
  return <TablePanel title="Pontos e faixas possíveis" description={`${points.length} resultados, inclusive sem localização.`}>
    <table className="type-table w-full min-w-[620px] text-left"><thead><tr className="bg-[var(--surface-soft)]"><th className="px-3 py-2">SIA</th><th className="px-3 py-2">Município</th><th className="px-3 py-2">Completude</th><th className="px-3 py-2 text-right">{metricLabel(metric)}</th></tr></thead>
      <tbody>{points.map((point) => <tr key={point.key} className="border-t border-[var(--line-ghost)] hover:bg-[var(--surface-soft)]"><td className="p-0"><button className="min-h-11 w-full px-3 py-2 text-left font-bold text-[var(--brand-navy-strong)] focus-visible:outline-2 focus-visible:outline-[var(--brand-teal)]" onClick={() => onSelect(point.key)}>{point.siaCode}</button></td><td className="px-3 py-2">{point.municipality || "—"}</td><td className="px-3 py-2">{completenessLabel(point.completeness)}</td><td className="px-3 py-2 text-right font-bold tabular-nums">{formatRange(metricRange(point, metric))}</td></tr>)}</tbody>
    </table>
  </TablePanel>;
}

function RankingTable({ points, metric }: { points: ResultPoint[]; metric: ResultMetric }) {
  return <TablePanel title="Ranking de resultados completos" description="Resultados parciais e indisponíveis ficam fora do ranking.">
    <table className="type-table w-full min-w-[480px] text-left"><thead><tr className="bg-[var(--surface-soft)]"><th className="px-3 py-2">Posição</th><th className="px-3 py-2">SIA</th><th className="px-3 py-2">Município</th><th className="px-3 py-2 text-right">Valor</th></tr></thead>
      <tbody>{points.map((point, index) => <tr key={point.key} className="border-t border-[var(--line-ghost)]"><td className="px-3 py-2 font-bold">{metric === "overall" ? point.overall.rank ?? index + 1 : index + 1}</td><td className="px-3 py-2 font-bold text-[var(--brand-navy-strong)]">{point.siaCode}</td><td className="px-3 py-2">{point.municipality || "—"}</td><td className="px-3 py-2 text-right font-bold tabular-nums">{formatValue(metricRange(point, metric).value)}</td></tr>)}</tbody>
    </table>
  </TablePanel>;
}

type MunicipalityRow = { name: string; total: number; complete: number; partial: number; unavailable: number };
function MunicipalityTable({ rows }: { rows: MunicipalityRow[] }) {
  return <TablePanel title="Resumo por município" description="Contagens por estado do resultado, sem score municipal sintético.">
    <table className="type-table w-full min-w-[560px] text-left"><thead><tr className="bg-[var(--surface-soft)]"><th className="px-3 py-2">Município</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-right">Completos</th><th className="px-3 py-2 text-right">Parciais</th><th className="px-3 py-2 text-right">Indisponíveis</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.name} className="border-t border-[var(--line-ghost)]"><td className="px-3 py-2 font-bold text-[var(--brand-navy-strong)]">{row.name}</td><td className="px-3 py-2 text-right">{row.total}</td><td className="px-3 py-2 text-right">{row.complete}</td><td className="px-3 py-2 text-right">{row.partial}</td><td className="px-3 py-2 text-right">{row.unavailable}</td></tr>)}</tbody>
    </table>
  </TablePanel>;
}

function ResultsHistory({ campaigns, metric, campaignLabels }: { campaigns: ResultsCampaign[]; metric: ResultMetric; campaignLabels: Record<string, string> }) {
  return <TablePanel title="Histórico por campanha" description="Média dos pontos completos de cada campanha; não há linha conectando lacunas.">
    <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">{campaigns.map((campaign) => {
      const values = campaign.points.flatMap((point) => {
        const value = metricRange(point, metric).value;
        return point.completeness === "complete" && value !== null ? [value] : [];
      });
      const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
      return <article key={campaign.campaignCode} className="rounded-xl border border-[var(--line-ghost)] bg-white p-4"><p className="type-label font-bold text-[var(--brand-navy-strong)]">{campaignLabels[campaign.campaignCode] ?? campaign.campaignCode}</p><p className="heading-font type-kpi mt-1 text-[var(--brand-navy-strong)]">{formatValue(mean)}</p><p className="type-caption text-[var(--ink-soft)]">Índice médio · {values.length} pontos completos</p></article>;
    })}</div>
  </TablePanel>;
}

function TablePanel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section className="app-card min-w-0 overflow-hidden p-0"><header className="border-b border-[var(--line-soft)] p-4"><h3 className="heading-font type-panel-title text-[var(--brand-navy-strong)]">{title}</h3><p className="type-metadata mt-1 text-[var(--ink-soft)]">{description}</p></header><div className="overflow-x-auto">{children}</div></section>;
}

export function metricRange(point: ResultPoint, metric: ResultMetric) {
  return metric === "overall" ? point.overall : point.domains[metric];
}

export function summarizeMunicipalities(points: ResultPoint[]): MunicipalityRow[] {
  const rows = new Map<string, MunicipalityRow>();
  for (const point of points) {
    const name = point.municipality?.trim() || "Município não informado";
    const row = rows.get(name) ?? { name, total: 0, complete: 0, partial: 0, unavailable: 0 };
    row.total += 1;
    if (point.completeness === "complete") row.complete += 1;
    else if (point.completeness === "unavailable") row.unavailable += 1;
    else row.partial += 1;
    rows.set(name, row);
  }
  return [...rows.values()].sort((left, right) => right.complete - left.complete || left.name.localeCompare(right.name, "pt-BR"));
}

export function buildResultMapPoints(
  points: ResultPoint[],
  metric: ResultMetric = "overall",
  campaignLabels: Record<string, string> = {},
  fieldPhotos: Record<string, string> = {},
): CampaignHydroMapPoint[] {
  return points.flatMap((point) => {
    if (!point.coordinates) return [];
    const range = metricRange(point, metric);
    return [{
      id: point.key,
      code: point.siaCode,
      point: point.waterBody ?? undefined,
      campaign: campaignLabels[point.campaignCode] ?? point.campaignCode,
      municipality: point.municipality ?? "",
      waterBody: point.waterBody ?? "",
      original: null,
      effective: { lat: point.coordinates.latitude, lon: point.coordinates.longitude },
      accessibility: "",
      waterAspect: "",
      weatherConditions: "",
      problems: "",
      photoUrl: fieldPhotos[photoKey(point.campaignCode, point.siaCode)] ?? "",
      resultValue: range.value,
      resultLower: range.lower,
      resultUpper: range.upper,
      resultCompleteness: point.completeness,
      resultIncluded: [point.components.bacteria.included, point.components.cyanobacteria.included, point.components.coi.included] as const,
      resultMetricLabel: metricLabel(metric),
    } satisfies CampaignHydroMapPoint];
  });
}

function metricLabel(metric: ResultMetric) {
  return metricOptions.find((option) => option.value === metric)?.label ?? metric;
}


function completenessLabel(value: ResultCompleteness) {
  return ({ complete: "Completo — 3/3", partial_2: "Parcial — 2/3", partial_1: "Parcial — 1/3", unavailable: "Indisponível — 0/3" } as const)[value];
}

function formatRange(range: { value: number | null; lower: number; upper: number }) {
  return range.value === null ? `${formatValue(range.lower)}–${formatValue(range.upper)}` : formatValue(range.value);
}

function formatValue(value: number | null) {
  return formatResultIndex(value, "Sem resultado");
}

function photoKey(campaignCode: string, siaCode: string) {
  return `${campaignCode}|${siaCode}`;
}

function normalizeText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
}
