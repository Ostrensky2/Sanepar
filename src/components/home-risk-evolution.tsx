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
  score: number | null;
  riskLabel: string | null;
  color: string | null;
};

export function HomeRiskEvolution({ points }: { points: LaboratoryRiskPoint[] }) {
  const pointOptions = useMemo(() => buildRiskPointOptions(points), [points]);
  const [pointQuery, setPointQuery] = useState("");
  const selectedPointKey =
    pointOptions.find((option) => option.label === pointQuery)?.key ?? ALL_POINTS;
  const periods = useMemo(
    () => buildRiskEvolutionPeriods(points, selectedPointKey),
    [points, selectedPointKey],
  );
  const selectedLabel =
    pointOptions.find((option) => option.key === selectedPointKey)?.label ??
    "Média dos pontos publicados";

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
        <label className="type-label flex min-w-0 flex-col gap-1 text-[var(--ink)] sm:w-80">
          Ponto de monitoramento
          <input
            type="search"
            list="risk-point-options"
            className="min-h-11 w-full rounded-lg border border-[var(--line-strong)] bg-white px-3 text-sm text-[var(--ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-teal)] focus-visible:ring-offset-2"
            placeholder="Média das campanhas · digite SIA, ponto ou município"
            value={pointQuery}
            onChange={(event) => setPointQuery(event.target.value)}
            aria-describedby="risk-point-help"
          />
          <datalist id="risk-point-options">
            {pointOptions.map((option) => (
              <option key={option.key} value={option.label} />
            ))}
          </datalist>
          <span id="risk-point-help" className="type-caption font-normal text-[var(--ink-soft)]">
            {pointQuery && selectedPointKey === ALL_POINTS
              ? "Selecione uma sugestão; até lá, a média permanece exibida."
              : selectedPointKey === ALL_POINTS
                ? "Sem seleção: média das campanhas."
                : "Ponto selecionado nas campanhas publicadas."}
          </span>
        </label>
      </div>

      <ol
        className="grid h-56 grid-cols-9 items-end gap-1 border-b border-[var(--line-soft)] bg-[var(--surface-soft)] px-2 pt-5 sm:gap-2 sm:px-4"
        aria-label={`Risco integrado por campanha: ${selectedLabel}`}
      >
        {periods.map((period, index) => {
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
                    className="flex w-full max-w-20 items-start justify-center rounded-t-md px-px pt-2 text-[10px] font-bold tabular-nums text-white sm:text-xs"
                    style={{
                      height: `${Math.max(score * 100, 18)}%`,
                      backgroundColor: period.color ?? "var(--surface-muted-strong)",
                    }}
                    title={period.riskLabel ?? undefined}
                  >
                    {formatScore(score)}
                  </div>
                ) : (
                  <span className="pb-2 text-[7.5px] font-semibold leading-none text-[var(--ink-soft)] sm:text-xs">
                    <span className="block">Sem</span>
                    <span className="block">resultado</span>
                  </span>
                )}
              </div>
              <span className="type-caption border-t border-[var(--line-strong)] py-2 font-bold text-[var(--brand-navy-strong)]">
                C{index + 1}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3" aria-label="Legenda das classes de risco">
        {RISK_LEGEND.map(({ level, label }) => (
          <span key={level} className="type-caption inline-flex items-center gap-1.5 text-[var(--ink-soft)]">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: laboratoryRiskColor(level) }} aria-hidden="true" />
            {label}
          </span>
        ))}
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
      score,
      riskLabel: score === null ? null : point?.riskLabel ?? null,
      color: score === null || !point ? null : laboratoryRiskColor(point.riskLevel),
    };
  });
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
