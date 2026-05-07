"use client";

import { Minus, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

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
  riskLevel?: "baixo" | "medio" | "alto";
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
};

type RoadRouteSegment = {
  id: string;
  kind: "daily" | "transition";
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
const minZoom = 7;
const maxZoom = 16;
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

export function CampaignHydroMap({
  points,
  selectedPointId,
  layers,
  onSelectPoint,
  caption = "Mapa rodoviário OpenStreetMap · Paraná · Bacias SUDERHSA/IAT 2007",
  showBaseTiles = true,
  markerMode = "campaign",
  showPointTooltip = false,
}: {
  points: CampaignHydroMapPoint[];
  selectedPointId?: string;
  layers: CampaignMapLayerVisibility;
  onSelectPoint?: (point: CampaignHydroMapPoint) => void;
  caption?: string;
  showBaseTiles?: boolean;
  markerMode?: "campaign" | "risk" | "pointAction";
  showPointTooltip?: boolean;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; y: number; center: Coordinate } | null>(null);
  const fittedPointsKeyRef = useRef<string | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [center, setCenter] = useState<Coordinate>({ lat: -24.75, lon: -51.45 });
  const [zoom, setZoom] = useState(8);
  const [basins, setBasins] = useState<BasinCollection | null>(null);
  const [resolvedRoadRoutes, setResolvedRoadRoutes] = useState<Record<string, Coordinate[]>>({});
  const [hoveredPoint, setHoveredPoint] = useState<CampaignHydroMapPoint | null>(null);

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
    () => buildTiles(center, zoom, size.width, size.height),
    [center, size.height, size.width, zoom],
  );
  const shouldResolveRoadRoutes = layers.dailyRoutes || layers.dayTransitions;
  const routeRequests = useMemo(
    () => (shouldResolveRoadRoutes ? buildRoadRouteRequests(points) : []),
    [points, shouldResolveRoadRoutes],
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

    routeRequests.forEach((request, index) => {
      fetchRoadRoute(request.waypoints).then((coordinates) => {
        if (cancelled || coordinates === null) {
          return;
        }

        setResolvedRoadRoutes((current) => ({
          ...current,
          [request.id || String(index)]: coordinates,
        }));
      });
    });

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
      center,
      zoom,
      size,
      layers,
      selectedPointId,
      markerMode,
    );
  }, [basins, center, layers, markerMode, points, roadRoutes, selectedPointId, size, zoom]);

  useEffect(() => {
    if (!size.width || !size.height) {
      return;
    }

    const coordinates = points
      .map((point) => mapCoordinate(point, layers))
      .filter((coordinate): coordinate is Coordinate => coordinate !== null);
    const fitKey = coordinates
      .map((coordinate) => `${coordinate.lat.toFixed(5)},${coordinate.lon.toFixed(5)}`)
      .join("|");

    if (!coordinates.length || fittedPointsKeyRef.current === fitKey) {
      return;
    }

    fittedPointsKeyRef.current = fitKey;
    const nextView = fitCoordinatesToView(coordinates, size);
    const frame = window.requestAnimationFrame(() => {
      setCenter(nextView.center);
      setZoom(nextView.zoom);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [layers, points, size]);

  function zoomBy(delta: number) {
    setZoom((current) => Math.max(minZoom, Math.min(maxZoom, current + delta)));
  }

  return (
    <div
      ref={wrapperRef}
      className="absolute inset-0 overflow-hidden bg-[#dbe9ed]"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = { x: event.clientX, y: event.clientY, center };
      }}
      onPointerMove={(event) => {
        if (!dragRef.current) {
          if (showPointTooltip && size.width && size.height) {
            const bounds = event.currentTarget.getBoundingClientRect();
            const hovered = findNearestPoint(
              points,
              event.clientX - bounds.left,
              event.clientY - bounds.top,
              center,
              zoom,
              size,
              layers,
            );

            setHoveredPoint(hovered);
          }
          return;
        }

        const dx = event.clientX - dragRef.current.x;
        const dy = event.clientY - dragRef.current.y;
        const start = lonLatToWorld(dragRef.current.center.lon, dragRef.current.center.lat, zoom);
        const next = worldToLonLat(start.x - dx, start.y - dy, zoom);
        setCenter(next);
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
      onWheel={(event) => {
        event.preventDefault();
        zoomBy(event.deltaY > 0 ? -1 : 1);
      }}
      onClick={(event) => {
        if (!onSelectPoint || !size.width || !size.height) {
          return;
        }

        const bounds = event.currentTarget.getBoundingClientRect();
        const selected = findNearestPoint(
          points,
          event.clientX - bounds.left,
          event.clientY - bounds.top,
          center,
          zoom,
          size,
          layers,
        );

        if (selected) {
          onSelectPoint(selected);
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
          center={center}
          zoom={zoom}
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

function fitCoordinatesToView(
  coordinates: Coordinate[],
  size: { width: number; height: number },
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
  const center = {
    lat: (minLat + maxLat) / 2,
    lon: (minLon + maxLon) / 2,
  };
  const padding = 80;
  const availableWidth = Math.max(size.width - padding * 2, 160);
  const availableHeight = Math.max(size.height - padding * 2, 140);

  for (let nextZoom = maxZoom; nextZoom >= minZoom; nextZoom -= 1) {
    const northWest = lonLatToWorld(minLon, maxLat, nextZoom);
    const southEast = lonLatToWorld(maxLon, minLat, nextZoom);
    const boundsWidth = Math.abs(southEast.x - northWest.x);
    const boundsHeight = Math.abs(southEast.y - northWest.y);

    if (boundsWidth <= availableWidth && boundsHeight <= availableHeight) {
      return {
        center,
        zoom: nextZoom,
      };
    }
  }

  return {
    center,
    zoom: minZoom,
  };
}

function buildTiles(center: Coordinate, zoom: number, width: number, height: number): Tile[] {
  if (!width || !height) {
    return [];
  }

  const centerWorld = lonLatToWorld(center.lon, center.lat, zoom);
  const minX = Math.floor((centerWorld.x - width / 2) / tileSize);
  const maxX = Math.floor((centerWorld.x + width / 2) / tileSize);
  const minY = Math.floor((centerWorld.y - height / 2) / tileSize);
  const maxY = Math.floor((centerWorld.y + height / 2) / tileSize);
  const tileCount = 2 ** zoom;
  const tiles: Tile[] = [];

  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      if (y < 0 || y >= tileCount) {
        continue;
      }

      const wrappedX = ((x % tileCount) + tileCount) % tileCount;

      tiles.push({
        key: `${zoom}-${x}-${y}`,
        url: `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${y}.png`,
        x: x * tileSize - centerWorld.x + width / 2,
        y: y * tileSize - centerWorld.y + height / 2,
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

  drawPoints(context, points, center, zoom, size, layers, selectedPointId, markerMode);
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
) {
  context.lineCap = "round";

  if (layers.displacement && layers.planned && layers.effective) {
    for (const point of points) {
      if (point.original && point.effective) {
        const original = lonLatToScreen(point.original.lon, point.original.lat, center, zoom, size);
        const effective = lonLatToScreen(point.effective.lon, point.effective.lat, center, zoom, size);

        context.beginPath();
        context.moveTo(original.x, original.y);
        context.lineTo(effective.x, effective.y);
        context.strokeStyle = "rgba(0, 66, 98, 0.32)";
        context.lineWidth = 1;
        context.stroke();
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
      route.kind === "daily" ? layers.dailyRoutes : layers.dayTransitions;

    if (!visible || !route.coordinates || route.coordinates.length < 2) {
      return;
    }

    const screens = route.coordinates.map((coordinate) =>
      lonLatToScreen(coordinate.lon, coordinate.lat, center, zoom, size),
    );
    const color =
      route.kind === "transition"
        ? "rgba(71, 85, 105, 0.76)"
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
    context.lineWidth = route.kind === "transition" ? 3 : 7;
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
    context.lineWidth = route.kind === "transition" ? 1.6 : 4.2;
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

function buildRoadRouteRequests(points: CampaignHydroMapPoint[]) {
  const groups = new Map<string, { label: string; points: CampaignHydroMapPoint[] }>();
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
        label,
        points: [point],
      });
    }
  }

  const orderedGroups = [...groups.values()];
  const requests: Array<Omit<RoadRouteSegment, "coordinates" | "isFallback">> = [];

  orderedGroups.forEach((group, groupIndex) => {
    const color = dailyRouteColors[groupIndex % dailyRouteColors.length];
    const waypoints = group.points
      .map((point) => routeCoordinate(point))
      .filter((coordinate): coordinate is Coordinate => coordinate !== null);

    if (waypoints.length > 1) {
      requests.push({
        id: `daily-${group.label}`,
        kind: "daily",
        label: group.label,
        color,
        waypoints,
      });
    }

    const nextGroup = orderedGroups[groupIndex + 1];

    if (nextGroup) {
      const from = routeCoordinate(group.points[group.points.length - 1]);
      const to = routeCoordinate(nextGroup.points[0]);

      if (from && to) {
        requests.push({
          id: `transition-${group.label}-${nextGroup.label}`,
          kind: "transition",
          label: `${group.label} > ${nextGroup.label}`,
          color: "#334155",
          waypoints: [from, to],
        });
      }
    }
  });

  return requests;
}

function routeCoordinate(point?: CampaignHydroMapPoint) {
  return point?.effective ?? point?.original ?? null;
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
  const timeout = window.setTimeout(() => controller.abort(), 12000);

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

function drawMarkerAt(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  type: "original" | "effective",
  selected = false,
  riskLevel?: CampaignHydroMapPoint["riskLevel"],
  isPointAction = false,
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

  context.beginPath();
  context.arc(x, y, type === "original" ? 5 : riskLevel ? 7 : 5.2, 0, Math.PI * 2);
  context.fillStyle =
    type === "original"
      ? "#eaff00"
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
    return "#dc2626";
  }

  if (riskLevel === "medio") {
    return "#facc15";
  }

  return "#16a34a";
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
  let nearest: { point: CampaignHydroMapPoint; distance: number } | null = null;

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

      if (distance <= 14 && (!nearest || distance < nearest.distance)) {
        nearest = { point, distance };
      }
    }
  }

  return nearest?.point ?? null;
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
