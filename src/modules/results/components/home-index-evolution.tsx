"use client";

import { useState } from "react";
import { formatResultIndex } from "../format-index";
import Link from "next/link";
import { ResultsReviewDialog } from "@/components/results-review-dialog";
import { defaultCampaigns } from "@/lib/campaign-management";
import type { ResultRange, ResultsCampaign } from "@/modules/results";
import { resultDetailHref } from "./results-index-dashboard";
import { CompleteVsPartialSketch } from "./help-visuals";
import { ResultsInterpretationHelp } from "./results-interpretation-help";
import { continuousResultColor, resultIntervalStops } from "./result-visual";

export const EVOLUTION_SERIES = [
  { key: "overall", label: "Geral", short: "Geral" },
] as const;

export const EVOLUTION_HELP = [
  "Cada coluna é uma campanha. A altura é a média do índice (0 a 1) nos pontos em que os três conjuntos foram analisados.",
  "Ao escolher um ponto, as colunas mostram o valor desse ponto em cada campanha. Se faltou um conjunto, aparece uma faixa com o menor e o maior valor possível, em vez de um número.",
  "Pontos com faixa ficam fora da média. Por isso cada coluna informa quantos completos e quantos parciais teve.",
];

export function evolutionExclusions(campaign: ResultsCampaign, included: number) {
  const points = campaign.points.filter((point) => point.campaignCode === campaign.campaignCode);
  const partial = points.filter((point) => point.completeness === "partial_1" || point.completeness === "partial_2").length;
  const unavailable = points.filter((point) => point.completeness === "unavailable").length;
  const other = points.length - included - partial - unavailable;
  const excluded = points.length - included;
  return {
    label: excluded === partial ? `${partial} parciais` : `${excluded} fora da média`,
    detail: [`${partial} parciais`, `${unavailable} indisponíveis`, ...(other ? [`${other} sem valor geral completo finito`] : [])].join("; "),
  };
}

// Full identifier only: never suffix matching or name-based identity.
export function evolutionSiaKey(sia: string) {
  const match = sia.trim().match(/^(?:SIA[-\s]*)?(\d+)$/i);
  return match ? match[1].replace(/^0+(?=\d)/, "") : null;
}

export function evolutionPointOptions(campaigns: ResultsCampaign[], query = "") {
  const options = new Map<string, { key: string; label: string }>();
  for (const campaign of campaigns) for (const point of campaign.points) {
    const key = evolutionSiaKey(point.siaCode);
    if (!key) continue;
    const label = [point.siaCode, point.waterBody, point.municipality].filter(Boolean).join(" · ");
    const previous = options.get(key);
    options.set(key, { key, label: previous && previous.label !== label ? `${previous.label} / ${label}` : label });
  }
  const normalized = normalizeSearch(query);
  return [...options.values()].filter((option) => normalizeSearch(option.label).includes(normalized))
    .sort((a, b) => a.key.localeCompare(b.key, "pt-BR", { numeric: true }));
}

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[-\s]+/g, " ").trim();
}

export function evolutionSeries(campaign?: ResultsCampaign, selectedSia: string | null = null) {
  const candidates = (campaign?.points ?? []).filter((point) => point.campaignCode === campaign?.campaignCode);
  const matches = selectedSia === null ? [] : candidates.filter((point) => evolutionSiaKey(point.siaCode) === selectedSia);
  const point = matches.length === 1 ? matches[0] : undefined;
  return EVOLUTION_SERIES.map((series) => {
    let range: ResultRange | null = null;
    let included = 0;
    if (selectedSia === null) {
      const values = candidates.flatMap((item) => {
        const value = item.overall.value;
        return item.completeness === "complete" && value !== null && Number.isFinite(value) ? [value] : [];
      });
      included = values.length;
      if (included) {
        const mean = values.reduce((sum, value) => sum + value, 0) / included;
        range = { value: mean, lower: mean, upper: mean };
      }
    } else if (point && point.completeness !== "unavailable") {
      const published = point.overall;
      if (point.completeness === "complete" && published.value !== null && Number.isFinite(published.value)) {
        range = published;
        included = 1;
      } else if (point.completeness !== "complete" && Number.isFinite(published.lower) && Number.isFinite(published.upper)) {
        range = { value: null, lower: published.lower, upper: published.upper };
      }
    }
    return { ...series, range, included, excluded: candidates.length - included };
  });
}

export function evolutionBarStyle(range: ResultRange) {
  if (range.value !== null) return { bottom: "0%", height: `${range.value * 100}%`, backgroundColor: continuousResultColor(range.value) };
  return {
    bottom: `${range.lower * 100}%`, height: `${(range.upper - range.lower) * 100}%`,
    background: `linear-gradient(to top, ${resultIntervalStops(range.lower, range.upper).map((stop) => `${stop.color} ${stop.offset * 100}%`).join(", ")})`,
  };
}

export function HomeIndexEvolution({ campaigns }: { campaigns: ResultsCampaign[] }) {
  const [query, setQuery] = useState("");
  const [selectedSia, setSelectedSia] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [explanation, setExplanation] = useState<{ title: string; paragraphs: string[] } | null>(null);
  const suggestions = evolutionPointOptions(campaigns, query);
  const applied = evolutionPointOptions(campaigns).find((option) => option.key === selectedSia)?.label;
  // Todas as campanhas previstas aparecem, com ou sem resultado publicado.
  const visibleCampaigns = defaultCampaigns;
  function clear() { setQuery(""); setSelectedSia(null); setOpen(false); setActive(-1); }
  function apply(option: { key: string; label: string }) { setSelectedSia(option.key); setQuery(option.label); setOpen(false); setActive(-1); }

  return <section className="app-card min-w-0 border-[var(--line-ghost)] bg-[var(--surface-panel)] p-0" aria-labelledby="home-evolution-title">
    <header className="border-b border-[var(--line-soft)] px-4 py-3 sm:px-5">
      <div className="flex items-center gap-1">
        <h2 id="home-evolution-title" className="heading-font type-section-title text-[var(--brand-navy-strong)]">Evolução do índice geral</h2>
        <ResultsInterpretationHelp title="Como ler a evolução">{EVOLUTION_HELP.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}<CompleteVsPartialSketch /></ResultsInterpretationHelp>
      </div>
      <p className="type-metadata mt-1 text-[var(--ink-soft)]">{selectedSia === null ? "Média dos resultados completos por campanha." : "Resultados do ponto selecionado por campanha."}</p>
      <div className="relative mt-3 max-w-xl" onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) { setOpen(false); setActive(-1); }
      }}>
        <label htmlFor="evolution-point-search" className="type-label text-[var(--ink)]">Ponto de monitoramento</label>
        <div className="mt-1 flex gap-2">
          <input id="evolution-point-search" type="search" role="combobox" autoComplete="off"
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-[var(--line-strong)] bg-white px-3 text-sm text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--brand-teal)]"
            placeholder="SIA, nome do manancial ou município" value={query}
            aria-controls="evolution-suggestions" aria-expanded={open} aria-autocomplete="list" aria-describedby="evolution-applied"
            aria-activedescendant={open && active >= 0 ? `evolution-option-${active}` : undefined}
            onChange={(event) => { const value = event.target.value; setQuery(value); setOpen(Boolean(value)); setActive(-1); if (!value) setSelectedSia(null); }}
            onFocus={() => setOpen(Boolean(query))}
            onKeyDown={(event) => {
              if (event.key === "Escape") { setOpen(false); setActive(-1); }
              if (!suggestions.length) return;
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault(); setOpen(true);
                const next = event.key === "ArrowDown" ? Math.min(active + 1, suggestions.length - 1) : Math.max(active - 1, 0);
                setActive(next);
                requestAnimationFrame(() => document.getElementById(`evolution-option-${next}`)?.scrollIntoView({ block: "nearest" }));
              }
              if (event.key === "Enter" && open) { event.preventDefault(); apply(suggestions[active] ?? suggestions[0]); }
            }} />
          <button type="button" className="min-h-11 rounded-lg border border-[var(--line-strong)] px-3 text-sm font-bold text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--brand-teal)] disabled:opacity-50" disabled={!query && selectedSia === null} onClick={clear}>Limpar</button>
        </div>
        {open && <ul id="evolution-suggestions" role="listbox" aria-label="Pontos publicados" className="absolute inset-x-0 top-full z-20 max-h-52 overflow-y-auto rounded-lg border border-[var(--line-strong)] bg-white p-1">
          {suggestions.map((option, index) => <li key={option.key} role="presentation"><button type="button" role="option" id={`evolution-option-${index}`} aria-selected={active === index} tabIndex={-1}
            className="min-h-11 w-full rounded px-3 py-2 text-left text-sm text-[var(--ink)] hover:bg-[var(--surface-soft)] aria-selected:bg-[var(--surface-soft)]"
            onMouseDown={(event) => event.preventDefault()} onClick={() => apply(option)}>{option.label}</button></li>)}
          {!suggestions.length && <li role="presentation"><span role="status" className="block p-3 text-sm">Nenhum ponto encontrado.</span></li>}
        </ul>}
      </div>
      <p id="evolution-applied" className="type-caption mt-2 text-[var(--ink)]" aria-live="polite">Aplicado: {selectedSia === null ? "médias dos resultados completos" : applied ?? `SIA ${selectedSia}`}.{query && query !== applied ? " Selecione uma sugestão para aplicar a busca." : ""}</p>
    </header>
    <div className="p-4 sm:px-5" role="region" aria-label="Índice geral por campanha">
      <div className="overflow-x-auto pb-1">
      <div className="grid min-w-[42rem] gap-2" style={{ gridTemplateColumns: `repeat(${visibleCampaigns.length}, minmax(4.5rem, 1fr))` }}>
        {visibleCampaigns.map((definition, index) => {
          const code = `C${index + 1}`;
          const campaign = campaigns.find((item) => item.campaignCode === code);
          const series = evolutionSeries(campaign, selectedSia);
          const label = definition.title.split(" - ")[1]?.replace(/20(\d{2})/, "$1") ?? code;
          return <div key={code} className="min-w-0 text-center" data-evolution-campaign={code}>
            <Link href={resultDetailHref(code, selectedSia === null ? undefined : `SIA-${selectedSia.padStart(4, "0")}`)} className="mb-2 inline-flex min-h-11 flex-col items-center justify-center text-sm font-bold leading-tight text-[var(--brand-navy-strong)]">
              <span>{label}</span>
              <span className="mt-0.5 text-xs font-semibold text-[var(--ink-soft)]" data-evolution-code={code}>{code}</span>
            </Link>
            <div className="mx-auto max-w-16">
              {series.map((item) => {
                const text = item.range === null ? "Sem resultado" : item.range.value === null ? `${format(item.range.lower)}–${format(item.range.upper)}` : format(item.range.value);
                return <div key={item.key} data-evolution-series={item.key} aria-label={`${definition.title}, ${item.label}: ${text}${selectedSia === null ? `; média, ${item.included} incluídos, ${item.excluded} excluídos` : item.range?.value === null ? "; faixa possível, sem valor único" : ""}`}>
                  <div className="relative h-32 bg-[var(--surface-soft)]" aria-hidden="true">
                    <span className="pointer-events-none absolute inset-x-0 top-0 border-t border-[var(--line-strong)]" />
                    <span className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-[var(--line-strong)]" />
                    {item.range && <div className="absolute inset-x-1 border-y border-[var(--ink)]" style={evolutionBarStyle(item.range)} />}
                  </div>
                  <p className="mt-1 min-h-9 text-xs font-bold tabular-nums text-[var(--ink)]">{item.range?.value === null ? <>{format(item.range.lower)}<br />–{format(item.range.upper)}</> : text}</p>
                  {selectedSia === null && campaign && <div className="text-xs text-[var(--ink-soft)]">
                    {item.included > 0 && <p>{item.included} completos</p>}
                    {item.excluded > 0 && <button type="button" className="min-h-11 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-[var(--brand-teal)]" onClick={() => setExplanation({ title: `${label}: fora da média`, paragraphs: [evolutionExclusions(campaign, item.included).detail] })}>{evolutionExclusions(campaign, item.included).label}</button>}
                  </div>}
                </div>;
              })}
            </div>
          </div>;
        })}
      </div>
      </div>
    </div>
    {explanation && <ResultsReviewDialog title={explanation.title} closeLabel="Fechar explicação" onClose={() => setExplanation(null)}><div className="space-y-4">{explanation.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div></ResultsReviewDialog>}
  </section>;
}

function format(value: number) { return formatResultIndex(value); }
