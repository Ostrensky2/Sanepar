"use client";

import { Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LaboratoryRiskLevel } from "@/lib/laboratory-risk";

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
const paranaBounds = {
  north: -22.29,
  south: -26.72,
  west: -54.62,
  east: -48.02,
};
const basinColors = [
  "rgba(0, 142, 156, 0.30)",
  "rgba(0, 87, 159, 0.24)",
  "rgba(0, 186, 0, 0.20)",
  "rgba(197, 122, 0, 0.22)",
  "rgba(0, 135, 193, 0.24)",
  "rgba(64, 116, 92, 0.22)",
];
const dailyRouteColors = [
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
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; y: number; center: Coordinate } | null>(null);
  const fittedPointsKeyRef = useRef<string | null>(null);
  const fitFrameRef = useRef<number | null>(null);
  const wheelDeltaRef = useRef(0);
  const routeRequestStatusRef = useRef<Set<string>>(new Set());
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [center, setCenter] = useState<Coordinate>({ lat: -24.75, lon: -51.45 });
  const [zoom, setZoom] = useState(8);
  const [basins, setBasins] = useState<BasinCollection | null>(null);
  const [resolvedRoadRoutes, setResolvedRoadRoutes] = useState<Record<string, Coordinate[]>>({});
  const [hoveredPoint, setHoveredPoint] = useState<CampaignHydroMapPoint | null>(null);
  const [windowResizeCount, setWindowResizeCount] = useState(0);
  const defaultView = useMemo(
    () => getDefaultMapView(points, layers, size),
    [layers, points, size],
  );
  const minimumView = useMemo(() => getMinimumMapView(size), [size]);
  const minimumZoom = minimumView.zoom;
  const mapZoom = Math.max(minimumZoom, Math.min(maxZoom, zoom));
  const constrainedCenter = isMinimumZoom(mapZoom, minimumZoom) ? minimumView.center : center;

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
  const routeRequests = useMemo(
    () => (shouldResolveRoadRoutes ? buildRoadRouteRequests(points, layers) : []),
    [layers, points, shouldResolveRoadRoutes],
  );
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

  useEffect(() => {
    let cancelled = false;
    const maxAttempts = 4;
    const queue: Array<{ request: (typeof routeRequests)[number]; attempt: number }> =
      routeRequests
        .filter((request) => !routeRequestStatusRef.current.has(request.id))
        .map((request) => ({ request, attempt: 0 }));

    async function resolveNextRoute() {
      while (true) {
        const next = queue.shift();

        if (!next) {
          return;
        }

        const { request, attempt } = next;
        routeRequestStatusRef.current.add(request.id);

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
        } else if (attempt + 1 < maxAttempts) {
          routeRequestStatusRef.current.delete(request.id);
          const backoffMs = 600 * (attempt + 1);
          await new Promise((resolve) => window.setTimeout(resolve, backoffMs));

          if (cancelled) {
            return;
          }

          queue.push({ request, attempt: attempt + 1 });
        } else {
          routeRequestStatusRef.current.delete(request.id);
        }
      }
    }

    const workerCount = Math.min(3, queue.length);
    void Promise.all(
      Array.from({ length: workerCount }, () => resolveNextRoute()),
    );

    return () => {
      cancelled = true;
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
    );
  }, [basins, constrainedCenter, effectivePointColor, layers, mapZoom, markerMode, points, roadRoutes, selectedPointId, size]);

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
    if (fitFrameRef.current !== null) {
      window.cancelAnimationFrame(fitFrameRef.current);
      fitFrameRef.current = null;
    }
    const frame = window.requestAnimationFrame(() => {
      fitFrameRef.current = null;
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
    if (fitFrameRef.current === null) {
      return;
    }

    window.cancelAnimationFrame(fitFrameRef.current);
    fitFrameRef.current = null;
  }

  const zoomBy = useCallback((delta: number) => {
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
    }

    if (nextZoom === mapZoom) {
      return;
    }

    setZoom(nextZoom);
  }, [mapZoom, minimumView.center, minimumZoom, size.height, size.width]);

  useEffect(() => {
    const wrapper = wrapperRef.current;

    if (!wrapper) {
      return;
    }

    function handleWheel(event: WheelEvent) {
      event.preventDefault();
      event.stopPropagation();
      wheelDeltaRef.current += event.deltaY;

      if (Math.abs(wheelDeltaRef.current) < wheelZoomThreshold) {
        return;
      }

      zoomBy(wheelDeltaRef.current > 0 ? -1 : 1);
      wheelDeltaRef.current = 0;
    }

    wrapper.addEventListener("wheel", handleWheel, { passive: false });

    return () => wrapper.removeEventListener("wheel", handleWheel);
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
          setCenter(minimumView.center);
          setHoveredPoint(null);
          return;
        }

        const start = lonLatToWorld(dragRef.current.center.lon, dragRef.current.center.lat, mapZoom);
        const next = worldToLonLat(start.x - dx, start.y - dy, mapZoom);
        setCenter(clampCenterToParana(next));
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
            cancelPendingFitFrame();
            setCenter(selected.coordinate);
            setZoom(maxZoom);
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

      <div className="absolute bottom-4 left-4 rounded border border-white/70 bg-white/90 px-3 py-2 text-[10px] font-semibold text-slate-600 shadow backdrop-blur">
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
      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-400">
        Ponto SIA
      </p>
      <p className="mt-0.5 font-black text-[var(--brand-navy-strong)]">
        {point.municipality}
      </p>
      <p className="mt-0.5 font-semibold text-slate-600">{point.code}</p>
      <p className="mt-1 max-w-56 text-[11px] font-medium leading-4 text-slate-500">
        {point.waterBody || "Manancial não informado"}
      </p>
    </div>
  );
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

  const coordinates = [
    ...getParanaFrame(),
    ...getVisibleMarkerCoordinates(points, layers),
  ];

  if (!coordinates.length) {
    return minimumView;
  }

  return fitCoordinatesToView(
    coordinates,
    size,
    minimumView.zoom,
    defaultFitPadding,
  );
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
    { lat: paranaBounds.north, lon: paranaBounds.west },
    { lat: paranaBounds.north, lon: paranaBounds.east },
    { lat: paranaBounds.south, lon: paranaBounds.west },
    { lat: paranaBounds.south, lon: paranaBounds.east },
  ];
}

function paranaCenter() {
  return {
    lat: (paranaBounds.north + paranaBounds.south) / 2,
    lon: (paranaBounds.west + paranaBounds.east) / 2,
  };
}

function clampCenterToParana(coordinate: Coordinate) {
  return {
    lat: Math.min(Math.max(coordinate.lat, paranaBounds.south), paranaBounds.north),
    lon: Math.min(Math.max(coordinate.lon, paranaBounds.west), paranaBounds.east),
  };
}

function isMinimumZoom(zoom: number, minimumZoom: number) {
  return zoom <= minimumZoom + zoomEpsilon;
}

function buildTiles(center: Coordinate, zoom: number, width: number, height: number): Tile[] {
  if (!width || !height) {
    return [];
  }

  const tileZoom = Math.max(0, Math.min(19, Math.floor(zoom)));
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

  if (basins && layers.basins) {
    drawBasins(context, basins, center, zoom, size);
  }

  drawRoadRoutes(context, roadRoutes, center, zoom, size, layers);

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
  );
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
) {
  context.lineCap = "round";

  if (layers.displacement && layers.planned && layers.effective) {
    for (const point of points) {
      if (point.original && point.effective) {
        const original = lonLatToScreen(point.original.lon, point.original.lat, center, zoom, size);
        const effective = lonLatToScreen(point.effective.lon, point.effective.lat, center, zoom, size);

        if (haversineDistanceMeters(point.original, point.effective) <= maxStraightDisplacementMeters) {
          context.beginPath();
          context.moveTo(original.x, original.y);
          context.lineTo(effective.x, effective.y);
          context.strokeStyle = "rgba(0, 66, 98, 0.32)";
          context.lineWidth = 1;
          context.stroke();
        }
      }
    }
  }

  for (const point of points) {
    if (point.original && layers.planned) {
      const original = lonLatToScreen(point.original.lon, point.original.lat, center, zoom, size);
      drawMarkerAt(context, original.x, original.y, "original", point.id === selectedPointId);
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
      );
    }
  }
}

function drawRoadRoutes(
  context: CanvasRenderingContext2D,
  routes: RoadRouteSegment[],
  center: Coordinate,
  zoom: number,
  size: { width: number; height: number },
  layers: CampaignMapLayerVisibility,
) {
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";

  routes.forEach((route) => {
    const visible =
      route.kind === "daily"
        ? layers.dailyRoutes
        : route.kind === "transition"
          ? layers.dayTransitions
          : layers.displacement;

    if (!visible || !route.coordinates || route.coordinates.length < 2) {
      return;
    }

    const screens = route.coordinates.map((coordinate) =>
      lonLatToScreen(coordinate.lon, coordinate.lat, center, zoom, size),
    );
    const color =
      route.kind === "transition"
        ? "rgba(71, 85, 105, 0.76)"
        : route.kind === "displacement"
          ? "rgba(0, 66, 98, 0.48)"
        : route.color;

    context.setLineDash(route.kind === "transition" ? [5, 7] : []);
    context.beginPath();
    screens.forEach((screen, pointIndex) => {
      if (pointIndex === 0) {
        context.moveTo(screen.x, screen.y);
      } else {
        context.lineTo(screen.x, screen.y);
      }
    });
    context.strokeStyle = "rgba(255, 255, 255, 0.86)";
    context.lineWidth =
      route.kind === "daily" ? 7 : route.kind === "transition" ? 3 : 2.8;
    context.stroke();

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
      route.kind === "daily" ? 4.2 : route.kind === "transition" ? 1.6 : 1.4;
    context.stroke();

    if (zoom >= 9 && route.kind === "daily") {
      const labelAnchor = screens[Math.floor(screens.length / 2)];
      context.setLineDash([]);
      context.font = "800 9px Inter, Arial, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.lineWidth = 3;
      context.strokeStyle = "rgba(255, 255, 255, 0.95)";
      context.strokeText(route.label, labelAnchor.x, labelAnchor.y - 10);
      context.fillStyle = color;
      context.fillText(route.label, labelAnchor.x, labelAnchor.y - 10);
    }
  });

  context.restore();
}

function buildRoadRouteRequests(
  points: CampaignHydroMapPoint[],
  layers: CampaignMapLayerVisibility,
) {
  const groups = new Map<string, { key: string; label: string; points: CampaignHydroMapPoint[] }>();
  const inferredDayLabels = new Map<string, string>();

  for (const point of points) {
    const coordinate = point.effective ?? point.original;

    if (!coordinate) {
      continue;
    }

    const label = formatRouteDayLabel(point, inferredDayLabels);
    const key = `${point.campaign || "campanha"}-${label}`;
    const group = groups.get(key);

    if (group) {
      group.points.push(point);
    } else {
      groups.set(key, {
        key,
        label,
        points: [point],
      });
    }
  }

  const orderedGroups = [...groups.values()].sort(
    (a, b) => dayLabelNumber(a.label) - dayLabelNumber(b.label),
  );
  const dailyRequests: Array<Omit<RoadRouteSegment, "coordinates">> = [];
  const transitionRequests: Array<Omit<RoadRouteSegment, "coordinates">> = [];
  const displacementRequests: Array<Omit<RoadRouteSegment, "coordinates">> = [];

  orderedGroups.forEach((group, groupIndex) => {
    const color = dailyRouteColors[groupIndex % dailyRouteColors.length];
    const waypoints = group.points
      .map((point) => routeCoordinate(point))
      .filter((coordinate): coordinate is Coordinate => coordinate !== null);

    if (layers.dailyRoutes && waypoints.length > 1) {
      const waypointKey = roadRouteWaypointsKey(waypoints);

      dailyRequests.push({
        id: `daily-${group.key}-${waypointKey}`,
        kind: "daily",
        label: group.label,
        color,
        waypoints,
      });
    }

    const nextGroup = orderedGroups[groupIndex + 1];

    if (layers.dayTransitions && nextGroup) {
      const from = routeCoordinate(group.points[group.points.length - 1]);
      const to = routeCoordinate(nextGroup.points[0]);

      if (from && to) {
        const waypoints = [from, to];
        const waypointKey = roadRouteWaypointsKey(waypoints);

        transitionRequests.push({
          id: `transition-${group.key}-${nextGroup.key}-${waypointKey}`,
          kind: "transition",
          label: `${group.label} > ${nextGroup.label}`,
          color: "#334155",
          waypoints,
        });
      }
    }
  });

  if (layers.displacement) {
    points.forEach((point) => {
      if (
        !point.original ||
        !point.effective ||
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

  return [...dailyRequests, ...transitionRequests, ...displacementRequests];
}

function dayLabelNumber(label: string) {
  const match = label.match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

function routeCoordinate(point?: CampaignHydroMapPoint) {
  return point?.effective ?? point?.original ?? null;
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
    context.fillStyle = "#f97316";
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
  context.beginPath();
  context.arc(
    x,
    y,
    type === "original" ? 5 : hasOverride || riskLevel ? 7 : 5.2,
    0,
    Math.PI * 2,
  );
  context.fillStyle =
    type === "original"
      ? "#eaff00"
      : hasOverride
        ? (effectivePointColor as string)
        : riskLevel
          ? riskColor(riskLevel)
          : "#050505";
  context.strokeStyle = type === "original" ? "#111827" : "#ffffff";
  context.lineWidth = selected ? 2.6 : 1.8;
  context.fill();
  context.stroke();
}

function riskColor(riskLevel: CampaignHydroMapPoint["riskLevel"]) {
  if (riskLevel === "alto") {
    return "#7f1d1d";
  }

  if (riskLevel === "moderado") {
    return "#f97316";
  }

  if (riskLevel === "baixoModerado") {
    return "#facc15";
  }

  return "#16a34a";
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
