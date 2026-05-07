"use client";

import { Activity, AlertTriangle, Filter, FlaskConical, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  CampaignHydroMap,
  type CampaignMapLayerVisibility,
} from "@/components/campaign-hydro-map";
import type { LaboratoryRiskPoint } from "@/lib/dashboard-data";

const riskLayers: CampaignMapLayerVisibility = {
  roadMap: true,
  basins: true,
  dailyRoutes: false,
  dayTransitions: false,
  planned: false,
  effective: true,
  displacement: false,
};

export function HomeRiskMapSection({ points }: { points: LaboratoryRiskPoint[] }) {
  const [activePoints, setActivePoints] = useState(points);
  const [campaignFilter, setCampaignFilter] = useState("Todas");
  const [selectedPointId, setSelectedPointId] = useState<string | undefined>(points[0]?.id);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const storedResults = window.localStorage.getItem("yvae:lab-risk-results");

      if (!storedResults) {
        return;
      }

      try {
        const parsed = JSON.parse(storedResults) as LaboratoryRiskPoint[];

        if (Array.isArray(parsed) && parsed.length > 0) {
          setActivePoints(parsed);
          setSelectedPointId(parsed[0].id);
        }
      } catch {
        window.localStorage.removeItem("yvae:lab-risk-results");
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const campaigns = useMemo(
    () => ["Todas", ...new Set(activePoints.map((point) => point.campaign).filter(Boolean))],
    [activePoints],
  );
  const filteredPoints = useMemo(
    () =>
      campaignFilter === "Todas"
        ? activePoints
        : activePoints.filter((point) => point.campaign === campaignFilter),
    [activePoints, campaignFilter],
  );
  const selectedPoint = useMemo(
    () =>
      filteredPoints.find((point) => point.id === selectedPointId) ?? filteredPoints[0],
    [filteredPoints, selectedPointId],
  );
  const summary = useMemo(() => buildRiskSummary(filteredPoints), [filteredPoints]);

  return (
    <section className="grid min-h-[calc(100vh-14rem)] gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="relative min-h-[620px] overflow-hidden rounded-[30px] border border-[var(--line-ghost)] bg-[linear-gradient(180deg,#eef7f2,#e4f0f4)] shadow-[0_30px_80px_-48px_rgba(0,66,98,0.22)]">
        <CampaignHydroMap
          points={filteredPoints}
          selectedPointId={selectedPoint?.id}
          layers={riskLayers}
          markerMode="risk"
          showPointTooltip
          caption="Base hidrográfica do Paraná · Pontos efetivos SIA · Resultados eDNA"
          onSelectPoint={(point) => setSelectedPointId(point.id)}
        />

        <div className="absolute left-4 top-4 w-64 overflow-hidden rounded-[20px] border border-[var(--line-ghost)] bg-white/92 shadow backdrop-blur">
          <div className="flex items-center justify-between border-b border-[var(--line-ghost)] bg-[var(--surface-soft)] px-3 py-2">
            <span className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">
              Resultados por campanha
            </span>
            <Filter className="h-4 w-4 text-slate-400" />
          </div>
          <div className="space-y-3 p-3">
            <select
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[var(--brand-navy-strong)]"
              value={campaignFilter}
              onChange={(event) => {
                setCampaignFilter(event.target.value);
                setSelectedPointId(undefined);
              }}
            >
              {campaigns.map((campaign) => (
                <option key={campaign} value={campaign}>
                  {campaign}
                </option>
              ))}
            </select>

            <div className="grid grid-cols-3 gap-1.5 text-[10px] font-bold">
              <RiskPill label="Baixo" value={summary.baixo} tone="baixo" />
              <RiskPill label="Médio" value={summary.medio} tone="medio" />
              <RiskPill label="Alto" value={summary.alto} tone="alto" />
            </div>
          </div>
        </div>

        <div className="absolute bottom-4 right-4 flex gap-2 rounded-full border border-white/70 bg-white/92 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600 shadow backdrop-blur">
          <LegendDot tone="baixo" label="baixo" />
          <LegendDot tone="medio" label="moderado" />
          <LegendDot tone="alto" label="alto" />
        </div>
      </div>

      <aside className="glass-panel flex min-h-[620px] flex-col rounded-[28px] p-5">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[var(--brand-green-soft)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--brand-navy-strong)]">
              <FlaskConical className="h-3.5 w-3.5" />
              eDNA
            </span>
            <h2 className="heading-font text-2xl font-extrabold tracking-tight text-[var(--brand-navy-strong)]">
              Risco laboratorial por ETA
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Visão executiva preparada para consolidar resultados laboratoriais por ponto SIA
              e campanha.
            </p>
          </div>
          <RiskIcon level={summary.priority} />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Metric label="Pontos" value={summary.total} />
          <Metric label="ETAs" value={summary.etas} />
          <Metric label="Críticos" value={summary.alto} />
        </div>

        <div className="mt-5 flex-1 rounded-[22px] border border-[var(--line-ghost)] bg-white p-4">
          {selectedPoint ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
                    {selectedPoint.campaign}
                  </p>
                  <h3 className="heading-font mt-1 text-2xl font-black text-[var(--brand-navy-strong)]">
                    {selectedPoint.code}
                  </h3>
                  <p className="text-xs font-semibold text-slate-500">
                    {selectedPoint.eta} · {selectedPoint.municipality}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${riskBadgeClass(selectedPoint.riskLevel)}`}>
                  {selectedPoint.riskLabel}
                </span>
              </div>

              <p className="text-sm leading-6 text-slate-600">{selectedPoint.resultSummary}</p>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <Info label="Sinal eDNA" value={selectedPoint.ednaSignal} />
                <Info label="Status" value="Aguardando planilha" />
                <Info
                  label="Latitude efetiva"
                  value={selectedPoint.effective?.lat.toFixed(5)}
                />
                <Info
                  label="Longitude efetiva"
                  value={selectedPoint.effective?.lon.toFixed(5)}
                />
              </div>

              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  Marcadores previstos
                </p>
                <div className="flex flex-wrap gap-2">
                  {selectedPoint.detectedMarkers.map((marker) => (
                    <span
                      key={marker}
                      className="rounded-full bg-[var(--surface-soft)] px-3 py-1 text-xs font-semibold text-slate-600"
                    >
                      {marker}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-center text-sm font-medium text-slate-500">
              Nenhum ponto efetivo disponível para o filtro selecionado.
            </div>
          )}
        </div>
      </aside>
    </section>
  );
}

function buildRiskSummary(points: LaboratoryRiskPoint[]) {
  const totals = points.reduce(
    (accumulator, point) => ({
      ...accumulator,
      [point.riskLevel]: accumulator[point.riskLevel] + 1,
    }),
    { baixo: 0, medio: 0, alto: 0 },
  );

  const priority: LaboratoryRiskPoint["riskLevel"] =
    totals.alto > 0 ? "alto" : totals.medio > 0 ? "medio" : "baixo";

  return {
    ...totals,
    total: points.length,
    etas: new Set(points.map((point) => point.eta)).size,
    priority,
  };
}

function RiskPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: LaboratoryRiskPoint["riskLevel"];
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-white px-2 py-2">
      <span className="flex items-center gap-1 text-slate-500">
        <span className={`h-2 w-2 rounded-full ${riskDotClass(tone)}`} />
        {label}
      </span>
      <span className="mt-1 block text-lg font-black text-[var(--brand-navy-strong)]">
        {value}
      </span>
    </div>
  );
}

function LegendDot({
  tone,
  label,
}: {
  tone: LaboratoryRiskPoint["riskLevel"];
  label: string;
}) {
  return (
    <span className="flex items-center gap-1">
      <span className={`h-2.5 w-2.5 rounded-full border border-white ${riskDotClass(tone)}`} />
      {label}
    </span>
  );
}

function RiskIcon({ level }: { level: LaboratoryRiskPoint["riskLevel"] }) {
  const Icon = level === "alto" ? AlertTriangle : level === "medio" ? Activity : ShieldCheck;

  return (
    <div className={`rounded-2xl p-3 ${riskIconClass(level)}`}>
      <Icon className="h-5 w-5" />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[18px] bg-[var(--surface-soft)] p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>
      <p className="heading-font mt-1 text-2xl font-black text-[var(--brand-navy-strong)]">
        {value}
      </p>
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string }) {
  return (
    <div className="rounded-lg bg-[var(--surface-soft)] px-3 py-2">
      <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 font-semibold text-slate-700">{value || "Não informado"}</p>
    </div>
  );
}

function riskDotClass(level: LaboratoryRiskPoint["riskLevel"]) {
  if (level === "alto") {
    return "bg-red-600";
  }

  if (level === "medio") {
    return "bg-yellow-400";
  }

  return "bg-green-600";
}

function riskBadgeClass(level: LaboratoryRiskPoint["riskLevel"]) {
  if (level === "alto") {
    return "bg-red-50 text-red-700";
  }

  if (level === "medio") {
    return "bg-yellow-50 text-yellow-700";
  }

  return "bg-emerald-50 text-emerald-700";
}

function riskIconClass(level: LaboratoryRiskPoint["riskLevel"]) {
  if (level === "alto") {
    return "bg-red-50 text-red-700";
  }

  if (level === "medio") {
    return "bg-yellow-50 text-yellow-700";
  }

  return "bg-emerald-50 text-emerald-700";
}
