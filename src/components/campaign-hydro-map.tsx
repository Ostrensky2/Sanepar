"use client";

import { Calendar, Minimize2, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normalizeCampaignKey } from "@/lib/campaign-points";
import { laboratoryRiskColor, type LaboratoryRiskLevel } from "@/lib/laboratory-risk";

type Coordinate = {
  lat: number;
  lon: number;
};

export type CampaignHydroMapPoint = {
  id: string;
  code: string;
  point?: string;
  day?: string;
  campaign: string;
  date?: string;
  // Sequência de coleta persistida (ordem das linhas da planilha no dia).
  collectionOrder?: number | null;
  municipality: string;
  waterBody: string;
  original: Coordinate | null;
  effective: Coordinate | null;
  accessibility: string;
  waterAspect: string;
  weatherConditions: string;
  problems: string;
  driveUrl?: string;
  dropboxUrl?: string;
  photoUrl: string;
  photos?: Array<{
    id: string;
    url: string;
    caption?: string | null;
  }>;
  riskLevel?: LaboratoryRiskLevel;
};

type BasinFeature = {
  type: "Feature";
  properties: {
    NOME?: string;
  };
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
};

type BasinCollection = {
  type: "FeatureCollection";
  features: BasinFeature[];
};

type Tile = {
  key: string;
  url: string;
  x: number;
  y: number;
  size: number;
};

type RoadRouteSegment = {
  id: string;
  kind: "daily" | "transition" | "displacement";
  label: string;
  color: string;
  // Chave estável do dia de coleta (campanha+data) do trecho, para realçar/atenuar
  // por dia. Transição carrega o dia de origem; deslocamento não tem dia.
  dayKey?: string;
  waypoints: Coordinate[];
  coordinates: Coordinate[] | null;
};

export type CampaignMapLayerVisibility = {
  roadMap: boolean;
  basins: boolean;
  dailyRoutes: boolean;
  dayTransitions: boolean;
  planned: boolean;
  effective: boolean;
  displacement: boolean;
};

const tileSize = 256;
const absoluteMinZoom = 3;
const maxZoom = 19;
const defaultFitPadding = 36;
const paranaFitPadding = 28;
const markerHitRadius = 24;
const wheelZoomThreshold = 180;
const zoomEpsilon = 0.001;
const paranaVisualBounds = {
  north: -22.516087,
  south: -26.715371,
  west: -54.618983,
  east: -48.023055,
};
const paranaBounds = {
  north: -22.29,
  south: -26.72,
  west: -54.62,
  east: -48.02,
};
const statewideCoverageThreshold = 0.58;
const basinColors = [
  "rgba(0, 142, 156, 0.30)",
  "rgba(0, 87, 159, 0.24)",
  "rgba(0, 186, 0, 0.20)",
  "rgba(197, 122, 0, 0.22)",
  "rgba(0, 135, 193, 0.24)",
  "rgba(64, 116, 92, 0.22)",
];
export const dailyRouteColors = [
  "#00579f",
  "#c57a00",
  "#008e9c",
  "#8b5cf6",
  "#dc2626",
  "#0f766e",
  "#b45309",
  "#2563eb",
];
const maxStraightDisplacementMeters = 2000;
// Opacidade dos elementos de OUTROS dias quando um dia é realçado (hover na
// legenda). Baixa o bastante para "apagar" sem sumir de vez com o contexto.
const dayFocusDimAlpha = 0.12;
// Tipos de polyline que o app pode desenhar na camada de percurso. Qualquer
// segmento sem um destes tipos é descartado (nunca renderiza linha "solta").
export const renderableRouteKinds = new Set<RoadRouteSegment["kind"]>([
  "daily",
  "transition",
  "displacement",
]);
// Folga aplicada à caixa do Paraná (`paranaBounds`) ao validar coordenadas de
// rota/deslocamento. Coordenadas fora disso — tipicamente um campo em branco que
// virou 0,0 — não podem ancorar linha, senão riscam o mapa inteiro rumo a um
// ponto inexistente. A folga (~0,5°) evita descartar pontos legítimos na divisa.
const paranaRouteBoundsPaddingDegrees = 0.5;

export function CampaignHydroMap({
  points,
  selectedPointId,
  layers,
  onSelectPoint,
  caption = "Mapa rodoviário OpenStreetMap · Paraná · Bacias SUDERHSA/IAT 2007",
  showBaseTiles = true,
  markerMode = "campaign",
  showPointTooltip = false,
  effectivePointColor,
  zoomOnSelect = true,
  clipBaseTilesToBasins: shouldClipBaseTilesToBasins = true,
  focusedDayKey = null,
  isPreparation = false,
}: {
  points: CampaignHydroMapPoint[];
  selectedPointId?: string;
  layers: CampaignMapLayerVisibility;
  onSelectPoint?: (point: CampaignHydroMapPoint) => void;
  caption?: string;
  showBaseTiles?: boolean;
  markerMode?: "campaign" | "risk" | "pointAction";
  showPointTooltip?: boolean;
  effectivePointColor?: string;
  zoomOnSelect?: boolean;
  clipBaseTilesToBasins?: boolean;
  focusedDayKey?: string | null;
  isPreparation?: boolean;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; y: number; center: Coordinate } | null>(null);
  const fittedPointsKeyRef = useRef<string | null>(null);
  const fitFrameRef = useRef<number | null>(null);
  const fitRevisionRef = useRef(0);
  const userControlledViewRef = useRef(false);
  const wheelDeltaRef = useRef(0);
  const routeRequestStatusRef = useRef<Set<string>>(new Set());
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [center, setCenter] = useState<Coordinate>({ lat: -24.75, lon: -51.45 });
  const [zoom, setZoom] = useState(8);
  const [basins, setBasins] = useState<BasinCollection | null>(null);
  const [resolvedRoadRoutes, setResolvedRoadRoutes] = useState<Record<string, Coordinate[]>>({});
  const resolvedRoadRoutesRef = useRef(resolvedRoadRoutes);
  useEffect(() => {
    resolvedRoadRoutesRef.current = resolvedRoadRoutes;
  }, [resolvedRoadRoutes]);
  const [hoveredPoint, setHoveredPoint] = useState<CampaignHydroMapPoint | null>(null);
  const [windowResizeCount, setWindowResizeCount] = useState(0);
  const defaultView = useMemo(
    () => getDefaultMapView(points, layers, size),
    [layers, points, size],
  );
  const minimumView = useMemo(() => getMinimumMapView(size), [size]);
  const minimumZoom = minimumView.zoom;
  const mapZoom = Math.max(minimumZoom, Math.min(maxZoom, zoom));
  const constrainedCenter = isMinimumZoom(mapZoom, minimumZoom)
    ? minimumView.center
    : clampCenterToParanaView(center, mapZoom, size);

  useEffect(() => {
    const wrapper = wrapperRef.current;

    if (!wrapper) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    observer.observe(wrapper);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleWindowResize = () => {
      setWindowResizeCount((current) => current + 1);
    };

    window.addEventListener("resize", handleWindowResize);

    return () => window.removeEventListener("resize", handleWindowResize);
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetch("/data/bacias-hidrograficas-parana.geojson")
      .then((response) => response.json())
      .then((data: BasinCollection) => {
        if (!cancelled) {
          setBasins(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBasins(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const tiles = useMemo(
    () => buildTiles(constrainedCenter, mapZoom, size.width, size.height),
    [constrainedCenter, mapZoom, size.height, size.width],
  );
  const shouldResolveRoadRoutes =
    layers.dailyRoutes || layers.dayTransitions || layers.displacement;
  const routeBuild = useMemo(
    () =>
      shouldResolveRoadRoutes
        ? buildRoadRouteRequests(points, layers)
        : { requests: [], diagnostics: emptyRouteDiagnostics(points.length) },
    [layers, points, shouldResolveRoadRoutes],
  );
  const routeRequests = routeBuild.requests;
  const roadRoutes = useMemo(
    () =>
      routeRequests.map((request) => {
        const coordinates = resolvedRoadRoutes[request.id];

        return {
          ...request,
          coordinates: coordinates ?? null,
        };
      }),
    [resolvedRoadRoutes, routeRequests],
  );
  // No mapa de PERCURSO cada ponto de coleta é pintado com a cor do seu dia —
  // a mesma cor da linha diária. Fora do modo campanha (Início/Resultados/Ações)
  // a cor tem outro significado, então não usamos esta paleta por dia.
  const pointDayColors = useMemo(
    () => (markerMode === "campaign" ? buildPointDayColorMap(points) : null),
    [markerMode, points],
  );
  // Dia de coleta de cada ponto (mesma chave estável dos trechos de rota), usado
  // para realçar/atenuar todos os elementos de um dia ao passar o mouse na legenda ou no mapa.
  const pointDayKeys = useMemo(
    () =>
      markerMode === "campaign" ? buildPointDayKeyMap(points) : null,
    [markerMode, points],
  );

  const hoveredDayKey = useMemo(() => {
    if (!hoveredPoint) {
      return null;
    }
    return pointDayKeys?.get(hoveredPoint.id) ?? null;
  }, [hoveredPoint, pointDayKeys]);

  const activeFocusedDayKey = focusedDayKey ?? hoveredDayKey;

  const routeDiagnostics = useMemo(() => {
    const dailyRequested = roadRoutes.filter((route) => route.kind === "daily").length;
    const dailyResolved = roadRoutes.filter(
      (route) => route.kind === "daily" && route.coordinates && route.coordinates.length >= 2,
    ).length;

    return {
      ...routeBuild.diagnostics,
      dailyLegsRequisitados: dailyRequested,
      dailyLegsComRota: dailyResolved,
      dailyLegsSemRota: Math.max(0, dailyRequested - dailyResolved),
    };
  }, [roadRoutes, routeBuild.diagnostics]);

  useEffect(() => {
    // Diagnóstico de rota no console (só em desenvolvimento): total de pontos,
    // datas com rota, trechos diários esperados/com rota/sem rota, ligações entre
    // dias desenhadas e ignoradas por intervalo de datas.
    if (process.env.NODE_ENV !== "production" && markerMode === "campaign" && points.length) {
      console.info("[mapa-percurso] diagnóstico de rota", routeDiagnostics);
    }
  }, [markerMode, points.length, routeDiagnostics]);


  useEffect(() => {
    let cancelled = false;
    const activeRequestIds = new Set<string>();
    const routeRequestStatus = routeRequestStatusRef.current;
    const maxAttempts = 4;
    const queue: Array<{ request: (typeof routeRequests)[number]; attempt: number }> =
      routeRequests
        .filter((request) => !resolvedRoadRoutesRef.current[request.id] && !routeRequestStatus.has(request.id))
        .map((request) => ({ request, attempt: 0 }));

    async function resolveNextRoute() {
      while (true) {
        if (cancelled) {
          return;
        }

        const next = queue.shift();

        if (!next) {
          return;
        }

        const { request, attempt } = next;
        routeRequestStatus.add(request.id);
        activeRequestIds.add(request.id);

        const coordinates = await fetchRoadRoute(request.waypoints).catch(
          () => null,
        );

        if (cancelled) {
          return;
        }

        if (coordinates) {
          const resolved = coordinates;
          setResolvedRoadRoutes((current) =>
            current[request.id] ? current : { ...current, [request.id]: resolved },
          );
          routeRequestStatus.delete(request.id);
        } else if (attempt + 1 < maxAttempts) {
          routeRequestStatus.delete(request.id);
          activeRequestIds.delete(request.id);
          const backoffMs = 600 * (attempt + 1);
          await new Promise((resolve) => window.setTimeout(resolve, backoffMs));

          if (cancelled) {
            return;
          }

          queue.push({ request, attempt: attempt + 1 });
        } else {
          // Keep it in status ref to prevent endless retries
        }
      }
    }

    const workerCount = Math.min(3, queue.length);
    void Promise.all(
      Array.from({ length: workerCount }, () => resolveNextRoute()),
    );

    return () => {
      cancelled = true;
      for (const id of activeRequestIds) {
        routeRequestStatus.delete(id);
      }
    };
  }, [routeRequests]);

  useEffect(() => {
    drawMapOverlay(
      canvasRef.current,
      basins,
      points,
      roadRoutes,
      constrainedCenter,
      mapZoom,
      size,
      layers,
      selectedPointId,
      markerMode,
      effectivePointColor,
      shouldClipBaseTilesToBasins,
      pointDayColors,
      activeFocusedDayKey,
      pointDayKeys,
      isPreparation,
    );
  }, [basins, constrainedCenter, effectivePointColor, activeFocusedDayKey, layers, mapZoom, markerMode, pointDayColors, pointDayKeys, points, roadRoutes, selectedPointId, shouldClipBaseTilesToBasins, size, isPreparation]);

  useEffect(() => {
    if (!size.width || !size.height) {
      return;
    }

    const coordinates = getVisibleMarkerCoordinates(points, layers);
    const fitKey = [
      Math.round(size.width),
      Math.round(size.height),
      windowResizeCount,
      defaultView.zoom,
      defaultView.center.lat.toFixed(5),
      defaultView.center.lon.toFixed(5),
      ...coordinates.map((coordinate) => `${coordinate.lat.toFixed(5)},${coordinate.lon.toFixed(5)}`),
    ].join("|");

    if (fittedPointsKeyRef.current === fitKey) {
      return;
    }

    fittedPointsKeyRef.current = fitKey;
    userControlledViewRef.current = false;

    if (fitFrameRef.current !== null) {
      window.cancelAnimationFrame(fitFrameRef.current);
      fitFrameRef.current = null;
    }
    const fitRevision = fitRevisionRef.current + 1;
    fitRevisionRef.current = fitRevision;
    const frame = window.requestAnimationFrame(() => {
      fitFrameRef.current = null;
      if (fitRevisionRef.current !== fitRevision) {
        return;
      }
      setCenter(defaultView.center);
      setZoom(defaultView.zoom);
    });
    fitFrameRef.current = frame;

    return () => {
      window.cancelAnimationFrame(frame);

      if (fitFrameRef.current === frame) {
        fitFrameRef.current = null;
      }
    };
  }, [defaultView, layers, points, size, windowResizeCount]);

  function cancelPendingFitFrame() {
    fitRevisionRef.current += 1;

    if (fitFrameRef.current === null) {
      return;
    }

    window.cancelAnimationFrame(fitFrameRef.current);
    fitFrameRef.current = null;
  }

  const resetToDefaultView = useCallback(() => {
    userControlledViewRef.current = true;
    cancelPendingFitFrame();
    setCenter(defaultView.center);
    setZoom(defaultView.zoom);
  }, [defaultView.center, defaultView.zoom]);

  const zoomBy = useCallback((delta: number, anchor?: { x: number; y: number }) => {
    userControlledViewRef.current = true;
    cancelPendingFitFrame();

    if (!size.width || !size.height) {
      setZoom((current) => {
        const nextZoom = Math.max(minimumZoom, Math.min(maxZoom, current + delta));

        if (isMinimumZoom(nextZoom, minimumZoom)) {
          setCenter(minimumView.center);
        }

        return nextZoom;
      });
      return;
    }

    const nextZoom = Math.max(minimumZoom, Math.min(maxZoom, mapZoom + delta));

    if (isMinimumZoom(nextZoom, minimumZoom)) {
      setCenter(minimumView.center);
    } else if (anchor) {
      setCenter(
        clampCenterToParanaView(
          centerForAnchoredZoom(constrainedCenter, mapZoom, nextZoom, size, anchor),
          nextZoom,
          size,
        ),
      );
    } else {
      setCenter((current) => clampCenterToParanaView(current, nextZoom, size));
    }

    if (nextZoom === mapZoom) {
      return;
    }

    setZoom(nextZoom);
  }, [constrainedCenter, mapZoom, minimumView.center, minimumZoom, size]);

  useEffect(() => {
    const wrapper = wrapperRef.current;

    if (!wrapper) {
      return;
    }

    const mapWrapper = wrapper;

    function handleWheel(event: WheelEvent) {
      event.preventDefault();
      event.stopPropagation();
      wheelDeltaRef.current += event.deltaY;

      if (Math.abs(wheelDeltaRef.current) < wheelZoomThreshold) {
        return;
      }

      const bounds = mapWrapper.getBoundingClientRect();
      zoomBy(wheelDeltaRef.current > 0 ? -1 : 1, {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });
      wheelDeltaRef.current = 0;
    }

    mapWrapper.addEventListener("wheel", handleWheel, { passive: false });

    return () => mapWrapper.removeEventListener("wheel", handleWheel);
  }, [zoomBy]);

  return (
    <div
      ref={wrapperRef}
      className="absolute inset-0 overflow-hidden bg-[#dbe9ed]"
      data-default-zoom={defaultView.zoom}
      data-effective-count={points.filter((point) => point.effective).length}
      data-map-zoom={mapZoom}
      data-min-zoom={minimumZoom}
      data-original-count={points.filter((point) => point.original).length}
      data-point-count={points.length}
      data-resolved-route-count={
        roadRoutes.filter((route) => route.coordinates && route.coordinates.length >= 2).length
      }
      data-route-request-count={routeRequests.length}
      data-route-dates={routeDiagnostics.routeDates}
      data-daily-legs-expected={routeDiagnostics.dailyLegsExpected}
      data-daily-legs-com-rota={routeDiagnostics.dailyLegsComRota}
      data-daily-legs-sem-rota={routeDiagnostics.dailyLegsSemRota}
      data-interday-drawn={routeDiagnostics.interdayDrawn}
      data-interday-ignored-gap={routeDiagnostics.interdayIgnoredGap}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = { x: event.clientX, y: event.clientY, center: constrainedCenter };
      }}
      onPointerMove={(event) => {
        if (!dragRef.current) {
          if (showPointTooltip && size.width && size.height) {
            const bounds = event.currentTarget.getBoundingClientRect();
            const hovered = findNearestPoint(
              points,
              event.clientX - bounds.left,
              event.clientY - bounds.top,
              constrainedCenter,
              mapZoom,
              size,
              layers,
            );

            setHoveredPoint(hovered);
          }
          return;
        }

        const dx = event.clientX - dragRef.current.x;
        const dy = event.clientY - dragRef.current.y;

        if (isMinimumZoom(mapZoom, minimumZoom)) {
          userControlledViewRef.current = true;
          setCenter(minimumView.center);
          setHoveredPoint(null);
          return;
        }

        const start = lonLatToWorld(dragRef.current.center.lon, dragRef.current.center.lat, mapZoom);
        const next = worldToLonLat(start.x - dx, start.y - dy, mapZoom);
        userControlledViewRef.current = true;
        setCenter(clampCenterToParanaView(next, mapZoom, size));
        setHoveredPoint(null);
      }}
      onPointerUp={() => {
        dragRef.current = null;
      }}
      onPointerCancel={() => {
        dragRef.current = null;
        setHoveredPoint(null);
      }}
      onPointerLeave={() => {
        dragRef.current = null;
        setHoveredPoint(null);
      }}
      onClick={(event) => {
        if (!size.width || !size.height) {
          return;
        }

        const bounds = event.currentTarget.getBoundingClientRect();
        const selected = findNearestMarker(
          points,
          event.clientX - bounds.left,
          event.clientY - bounds.top,
          constrainedCenter,
          mapZoom,
          size,
          layers,
        );

        if (selected) {
          onSelectPoint?.(selected.point);

          if (zoomOnSelect) {
            userControlledViewRef.current = true;
            cancelPendingFitFrame();
            if (selected.point.id === selectedPointId && mapZoom >= maxZoom - zoomEpsilon) {
              resetToDefaultView();
            } else {
              setCenter(clampCenterToParanaView(selected.coordinate, maxZoom, size));
              setZoom(maxZoom);
            }
          }
        }
      }}
      style={{ cursor: hoveredPoint ? "pointer" : undefined }}
    >
      <div className="absolute inset-0">
        {showBaseTiles ? tiles.map((tile) => (
          // Map tiles are a repeated raster grid; next/image is not a good fit here.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={tile.key}
            alt=""
            src={tile.url}
            className="absolute h-64 w-64 select-none transition duration-300"
            draggable={false}
            style={{
              left: tile.x,
              top: tile.y,
              height: tile.size,
              width: tile.size,
              filter: layers.roadMap
                ? "saturate(1.05) contrast(1.04)"
                : "grayscale(0.92) contrast(0.82) opacity(0.55)",
            }}
          />
        )) : null}
      </div>

      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {showPointTooltip && hoveredPoint ? (
        <PointTooltip
          point={hoveredPoint}
          coordinate={tooltipCoordinate(hoveredPoint, layers)}
          center={constrainedCenter}
          zoom={mapZoom}
          size={size}
        />
      ) : null}

      {isPreparation ? (
        <div className="absolute left-4 top-4 z-20 max-w-[240px] md:max-w-[280px] rounded-xl border border-amber-200 bg-amber-50/95 p-3 shadow-[0_8px_24px_-8px_rgba(120,53,4,0.16)] backdrop-blur-sm transition-all hover:bg-amber-50">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="flex h-2.5 w-2.5 items-center justify-center rounded-full bg-amber-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
            </span>
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-800 flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Campanha Prevista
            </span>
          </div>
          <p className="text-[11px] font-semibold leading-relaxed text-amber-700 normal-case tracking-normal">
            A campanha está em fase de preparação. Estas são as rotas e o cronograma planejado.
          </p>
        </div>
      ) : null}

      <div className="absolute bottom-4 left-4 rounded border border-white/70 bg-white/90 px-3 py-2 text-caption font-semibold text-slate-600 shadow backdrop-blur">
        {caption}
      </div>

      <div className="absolute right-4 bottom-4 flex flex-col overflow-hidden rounded-xl border border-white/70 bg-white/95 shadow">
        <button
          type="button"
          aria-label="Aproximar mapa"
          className="flex h-9 w-9 items-center justify-center text-[var(--brand-navy-strong)] transition-colors hover:bg-slate-100"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            zoomBy(1);
          }}
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Voltar ao enquadramento padrão"
          title="Voltar ao enquadramento padrão"
          className="flex h-9 w-9 items-center justify-center border-t border-slate-100 text-[var(--brand-navy-strong)] transition-colors hover:bg-slate-100"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            resetToDefaultView();
          }}
        >
          <Minimize2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Afastar mapa"
          className="flex h-9 w-9 items-center justify-center border-t border-slate-100 text-[var(--brand-navy-strong)] transition-colors hover:bg-slate-100"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            zoomBy(-1);
          }}
        >
          <Minus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function PointTooltip({
  point,
  coordinate,
  center,
  zoom,
  size,
}: {
  point: CampaignHydroMapPoint;
  coordinate: Coordinate | null;
  center: Coordinate;
  zoom: number;
  size: { width: number; height: number };
}) {
  if (!coordinate || !size.width || !size.height) {
    return null;
  }

  const screen = lonLatToScreen(coordinate.lon, coordinate.lat, center, zoom, size);
  const left = Math.min(Math.max(screen.x + 12, 12), size.width - 190);
  const top = Math.min(Math.max(screen.y - 46, 12), size.height - 76);

  return (
    <div
      className="pointer-events-none absolute z-30 min-w-44 rounded-xl border border-white/70 bg-white/95 px-3 py-2 text-xs shadow-[0_18px_42px_-24px_rgba(0,66,98,0.48)] backdrop-blur"
      style={{ left, top }}
    >
      <p className="text-caption font-black uppercase tracking-[0.18em] text-slate-400">
        {point.campaign || "Campanha"}
      </p>
      <p className="mt-0.5 font-black text-[var(--brand-navy-strong)]">{point.code}</p>
      {point.point ? (
        <p className="mt-0.5 text-label font-semibold leading-4 text-slate-600">{point.point}</p>
      ) : null}
      {point.day || point.date || point.collectionOrder != null ? (
        <p className="mt-1.5 inline-flex flex-wrap items-center gap-1 rounded bg-[var(--surface-soft)] px-1.5 py-0.5 text-caption font-black uppercase tracking-[0.08em] text-[var(--brand-navy-strong)]">
          {point.day ? formatCollectionDayLabel(point.day) : null}
          {point.date ? `${point.day ? " · " : ""}${formatCollectionDate(point.date)}` : null}
          {point.collectionOrder != null ? ` · Coleta ${point.collectionOrder}` : null}
        </p>
      ) : null}
      <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-label leading-4">
        <dt className="font-bold text-slate-400">Município</dt>
        <dd className="font-medium text-slate-600">{point.municipality || "—"}</dd>
        <dt className="font-bold text-slate-400">Rio</dt>
        <dd className="max-w-40 font-medium text-slate-600">{point.waterBody || "—"}</dd>
      </dl>
    </div>
  );
}

function formatCollectionDayLabel(day: string) {
  const trimmed = String(day).trim();
  const number = trimmed.match(/\d+/);

  if (number) {
    return `Dia ${Number(number[0])}`;
  }

  return trimmed.toLowerCase().startsWith("dia") ? trimmed : `Dia ${trimmed}`;
}

// Data de coleta em DD/MM/AAAA, aceitando ISO "AAAA-MM-DD" ou já em BR.
function formatCollectionDate(value: string) {
  const text = String(value).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (iso) {
    return `${iso[3]}/${iso[2]}/${iso[1]}`;
  }

  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/);

  return br ? `${br[1]}/${br[2]}/${br[3]}` : text;
}

function tooltipCoordinate(
  point: CampaignHydroMapPoint,
  layers: CampaignMapLayerVisibility,
) {
  return mapCoordinate(point, layers);
}

function mapCoordinate(
  point: CampaignHydroMapPoint,
  layers: CampaignMapLayerVisibility,
) {
  if (layers.effective && point.effective) {
    return point.effective;
  }

  if (layers.planned && point.original) {
    return point.original;
  }

  return point.effective ?? point.original;
}

function getVisibleMarkerCoordinates(
  points: CampaignHydroMapPoint[],
  layers: CampaignMapLayerVisibility,
) {
  const coordinates: Coordinate[] = [];
  const knownCoordinates = new Set<string>();

  for (const point of points) {
    const visibleCoordinates = [
      layers.planned ? point.original : null,
      layers.effective ? point.effective : null,
    ];

    for (const coordinate of visibleCoordinates) {
      if (!coordinate) {
        continue;
      }

      const key = `${coordinate.lat.toFixed(7)},${coordinate.lon.toFixed(7)}`;

      if (!knownCoordinates.has(key)) {
        knownCoordinates.add(key);
        coordinates.push(coordinate);
      }
    }
  }

  if (coordinates.length) {
    return coordinates;
  }

  return points
    .flatMap((point) => [point.effective, point.original])
    .filter((coordinate): coordinate is Coordinate => coordinate !== null);
}

function getDefaultMapView(
  points: CampaignHydroMapPoint[],
  layers: CampaignMapLayerVisibility,
  size: { width: number; height: number },
) {
  const minimumView = getMinimumMapView(size);

  if (!size.width || !size.height) {
    return minimumView;
  }

  const coordinates = getVisibleMarkerCoordinates(points, layers);

  if (!coordinates.length) {
    return minimumView;
  }

  if (shouldUseStatewideFrame(coordinates)) {
    return minimumView;
  }

  const fittedView = fitCoordinatesToView(
    coordinates,
    size,
    minimumView.zoom,
    defaultFitPadding,
  );

  return {
    ...fittedView,
    center: clampCenterToParanaView(fittedView.center, fittedView.zoom, size),
  };
}

function shouldUseStatewideFrame(coordinates: Coordinate[]) {
  if (coordinates.length < 2) {
    return false;
  }

  const minLat = Math.min(...coordinates.map((coordinate) => coordinate.lat));
  const maxLat = Math.max(...coordinates.map((coordinate) => coordinate.lat));
  const minLon = Math.min(...coordinates.map((coordinate) => coordinate.lon));
  const maxLon = Math.max(...coordinates.map((coordinate) => coordinate.lon));
  const latCoverage = (maxLat - minLat) / (paranaVisualBounds.north - paranaVisualBounds.south);
  const lonCoverage = (maxLon - minLon) / (paranaVisualBounds.east - paranaVisualBounds.west);

  return latCoverage >= statewideCoverageThreshold || lonCoverage >= statewideCoverageThreshold;
}

function getMinimumMapView(size: { width: number; height: number }) {
  if (!size.width || !size.height) {
    return {
      center: paranaCenter(),
      zoom: absoluteMinZoom,
    };
  }

  return fitCoordinatesToView(
    getParanaFrame(),
    size,
    absoluteMinZoom,
    paranaFitPadding,
  );
}

function fitCoordinatesToView(
  coordinates: Coordinate[],
  size: { width: number; height: number },
  minimumZoom = absoluteMinZoom,
  padding = defaultFitPadding,
) {
  if (coordinates.length === 1) {
    return {
      center: coordinates[0],
      zoom: maxZoom,
    };
  }

  const minLat = Math.min(...coordinates.map((coordinate) => coordinate.lat));
  const maxLat = Math.max(...coordinates.map((coordinate) => coordinate.lat));
  const minLon = Math.min(...coordinates.map((coordinate) => coordinate.lon));
  const maxLon = Math.max(...coordinates.map((coordinate) => coordinate.lon));
  const availableWidth = Math.max(size.width - padding * 2, 160);
  const availableHeight = Math.max(size.height - padding * 2, 140);
  const northWestAtZero = lonLatToWorld(minLon, maxLat, 0);
  const southEastAtZero = lonLatToWorld(maxLon, minLat, 0);
  const center = worldToLonLat(
    (northWestAtZero.x + southEastAtZero.x) / 2,
    (northWestAtZero.y + southEastAtZero.y) / 2,
    0,
  );
  const boundsWidthAtZero = Math.abs(southEastAtZero.x - northWestAtZero.x);
  const boundsHeightAtZero = Math.abs(southEastAtZero.y - northWestAtZero.y);

  if (!boundsWidthAtZero || !boundsHeightAtZero) {
    return {
      center,
      zoom: maxZoom,
    };
  }

  const zoomForWidth = Math.log2(availableWidth / boundsWidthAtZero);
  const zoomForHeight = Math.log2(availableHeight / boundsHeightAtZero);
  const fittedZoom = Math.min(zoomForWidth, zoomForHeight);

  return {
    center,
    zoom: Math.max(minimumZoom, Math.min(maxZoom, fittedZoom)),
  };
}

function getParanaFrame() {
  return [
    { lat: paranaVisualBounds.north, lon: paranaVisualBounds.west },
    { lat: paranaVisualBounds.north, lon: paranaVisualBounds.east },
    { lat: paranaVisualBounds.south, lon: paranaVisualBounds.west },
    { lat: paranaVisualBounds.south, lon: paranaVisualBounds.east },
  ];
}

function paranaCenter() {
  return {
    lat: (paranaVisualBounds.north + paranaVisualBounds.south) / 2,
    lon: (paranaVisualBounds.west + paranaVisualBounds.east) / 2,
  };
}

function clampCenterToParana(coordinate: Coordinate) {
  return {
    lat: Math.min(Math.max(coordinate.lat, paranaBounds.south), paranaBounds.north),
    lon: Math.min(Math.max(coordinate.lon, paranaBounds.west), paranaBounds.east),
  };
}

function clampCenterToParanaView(
  coordinate: Coordinate,
  zoom: number,
  size: { width: number; height: number },
) {
  if (!size.width || !size.height) {
    return clampCenterToParana(coordinate);
  }

  const northWest = lonLatToWorld(paranaBounds.west, paranaBounds.north, zoom);
  const southEast = lonLatToWorld(paranaBounds.east, paranaBounds.south, zoom);
  const desired = lonLatToWorld(coordinate.lon, coordinate.lat, zoom);
  const halfWidth = size.width / 2;
  const halfHeight = size.height / 2;
  const minCenterX = northWest.x + halfWidth;
  const maxCenterX = southEast.x - halfWidth;
  const minCenterY = northWest.y + halfHeight;
  const maxCenterY = southEast.y - halfHeight;
  const x = minCenterX <= maxCenterX
    ? Math.min(Math.max(desired.x, minCenterX), maxCenterX)
    : (northWest.x + southEast.x) / 2;
  const y = minCenterY <= maxCenterY
    ? Math.min(Math.max(desired.y, minCenterY), maxCenterY)
    : (northWest.y + southEast.y) / 2;

  return worldToLonLat(x, y, zoom);
}

function centerForAnchoredZoom(
  center: Coordinate,
  currentZoom: number,
  nextZoom: number,
  size: { width: number; height: number },
  anchor: { x: number; y: number },
) {
  const currentCenterWorld = lonLatToWorld(center.lon, center.lat, currentZoom);
  const anchorWorld = {
    x: currentCenterWorld.x + anchor.x - size.width / 2,
    y: currentCenterWorld.y + anchor.y - size.height / 2,
  };
  const anchorCoordinate = worldToLonLat(anchorWorld.x, anchorWorld.y, currentZoom);
  const nextAnchorWorld = lonLatToWorld(
    anchorCoordinate.lon,
    anchorCoordinate.lat,
    nextZoom,
  );
  const nextCenterWorld = {
    x: nextAnchorWorld.x - anchor.x + size.width / 2,
    y: nextAnchorWorld.y - anchor.y + size.height / 2,
  };

  return worldToLonLat(nextCenterWorld.x, nextCenterWorld.y, nextZoom);
}

function isMinimumZoom(zoom: number, minimumZoom: number) {
  return zoom <= minimumZoom + zoomEpsilon;
}

function buildTiles(center: Coordinate, zoom: number, width: number, height: number): Tile[] {
  if (!width || !height) {
    return [];
  }

  const tileZoom = Math.max(0, Math.min(19, Math.round(zoom)));
  const tileScale = 2 ** (zoom - tileZoom);
  const scaledTileSize = tileSize * tileScale;
  const centerWorld = lonLatToWorld(center.lon, center.lat, tileZoom);
  const scaledCenter = {
    x: centerWorld.x * tileScale,
    y: centerWorld.y * tileScale,
  };
  const minX = Math.floor((scaledCenter.x - width / 2) / scaledTileSize);
  const maxX = Math.floor((scaledCenter.x + width / 2) / scaledTileSize);
  const minY = Math.floor((scaledCenter.y - height / 2) / scaledTileSize);
  const maxY = Math.floor((scaledCenter.y + height / 2) / scaledTileSize);
  const tileCount = 2 ** tileZoom;
  const tiles: Tile[] = [];

  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      if (y < 0 || y >= tileCount) {
        continue;
      }

      const wrappedX = ((x % tileCount) + tileCount) % tileCount;

      tiles.push({
        key: `${tileZoom}-${zoom.toFixed(3)}-${x}-${y}`,
        url: `https://tile.openstreetmap.org/${tileZoom}/${wrappedX}/${y}.png`,
        x: x * scaledTileSize - scaledCenter.x + width / 2,
        y: y * scaledTileSize - scaledCenter.y + height / 2,
        size: scaledTileSize,
      });
    }
  }

  return tiles;
}

function drawMapOverlay(
  canvas: HTMLCanvasElement | null,
  basins: BasinCollection | null,
  points: CampaignHydroMapPoint[],
  roadRoutes: RoadRouteSegment[],
  center: Coordinate,
  zoom: number,
  size: { width: number; height: number },
  layers: CampaignMapLayerVisibility,
  selectedPointId?: string,
  markerMode: "campaign" | "risk" | "pointAction" = "campaign",
  effectivePointColor?: string,
  shouldClipBaseTilesToBasins = false,
  pointDayColors: Map<string, string> | null = null,
  focusedDayKey: string | null = null,
  pointDayKeys: Map<string, string> | null = null,
  isPreparation = false,
) {
  if (!canvas || !size.width || !size.height) {
    return;
  }

  const ratio = window.devicePixelRatio || 1;
  canvas.width = size.width * ratio;
  canvas.height = size.height * ratio;
  const context = canvas.getContext("2d");

  if (!context) {
    return;
  }

  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, size.width, size.height);

  if (basins && shouldClipBaseTilesToBasins) {
    clipBaseTilesToBasins(context, basins, center, zoom, size);
  }

  if (basins && layers.basins) {
    drawBasins(context, basins, center, zoom, size);
  }

  drawRoadRoutes(context, roadRoutes, center, zoom, size, layers, focusedDayKey);

  drawPoints(
    context,
    points,
    center,
    zoom,
    size,
    layers,
    selectedPointId,
    markerMode,
    effectivePointColor,
    pointDayColors,
    focusedDayKey,
    pointDayKeys,
    isPreparation,
  );
}

function clipBaseTilesToBasins(
  context: CanvasRenderingContext2D,
  basins: BasinCollection,
  center: Coordinate,
  zoom: number,
  size: { width: number; height: number },
) {
  context.save();
  context.beginPath();
  context.rect(0, 0, size.width, size.height);
  appendBasinPaths(context, basins, center, zoom, size);
  context.fillStyle = "#dbe9ed";
  context.fill("evenodd");
  context.restore();
}

function drawBasins(
  context: CanvasRenderingContext2D,
  basins: BasinCollection,
  center: Coordinate,
  zoom: number,
  size: { width: number; height: number },
) {
  basins.features.forEach((feature, index) => {
    const polygons = feature.geometry.type === "Polygon"
      ? [feature.geometry.coordinates as number[][][]]
      : (feature.geometry.coordinates as number[][][][]);

    context.beginPath();
    appendPolygonPaths(context, polygons, center, zoom, size);

    context.fillStyle = basinColors[index % basinColors.length];
    context.strokeStyle = "rgba(0, 66, 98, 0.78)";
    context.lineWidth = 1.2;
    context.fill("evenodd");
    context.stroke();

    const label = feature.properties.NOME;
    const centroid = basinCentroid(polygons);

    if (label && centroid) {
      const screen = lonLatToScreen(centroid.lon, centroid.lat, center, zoom, size);
      context.font = "700 10px Inter, Arial, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.lineWidth = 3;
      context.strokeStyle = "rgba(255, 255, 255, 0.92)";
      context.strokeText(label, screen.x, screen.y);
      context.fillStyle = "rgba(0, 66, 98, 0.82)";
      context.fillText(label, screen.x, screen.y);
    }
  });
}

function appendBasinPaths(
  context: CanvasRenderingContext2D,
  basins: BasinCollection,
  center: Coordinate,
  zoom: number,
  size: { width: number; height: number },
) {
  for (const feature of basins.features) {
    const polygons = feature.geometry.type === "Polygon"
      ? [feature.geometry.coordinates as number[][][]]
      : (feature.geometry.coordinates as number[][][][]);

    appendPolygonPaths(context, polygons, center, zoom, size);
  }
}

function appendPolygonPaths(
  context: CanvasRenderingContext2D,
  polygons: number[][][][],
  center: Coordinate,
  zoom: number,
  size: { width: number; height: number },
) {
  for (const polygon of polygons) {
    for (const ring of polygon) {
      ring.forEach(([lon, lat], pointIndex) => {
        const screen = lonLatToScreen(lon, lat, center, zoom, size);
        if (pointIndex === 0) {
          context.moveTo(screen.x, screen.y);
        } else {
          context.lineTo(screen.x, screen.y);
        }
      });
      context.closePath();
    }
  }
}

function drawPoints(
  context: CanvasRenderingContext2D,
  points: CampaignHydroMapPoint[],
  center: Coordinate,
  zoom: number,
  size: { width: number; height: number },
  layers: CampaignMapLayerVisibility,
  selectedPointId?: string,
  markerMode: "campaign" | "risk" | "pointAction" = "campaign",
  effectivePointColor?: string,
  pointDayColors: Map<string, string> | null = null,
  focusedDayKey: string | null = null,
  pointDayKeys: Map<string, string> | null = null,
  isPreparation = false,
) {
  context.lineCap = "round";

  // Um ponto fica atenuado quando há um dia realçado (hover na legenda ou mapa) e ele
  // NÃO é desse dia. Sem realce ativo, nada é atenuado.
  const isDimmed = (point: CampaignHydroMapPoint) =>
    focusedDayKey ? pointDayKeys?.get(point.id) !== focusedDayKey : false;

  if (layers.displacement && layers.planned && layers.effective) {
    for (const point of points) {
      if (point.original && point.effective) {
        const original = lonLatToScreen(point.original.lon, point.original.lat, center, zoom, size);
        const effective = lonLatToScreen(point.effective.lon, point.effective.lat, center, zoom, size);

        if (haversineDistanceMeters(point.original, point.effective) <= maxStraightDisplacementMeters) {
          context.globalAlpha = isDimmed(point) ? dayFocusDimAlpha : 1;
          context.beginPath();
          context.moveTo(original.x, original.y);
          context.lineTo(effective.x, effective.y);
          context.strokeStyle = "rgba(0, 66, 98, 0.32)";
          context.lineWidth = 1;
          context.stroke();
          context.globalAlpha = 1;
        }
      }
    }
  }

  // O mapa de campanha é um mapa de PERCURSO (sem resultados). O ponto de coleta
  // (efetivo) é pintado com a cor do seu DIA — a mesma cor da linha diária — com
  // contorno branco para continuar legível. A coordenada de apoio (prevista)
  // permanece neutra (preta) para se distinguir da coleta. Nenhuma cor aqui
  // representa qualidade da água, classificação ou métrica — apenas o dia.
  const campaignRoute = markerMode === "campaign";

  for (const point of points) {
    // Ponto selecionado nunca é atenuado, mesmo com outro dia em realce.
    const dimmed = isDimmed(point) && point.id !== selectedPointId;
    const isHighlightedDay = focusedDayKey && pointDayKeys?.get(point.id) === focusedDayKey;
    context.globalAlpha = dimmed ? dayFocusDimAlpha : 1;

    if (point.original && layers.planned) {
      const original = lonLatToScreen(point.original.lon, point.original.lat, center, zoom, size);
      drawMarkerAt(
        context,
        original.x,
        original.y,
        "original",
        point.id === selectedPointId,
        undefined,
        false,
        undefined,
        campaignRoute,
        undefined,
        Boolean(isHighlightedDay),
        isPreparation,
      );
    }

    if (point.effective && layers.effective) {
      const effective = lonLatToScreen(point.effective.lon, point.effective.lat, center, zoom, size);
      drawMarkerAt(
        context,
        effective.x,
        effective.y,
        "effective",
        point.id === selectedPointId,
        markerMode === "risk" ? point.riskLevel : undefined,
        markerMode === "pointAction",
        effectivePointColor,
        campaignRoute,
        campaignRoute ? pointDayColors?.get(point.id) : undefined,
        Boolean(isHighlightedDay),
        isPreparation,
      );
    }

    context.globalAlpha = 1;
  }
}

function drawRoadRoutes(
  context: CanvasRenderingContext2D,
  routes: RoadRouteSegment[],
  center: Coordinate,
  zoom: number,
  size: { width: number; height: number },
  layers: CampaignMapLayerVisibility,
  focusedDayKey: string | null = null,
) {
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";

  routes.forEach((route) => {
    // Toda polyline criada pelo app tem tipo explícito (daily / transition /
    // displacement). Tipo não reconhecido NÃO é renderizado — garante que nenhuma
    // linha "solta" (potencialmente preta contínua) apareça na camada de percurso.
    if (!renderableRouteKinds.has(route.kind)) {
      return;
    }

    const visible =
      route.kind === "daily"
        ? layers.dailyRoutes
        : route.kind === "transition"
          ? layers.dayTransitions
          : layers.displacement;

    // Regra do usuário: o mapa NÃO adivinha trajeto. Rotas diárias e as
    // transições entre dias (último ponto de um dia → primeiro ponto do dia
    // seguinte, mesmo com dias de intervalo) só existem sobre a malha rodoviária
    // (OSRM). Enquanto a rota não resolve — ou se falha de vez — não traçamos
    // nenhuma reta "chutada" entre os pontos; era isso que produzia as linhas
    // cruzando o mapa sem sentido. O deslocamento (original → efetivo) continua
    // reto, pois representa a própria correção do ponto, não um trecho de via.
    const roadGeometry =
      route.coordinates && route.coordinates.length >= 2 ? route.coordinates : null;
    const geometry =
      roadGeometry ?? (route.kind === "displacement" ? route.waypoints : null);

    if (!visible || !geometry || geometry.length < 2) {
      return;
    }

    const screens = geometry.map((coordinate) =>
      lonLatToScreen(coordinate.lon, coordinate.lat, center, zoom, size),
    );
    const color =
      route.kind === "transition"
        ? "rgba(71, 85, 105, 0.76)"
        : route.kind === "displacement"
          ? "rgba(0, 66, 98, 0.48)"
        : route.color;

    // Realce por dia (hover na legenda): trechos de outros dias ficam atenuados.
    // O deslocamento não tem dia, então acompanha o realce (some junto com o resto).
    const dimmed = focusedDayKey ? route.dayKey !== focusedDayKey : false;
    const isFocused = focusedDayKey && route.dayKey === focusedDayKey;

    context.globalAlpha = dimmed ? dayFocusDimAlpha : 1;
    context.setLineDash(route.kind === "transition" ? [6, 8] : []);
    context.beginPath();
    screens.forEach((screen, pointIndex) => {
      if (pointIndex === 0) {
        context.moveTo(screen.x, screen.y);
      } else {
        context.lineTo(screen.x, screen.y);
      }
    });
    context.strokeStyle = color;
    context.lineWidth =
      route.kind === "daily"
        ? (isFocused ? 6 : 3.2)
        : route.kind === "transition"
          ? (isFocused ? 3.5 : 2)
          : 1.4;
    context.stroke();
    context.globalAlpha = 1;
  });

  context.restore();
}

export type RouteDiagnostics = {
  totalPoints: number;
  routeDates: number;
  dailyLegsExpected: number;
  interdayExpected: number;
  interdayDrawn: number;
  interdayIgnoredGap: number;
};

function emptyRouteDiagnostics(totalPoints = 0): RouteDiagnostics {
  return {
    totalPoints,
    routeDates: 0,
    dailyLegsExpected: 0,
    interdayExpected: 0,
    interdayDrawn: 0,
    interdayIgnoredGap: 0,
  };
}

// Um "dia" de percurso = pontos da mesma campanha coletados na mesma DATA real.
type CampaignDayGroup = {
  key: string;
  campaignKey: string;
  label: string;
  dateMs: number | null;
  points: CampaignHydroMapPoint[];
};

// Agrupa os pontos por campanha + data real e os ordena na sequência do percurso
// (campanha, data, nº do dia). Esta é a ÚNICA fonte da ordem dos dias: a cor da
// linha diária (`buildRoadRouteRequests`) e a cor do marcador do ponto
// (`buildPointDayColorMap`) derivam ambas deste índice de grupo, garantindo que
// ponto e linha do mesmo dia recebam exatamente a mesma cor.
export function buildCampaignDayGroups(
  points: CampaignHydroMapPoint[],
): CampaignDayGroup[] {
  const groups = new Map<string, CampaignDayGroup>();
  const inferredDayLabels = new Map<string, string>();

  for (const point of points) {
    const coordinate = point.effective ?? point.original;

    if (!coordinate) {
      continue;
    }

    const label = formatRouteDayLabel(point, inferredDayLabels);
    const campaignKey = normalizeCampaignKey(point.campaign) || "campanha";
    // Chave de rota = campanha + DATA REAL da coleta. O "dia da campanha" é só
    // rótulo/ordem auxiliar. Sem data confiável, cai para o rótulo do dia.
    const dateMs = parseRouteDateMs(point.date);
    const dateKey = dateMs !== null ? `d${dateMs}` : `label-${label}`;
    const key = `${campaignKey}|${dateKey}`;
    const group = groups.get(key);

    if (group) {
      group.points.push(point);
    } else {
      groups.set(key, { key, campaignKey, label, dateMs, points: [point] });
    }
  }

  return [...groups.values()].sort(
    (a, b) =>
      a.campaignKey.localeCompare(b.campaignKey) ||
      (a.dateMs ?? Number.MAX_SAFE_INTEGER) - (b.dateMs ?? Number.MAX_SAFE_INTEGER) ||
      dayLabelNumber(a.label) - dayLabelNumber(b.label),
  );
}

// Cor por ponto = cor do DIA de coleta daquele ponto (mesma paleta e mesmo
// índice de grupo usados na linha diária). No mapa de PERCURSO a cor significa
// apenas o dia da coleta — nunca resultado, classificação ou métrica ambiental.
export function buildPointDayColorMap(
  points: CampaignHydroMapPoint[],
): Map<string, string> {
  const colorByPointId = new Map<string, string>();

  buildCampaignDayGroups(points).forEach((group, groupIndex) => {
    const color = dailyRouteColors[groupIndex % dailyRouteColors.length];

    for (const point of group.points) {
      colorByPointId.set(point.id, color);
    }
  });

  return colorByPointId;
}

// Dia de coleta de cada ponto (mesma chave estável dos trechos de rota), usado
// para realçar/atenuar todos os elementos de um dia ao passar o mouse na legenda.
export function buildPointDayKeyMap(
  points: CampaignHydroMapPoint[],
): Map<string, string> {
  const dayKeyByPointId = new Map<string, string>();

  for (const group of buildCampaignDayGroups(points)) {
    for (const point of group.points) {
      dayKeyByPointId.set(point.id, group.key);
    }
  }

  return dayKeyByPointId;
}

export type CampaignDayLegendEntry = {
  key: string;
  label: string;
  color: string;
  dateMs: number | null;
};

// Lista compacta de dias de coleta (chave, rótulo, cor, data) na ordem do
// percurso — a fonte dos "chips" de realce por dia na legenda.
export function buildCampaignDayLegend(
  points: CampaignHydroMapPoint[],
): CampaignDayLegendEntry[] {
  return buildCampaignDayGroups(points).map((group, groupIndex) => ({
    key: group.key,
    label: group.label,
    color: dailyRouteColors[groupIndex % dailyRouteColors.length],
    dateMs: group.dateMs,
  }));
}

export function buildRoadRouteRequests(
  points: CampaignHydroMapPoint[],
  layers: CampaignMapLayerVisibility,
): {
  requests: Array<Omit<RoadRouteSegment, "coordinates">>;
  diagnostics: RouteDiagnostics;
} {
  const orderedGroups = buildCampaignDayGroups(points);
  const dailyRequests: Array<Omit<RoadRouteSegment, "coordinates">> = [];
  const transitionRequests: Array<Omit<RoadRouteSegment, "coordinates">> = [];
  const displacementRequests: Array<Omit<RoadRouteSegment, "coordinates">> = [];
  const diagnostics = emptyRouteDiagnostics(points.length);
  diagnostics.routeDates = orderedGroups.length;

  orderedGroups.forEach((group, groupIndex) => {
    const color = dailyRouteColors[groupIndex % dailyRouteColors.length];
    const waypoints = group.points
      .map((point) => routeCoordinate(point))
      .filter((coordinate): coordinate is Coordinate => coordinate !== null);

    // Cada data é dividida em trechos ponto-a-ponto: se o OSRM não resolver UMA
    // perna (ou o ponto não "snapa" na via), só aquela perna fica sem linha — as
    // demais continuam sobre a estrada. Nunca desenhamos reta "chutada".
    if (waypoints.length > 1) {
      diagnostics.dailyLegsExpected += waypoints.length - 1;

      if (layers.dailyRoutes) {
        for (let index = 1; index < waypoints.length; index += 1) {
          const segment = [waypoints[index - 1], waypoints[index]];
          const waypointKey = roadRouteWaypointsKey(segment);

          dailyRequests.push({
            id: `daily-${group.key}-${index}-${waypointKey}`,
            kind: "daily",
            label: group.label,
            color,
            dayKey: group.key,
            waypoints: segment,
          });
        }
      }
    }

    const nextGroup = orderedGroups[groupIndex + 1];

    // Ligação entre dias: só entre DATAS ADJACENTES (diferença de exatamente 1
    // dia). Se houve intervalo, não se liga — a nova data recomeça do zero.
    if (nextGroup && nextGroup.campaignKey === group.campaignKey) {
      diagnostics.interdayExpected += 1;

      if (areAdjacentDateMs(group.dateMs, nextGroup.dateMs)) {
        const from = lastRouteCoordinate(group.points);
        const to = firstRouteCoordinate(nextGroup.points);

        if (from && to) {
          diagnostics.interdayDrawn += 1;

          if (layers.dayTransitions) {
            const waypoints = [from, to];
            const waypointKey = roadRouteWaypointsKey(waypoints);

            transitionRequests.push({
              id: `transition-${group.key}-${nextGroup.key}-${waypointKey}`,
              kind: "transition",
              label: `${group.label} > ${nextGroup.label}`,
              color: "#334155",
              dayKey: group.key,
              waypoints,
            });
          }
        }
      } else {
        diagnostics.interdayIgnoredGap += 1;
      }
    }
  });

  if (layers.displacement) {
    points.forEach((point) => {
      if (
        !isWithinParana(point.original) ||
        !isWithinParana(point.effective) ||
        haversineDistanceMeters(point.original, point.effective) <= maxStraightDisplacementMeters
      ) {
        return;
      }

      const waypoints = [point.original, point.effective];
      const waypointKey = roadRouteWaypointsKey(waypoints);

      displacementRequests.push({
        id: `displacement-${point.id}-${waypointKey}`,
        kind: "displacement",
        label: point.code,
        color: "#00425f",
        waypoints,
      });
    });
  }

  return {
    requests: [...dailyRequests, ...transitionRequests, ...displacementRequests],
    diagnostics,
  };
}

function areAdjacentDateMs(a: number | null, b: number | null): boolean {
  return a !== null && b !== null && b - a === 86_400_000;
}

function dayLabelNumber(label: string) {
  const match = label.match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

// Converte a data do ponto (ISO "AAAA-MM-DD" ou BR "DD/MM/AAAA") em milissegundos
// UTC no início do dia, para comparar adjacência de datas com segurança.
function parseRouteDateMs(value?: string): number | null {
  const text = String(value ?? "").trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (iso) {
    return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }

  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/);

  if (br) {
    return Date.UTC(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
  }

  return null;
}

function routeCoordinate(point?: CampaignHydroMapPoint) {
  const coordinate = point?.effective ?? point?.original ?? null;
  return isWithinParana(coordinate) ? coordinate : null;
}

function firstRouteCoordinate(points: CampaignHydroMapPoint[]) {
  for (const point of points) {
    const coordinate = routeCoordinate(point);

    if (coordinate) {
      return coordinate;
    }
  }

  return null;
}

function lastRouteCoordinate(points: CampaignHydroMapPoint[]) {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const coordinate = routeCoordinate(points[index]);

    if (coordinate) {
      return coordinate;
    }
  }

  return null;
}

function isWithinParana(coordinate: Coordinate | null | undefined): coordinate is Coordinate {
  const padding = paranaRouteBoundsPaddingDegrees;

  return (
    !!coordinate &&
    Number.isFinite(coordinate.lat) &&
    Number.isFinite(coordinate.lon) &&
    coordinate.lat <= paranaBounds.north + padding &&
    coordinate.lat >= paranaBounds.south - padding &&
    coordinate.lon >= paranaBounds.west - padding &&
    coordinate.lon <= paranaBounds.east + padding
  );
}

function roadRouteWaypointsKey(waypoints: Coordinate[]) {
  return waypoints
    .map((point) => `${point.lon.toFixed(5)},${point.lat.toFixed(5)}`)
    .join("-");
}

async function fetchRoadRoute(waypoints: Coordinate[]) {
  if (waypoints.length < 2) {
    return null;
  }

  const cacheKey = `yvae:road-route:${waypoints
    .map((point) => `${point.lon.toFixed(5)},${point.lat.toFixed(5)}`)
    .join(":")}`;

  try {
    const cached = window.sessionStorage.getItem(cacheKey);

    if (cached) {
      return JSON.parse(cached) as Coordinate[];
    }
  } catch {
    // Session storage can be unavailable in private browsing or strict browser modes.
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 180000);

  try {
    const response = await fetch("/api/roads/route", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ waypoints }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { coordinates?: Coordinate[] };
    const coordinates = data.coordinates;

    if (!coordinates || coordinates.length < 2) {
      return null;
    }

    try {
      window.sessionStorage.setItem(cacheKey, JSON.stringify(coordinates));
    } catch {
      // Route cache is only an optimization.
    }

    return coordinates;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
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

function drawMarkerAt(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  type: "original" | "effective",
  selected = false,
  riskLevel?: CampaignHydroMapPoint["riskLevel"],
  isPointAction = false,
  effectivePointColor?: string,
  campaignRoute = false,
  dayColor?: string,
  isHighlightedDay = false,
  isPreparation = false,
) {
  if (selected) {
    context.beginPath();
    context.arc(x, y, isPointAction ? 10 : 9, 0, Math.PI * 2);
    context.fillStyle = "rgba(255, 255, 255, 0.72)";
    context.fill();
  }

  if (isPointAction && type === "effective") {
    context.beginPath();
    context.arc(x, y, 7.2, 0, Math.PI * 2);
    context.fillStyle = "#FC883A";
    context.strokeStyle = "#ffffff";
    context.lineWidth = selected ? 2.6 : 1.8;
    context.fill();
    context.stroke();

    context.beginPath();
    context.arc(x, y, 3.8, 0, Math.PI * 2);
    context.fillStyle = "#050505";
    context.fill();
    return;
  }

  const hasOverride = type === "effective" && Boolean(effectivePointColor);
  // No mapa de percurso o ponto de coleta (efetivo) recebe a cor do seu DIA.
  const hasDayColor =
    campaignRoute && type === "effective" && Boolean(dayColor) && !hasOverride && !riskLevel;
  // Sem cor de dia (ex.: apoio/previsto no percurso, ou dia sem data), o ponto
  // fica preto neutro — nunca representa resultado, só distingue o marcador.
  const routeBlack = (campaignRoute && !hasOverride && !riskLevel && !hasDayColor) || isPreparation;
  context.beginPath();

  const markerRadius = hasDayColor && !isPreparation
    ? (isHighlightedDay ? 7.5 : 5.6)
    : routeBlack
      ? (isHighlightedDay ? 7 : 5.2)
      : type === "original"
        ? (isHighlightedDay ? 6.5 : 5)
        : hasOverride || riskLevel
          ? (isHighlightedDay ? 9 : 7)
          : (isHighlightedDay ? 7 : 5.2);

  context.arc(
    x,
    y,
    markerRadius,
    0,
    Math.PI * 2,
  );
  context.fillStyle = hasDayColor && !isPreparation
    ? (dayColor as string)
    : routeBlack
      ? "#050505"
      : type === "original"
        ? "#eaff00"
        : hasOverride
          ? (effectivePointColor as string)
          : riskLevel
            ? riskColor(riskLevel)
            : "#050505";
  // Contorno claro para o ponto continuar visível sobre a linha e o mapa (regra:
  // preto ou branco). Mantemos branco, como no padrão dos pontos efetivos.
  context.strokeStyle =
    (hasDayColor && !isPreparation) || routeBlack ? "#ffffff" : type === "original" ? "#111827" : "#ffffff";
  context.lineWidth = selected ? 2.6 : (hasDayColor && !isPreparation) ? (isHighlightedDay ? 2.8 : 2) : 1.8;
  context.fill();
  context.stroke();
}

function riskColor(riskLevel: NonNullable<CampaignHydroMapPoint["riskLevel"]>) {
  return laboratoryRiskColor(riskLevel);
}

function haversineDistanceMeters(from: Coordinate, to: Coordinate) {
  const earthRadiusMeters = 6_371_000;
  const fromLat = degreesToRadians(from.lat);
  const toLat = degreesToRadians(to.lat);
  const deltaLat = degreesToRadians(to.lat - from.lat);
  const deltaLon = degreesToRadians(to.lon - from.lon);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(deltaLon / 2) ** 2;

  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function degreesToRadians(value: number) {
  return (value * Math.PI) / 180;
}

function findNearestPoint(
  points: CampaignHydroMapPoint[],
  clickX: number,
  clickY: number,
  center: Coordinate,
  zoom: number,
  size: { width: number; height: number },
  layers: CampaignMapLayerVisibility,
) {
  return findNearestMarker(points, clickX, clickY, center, zoom, size, layers)?.point ?? null;
}

function findNearestMarker(
  points: CampaignHydroMapPoint[],
  clickX: number,
  clickY: number,
  center: Coordinate,
  zoom: number,
  size: { width: number; height: number },
  layers: CampaignMapLayerVisibility,
) {
  let nearest: {
    point: CampaignHydroMapPoint;
    coordinate: Coordinate;
    distance: number;
  } | null = null;

  for (const point of points) {
    const visibleCoordinates = [
      layers.planned ? point.original : null,
      layers.effective ? point.effective : null,
    ];

    for (const coordinate of visibleCoordinates) {
      if (!coordinate) {
        continue;
      }

      const screen = lonLatToScreen(coordinate.lon, coordinate.lat, center, zoom, size);
      const distance = Math.hypot(screen.x - clickX, screen.y - clickY);

      if (distance <= markerHitRadius && (!nearest || distance < nearest.distance)) {
        nearest = { point, coordinate, distance };
      }
    }
  }

  return nearest;
}

function basinCentroid(polygons: number[][][][]) {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const [lon, lat] of ring) {
        minLon = Math.min(minLon, lon);
        maxLon = Math.max(maxLon, lon);
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
      }
    }
  }

  if (!Number.isFinite(minLon) || !Number.isFinite(minLat)) {
    return null;
  }

  return {
    lon: (minLon + maxLon) / 2,
    lat: (minLat + maxLat) / 2,
  };
}

function lonLatToScreen(
  lon: number,
  lat: number,
  center: Coordinate,
  zoom: number,
  size: { width: number; height: number },
) {
  const centerWorld = lonLatToWorld(center.lon, center.lat, zoom);
  const world = lonLatToWorld(lon, lat, zoom);

  return {
    x: world.x - centerWorld.x + size.width / 2,
    y: world.y - centerWorld.y + size.height / 2,
  };
}

function lonLatToWorld(lon: number, lat: number, zoom: number) {
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const scale = tileSize * 2 ** zoom;

  return {
    x: ((lon + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale,
  };
}

function worldToLonLat(x: number, y: number, zoom: number): Coordinate {
  const scale = tileSize * 2 ** zoom;
  const lon = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));

  return { lat, lon };
}

