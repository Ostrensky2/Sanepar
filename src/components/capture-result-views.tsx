"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bug,
  ChartColumnBig,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  LayoutDashboard,
  Map as MapIcon,
  MapPin,
  Microscope,
} from "lucide-react";
import { bands, bandNames, fixedBandIndex } from "@/modules/results/components/capture-map-scale";
import { formatCaptureIndex } from "@/lib/capture-index/format";
import type { CaptureResultViews } from "@/lib/capture-index/views";
import { defaultCampaigns } from "@/lib/campaign-management";
import type { ResultsCampaign } from "@/modules/results";
import { ResultsIndexDashboard } from "@/modules/results/components/results-index-dashboard";
import { CapturePointEvidence } from "./capture-index-panel";
import { CaptureEffectsSummary } from "./capture-effects-summary";
import { CaptureExoticsReconciliation } from "./capture-exotics-reconciliation";
import { PointMediaGallery } from "@/modules/results/components/point-media-gallery";
import { ResultsInterpretationHelp } from "@/modules/results/components/results-interpretation-help";
import { SiaPeek, peekMembers, useCampaignPoints, type PeekPoint } from "@/modules/results/components/sia-peek";

import { captureViews, type CaptureView } from "@/lib/capture-index/result-tabs";
export type { CaptureView };

/** Subabas da página de resultados. Cada uma responde a uma pergunta; nenhuma recalcula o índice. */
const tabs: Record<CaptureView, { label: string; icon: typeof MapIcon }> = {
  rede: { label: "Visão geral", icon: LayoutDashboard },
  campanha: { label: "Por campanha", icon: ChartColumnBig },
  mapa: { label: "Mapa", icon: MapIcon },
  efeitos: { label: "Tipos de efeito", icon: Microscope },
  exoticas: { label: "Exóticas", icon: Bug },
  ponto: { label: "Por ponto", icon: MapPin },
};

const bandText = (value: number | null) => {
  const i = fixedBandIndex(value);
  return i < 0 ? null : { ...bands[i], name: bandNames[i], index: i };
};
const shortDomains = ["Danos", "Operação", "Saúde"];
const seasons = ["Verão 2026", "Outono 2026", "Inverno 2026"];

const link =
  "inline-flex min-h-11 items-center gap-2 rounded-md px-1 font-semibold text-[var(--brand-navy-strong)] underline underline-offset-4 focus-visible:outline-2";
const button =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--line-strong)] bg-white px-4 font-semibold text-[var(--brand-navy-strong)] transition hover:bg-[var(--surface-soft)] focus-visible:outline-2";
const card = "app-card min-w-0 p-4 sm:p-6";
const cell = "px-3 py-2.5 text-left align-middle tabular-nums";

function BandChip({ value, empty = "Sem medição" }: { value: number | null; empty?: string }) {
  const band = bandText(value);
  if (!band)
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
        <span aria-hidden className="size-3 rounded-full border-2 border-[var(--ink-soft)] bg-transparent" />
        {empty}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--line-ghost)] bg-white px-2.5 py-0.5 text-sm font-semibold text-[var(--ink)]">
      <span aria-hidden className="size-3 rounded-full" style={{ backgroundColor: band.color }} />
      {band.name}
    </span>
  );
}

function Meter({ value, label, empty }: { value: number | null; label?: string; empty?: string }) {
  const band = bandText(value);
  return (
    <div className="min-w-0">
      {label && <p className="truncate text-xs font-semibold text-[var(--text-secondary)]">{label}</p>}
      <div className="flex items-center gap-2">
        <span aria-hidden className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--surface-muted)]">
          <span className="block h-full rounded-full" style={{ width: `${Math.max((value ?? 0) * 100, value ? 2 : 0)}%`, backgroundColor: band?.color }} />
        </span>
        <span className={`${value === null && empty ? "w-auto" : "w-12"} text-right text-sm font-bold tabular-nums`}>{value === null && empty ? empty : formatCaptureIndex(value)}</span>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-[var(--text-secondary)]" aria-label="Faixas da escala fixa de 0 a 1">
      {bands.map((b, i) => (
        <li key={b.label} className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded-full" style={{ backgroundColor: b.color }} />
          <strong className="text-[var(--ink)]">{bandNames[i]}</strong> {b.label}
        </li>
      ))}
      <li className="inline-flex items-center gap-1.5">
        <span aria-hidden className="size-3 rounded-full border-2 border-[var(--ink-soft)]" />
        <strong className="text-[var(--ink)]">Sem estimativa ou sem medição</strong>
      </li>
    </ul>
  );
}

type Peek = { title: string; campaign: number; points: PeekPoint[]; expected?: number };
const peekArea = "rounded-md [&[data-peek]]:cursor-pointer [&[data-peek]:hover]:bg-[var(--surface-soft)] [&[data-peek][aria-expanded=true]]:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-[var(--brand-teal)]";
const peekNumber = peekArea + " -mx-1 px-1 [&[data-peek]]:underline [&[data-peek]]:decoration-dotted [&[data-peek]]:underline-offset-4";

/** Barra 100% empilhada; cada segmento tem número quando cabe e, ao passar o mouse, a lista dos SIAs daquela faixa. */
function StackedBar({ bins, missing, tall, campaign, members, context }: { bins: number[]; missing: number; tall?: boolean; campaign: number; members?: PeekPoint[][]; context: string }) {
  const counts = [...bins, missing];
  const n = counts.reduce((s, x) => s + x, 0);
  return (
    <div role="group" aria-label={`Pontos por faixa · ${context}`} className={`flex gap-0.5 ${tall ? "h-9" : "h-6"}`}>
      {counts.map((count, i) => {
        if (!count) return null;
        const name = i < bands.length ? bandNames[i] : "Sem estimativa ou sem medição";
        return (
          <SiaPeek
            key={i}
            title={`${context} · ${name}`}
            label={`${name}: ${count} ${count === 1 ? "ponto" : "pontos"}`}
            campaign={campaign}
            points={members?.[i] ?? []}
            expected={count}
            className="flex min-w-1.5 items-center justify-center rounded-[3px] text-xs font-bold first:rounded-l-md last:rounded-r-md focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brand-navy-strong)] [&[data-peek]]:cursor-pointer [&[data-peek]:hover]:brightness-95"
            style={{
              flex: `${count} 1 0%`,
              backgroundColor: i < bands.length ? bands[i].color : "transparent",
              color: i >= 3 && i < bands.length ? "#fff" : "var(--ink)",
              border: i === bands.length ? "2px dashed var(--ink-soft)" : undefined,
            }}
          >
            {(100 * count) / n >= 6 ? count : ""}
          </SiaPeek>
        );
      })}
    </div>
  );
}

function Kpi({ label, value, note, accent, peek }: { label: string; value: string; note?: string; accent?: string; peek?: Peek }) {
  return (
    <div className="min-w-0 rounded-xl border border-[var(--line-ghost)] bg-white p-4">
      <p className="text-sm font-semibold text-[var(--text-secondary)]">{label}</p>
      <p className="mt-1 text-3xl font-extrabold tabular-nums text-[var(--brand-navy-strong)]" style={accent ? { color: accent } : undefined}>
        {peek ? <SiaPeek {...peek} className={peekNumber}>{value}</SiaPeek> : value}
      </p>
      {note && <p className="mt-1 text-sm text-[var(--text-secondary)]">{note}</p>}
    </div>
  );
}

/** Título do bloco. A explicação não ocupa a página: abre no "?" ao lado do título. */
function SectionHead({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <header className="mb-4 flex items-center gap-1">
      <h2 className="text-xl font-bold text-[var(--brand-navy-strong)]">{title}</h2>
      {children && <ResultsInterpretationHelp title={title}>{children}</ResultsInterpretationHelp>}
    </header>
  );
}

function Network({ data, href }: { data: CaptureResultViews; href: (view: CaptureView, n?: number) => string }) {
  // Quais SIAs formam cada segmento e cada número: as notas por ponto da própria campanha.
  const pointsByCampaign = useCampaignPoints();
  const members = new Map(data.network.map((row) => {
    const groups = peekMembers(pointsByCampaign[`C${row.campaign}`]);
    return [row.campaign, { ...groups, series: [...groups.bands, groups.missing] }];
  }));
  return (
    <div className="space-y-6">
      <section aria-label="Campanhas medidas" className="grid gap-4 md:grid-cols-3">
        {data.network.map((row) => {
          const n = row.bins.reduce((s, x) => s + x, 0) + row.missing;
          const attention = row.bins.slice(2).reduce((s, x) => s + x, 0);
          const group = members.get(row.campaign)!;
          return (
            <article key={row.campaign} className={card + " flex flex-col gap-4"}>
              <header className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-bold uppercase tracking-wide text-[var(--text-teal)]">Campanha {row.campaign}</p>
                  <h3 className="text-lg font-bold">{seasons[row.campaign - 1]}</h3>
                </div>
                <span className="rounded-full bg-[var(--surface-soft)] px-3 py-1 text-sm font-semibold">
                  {row.all.measured} de {row.all.total} pontos
                </span>
              </header>
              <dl className="grid grid-cols-3 gap-2">
                {([["Média", row.all.mean], ["P90", row.all.p90], ["Maior", row.max]] as const).map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-sm text-[var(--text-secondary)]">{label}</dt>
                    <dd className="text-2xl font-extrabold tabular-nums text-[var(--brand-navy-strong)]">{label === "Maior"
                      ? <SiaPeek className={peekNumber} title={`C${row.campaign} · maior índice`} campaign={row.campaign} points={group.top.filter((point) => formatCaptureIndex(point.value) === formatCaptureIndex(value))}>{formatCaptureIndex(value)}</SiaPeek>
                      : formatCaptureIndex(value)}</dd>
                  </div>
                ))}
              </dl>
              <div className="space-y-2">
                <StackedBar bins={row.bins} missing={row.missing} tall campaign={row.campaign} members={group.series} context={`C${row.campaign}`} />
                <p className="text-sm text-[var(--text-secondary)]">
                  <SiaPeek className={peekNumber} title={`C${row.campaign} · Atenção ou acima`} campaign={row.campaign} points={group.attention} expected={attention}><strong className="text-[var(--ink)]">{attention}</strong> de {n} pontos</SiaPeek> na faixa Atenção ou acima.
                </p>
              </div>
              <Link href={href("campanha", row.campaign)} className={button + " mt-auto"}>
                Abrir a campanha {row.campaign}
              </Link>
            </article>
          );
        })}
      </section>

      <section className={card}>
        <SectionHead title="Quantos pontos em cada faixa">
          <p>Cada barra é uma campanha. Os segmentos contam quantos pontos têm o índice geral em cada faixa da escala fixa de 0 a 1.</p>
          <p>Cada campanha é lida separadamente; as barras só ficam lado a lado para consulta. Não há total nem média juntando campanhas.</p>
          <p>O segmento tracejado, quando aparece, são pontos sem estimativa ou sem medição. Eles não são zero.</p>
          <p>Passe o mouse em um segmento ou em um número da tabela para ver quais SIAs estão ali. Clicar ou tocar fixa a lista, e cada SIA abre a ficha do ponto.</p>
        </SectionHead>
        <div className="space-y-4">
          {data.network.map((row) => (
            <div key={row.campaign} className="grid items-center gap-2 sm:grid-cols-[7rem_1fr]">
              <p className="font-bold">C{row.campaign} · {seasons[row.campaign - 1].split(" ")[0]}</p>
              <StackedBar bins={row.bins} missing={row.missing} tall campaign={row.campaign} members={members.get(row.campaign)!.series} context={`C${row.campaign}`} />
            </div>
          ))}
        </div>
        <div className="mt-5 border-t border-[var(--line-ghost)] pt-4">
          <Legend />
        </div>
        <details className="disclosure mt-4">
          <summary className="min-h-11 cursor-pointer py-2 font-semibold">Ver a contagem em tabela</summary>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--line-strong)]">
                  <th className={cell} scope="col">Faixa</th>
                  {data.network.map((row) => <th key={row.campaign} className={cell} scope="col">C{row.campaign}</th>)}
                </tr>
              </thead>
              <tbody>
                {[...bandNames, "Sem estimativa ou sem medição"].map((name, i) => (
                  <tr key={name} className="border-b border-[var(--line-ghost)]">
                    <th className={cell} scope="row">{name}{i < bands.length ? ` (${bands[i].label})` : ""}</th>
                    {data.network.map((row) => <td key={row.campaign} className={cell}><SiaPeek className={peekNumber + " inline-flex min-h-8 min-w-8 items-center"} title={`C${row.campaign} · ${name}`} campaign={row.campaign} points={members.get(row.campaign)!.series[i]} expected={row.bins[i] ?? row.missing}>{row.bins[i] ?? row.missing}</SiaPeek></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <section className={card}>
        <SectionHead title="Os mesmos pontos nas três campanhas">
          <p>A tabela usa só os SIAs que têm índice nas três campanhas, para comparar sem o efeito da troca de pontos. Cada ponto pesa igual.</p>
          <p>O P90 usa a posição arredondada para cima, sem interpolação.</p>
          <p>Zero é nota calculada. Ponto sem estimativa ou sem medição fica fora da média e do P90.</p>
        </SectionHead>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="border-b border-[var(--line-strong)]">
                {["Campanha", "Pontos", "Média", "P90"].map((h) => <th key={h} scope="col" className={cell}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.network.map((row) => (
                <tr key={row.campaign} className="border-b border-[var(--line-ghost)]">
                  <th scope="row" className={cell}>C{row.campaign} · {seasons[row.campaign - 1]}</th>
                  <td className={cell}>{row.cohort.measured}</td>
                  <td className={cell}><Meter value={row.cohort.mean} /></td>
                  <td className={cell}><Meter value={row.cohort.p90} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

type Place = { waterBody: string | null; municipality: string | null };
function usePlaces(campaign?: number) {
  const [places, setPlaces] = useState<Map<string, Place>>(new Map());
  useEffect(() => {
    if (!campaign) return;
    const controller = new AbortController();
    fetch("/api/results/capture-index/campaigns", { cache: "no-store", signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { campaigns: ResultsCampaign[] } | null) => {
        if (!body || controller.signal.aborted) return;
        const points = body.campaigns.find((c) => c.campaignCode === `C${campaign}`)?.points ?? [];
        setPlaces(new Map(points.map((p) => [p.siaCode, { waterBody: p.waterBody, municipality: p.municipality }])));
      })
      .catch(() => {});
    return () => controller.abort();
  }, [campaign]);
  return places;
}
const placeName = (p?: Place) => [p?.waterBody, p?.municipality].filter(Boolean).join(" · ");

function Campaign({ data, number, href }: { data: CaptureResultViews; number: number; href: (v: CaptureView, n?: number, sia?: string) => string }) {
  const pointsByCampaign = useCampaignPoints();
  const campaignPoints = pointsByCampaign[`C${number}`];
  const places = useMemo(() => new Map((campaignPoints ?? []).map((p) => [p.siaCode, { waterBody: p.waterBody, municipality: p.municipality } as Place])), [campaignPoints]);
  const members = useMemo(() => {
    const groups = peekMembers(campaignPoints);
    return { ...groups, series: [...groups.bands, groups.missing], categories: (["environmental", "operational", "humanHealth"] as const).map((metric) => { const g = peekMembers(campaignPoints, metric); return [...g.bands, g.missing]; }) };
  }, [campaignPoints]);
  const [all, setAll] = useState(false);
  const [search, setSearch] = useState("");
  const s = data.campaignStats;
  const overall = data.network.find((row) => row.campaign === number);
  const attention = overall ? overall.bins.slice(2).reduce((sum, x) => sum + x, 0) : 0;
  const term = search.trim().toLocaleLowerCase("pt-BR");
  const matches = term
    ? data.ranking.filter((row) => `sia ${row.sia} ${placeName(places.get(row.sia))}`.toLocaleLowerCase("pt-BR").includes(term))
    : data.ranking;
  const shown = all || term ? matches : matches.slice(0, 10);
  return (
    <div className="space-y-6">
      <section aria-label="Números da campanha" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Pontos medidos" value={`${s.measured}`} note={`de ${s.total} registrados`} />
        <Kpi label="Índice médio" value={formatCaptureIndex(s.mean)} note="cada ponto pesa igual" />
        <Kpi label="Mediana" value={formatCaptureIndex(s.median)} note="metade dos pontos abaixo" />
        <Kpi label="Percentil 90" value={formatCaptureIndex(s.p90)} note="10% dos pontos acima" />
        <Kpi label="Maior índice" value={formatCaptureIndex(s.max)} note={data.ranking[0] ? `SIA ${data.ranking[0].sia}` : undefined} accent={bandText(s.max)?.color} peek={{ title: `C${number} · maior índice`, campaign: number, points: members.top.filter((point) => formatCaptureIndex(point.value) === formatCaptureIndex(s.max)) }} />
        <Kpi label="Atenção ou acima" value={String(attention)} note={`de ${s.measured} pontos, índice a partir de 0,15`} accent={attention ? bands[2].color : undefined} peek={{ title: `C${number} · Atenção ou acima`, campaign: number, points: members.attention, expected: attention }} />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        {overall && (
          <section className={card + " flex flex-col"}>
            <SectionHead title="Pontos por faixa do índice geral"><p>Quantos pontos da C{number} têm o índice geral em cada faixa da escala fixa de 0 a 1. A porcentagem é sobre os pontos registrados na campanha.</p><p>Passe o mouse em uma faixa para ver quais SIAs estão nela. Clicar ou tocar fixa a lista, e cada SIA abre a ficha do ponto.</p><p>As faixas orientam a investigação; não são classes de risco comprovado.</p></SectionHead>
            <ul className="flex flex-1 flex-col justify-around gap-3">
              {[...bandNames, "Sem estimativa ou sem medição"].map((name, i) => {
                const count = i < bands.length ? overall.bins[i] : overall.missing;
                const pct = s.total ? (100 * count) / s.total : 0;
                return (
                  <li key={name}><SiaPeek className={peekArea + " -mx-1.5 grid w-[calc(100%+0.75rem)] grid-cols-[9.5rem_1fr_4.5rem] items-center gap-3 px-1.5 py-1 text-left"} title={`C${number} · ${name}`} campaign={number} points={members.series[i]} expected={count}>
                    <span className="inline-flex items-center gap-2 text-sm font-semibold">
                      <span aria-hidden className={`size-3 shrink-0 rounded-full ${i === bands.length ? "border-2 border-[var(--ink-soft)]" : ""}`} style={i < bands.length ? { backgroundColor: bands[i].color } : undefined} />
                      {name}
                    </span>
                    <span aria-hidden className="h-4 overflow-hidden rounded bg-[var(--surface-soft)]">
                      <span className="block h-full rounded" style={{ width: `${pct}%`, backgroundColor: i < bands.length ? bands[i].color : "var(--line-strong)" }} />
                    </span>
                    <span className="text-right text-sm tabular-nums"><strong>{count}</strong> · {Math.round(pct)}%</span>
                  </SiaPeek></li>
                );
              })}
            </ul>
          </section>
        )}

        <section className={card}>
          <SectionHead title="As três categorias"><p>A maior das três é o piso do índice geral; um dano distinto e documentado em outra categoria pode elevá-lo. O índice geral não é a média das três.</p><p>Cada barra mostra a distribuição dos pontos da campanha naquela categoria, com a média ao lado. Passe o mouse em um segmento para ver os SIAs daquela faixa na categoria.</p></SectionHead>
          <div className="space-y-5">
            {data.categories.map((category, i) => (
              <div key={category.name} className="space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-bold">{category.name}</h3>
                  <span className="text-sm text-[var(--text-secondary)]">média <strong className="text-[var(--ink)]">{formatCaptureIndex(data.categoryMeans[i])}</strong></span>
                </div>
                <StackedBar bins={category.bins} missing={category.missing} campaign={number} members={members.categories[i]} context={`C${number} · ${category.name}`} />
              </div>
            ))}
          </div>
          <div className="mt-5 border-t border-[var(--line-ghost)] pt-4"><Legend /></div>
        </section>
      </div>

      <section className={card}>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <SectionHead title={term ? `${matches.length} ponto(s) encontrado(s)` : all ? `Todos os ${data.ranking.length} pontos medidos` : "Os 10 pontos com maior índice"}>
            <p>Os pontos estão em ordem de atenção dentro da C{number}: do maior para o menor índice geral.</p>
            <p>A posição compara pontos da mesma campanha. Não é probabilidade de dano.</p>
            <p>As três colunas à direita mostram a nota de cada categoria. Abra a ficha para ver o que formou a nota.</p>
          </SectionHead>
          <div className="flex flex-wrap items-end gap-2">
            <label className="block text-sm font-semibold">
              Buscar SIA, manancial ou município
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ex.: 78 ou Iraí" className="mt-1 block min-h-11 w-64 max-w-full rounded-lg border border-[var(--line-strong)] bg-white px-3 text-base font-normal" />
            </label>
            <Link href={href("mapa", number)} className={button}><MapIcon className="size-4" aria-hidden />Ver no mapa</Link>
          </div>
        </div>
        {!shown.length && <p role="status" className="rounded-lg bg-[var(--surface-soft)] p-4">Nenhum ponto medido com esse texto na C{number}.</p>}
        <ul className="space-y-3 md:hidden">
          {shown.map((row) => (
            <li key={row.sia}>
              <Link href={href("ponto", number, row.sia)} className="block rounded-xl border border-[var(--line-ghost)] bg-white p-3 focus-visible:outline-2">
                <span className="flex items-start gap-3">
                  <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-soft)] text-sm font-bold">{row.rank}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">SIA {row.sia}</span>
                    <span className="block text-sm text-[var(--text-secondary)]">{placeName(places.get(row.sia)) || (row.coi ? "16S e COI" : "só 16S")}</span>
                  </span>
                  <span className="text-right">
                    <span className="block text-xl font-extrabold tabular-nums">{formatCaptureIndex(row.general)}</span>
                    <BandChip value={row.general} />
                  </span>
                </span>
                <span className="mt-3 grid grid-cols-3 gap-3">
                  {row.domains.map((value, i) => <Meter key={i} value={value} label={shortDomains[i]} />)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <div className={`hidden overflow-x-auto md:block ${shown.length ? "" : "md:hidden"}`}>
          <table className="w-full min-w-[56rem] text-sm">
            <thead>
              <tr className="border-b border-[var(--line-strong)] text-[var(--text-secondary)]">
                <th scope="col" className={cell}>Posição</th>
                <th scope="col" className={cell}>Ponto</th>
                <th scope="col" className={cell}>Índice geral</th>
                <th scope="col" className={cell + " w-36"}>Danos físicos e ambientais</th>
                <th scope="col" className={cell + " w-36"}>Riscos operacionais</th>
                <th scope="col" className={cell + " w-36"}>Perigo à saúde</th>
                <th scope="col" className={cell}><span className="sr-only">Abrir</span></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.sia} className="border-b border-[var(--line-ghost)] hover:bg-[var(--surface-soft)]">
                  <td className={cell}><span className="inline-flex size-8 items-center justify-center rounded-full bg-[var(--surface-soft)] font-bold">{row.rank}</span></td>
                  <th scope="row" className={cell}>
                    <span className="block font-bold">SIA {row.sia}</span>
                    <span className="block font-normal text-[var(--text-secondary)]">{placeName(places.get(row.sia)) || (row.coi ? "16S e COI" : "só 16S")}</span>
                  </th>
                  <td className={cell}>
                    <span className="block text-lg font-extrabold">{formatCaptureIndex(row.general)}</span>
                    <BandChip value={row.general} />
                  </td>
                  {row.domains.map((value, i) => (
                    <td key={i} className={cell}><Meter value={value} /></td>
                  ))}
                  <td className={cell}><Link className={link} href={href("ponto", number, row.sia)}>Ficha</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!term && data.ranking.length > 10 && (
          <button type="button" className={button + " mt-4"} onClick={() => setAll(!all)}>
            {all ? "Mostrar só os 10 primeiros" : `Mostrar os ${data.ranking.length} pontos`}
          </button>
        )}
      </section>

      <section className={card}>
        <SectionHead title="O que foi medido"><p>Quantos pontos da campanha têm biblioteca utilizável em cada marcador.</p><p>O cloroplasto (algas) é uma leitura do próprio 16S, não um terceiro marcador.</p><p>Ponto com um só marcador pode ter nota em algumas categorias e ficar sem estimativa em outras.</p></SectionHead>
        <div className="grid gap-x-10 gap-y-4 sm:grid-cols-2">
          {data.markers.map((m) => (
            <div key={m.name}>
              <div className="flex justify-between text-sm"><strong>{m.name}</strong><span className="tabular-nums">{m.usable} de {s.total} pontos</span></div>
              <span aria-hidden className="mt-1 block h-3 overflow-hidden rounded-full bg-[var(--surface-muted)]">
                <span className="block h-full rounded-full bg-[var(--brand-teal)]" style={{ width: `${s.total ? (100 * m.usable) / s.total : 0}%` }} />
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function MapTab({ campaign }: { campaign: number }) {
  const [state, setState] = useState<ResultsCampaign[] | "error" | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/results/capture-index/campaigns", { cache: "no-store", signal: controller.signal })
      .then(async (r) => { if (!r.ok) throw new Error(); return ((await r.json()) as { campaigns: ResultsCampaign[] }).campaigns; })
      .then((c) => { if (!controller.signal.aborted) setState(c); })
      .catch(() => { if (!controller.signal.aborted) setState("error"); });
    return () => controller.abort();
  }, []);
  const labels = Object.fromEntries(defaultCampaigns.map((item, index) => [`C${index + 1}`, item.title]));
  if (state === "error") return <p role="alert" className={card}>Não foi possível carregar o mapa agora.</p>;
  if (!state) return <section className="app-card h-96 animate-pulse bg-[var(--surface-soft)]" aria-label="Carregando o mapa" />;
  return <ResultsIndexDashboard key={campaign} campaigns={state} initialCampaignCode={`C${campaign}`} campaignLabels={labels} embedded />;
}

function Point({ data, campaign, sia, effect, href }: { data: CaptureResultViews; campaign: number; sia?: string; effect?: string; href: (v: CaptureView, n?: number, sia?: string) => string }) {
  const router = useRouter();
  const places = usePlaces(campaign);
  const row = sia ? data.ranking.find((r) => r.sia === sia) : undefined;
  const options = useMemo(() => [...data.points].sort((a, b) => Number(a) - Number(b)), [data.points]);
  const position = row ? data.ranking.indexOf(row) : -1;
  const previous = position > 0 ? data.ranking[position - 1] : undefined;
  const next = position >= 0 ? data.ranking[position + 1] : undefined;
  return (
    <div className="space-y-6">
      <section className={card}>
        <label className="block max-w-xl text-sm font-semibold">
          Ponto de monitoramento na C{campaign}
          <select
            className="mt-1 block min-h-11 w-full rounded-lg border border-[var(--line-strong)] bg-white px-3 text-base"
            value={sia && data.points.includes(sia) ? sia : ""}
            onChange={(e) => router.push(href("ponto", campaign, e.target.value))}
          >
            <option value="" disabled>Escolha o SIA</option>
            {options.map((id) => (
              <option key={id} value={id}>SIA {id}{placeName(places.get(id)) ? ` · ${placeName(places.get(id))}` : ""}</option>
            ))}
          </select>
        </label>
        {!sia && <p className="mt-3 text-[var(--text-secondary)]">Escolha um ponto, ou abra a ficha pela tabela da aba Por campanha.</p>}
        {(previous || next) && (
          <nav aria-label="Pontos vizinhos na ordem de atenção" className="mt-3 flex flex-wrap gap-2">
            {previous && <Link className={button} href={href("ponto", campaign, previous.sia)}><ChevronLeft className="size-4" aria-hidden />{previous.rank}º · SIA {previous.sia}</Link>}
            {next && <Link className={button} href={href("ponto", campaign, next.sia)}>{next.rank}º · SIA {next.sia}<ChevronRight className="size-4" aria-hidden /></Link>}
          </nav>
        )}
      </section>

      {sia && !data.point && <p role="status" className={card}>SIA {sia} sem registro nesta campanha.</p>}
      {sia && data.point && (
        <>
          <section className={card}>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,18rem)_1fr]">
              <div className="space-y-2 rounded-xl p-5 text-white" style={{ background: "linear-gradient(160deg, var(--brand-navy-strong), var(--brand-navy))" }}>
                <p className="text-sm font-semibold uppercase tracking-wide opacity-80">SIA {sia} · C{campaign}</p>
                <p className="text-lg font-bold leading-snug">{placeName(places.get(sia)) || "Ponto de captação"}</p>
                <p className="pt-2 text-sm opacity-80">Índice geral</p>
                <p className="text-5xl font-extrabold tabular-nums">{data.point.general}</p>
                <div className="pt-1"><BandChip value={data.point.exact.general} empty={data.point.state === "sem estimativa" ? "Sem estimativa" : "Sem medição"} /></div>
                {data.point.state === "sem estimativa" && <p className="pt-2 text-sm">Há leitura neste ponto e campanha, mas a nota 0.8 não pode ser afirmada. Não é zero.</p>}
                {row?.rank && <p className="pt-2 text-sm">{row.rank}º de {data.ranking.length} pontos medidos na campanha</p>}
              </div>
              <div className="min-w-0 space-y-5">
                <div>
                  <h2 className="text-xl font-bold text-[var(--brand-navy-strong)]">Categorias</h2>
                  <p className="text-sm text-[var(--text-secondary)]">
                    {row?.predominant ? <>Categoria de maior nota: <strong className="text-[var(--ink)]">{row.predominant}</strong>. </> : null}
                    Marcadores: {data.point.coverage}.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  {data.point.domains.map((d) => (
                    <Meter key={d.key} value={data.point!.exact.domains[d.key] ?? null} label={d.label} empty={data.point!.state === "sem medição" ? "sem medição" : "sem estimativa"} />
                  ))}
                </div>
                <div>
                  <h3 className="mb-2 font-bold">O mesmo ponto em cada campanha</h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {data.history.map((h) => (
                      <Link
                        key={h.campaign}
                        href={href("ponto", h.campaign, sia)}
                        aria-current={h.campaign === campaign ? "page" : undefined}
                        className={`flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border p-3 transition hover:bg-[var(--surface-soft)] sm:block ${h.campaign === campaign ? "border-[var(--brand-navy)] ring-2 ring-[var(--brand-blue-soft)]" : "border-[var(--line-ghost)]"}`}
                      >
                        <span className="block text-sm font-semibold text-[var(--text-secondary)]">C{h.campaign} · {seasons[h.campaign - 1].split(" ")[0]}</span>
                        <span className="block text-2xl font-extrabold tabular-nums">{!h.present ? "—" : h.state === "sem estimativa" ? "sem estimativa" : formatCaptureIndex(h.score)}</span>
                        <span className="block text-sm">{h.present ? <BandChip value={h.score} empty={h.state === "sem estimativa" ? "Sem estimativa" : "Sem medição"} /> : "Sem registro"}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>
          <section className={card + " space-y-4"}>
            <CapturePointEvidence row={data.point} version={data.version} effectId={effect} compact />
          </section>
          <section className={card}>
            <PointMediaGallery key={campaign + "-" + sia} campaign={campaign} sia={sia} />
          </section>
        </>
      )}
    </div>
  );
}

type Props = {
  path: string;
  view: CaptureView;
  campaign?: number;
  sia?: string;
  effect?: string;
  origin?: string;
  from?: string;
  back?: string;
};
const legacyHash: Record<string, CaptureView> = {
  "#results-index-dashboard": "mapa",
  "#tipos-de-efeito": "efeitos",
  "#exoticas": "exoticas",
  "#consulta-por-sia": "ponto",
};
export function CaptureResultViewsPanel({ path, view, campaign, sia, effect, origin, from, back }: Props) {
  const router = useRouter();
  const selectedCampaign = view === "rede" ? campaign : campaign ?? 3;
  // Links antigos apontavam seções por fragmento; agora cada seção é uma subaba.
  useEffect(() => {
    function restoreFragment() {
      const url = new URL(window.location.href);
      const next = legacyHash[url.hash] ?? (/^#detalhe-sia-c[1-3]$/.test(url.hash) ? "ponto" : undefined);
      if (!next) return;
      url.searchParams.set("vista", next);
      if (next !== "ponto") url.searchParams.delete("sia");
      router.replace(url.pathname + "?" + url.searchParams.toString());
    }
    restoreFragment();
    window.addEventListener("hashchange", restoreFragment);
    return () => window.removeEventListener("hashchange", restoreFragment);
  }, [router]);
  function href(next: CaptureView, number = selectedCampaign, point?: string) {
    const q = new URLSearchParams({ vista: next });
    if (number && next !== "rede") q.set("campaign", String(number));
    if (point && next === "ponto") q.set("sia", point);
    if (effect && (next === "ponto" || next === "efeitos")) q.set("effect", effect);
    if (origin) q.set("origem", origin);
    if (from) q.set("fromCampaign", from);
    return path + "?" + q;
  }
  const needsViews = view === "rede" || view === "campanha" || view === "ponto";
  const query = new URLSearchParams({ format: "views" });
  if (selectedCampaign && view !== "rede") query.set("campaign", String(selectedCampaign));
  if (sia && view === "ponto") query.set("sia", sia);
  const url = "/api/results/capture-index?" + query;
  const [state, setState] = useState<{ url: string; data?: CaptureResultViews; error?: string }>();
  useEffect(() => {
    if (!needsViews) return;
    const controller = new AbortController();
    void fetch(url, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error([401, 403].includes(response.status) ? "Seu perfil não tem acesso a este resultado." : "Não foi possível carregar os resultados.");
        const data: CaptureResultViews = await response.json();
        if (!controller.signal.aborted) setState({ url, data });
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setState({ url, error: error.message });
      });
    return () => controller.abort();
  }, [url, needsViews]);
  const data = state?.url === url ? state.data : undefined;
  const exportQuery = selectedCampaign && view !== "rede" ? "&campaign=" + selectedCampaign : "";

  return (
    <div className="min-w-0 space-y-6">
      <div className="space-y-4">
        <nav aria-label="Subabas de resultados" className="-mx-1 overflow-x-auto px-1 pb-1">
          <ul className="flex w-max min-w-full gap-1 rounded-xl border border-[var(--line-ghost)] bg-white p-1 shadow-sm">
            {captureViews.map((key) => {
              const Icon = tabs[key].icon;
              const active = view === key;
              return (
                <li key={key} className="flex-1">
                  <Link
                    aria-current={active ? "page" : undefined}
                    href={href(key, selectedCampaign ?? 3, key === "ponto" ? sia : undefined)}
                    className={`flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm font-semibold transition focus-visible:outline-2 ${active ? "bg-[var(--brand-navy-strong)] text-white shadow" : "text-[var(--text-secondary)] hover:bg-[var(--surface-soft)] hover:text-[var(--brand-navy-strong)]"}`}
                  >
                    <Icon className="size-4" aria-hidden />
                    {tabs[key].label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        {view !== "rede" && (
          <div role="group" aria-label="Campanha exibida" className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-sm font-semibold text-[var(--text-secondary)]">Campanha</span>
            {[1, 2, 3].map((n) => (
              <Link
                key={n}
                href={href(view, n, view === "ponto" ? sia : undefined)}
                aria-current={selectedCampaign === n ? "true" : undefined}
                className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition focus-visible:outline-2 ${selectedCampaign === n ? "border-[var(--brand-navy-strong)] bg-[var(--brand-navy-strong)] text-white" : "border-[var(--line-strong)] bg-white text-[var(--brand-navy-strong)] hover:bg-[var(--surface-soft)]"}`}
              >
                C{n} <span className="font-normal opacity-80">{seasons[n - 1]}</span>
              </Link>
            ))}
          </div>
        )}
        {back && (
          <Link href={back} className={link}>
            Voltar {origin === "efeitos" ? "ao quadro de efeitos" : "ao mapa"} da campanha
          </Link>
        )}
      </div>

      {view === "mapa" && selectedCampaign ? (
        <MapTab campaign={selectedCampaign} />
      ) : view === "efeitos" && selectedCampaign ? (
        <CaptureEffectsSummary key={`effects-${selectedCampaign}`} campaign={selectedCampaign} />
      ) : view === "exoticas" && selectedCampaign ? (
        <CaptureExoticsReconciliation campaign={selectedCampaign} />
      ) : state?.url === url && state.error ? (
        <p role="alert" className={card}>{state.error}</p>
      ) : !data ? (
        <section className="app-card h-72 animate-pulse bg-[var(--surface-soft)]" role="status" aria-label="Carregando resultados" />
      ) : view === "rede" ? (
        <Network data={data} href={href} />
      ) : view === "campanha" && selectedCampaign ? (
        <Campaign data={data} number={selectedCampaign} href={href} />
      ) : selectedCampaign ? (
        <Point data={data} campaign={selectedCampaign} sia={sia} effect={effect} href={href} />
      ) : null}

      <footer className="flex flex-wrap items-center gap-2 border-t border-[var(--line-ghost)] pt-4">
        <a className={button} href={"/api/results/capture-index?format=csv" + exportQuery}><Download className="size-4" aria-hidden />Exportar para leitura</a>
        <a className={button} href={"/api/results/capture-index?format=audit" + exportQuery}><Download className="size-4" aria-hidden />Exportar para auditoria</a>
        <Link className={link + " ml-auto"} href="/resultados/calculos"><FileText className="size-4" aria-hidden />Como o índice é calculado</Link>
      </footer>
    </div>
  );
}
