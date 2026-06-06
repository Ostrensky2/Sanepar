"use client";

import { Activity, AlertTriangle, Filter, FlaskConical, ImageIcon, ShieldCheck, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  CampaignHydroMap,
  type CampaignMapLayerVisibility,
} from "@/components/campaign-hydro-map";
import { canUseBrowserOnlyPersistence } from "@/lib/browser-persistence";
import type { LaboratoryRiskLevel, LaboratoryRiskPoint } from "@/lib/laboratory-risk";

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
  const [expandedPhotoPoint, setExpandedPhotoPoint] =
    useState<LaboratoryRiskPoint | null>(null);

  useEffect(() => {
    if (!canUseBrowserOnlyPersistence()) {
      return;
    }

    const timer = window.setTimeout(() => {
      const storedResults = window.localStorage.getItem("yvae:lab-risk-results");

      if (!storedResults) {
        return;
      }

      try {
        const parsed = JSON.parse(storedResults) as LaboratoryRiskPoint[];

        if (
          Array.isArray(parsed) &&
          parsed.length > 0 &&
          parsed.every(
            (point) =>
              point?.laboratoryStatus === "homologado" &&
              point.environmentalRiskLevel &&
              point.operationalRiskLevel &&
              point.sanitaryRiskLevel,
          )
        ) {
          setActivePoints(parsed);
          setSelectedPointId(parsed[0].id);
        } else {
          window.localStorage.removeItem("yvae:lab-risk-results");
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
    <section className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="relative h-[500px] overflow-hidden rounded-[30px] border border-[var(--line-ghost)] bg-[linear-gradient(180deg,#eef7f2,#e4f0f4)] shadow-[0_30px_80px_-48px_rgba(0,66,98,0.22)]">
        <CampaignHydroMap
          points={filteredPoints}
          selectedPointId={selectedPoint?.id}
          layers={riskLayers}
          markerMode="risk"
          showPointTooltip
          zoomOnSelect
          caption="Base hidrográfica do Paraná · Pontos efetivos SIA · Resultados eDNA"
          onSelectPoint={(point) => setSelectedPointId(point.id)}
        />
      </div>

      <aside className="flex max-h-[500px] flex-col gap-4 overflow-y-auto pr-1">
        <div className="overflow-hidden rounded-[20px] border border-[var(--line-ghost)] bg-white shadow">
          <div className="flex items-center justify-between border-b border-[var(--line-ghost)] bg-[var(--surface-soft)] px-3 py-2">
            <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
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

            <div className="grid grid-cols-2 gap-1.5 text-xs font-bold">
              <RiskPill label="Baixo" value={summary.baixo} tone="baixo" />
              <RiskPill
                label="Baixo a mod."
                value={summary.baixoModerado}
                tone="baixoModerado"
              />
              <RiskPill label="Moderado" value={summary.moderado} tone="moderado" />
              <RiskPill label="Alto" value={summary.alto} tone="alto" />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 rounded-[20px] border border-[var(--line-ghost)] bg-white px-4 py-3 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600 shadow">
          <LegendDot tone="baixo" label="baixo" />
          <LegendDot tone="baixoModerado" label="baixo a moderado" />
          <LegendDot tone="moderado" label="moderado" />
          <LegendDot tone="alto" label="alto" />
        </div>

        <div className="flex flex-1 flex-col rounded-[28px] border border-[var(--brand-navy-strong)]/15 bg-white p-5 shadow-[0_34px_90px_-42px_rgba(0,66,98,0.46)]">
        <div className="mb-5 rounded-[22px] bg-[var(--brand-navy-strong)] p-4 text-white shadow-[0_18px_42px_-30px_rgba(0,66,98,0.65)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold tracking-[0.16em] text-white">
                <FlaskConical className="h-3.5 w-3.5" />
                eDNA
              </span>
              <h2 className="heading-font text-xl font-extrabold tracking-tight text-white">
                Mapa Geral de Risco
              </h2>
              <p className="mt-2 text-sm font-medium leading-6 text-white/78">
                Resultados laboratoriais consolidados por ponto SIA e campanha.
              </p>
            </div>
            <RiskIcon level={summary.priority} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Metric label="Pontos" value={summary.total} />
          <Metric label="ETAs" value={summary.etas} />
          <Metric label="Alto" value={summary.alto} />
        </div>

        <div className="mt-5 flex-1 rounded-[22px] border border-[var(--brand-navy-strong)]/10 bg-white p-4 shadow-[0_20px_48px_-38px_rgba(0,66,98,0.42)]">
          {selectedPoint ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
                    Ranking {selectedPoint.rankingPosition ?? "-"}
                  </p>
                  <h3 className="heading-font mt-1 text-xl font-black text-[var(--brand-navy-strong)]">
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

              <RiskPointPhoto
                point={selectedPoint}
                onExpand={() => setExpandedPhotoPoint(selectedPoint)}
              />

              <div className="grid grid-cols-2 gap-2 text-xs">
                <RiskInfo
                  label="Score"
                  value={selectedPoint.score?.toFixed(3).replace(".", ",")}
                  tone={selectedPoint.riskLevel}
                  emphasized
                />
                <RiskInfo
                  label="Risco ambiental"
                  value={selectedPoint.environmentalRisk}
                  tone={selectedPoint.environmentalRiskLevel}
                />
                <RiskInfo
                  label="Risco operacional"
                  value={selectedPoint.operationalRisk}
                  tone={selectedPoint.operationalRiskLevel}
                />
                <RiskInfo
                  label="Risco sanitário"
                  value={selectedPoint.sanitaryRisk}
                  tone={selectedPoint.sanitaryRiskLevel}
                />
                <Info
                  label="Latitude"
                  value={selectedPoint.effective?.lat.toFixed(5)}
                />
                <Info
                  label="Longitude"
                  value={selectedPoint.effective?.lon.toFixed(5)}
                />
              </div>

              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  Marcadores observados
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

              {selectedPoint.recommendations ? (
                <p className="rounded-xl bg-[var(--surface-soft)] p-3 text-xs font-semibold leading-5 text-slate-600">
                  {selectedPoint.recommendations}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-center text-sm font-medium text-slate-500">
              Nenhum ponto efetivo disponível para o filtro selecionado.
            </div>
          )}
        </div>
        </div>
      </aside>

      {expandedPhotoPoint ? (
        <RiskPhotoModal
          point={expandedPhotoPoint}
          onClose={() => setExpandedPhotoPoint(null)}
        />
      ) : null}
    </section>
  );
}

function buildRiskSummary(points: LaboratoryRiskPoint[]) {
  const totals = points.reduce(
    (accumulator, point) => ({
      ...accumulator,
      [point.riskLevel]: accumulator[point.riskLevel] + 1,
    }),
    { baixo: 0, baixoModerado: 0, moderado: 0, alto: 0 },
  );

  const priority: LaboratoryRiskPoint["riskLevel"] =
    totals.alto > 0
      ? "alto"
      : totals.moderado > 0
        ? "moderado"
        : totals.baixoModerado > 0
          ? "baixoModerado"
          : "baixo";

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
  tone: LaboratoryRiskLevel;
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-white px-2 py-2">
      <span className="flex items-center gap-1 text-slate-500">
        <span className={`h-2 w-2 rounded-full ${riskDotClass(tone)}`} />
        {label}
      </span>
      <span className="mt-1 block text-base font-black text-[var(--brand-navy-strong)]">
        {value}
      </span>
    </div>
  );
}

function LegendDot({
  tone,
  label,
}: {
  tone: LaboratoryRiskLevel;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1">
      <span className={`h-2.5 w-2.5 rounded-full border border-white ${riskDotClass(tone)}`} />
      {label}
    </span>
  );
}

function RiskIcon({ level }: { level: LaboratoryRiskLevel }) {
  const Icon =
    level === "alto" || level === "moderado" ? AlertTriangle : level === "baixoModerado" ? Activity : ShieldCheck;

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
      <p className="heading-font mt-1 text-xl font-black text-[var(--brand-navy-strong)]">
        {value}
      </p>
    </div>
  );
}

function RiskPointPhoto({
  point,
  onExpand,
}: {
  point: LaboratoryRiskPoint;
  onExpand: () => void;
}) {
  const preview = getPhotoPreview(point.photoUrl);

  return (
    <button
      type="button"
      className="relative h-32 w-full overflow-hidden rounded-[18px] border border-slate-200 bg-slate-100 text-slate-400 transition hover:brightness-95 disabled:cursor-default disabled:hover:brightness-100"
      onClick={onExpand}
      disabled={!preview}
      aria-label="Expandir foto representativa do ponto"
    >
      {preview?.kind === "image" ? (
        // Google Drive and Dropbox previews need a regular image element.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={`Foto representativa do ponto ${point.code}`}
          className="h-full w-full object-cover"
          src={preview.src}
        />
      ) : preview?.kind === "folder" ? (
        <iframe
          className="h-full w-full border-0"
          src={preview.src}
          title={`Fotos representativas do ponto ${point.code}`}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <ImageIcon className="h-8 w-8 text-slate-300" />
        </div>
      )}
      {preview ? (
        <span className="absolute bottom-2 right-2 rounded bg-black/70 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-white">
          ampliar
        </span>
      ) : null}
    </button>
  );
}

function RiskPhotoModal({
  point,
  onClose,
}: {
  point: LaboratoryRiskPoint;
  onClose: () => void;
}) {
  const preview = getPhotoPreview(point.photoUrl);

  if (!preview) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="relative h-full max-h-[82vh] w-full max-w-5xl overflow-hidden rounded-[24px] border border-white/20 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
              Foto representativa
            </p>
            <h3 className="heading-font text-lg font-black text-[var(--brand-navy-strong)]">
              {point.code} · {point.municipality}
            </h3>
          </div>
          <button
            type="button"
            aria-label="Fechar foto expandida"
            className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="h-[calc(100%-76px)] bg-slate-100">
          {preview.kind === "image" ? (
            // Google Drive and Dropbox previews need a regular image element.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt={`Foto representativa do ponto ${point.code}`}
              className="h-full w-full object-contain"
              src={preview.src}
            />
          ) : (
            <iframe
              className="h-full w-full border-0"
              src={preview.src}
              title={`Fotos representativas do ponto ${point.code}`}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string }) {
  return (
    <div className="rounded-lg bg-[var(--surface-soft)] px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 font-semibold text-slate-700">{value || "Não informado"}</p>
    </div>
  );
}

function getPhotoPreview(url?: string) {
  if (!url) {
    return null;
  }

  const dropboxPreview = getDropboxPreview(url);

  if (dropboxPreview) {
    return dropboxPreview;
  }

  const drivePreview = getDrivePreview(url);

  if (drivePreview) {
    return drivePreview;
  }

  return {
    kind: "image" as const,
    src: url,
  };
}

function getDrivePreview(url: string) {
  const fileMatch =
    url.match(/\/file\/d\/([^/]+)/) ||
    url.match(/[?&]id=([^&]+)/) ||
    url.match(/\/uc\?id=([^&]+)/);

  if (fileMatch?.[1]) {
    return {
      kind: "image" as const,
      src: `https://drive.google.com/thumbnail?id=${fileMatch[1]}&sz=w1600`,
    };
  }

  const folderMatch = url.match(/\/folders\/([^/?]+)/);

  if (folderMatch?.[1]) {
    return {
      kind: "folder" as const,
      src: `https://drive.google.com/embeddedfolderview?id=${folderMatch[1]}#grid`,
    };
  }

  return {
    kind: "image" as const,
    src: url,
  };
}

function getDropboxPreview(url: string) {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (!parsed.hostname.endsWith("dropbox.com")) {
    return null;
  }

  parsed.searchParams.delete("dl");
  parsed.searchParams.set("raw", "1");

  return {
    kind: "image" as const,
    src: parsed.toString(),
  };
}

function RiskInfo({
  label,
  value,
  tone,
  emphasized = false,
}: {
  label: string;
  value?: string;
  tone: LaboratoryRiskLevel;
  emphasized?: boolean;
}) {
  return (
    <div className={`rounded-lg px-3 py-2 ${riskInfoClass(tone)}`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] opacity-70">
        {label}
      </p>
      <p className={`mt-1 ${emphasized ? "text-lg font-black" : "font-black"}`}>
        {value || "Não informado"}
      </p>
    </div>
  );
}

function riskDotClass(level: LaboratoryRiskLevel) {
  if (level === "alto") {
    return "bg-red-900";
  }

  if (level === "moderado") {
    return "bg-orange-500";
  }

  if (level === "baixoModerado") {
    return "bg-yellow-400";
  }

  return "bg-green-600";
}

function riskInfoClass(level: LaboratoryRiskLevel) {
  if (level === "alto") {
    return "bg-red-100 text-red-900";
  }

  if (level === "moderado") {
    return "bg-orange-50 text-orange-700";
  }

  if (level === "baixoModerado") {
    return "bg-yellow-50 text-yellow-700";
  }

  return "bg-emerald-50 text-emerald-700";
}

function riskBadgeClass(level: LaboratoryRiskLevel) {
  if (level === "alto") {
    return "bg-red-100 text-red-900";
  }

  if (level === "moderado") {
    return "bg-orange-50 text-orange-700";
  }

  if (level === "baixoModerado") {
    return "bg-yellow-50 text-yellow-700";
  }

  return "bg-emerald-50 text-emerald-700";
}

function riskIconClass(level: LaboratoryRiskLevel) {
  if (level === "alto") {
    return "bg-red-100 text-red-900";
  }

  if (level === "moderado") {
    return "bg-orange-50 text-orange-700";
  }

  if (level === "baixoModerado") {
    return "bg-yellow-50 text-yellow-700";
  }

  return "bg-emerald-50 text-emerald-700";
}
