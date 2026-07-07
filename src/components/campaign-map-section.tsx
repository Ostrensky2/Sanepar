"use client";

import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
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
import { campaignPointMatchesSelectedCampaign } from "@/lib/campaign-points";
import { getPhotoPreview } from "@/lib/photo-preview";

export function CampaignMapSection({
  points,
  compact = false,
  useLocalImportCache = true,
  selectedCampaignId,
  selectedCampaignTitle,
}: {
  points: CampaignHydroMapPoint[];
  compact?: boolean;
  useLocalImportCache?: boolean;
  selectedCampaignId?: string;
  selectedCampaignTitle?: string;
}) {
  const [cachedPoints, setCachedPoints] = useState<CampaignHydroMapPoint[] | null>(null);
  const [selectedPointId, setSelectedPointId] = useState(points[0]?.id);
  const [isDetailsPanelOpen, setIsDetailsPanelOpen] = useState(true);
  const [localImportLabel, setLocalImportLabel] = useState<string | null>(null);
  const [expandedPhoto, setExpandedPhoto] = useState<{
    point: CampaignHydroMapPoint;
    index: number;
  } | null>(null);
  const [layers, setLayers] = useState<CampaignMapLayerVisibility>({
    roadMap: true,
    basins: true,
    dailyRoutes: true,
    dayTransitions: true,
    planned: true,
    effective: true,
    displacement: true,
  });
  const scopedCachedPoints = useMemo(() => {
    if (!cachedPoints?.length) {
      return null;
    }

    if (!selectedCampaignId || !selectedCampaignTitle) {
      return cachedPoints;
    }

    const filtered = cachedPoints.filter((point) =>
      campaignPointMatchesSelectedCampaign(
        point,
        selectedCampaignId,
        selectedCampaignTitle,
      ),
    );

    return filtered.length ? filtered : null;
  }, [cachedPoints, selectedCampaignId, selectedCampaignTitle]);
  const activePoints = useMemo(
    () => (useLocalImportCache && scopedCachedPoints?.length ? scopedCachedPoints : points),
    [points, scopedCachedPoints, useLocalImportCache],
  );
  const cacheMatchesSelectedCampaign = Boolean(
    useLocalImportCache && scopedCachedPoints?.length,
  );
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
    { key: "planned", label: "Coordenada de apoio" },
    { key: "effective", label: "Pontos efetivos" },
    { key: "displacement", label: "Deslocamento" },
  ];
  const routeLegend = useMemo(() => buildRouteLegend(activePoints), [activePoints]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!useLocalImportCache) {
        setCachedPoints(null);
        setLocalImportLabel(null);
        return;
      }

      const storedPoints = window.localStorage.getItem("yvae:campaign-map-points");

      if (storedPoints) {
        try {
          const parsed = JSON.parse(storedPoints) as CampaignHydroMapPoint[];

          if (Array.isArray(parsed) && parsed.length > 0) {
            setCachedPoints(parsed);
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
  }, [useLocalImportCache]);

  const mapHeightClass = compact ? "h-[460px]" : "h-[520px]";
  const panelMaxHeightClass = compact ? "max-h-[460px]" : "max-h-[520px]";

  return (
    <section className="grid items-start gap-4 lg:grid-cols-[14rem_minmax(0,1fr)_18rem]">
      <aside className={`flex flex-col gap-4 overflow-y-auto pr-1 ${panelMaxHeightClass}`}>
        {localImportLabel && cacheMatchesSelectedCampaign ? (
          <div className="radius-card border border-emerald-200 bg-white px-4 py-3 text-label font-bold uppercase tracking-[0.12em] text-emerald-800 shadow">
            {localImportLabel}
          </div>
        ) : null}

        <div className="overflow-hidden radius-card border border-[var(--line-ghost)] bg-white shadow">
          <div className="flex items-center justify-between border-b border-[var(--line-ghost)] bg-[var(--surface-soft)] px-3 py-2">
            <span className="text-label font-black uppercase tracking-[0.18em] text-slate-500">
              Camadas
            </span>
            <Layers3 className="h-4 w-4 text-slate-400" />
          </div>
          <div className="p-1 text-xs font-semibold text-slate-600">
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
          <div className="grid grid-cols-2 gap-1 border-t border-[var(--line-ghost)] px-3 py-2 text-caption font-bold uppercase tracking-[0.12em] text-slate-500">
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full border border-slate-900 bg-[#eaff00]" />
              Apoio
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full border border-white bg-black shadow" />
              Efet.
            </span>
          </div>
          {routeLegend.length > 0 ? (
            <div className="max-h-64 overflow-y-auto border-t border-[var(--line-ghost)] px-3 py-2">
              <div className="mb-1 flex items-center gap-1 text-caption font-black uppercase tracking-[0.14em] text-slate-400">
                <Route className="h-3 w-3" />
                Rotas
              </div>
              <div className="mb-1.5 flex items-center gap-2 text-caption font-semibold text-slate-600">
                <span className="h-0 w-5 border-t border-dashed border-slate-500" />
                <span className="truncate">Ligação entre dias</span>
              </div>
              <div className="space-y-1">
                {routeLegend.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center gap-2 text-caption font-semibold text-slate-600"
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
      </aside>

      <div className={`relative overflow-hidden radius-panel border border-[var(--line-ghost)] bg-[linear-gradient(180deg,#eef5f8,#e6eef3)] shadow-[0_30px_80px_-48px_rgba(0,66,98,0.22)] ${mapHeightClass}`}>
        <CampaignHydroMap
          points={activePoints}
          selectedPointId={selectedPoint?.id}
          layers={layers}
          showPointTooltip
          zoomOnSelect
          clipBaseTilesToBasins
          caption="Mapa rodoviário OpenStreetMap · Diário de Campo · Sanepar"
          onSelectPoint={(point) => {
            // Clicar no marcador apenas seleciona e dá zoom (zoomOnSelect); as
            // fotos são exibidas no card lateral do ponto, não no mapa.
            setSelectedPointId(point.id);
            setIsDetailsPanelOpen(true);
          }}
        />
      </div>

      <aside className={`flex flex-col gap-4 overflow-y-auto pr-1 ${panelMaxHeightClass}`}>
        {isDetailsPanelOpen ? (
        <div className="overflow-hidden radius-card border border-[var(--line-ghost)] bg-white shadow-[0_30px_80px_-42px_rgba(0,66,98,0.34)]">
          <div className="bg-[var(--brand-navy-strong)] p-3 text-white">
            <div className="mb-1.5 flex items-start justify-between">
              <h3 className="heading-font text-lg font-black tracking-tight">
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
            <div className="flex items-center gap-2 rounded bg-white/10 px-2 py-1 text-caption font-bold uppercase tracking-[0.16em]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#eaff00]" />
              Dados da campanha
            </div>
          </div>

          <div className="space-y-3 overflow-y-auto p-3">
            <div className="grid grid-cols-2 gap-1.5 text-xs">
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

            <div className="grid grid-cols-2 gap-1.5 text-xs">
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
              key={selectedPoint?.id}
              point={selectedPoint}
              onExpand={(index) =>
                selectedPoint && setExpandedPhoto({ point: selectedPoint, index })
              }
            />

            <div className="grid grid-cols-2 gap-1.5">
              <button className="flex flex-col items-center gap-1 rounded border border-slate-100 bg-slate-50 p-1.5 text-caption font-bold uppercase text-slate-500 transition-colors hover:bg-slate-100">
                <FileText className="h-4 w-4 text-[var(--brand-navy-strong)]" />
                Documentos
              </button>
              <button className="flex flex-col items-center gap-1 rounded border border-slate-100 bg-slate-50 p-1.5 text-caption font-bold uppercase text-slate-500 transition-colors hover:bg-slate-100">
                <BarChart3 className="h-4 w-4 text-[var(--brand-navy-strong)]" />
                Resultados
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          aria-label="Abrir painel do ponto"
          className="rounded-full border border-[var(--line-ghost)] bg-white px-4 py-2 text-caption font-black uppercase tracking-[0.16em] text-[var(--brand-navy-strong)] shadow transition-colors hover:bg-[var(--surface-soft)]"
          onClick={() => setIsDetailsPanelOpen(true)}
        >
          Abrir painel
        </button>
      )}
      </aside>

      {expandedPhoto ? (
        <PhotoModal
          key={expandedPhoto.point.id}
          point={expandedPhoto.point}
          initialIndex={expandedPhoto.index}
          onClose={() => setExpandedPhoto(null)}
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
  const items: Array<{ key: string; label: string }> = [];
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
      items.push({ key, label });
    }
  }

  return items.map((item, index) => ({
    key: item.key,
    label: item.label,
    color: routeLegendColors[index % routeLegendColors.length],
  }));
}

function formatRouteDayLabel(
  point: CampaignHydroMapPoint,
  inferredDayLabels: Map<string, string>,
) {
  if (point.day) {
    const trimmed = String(point.day).trim();
    const numberMatch = trimmed.match(/\d+/);

    if (numberMatch) {
      return `Dia ${Number(numberMatch[0])}`;
    }

    return trimmed.toLowerCase().startsWith("dia ") ? trimmed : `Dia ${trimmed}`;
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
      <span className="block text-caption font-bold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </span>
      <span className="font-semibold text-slate-700">{value || "Não informado"}</span>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value?: string }) {
  return (
    <div className="rounded border border-slate-100 bg-white px-2 py-1.5 text-xs">
      <span className="mb-0.5 block text-caption font-bold uppercase tracking-[0.16em] text-slate-400">
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
  onExpand: (index: number) => void;
}) {
  const photos = getPointPhotos(point);
  const [index, setIndex] = useState(0);
  const safeIndex = Math.min(index, Math.max(photos.length - 1, 0));
  const activePhoto = photos[safeIndex];
  const preview = getPhotoPreview(activePhoto?.url);
  const [photoState, setPhotoState] = useState<{
    previewKey?: string;
    candidateIndex: number;
    hasError: boolean;
  }>({ candidateIndex: 0, hasError: false });
  const previewKey = preview?.originalUrl;
  const activeState =
    photoState.previewKey === previewKey
      ? photoState
      : { candidateIndex: 0, hasError: false };
  const activeSrc = preview?.candidates[activeState.candidateIndex] ?? preview?.src;
  const imageFailed = activeState.hasError;
  const hasMultiple = photos.length > 1;

  // Troca a foto exibida no card e zera o fallback de candidatos da nova imagem.
  function goToPhoto(nextIndex: number) {
    if (!photos.length) {
      return;
    }

    setIndex((nextIndex + photos.length) % photos.length);
    setPhotoState({ candidateIndex: 0, hasError: false });
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="relative h-24 w-full overflow-hidden rounded border border-slate-200 bg-slate-100 text-slate-400 transition hover:brightness-95"
        onClick={() => onExpand(safeIndex)}
        disabled={!preview || imageFailed}
        aria-label="Expandir fotos do ponto"
      >
        {preview?.kind === "image" && !imageFailed ? (
          // Google Drive thumbnails need a regular image element.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={activePhoto?.caption || `Foto do ponto ${point?.code ?? ""}`}
            className="h-full w-full object-cover"
            onError={() => {
              setPhotoState((current) => {
                const candidateIndex =
                  current.previewKey === previewKey ? current.candidateIndex : 0;
                const nextCandidateIndex = candidateIndex + 1;

                if (nextCandidateIndex < preview.candidates.length) {
                  return {
                    previewKey,
                    candidateIndex: nextCandidateIndex,
                    hasError: false,
                  };
                }

                return {
                  previewKey,
                  candidateIndex,
                  hasError: true,
                };
              });
            }}
            src={activeSrc}
          />
        ) : preview?.kind === "folder" ? (
          <iframe
            className="h-full w-full border-0"
            src={preview.src}
            title={`Fotos do ponto ${point?.code ?? ""}`}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1 px-3 text-center">
            <ImageIcon className="h-8 w-8 text-slate-300" />
            {imageFailed ? (
              <span className="text-caption font-bold text-slate-500">
                Foto indisponível — verifique o Drive
              </span>
            ) : null}
          </div>
        )}
        {preview && !imageFailed ? (
          <span className="absolute bottom-2 right-2 rounded bg-black/70 px-2 py-1 text-caption font-bold uppercase tracking-[0.14em] text-white">
            {hasMultiple ? `${safeIndex + 1}/${photos.length}` : "ampliar"}
          </span>
        ) : null}
      </button>

      {hasMultiple ? (
        <>
          <button
            type="button"
            aria-label="Foto anterior"
            onClick={() => goToPhoto(safeIndex - 1)}
            className="absolute left-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white shadow transition hover:bg-black/75"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Próxima foto"
            onClick={() => goToPhoto(safeIndex + 1)}
            className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white shadow transition hover:bg-black/75"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </>
      ) : null}
    </div>
  );
}

function PhotoModal({
  point,
  onClose,
  initialIndex = 0,
}: {
  point: CampaignHydroMapPoint;
  onClose: () => void;
  initialIndex?: number;
}) {
  const photos = getPointPhotos(point);
  const [photoIndex, setPhotoIndex] = useState(initialIndex);
  const activePhoto = photos[Math.min(photoIndex, Math.max(photos.length - 1, 0))];
  const preview = getPhotoPreview(activePhoto?.url);
  const [candidateIndex, setCandidateIndex] = useState(0);

  if (!preview) {
    return null;
  }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-6 backdrop-blur-sm">
      <div className="relative h-full max-h-[82vh] w-full max-w-5xl overflow-hidden radius-panel border border-white/20 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <p className="text-caption font-bold uppercase tracking-[0.18em] text-slate-400">
              Fotos da campanha
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

        <div className="grid h-[calc(100%-76px)] grid-rows-[minmax(0,1fr)_auto] bg-slate-100">
          <div className="min-h-0">
            {preview.kind === "image" ? (
              // Google Drive thumbnails need a regular image element.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={activePhoto?.caption || `Foto do ponto ${point.code}`}
                className="h-full w-full object-contain"
                onError={() =>
                  setCandidateIndex((current) =>
                    current + 1 < preview.candidates.length ? current + 1 : current,
                  )
                }
                src={preview.candidates[candidateIndex] ?? preview.src}
              />
            ) : (
              <iframe
                className="h-full w-full border-0"
                src={preview.src}
                title={`Fotos do ponto ${point.code}`}
              />
            )}
          </div>
          {photos.length > 1 ? (
            <div className="flex gap-2 overflow-x-auto border-t border-slate-200 bg-white p-3">
              {photos.map((photo, index) => (
                <button
                  key={photo.id || `${photo.url}-${index}`}
                  type="button"
                  className={[
                    "shrink-0 rounded border px-3 py-2 text-xs font-bold transition",
                    index === photoIndex
                      ? "border-[var(--brand-navy-strong)] bg-[var(--brand-navy-strong)] text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                  ].join(" ")}
                  onClick={() => {
                    setPhotoIndex(index);
                    setCandidateIndex(0);
                  }}
                >
                  {photo.caption || `Foto ${index + 1}`}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function getPointPhotos(point?: CampaignHydroMapPoint | null) {
  const photos = point?.photos?.filter((photo) => photo.url) ?? [];

  if (photos.length) {
    return photos;
  }

  return point?.photoUrl
    ? [{ id: `${point.id}-photo`, url: point.photoUrl, caption: "Foto representativa" }]
    : [];
}

