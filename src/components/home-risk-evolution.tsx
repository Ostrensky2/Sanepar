"use client";

import { useMemo, useState } from "react";
import { campaignIdentityKey } from "@/lib/campaign-identity";
import { defaultCampaigns } from "@/lib/campaign-management";
import {
  laboratoryRiskColor,
  laboratoryRiskLabel,
  type LaboratoryRiskLevel,
  type LaboratoryRiskPoint,
} from "@/lib/laboratory-risk";

const ALL_POINTS = "all";

export type RiskEvolutionPeriod = {
  campaignId: string;
  campaignLabel: string;
  axisLabel: string;
  score: number | null;
  riskLabel: string | null;
  color: string | null;
};

export function HomeRiskEvolution({ points }: { points: LaboratoryRiskPoint[] }) {
  const pointOptions = useMemo(() => buildRiskPointOptions(points), [points]);
  const [pointQuery, setPointQuery] = useState("");
  const [selectedPointKey, setSelectedPointKey] = useState(ALL_POINTS);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const suggestions = useMemo(
    () => filterRiskPointOptions(pointOptions, pointQuery),
    [pointOptions, pointQuery],
  );
  const periods = useMemo(
    () => buildRiskEvolutionPeriods(points, selectedPointKey),
    [points, selectedPointKey],
  );
  const selectedLabel =
    pointOptions.find((option) => option.key === selectedPointKey)?.label ??
    "Média dos pontos publicados";
  const hasAppliedPoint = selectedPointKey !== ALL_POINTS;

  function applyPoint(option: (typeof pointOptions)[number]) {
    setPointQuery(option.label);
    setSelectedPointKey(option.key);
    setSuggestionsOpen(false);
    setActiveSuggestion(-1);
  }

  return (
    <section
      className="app-card overflow-hidden border-[var(--line-ghost)] bg-[var(--surface-panel)] p-0 shadow-[var(--shadow-soft)]"
      aria-labelledby="risk-evolution-title"
    >
      <div className="flex flex-col gap-3 border-b border-[var(--line-soft)] p-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="type-eyebrow text-[var(--brand-teal)]">Série por campanha</p>
          <h2
            id="risk-evolution-title"
            className="heading-font type-section-title text-[var(--brand-navy-strong)]"
          >
            Evolução do risco integrado
          </h2>
          <p className="type-metadata mt-1 text-[var(--ink-soft)]">
            Média aritmética dos scores finitos da publicação válida ou resultado do ponto selecionado.
          </p>
        </div>
        <div className="type-label flex min-w-0 flex-col gap-1 text-[var(--ink)] sm:w-96">
          <label htmlFor="risk-point-search">Ponto de monitoramento</label>
          <div
            className="relative"
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setSuggestionsOpen(false);
                setActiveSuggestion(-1);
              }
            }}
          >
            <div className="flex items-center gap-2">
              <input
              id="risk-point-search"
              type="search"
              role="combobox"
              autoComplete="off"
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-[var(--line-strong)] bg-white px-3 text-sm text-[var(--ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-teal)] focus-visible:ring-offset-2"
              placeholder="Digite SIA, ponto ou município"
              value={pointQuery}
              onChange={(event) => {
                const query = event.target.value;
                setPointQuery(query);
                setSuggestionsOpen(Boolean(query));
                setActiveSuggestion(-1);
                if (!query) setSelectedPointKey(ALL_POINTS);
              }}
              onFocus={() => setSuggestionsOpen(Boolean(pointQuery))}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setSuggestionsOpen(false);
                  return;
                }
                if (!suggestions.length) return;
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  setSuggestionsOpen(true);
                  setActiveSuggestion((current) =>
                    event.key === "ArrowDown"
                      ? Math.min(current + 1, suggestions.length - 1)
                      : Math.max(current - 1, 0),
                  );
                }
                if (event.key === "Enter" && suggestionsOpen) {
                  event.preventDefault();
                  applyPoint(suggestions[activeSuggestion] ?? suggestions[0]);
                }
              }}
              aria-autocomplete="list"
              aria-controls="risk-point-suggestions"
              aria-expanded={suggestionsOpen}
              aria-activedescendant={
                suggestionsOpen && activeSuggestion >= 0
                  ? `risk-point-option-${activeSuggestion}`
                  : undefined
              }
              aria-describedby="risk-point-help risk-point-applied"
              />
              <button
                type="button"
                className="min-h-11 rounded-lg border border-[var(--line-strong)] px-3 text-sm font-bold text-[var(--brand-navy-strong)] disabled:cursor-not-allowed disabled:opacity-45"
                disabled={!pointQuery && !hasAppliedPoint}
                onClick={() => {
                  setPointQuery("");
                  setSelectedPointKey(ALL_POINTS);
                  setSuggestionsOpen(false);
                }}
              >
                Limpar
              </button>
            </div>
            {suggestionsOpen && suggestions.length ? (
              <ul
                id="risk-point-suggestions"
                role="listbox"
                aria-label="Sugestões de pontos de monitoramento"
                className="absolute inset-x-0 top-full z-20 mt-1 max-h-44 overflow-y-auto rounded-lg border border-[var(--line-strong)] bg-white p-1 shadow-[var(--shadow-soft)]"
              >
                {suggestions.map((option, index) => (
                  <li key={option.key}>
                    <button
                      id={`risk-point-option-${index}`}
                      type="button"
                      role="option"
                      aria-selected={index === activeSuggestion}
                      className="min-h-11 w-full rounded-md px-3 text-left text-sm text-[var(--ink)] hover:bg-[var(--surface-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-teal)] aria-selected:bg-[var(--surface-soft)]"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => applyPoint(option)}
                    >
                      {option.label}
                    </button>
                  </li>
                ))}
              </ul>
            ) : suggestionsOpen ? (
              <p
                id="risk-point-suggestions"
                role="status"
                className="absolute inset-x-0 top-full z-20 mt-1 rounded-lg border border-[var(--line-strong)] bg-white px-3 py-2 text-sm text-[var(--ink)] shadow-[var(--shadow-soft)]"
              >
                Nenhum ponto encontrado.
              </p>
            ) : null}
          </div>
          <span id="risk-point-help" className="type-caption font-normal text-[var(--ink-soft)]">
            Digite parte do SIA, ponto ou município e escolha uma sugestão com as setas e Enter.
          </span>
          <strong
            id="risk-point-applied"
            className="type-caption text-[var(--brand-navy-strong)]"
            aria-live="polite"
          >
            Aplicado: {hasAppliedPoint ? selectedLabel : "média das campanhas"}
            {pointQuery && !hasAppliedPoint ? " (a busca ainda não alterou o gráfico)" : ""}
          </strong>
        </div>
      </div>

      <div
        className="overflow-x-auto border-b border-[var(--line-soft)] bg-[var(--surface-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--brand-teal)]"
        role="region"
        aria-label="Gráfico de evolução do risco; deslize horizontalmente para ver todas as campanhas"
        tabIndex={0}
      >
        <ol
          className="grid h-44 min-w-[42rem] grid-cols-9 items-end gap-2 px-3 pt-4 sm:min-w-0 sm:px-4"
          aria-label={`Risco integrado por campanha: ${selectedLabel}`}
        >
          {periods.map((period) => {
            const score = period.score;
            const hasScore = score !== null;
            return (
              <li
                key={period.campaignId}
                className="flex h-full min-w-0 flex-col justify-end text-center"
                aria-label={`${period.campaignLabel}: ${hasScore ? `${formatScore(score)}${period.riskLabel ? `, ${period.riskLabel}` : ""}` : "Sem resultado"}`}
              >
                <div className="flex min-h-0 flex-1 items-end justify-center">
                  {hasScore ? (
                    <div
                      className="flex w-full max-w-20 items-start justify-center rounded-t-md px-1 pt-2 text-xs font-bold tabular-nums text-white"
                      style={{
                        height: `${Math.max(score * 100, 22)}%`,
                        backgroundColor: period.color ?? "var(--surface-muted-strong)",
                      }}
                      title={period.riskLabel ?? undefined}
                    >
                      {formatScore(score)}
                    </div>
                  ) : (
                    <span className="pb-2 text-xs font-semibold leading-tight text-[var(--ink-soft)]">
                      <span className="block">Sem</span>
                      <span className="block">resultado</span>
                    </span>
                  )}
                </div>
                <span className="type-caption border-t border-[var(--line-strong)] py-2 font-bold text-[var(--brand-navy-strong)]">
                  {period.axisLabel}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3" aria-label="Legenda das classes de risco">
        {RISK_LEGEND.map(({ level, label }) => (
          <span key={level} className="type-caption inline-flex items-center gap-1.5 text-[var(--ink-soft)]">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: laboratoryRiskColor(level) }} aria-hidden="true" />
            {label}
          </span>
        ))}
        <span className="type-caption basis-full text-[var(--ink-soft)]">
          Cor da média: faixa do resultado publicado mais próximo.
        </span>
      </div>
    </section>
  );
}

export function buildRiskEvolutionPeriods(
  points: LaboratoryRiskPoint[],
  selectedPointKey = ALL_POINTS,
): RiskEvolutionPeriod[] {
  return defaultCampaigns.map((campaign) => {
    const campaignPoints = points.filter(
      (point) => campaignIdentityKey(null, point.campaign) === campaign.id,
    );

    if (selectedPointKey === ALL_POINTS) {
      const scores = campaignPoints
        .map((point) => point.score)
        .filter((score): score is number => isFiniteScore(score));
      const score = scores.length
        ? scores.reduce((total, value) => total + value, 0) / scores.length
        : null;
      const nearestPublishedResult =
        score === null ? null : nearestClassifiedResult(campaignPoints, score);
      return {
        campaignId: campaign.id,
        campaignLabel: campaign.title,
        axisLabel: campaignAxisLabel(campaign.title, campaign.period),
        score,
        riskLabel:
          score === null
            ? null
            : nearestPublishedResult
              ? `Média; faixa visual derivada do resultado publicado mais próximo: ${laboratoryRiskLabel(nearestPublishedResult.riskLevel)}`
              : "Média; faixa visual indisponível por ausência de resultado publicado com classe",
        color: nearestPublishedResult
          ? laboratoryRiskColor(nearestPublishedResult.riskLevel)
          : null,
      };
    }

    const point = campaignPoints.find(
      (candidate) => riskPointIdentityKey(candidate) === selectedPointKey,
    );
    const score = isFiniteScore(point?.score) ? point.score : null;

    return {
      campaignId: campaign.id,
      campaignLabel: campaign.title,
      axisLabel: campaignAxisLabel(campaign.title, campaign.period),
      score,
      riskLabel: score === null ? null : point?.riskLabel ?? null,
      color: score === null || !point ? null : laboratoryRiskColor(point.riskLevel),
    };
  });
}

function campaignAxisLabel(title: string, period: string) {
  const match = `${title} ${period}`.match(
    /\b(Verão|Outono|Inverno|Primavera)\s+(?:de\s+)?(20\d{2})\b/i,
  );

  return match ? `${match[1]} ${match[2].slice(-2)}` : title;
}

export function buildRiskPointOptions(points: LaboratoryRiskPoint[]) {
  const options = new Map<string, string>();

  for (const point of points) {
    const key = riskPointIdentityKey(point);
    if (!key || options.has(key)) continue;
    const sia = normalizeSiaLabel(point.code);
    const label = [sia, point.point, point.municipality].filter(Boolean).join(" · ");
    options.set(key, label || "Ponto sem identificação");
  }

  return [...options.entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((left, right) => left.label.localeCompare(right.label, "pt-BR", { numeric: true }));
}

export function filterRiskPointOptions(
  options: ReturnType<typeof buildRiskPointOptions>,
  query: string,
) {
  const normalizedQuery = normalizePointPart(query);
  if (!normalizedQuery) return [];
  return options
    .filter((option) => normalizePointPart(option.label).includes(normalizedQuery))
    .slice(0, 6);
}

export function riskPointIdentityKey(
  point: Pick<LaboratoryRiskPoint, "code" | "point" | "municipality">,
) {
  const digits = String(point.code ?? "").match(/\d+/g)?.join("");
  if (digits) return `sia:${Number(digits)}`;

  const name = normalizePointPart(point.point);
  const municipality = normalizePointPart(point.municipality);
  return name ? `name:${name}|municipality:${municipality}` : "";
}

function normalizeSiaLabel(value: string) {
  const digits = String(value ?? "").match(/\d+/g)?.join("");
  return digits ? `SIA-${digits.padStart(4, "0")}` : "";
}

function normalizePointPart(value: string) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isFiniteScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function nearestClassifiedResult(
  points: LaboratoryRiskPoint[],
  targetScore: number,
) {
  return points.reduce<LaboratoryRiskPoint | null>((nearest, point) => {
    if (!isFiniteScore(point.score) || !isPublishedRiskLevel(point.riskLevel)) {
      return nearest;
    }
    if (!nearest || Math.abs(point.score - targetScore) < Math.abs(nearest.score! - targetScore)) {
      return point;
    }
    return nearest;
  }, null);
}

function isPublishedRiskLevel(value: unknown): value is LaboratoryRiskLevel {
  return RISK_LEGEND.some(({ level }) => level === value);
}

function formatScore(score: number) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(score);
}

const RISK_LEGEND: Array<{ level: LaboratoryRiskLevel; label: string }> = [
  { level: "alto", label: "Alto" },
  { level: "moderado", label: "Moderado" },
  { level: "baixoModerado", label: "Baixo a moderado" },
  { level: "baixo", label: "Baixo" },
];
