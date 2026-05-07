"use client";

import {
  BarChart3,
  FileText,
  Layers3,
  ImageIcon,
  Route,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  CampaignHydroMap,
  type CampaignMapLayerVisibility,
  type CampaignHydroMapPoint,
} from "@/components/campaign-hydro-map";

export function CampaignMapSection({
  points,
  compact = false,
}: {
  points: CampaignHydroMapPoint[];
  compact?: boolean;
}) {
  const [activePoints, setActivePoints] = useState(points);
  const [selectedPointId, setSelectedPointId] = useState(points[0]?.id);
  const [isDetailsPanelOpen, setIsDetailsPanelOpen] = useState(true);
  const [localImportLabel, setLocalImportLabel] = useState<string | null>(null);
  const [expandedPhotoPoint, setExpandedPhotoPoint] =
    useState<CampaignHydroMapPoint | null>(null);
  const [layers, setLayers] = useState<CampaignMapLayerVisibility>({
    roadMap: true,
    basins: true,
    dailyRoutes: true,
    dayTransitions: true,
    planned: true,
    effective: true,
    displacement: true,
  });
  const selectedPoint = useMemo(
    () =>
      activePoints.find((point) => point.id === selectedPointId) ?? activePoints[0],
    [activePoints, selectedPointId],
  );
  const layerOptions: Array<{
    key: keyof CampaignMapLayerVisibility;
    label: string;
  }> = [
    { key: "roadMap", label: "Mapa rodoviário PR" },
    { key: "basins", label: "Bacias hidrográficas" },
    { key: "dailyRoutes", label: "Percurso rodoviário diário" },
    { key: "dayTransitions", label: "Ligação entre dias" },
    { key: "planned", label: "Pontos previstos" },
    { key: "effective", label: "Pontos efetivos" },
    { key: "displacement", label: "Deslocamento" },
  ];
  const routeLegend = useMemo(() => buildRouteLegend(activePoints), [activePoints]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const storedPoints = window.localStorage.getItem("yvae:campaign-map-points");

      if (storedPoints) {
        try {
          const parsed = JSON.parse(storedPoints) as CampaignHydroMapPoint[];

          if (Array.isArray(parsed) && parsed.length > 0) {
            setActivePoints(parsed);
            setSelectedPointId(parsed[0].id);
          }
        } catch {
          window.localStorage.removeItem("yvae:campaign-map-points");
        }
      }

      const storedImport = window.localStorage.getItem("yvae:campaign-map-import");

      if (!storedImport) {
        return;
      }

      try {
        const parsed = JSON.parse(storedImport) as {
          fileName?: string;
          importedAt?: string;
        };

        if (parsed.fileName) {
          setLocalImportLabel(`Planilha ativa: ${parsed.fileName}`);
        }
      } catch {
        window.localStorage.removeItem("yvae:campaign-map-import");
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  return (
    <section
      className={`relative overflow-hidden rounded-[30px] border border-[var(--line-ghost)] bg-[linear-gradient(180deg,#eef5f8,#e6eef3)] shadow-[0_30px_80px_-48px_rgba(0,66,98,0.22)] ${
        compact ? "min-h-[620px]" : "min-h-[calc(100vh-14rem)]"
      }`}
    >
      <CampaignHydroMap
        points={activePoints}
        selectedPointId={selectedPoint?.id}
        layers={layers}
        showPointTooltip
        onSelectPoint={(point) => {
          setSelectedPointId(point.id);
          setIsDetailsPanelOpen(true);
        }}
      />

      <div className="absolute left-4 top-4 w-52 overflow-hidden rounded-[20px] border border-[var(--line-ghost)] bg-white/90 shadow backdrop-blur">
        <div className="flex items-center justify-between border-b border-[var(--line-ghost)] bg-[var(--surface-soft)] px-3 py-2">
          <span className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">
            Camadas
          </span>
          <Layers3 className="h-4 w-4 text-slate-400" />
        </div>
        <div className="p-1 text-[10px] font-semibold text-slate-600">
          {layerOptions.map((option) => (
            <label
              key={option.key}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 transition-colors hover:bg-slate-100"
            >
              <input
                type="checkbox"
                checked={layers[option.key]}
                onChange={(event) =>
                  setLayers((current) => ({
                    ...current,
                    [option.key]: event.target.checked,
                  }))
                }
                className="h-3 w-3 rounded border-slate-300 text-[var(--brand-navy-strong)] focus:ring-0"
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-1 border-t border-[var(--line-ghost)] px-3 py-2 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full border border-slate-900 bg-[#eaff00]" />
            Prev.
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full border border-white bg-black shadow" />
            Efet.
          </span>
        </div>
        {routeLegend.length > 0 ? (
          <div className="max-h-28 overflow-y-auto border-t border-[var(--line-ghost)] px-3 py-2">
            <div className="mb-1 flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
              <Route className="h-3 w-3" />
              Rotas
            </div>
            <div className="mb-1.5 flex items-center gap-2 text-[9px] font-semibold text-slate-600">
              <span className="h-0 w-5 border-t border-dashed border-slate-500" />
              <span className="truncate">Ligação entre dias</span>
            </div>
            <div className="space-y-1">
              {routeLegend.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center gap-2 text-[9px] font-semibold text-slate-600"
                >
                  <span
                    className="h-1.5 w-5 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="truncate">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {localImportLabel ? (
        <div className="absolute left-1/2 top-4 max-w-[min(520px,calc(100%-30rem))] -translate-x-1/2 rounded-full border border-emerald-200 bg-white/90 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-800 shadow backdrop-blur">
          {localImportLabel}
        </div>
      ) : null}

      {isDetailsPanelOpen ? (
        <aside className="absolute right-4 top-4 max-h-[calc(100%-2rem)] w-72 overflow-hidden rounded-[20px] border border-[var(--line-ghost)] bg-white shadow-[0_30px_80px_-42px_rgba(0,66,98,0.34)]">
          <div className="bg-[var(--brand-navy-strong)] p-3 text-white">
            <div className="mb-1.5 flex items-start justify-between">
              <h3 className="heading-font text-xl font-black tracking-tight">
                {selectedPoint?.code ?? "SIA"}
              </h3>
              <button
                aria-label="Esconder painel do ponto"
                className="rounded-full p-1 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                type="button"
                onClick={() => setIsDetailsPanelOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-2 rounded bg-white/10 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.18em]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#eaff00]" />
              Dados da campanha
            </div>
          </div>

          <div className="max-h-[calc(100vh-19rem)] space-y-3 overflow-y-auto p-3">
            <div className="grid grid-cols-2 gap-1.5 text-[10px]">
              <InfoTile label="Campanha" value={selectedPoint?.campaign} />
              <InfoTile label="SIA" value={selectedPoint?.code} />
              <InfoTile label="Ponto" value={selectedPoint?.point} />
              <InfoTile label="Dia" value={selectedPoint?.day} />
              <InfoTile label="Data" value={selectedPoint?.date} />
              <InfoTile label="Município" value={selectedPoint?.municipality} />
              <InfoTile label="Acessibilidade" value={selectedPoint?.accessibility} />
            </div>

            <InfoBlock label="Manancial" value={selectedPoint?.waterBody} />
            <InfoBlock label="Aspecto da água" value={selectedPoint?.waterAspect} />
            <InfoBlock label="Condições climáticas" value={selectedPoint?.weatherConditions} />
            <InfoBlock label="Problemas enfrentados" value={selectedPoint?.problems} />

            <div className="grid grid-cols-2 gap-1.5 text-[10px]">
              <InfoTile
                label="Previsto"
                value={
                  selectedPoint?.original
                    ? `${selectedPoint.original.lat.toFixed(4)}, ${selectedPoint.original.lon.toFixed(4)}`
                    : "sem coord."
                }
              />
              <InfoTile
                label="Efetivo"
                value={
                  selectedPoint?.effective
                    ? `${selectedPoint.effective.lat.toFixed(4)}, ${selectedPoint.effective.lon.toFixed(4)}`
                    : "sem coord."
                }
              />
            </div>

            <PointPhotoPreview
              point={selectedPoint}
              onExpand={() => selectedPoint && setExpandedPhotoPoint(selectedPoint)}
            />

            <div className="grid grid-cols-2 gap-1.5">
              <button className="flex flex-col items-center gap-1 rounded border border-slate-100 bg-slate-50 p-1.5 text-[9px] font-bold uppercase text-slate-500 transition-colors hover:bg-slate-100">
                <FileText className="h-4 w-4 text-[var(--brand-navy-strong)]" />
                Documentos
              </button>
              <button className="flex flex-col items-center gap-1 rounded border border-slate-100 bg-slate-50 p-1.5 text-[9px] font-bold uppercase text-slate-500 transition-colors hover:bg-slate-100">
                <BarChart3 className="h-4 w-4 text-[var(--brand-navy-strong)]" />
                Resultados
              </button>
            </div>
          </div>
        </aside>
      ) : (
        <button
          type="button"
          aria-label="Abrir painel do ponto"
          className="absolute right-4 top-4 rounded-full border border-[var(--line-ghost)] bg-white/95 px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--brand-navy-strong)] shadow backdrop-blur transition-colors hover:bg-[var(--surface-soft)]"
          onClick={() => setIsDetailsPanelOpen(true)}
        >
          Abrir painel
        </button>
      )}

      {expandedPhotoPoint ? (
        <PhotoModal
          point={expandedPhotoPoint}
          onClose={() => setExpandedPhotoPoint(null)}
        />
      ) : null}
    </section>
  );
}

const routeLegendColors = [
  "#00579f",
  "#c57a00",
  "#008e9c",
  "#8b5cf6",
  "#dc2626",
  "#0f766e",
  "#b45309",
  "#2563eb",
];

function buildRouteLegend(points: CampaignHydroMapPoint[]) {
  const labels: string[] = [];
  const knownLabels = new Set<string>();
  const inferredDayLabels = new Map<string, string>();

  for (const point of points) {
    if (!point.effective && !point.original) {
      continue;
    }

    const label = formatRouteDayLabel(point, inferredDayLabels);
    const key = `${point.campaign || "campanha"}-${label}`;

    if (!knownLabels.has(key)) {
      knownLabels.add(key);
      labels.push(label);
    }
  }

  return labels.map((label, index) => ({
    label,
    color: routeLegendColors[index % routeLegendColors.length],
  }));
}

function formatRouteDayLabel(
  point: CampaignHydroMapPoint,
  inferredDayLabels: Map<string, string>,
) {
  if (point.day) {
    return point.day.toLowerCase().startsWith("dia ")
      ? point.day
      : `Dia ${point.day}`;
  }

  const key = point.date || "sem-data";
  const existing = inferredDayLabels.get(key);

  if (existing) {
    return existing;
  }

  const label = `Dia ${inferredDayLabels.size + 1}`;
  inferredDayLabels.set(key, label);
  return label;
}

function InfoTile({ label, value }: { label: string; value?: string }) {
  return (
    <div className="rounded border border-slate-100 bg-slate-50 px-2 py-1.5">
      <span className="block font-bold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </span>
      <span className="font-semibold text-slate-700">{value || "Não informado"}</span>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value?: string }) {
  return (
    <div className="rounded border border-slate-100 bg-white px-2 py-1.5 text-xs">
      <span className="mb-0.5 block text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">
        {label}
      </span>
      <p className="font-medium leading-4 text-slate-700">{value || "Não informado"}</p>
    </div>
  );
}

function PointPhotoPreview({
  point,
  onExpand,
}: {
  point?: CampaignHydroMapPoint;
  onExpand: () => void;
}) {
  const preview = getPhotoPreview(point?.photoUrl);

  return (
    <button
      type="button"
      className="relative h-24 w-full overflow-hidden rounded border border-slate-200 bg-slate-100 text-slate-400 transition hover:brightness-95"
      onClick={onExpand}
      disabled={!preview}
      aria-label="Expandir foto representativa do ponto"
    >
      {preview?.kind === "image" ? (
        // Google Drive thumbnails need a regular image element.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={`Foto representativa do ponto ${point?.code ?? ""}`}
          className="h-full w-full object-cover"
          src={preview.src}
        />
      ) : preview?.kind === "folder" ? (
        <iframe
          className="h-full w-full border-0"
          src={preview.src}
          title={`Foto representativa do ponto ${point?.code ?? ""}`}
        />
      ) : (
        <div className="flex h-full items-center justify-center">
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

function PhotoModal({
  point,
  onClose,
}: {
  point: CampaignHydroMapPoint;
  onClose: () => void;
}) {
  const preview = getPhotoPreview(point.photoUrl);

  if (!preview) {
    return null;
  }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-6 backdrop-blur-sm">
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
            // Google Drive thumbnails need a regular image element.
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
              title={`Foto representativa do ponto ${point.code}`}
            />
          )}
        </div>
      </div>
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
