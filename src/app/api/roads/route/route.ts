import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import https from "node:https";
import { promisify } from "node:util";

type Coordinate = {
  lat: number;
  lon: number;
};

type OsrmResponse = {
  routes?: Array<{
    geometry?: {
      coordinates?: number[][];
    };
  }>;
};

const osrmEndpoints = [
  "https://router.project-osrm.org/route/v1/driving",
  "https://routing.openstreetmap.de/routed-car/route/v1/driving",
];
const valhallaEndpoints = ["https://valhalla1.openstreetmap.de/route"];
const ROAD_SNAP_RADIUS_METERS = 5000;
const execFileAsync = promisify(execFile);
const routeCache = new Map<string, Coordinate[]>();

export async function POST(request: Request) {
  let body: { waypoints?: Coordinate[] };

  try {
    body = (await request.json()) as { waypoints?: Coordinate[] };
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const waypoints = (body.waypoints ?? []).filter(isValidCoordinate);

  if (waypoints.length < 2) {
    return NextResponse.json(
      { error: "Ao menos dois pontos devem ser enviados para que a rota seja calculada." },
      { status: 400 },
    );
  }

  const cacheKey = routeCacheKey(waypoints);
  const cachedRoute = routeCache.get(cacheKey);

  if (cachedRoute) {
    return NextResponse.json({ coordinates: cachedRoute });
  }

  const fullRoute = await fetchOsrmRoute(waypoints);

  if (fullRoute) {
    routeCache.set(cacheKey, fullRoute);
    return NextResponse.json({ coordinates: fullRoute });
  }

  const segmentedRoute = await fetchSegmentedRoute(waypoints);

  if (segmentedRoute) {
    routeCache.set(cacheKey, segmentedRoute);
    return NextResponse.json({ coordinates: segmentedRoute });
  }

  return NextResponse.json(
    { error: "Não foi possível obter rota rodoviária para os pontos." },
    { status: 502 },
  );
}

function routeCacheKey(waypoints: Coordinate[]) {
  return waypoints
    .map((point) => `${point.lon.toFixed(6)},${point.lat.toFixed(6)}`)
    .join(";");
}

async function fetchSegmentedRoute(waypoints: Coordinate[]) {
  const coordinates: Coordinate[] = [];

  for (let index = 1; index < waypoints.length; index += 1) {
    const segment = await fetchOsrmRoute([waypoints[index - 1], waypoints[index]]);

    if (!segment) {
      return null;
    }

    coordinates.push(...(index === 1 ? segment : segment.slice(1)));
  }

  return coordinates.length >= 2 ? coordinates : null;
}

async function fetchOsrmRoute(waypoints: Coordinate[]) {
  const encodedWaypoints = waypoints
    .map((point) => `${point.lon},${point.lat}`)
    .join(";");
  const routeRequests: Array<Promise<Coordinate[] | null>> = [
    ...osrmEndpoints.map((endpoint) => {
      const url = new URL(`${endpoint}/${encodedWaypoints}`);
      url.searchParams.set("overview", "full");
      url.searchParams.set("geometries", "geojson");
      url.searchParams.set(
        "radiuses",
        waypoints.map(() => String(ROAD_SNAP_RADIUS_METERS)).join(";"),
      );

      return fetchOsrmRouteFromUrl(url);
    }),
    ...valhallaEndpoints.map((endpoint) => fetchValhallaRouteFromUrl(endpoint, waypoints)),
  ];

  return raceFirstSuccess(routeRequests);
}

function raceFirstSuccess<T>(promises: Array<Promise<T | null>>): Promise<T | null> {
  if (promises.length === 0) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    let remaining = promises.length;
    let settled = false;

    for (const promise of promises) {
      promise
        .then((value) => {
          if (settled) {
            return;
          }

          if (value !== null) {
            settled = true;
            resolve(value);
            return;
          }

          remaining -= 1;
          if (remaining === 0) {
            settled = true;
            resolve(null);
          }
        })
        .catch(() => {
          if (settled) {
            return;
          }

          remaining -= 1;
          if (remaining === 0) {
            settled = true;
            resolve(null);
          }
        });
    }
  });
}

async function fetchOsrmRouteFromUrl(url: URL) {
  try {
    const data = await requestJson(url);
    const coordinates = data.routes?.[0]?.geometry?.coordinates;

    if (!coordinates || coordinates.length < 2) {
      return null;
    }

    const route = coordinates
      .map(([lon, lat]) => ({ lat, lon }))
      .filter(isValidCoordinate);

    return route.length >= 2 ? route : null;
  } catch {
    return null;
  }
}

function requestJson(url: URL): Promise<OsrmResponse> {
  return requestJsonWithNode(url).catch(() => requestJsonWithPowerShell(url));
}

function requestJsonWithNode(url: URL) {
  return new Promise<OsrmResponse>((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          "User-Agent": "YvaeMonitoramento/1.0",
        },
        rejectUnauthorized: false,
        timeout: 25000,
      },
      (response) => {
        let body = "";

        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`OSRM respondeu ${response.statusCode ?? "sem status"}.`));
            return;
          }

          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      },
    );

    request.on("timeout", () => {
      request.destroy(new Error("Tempo esgotado ao consultar rota rodoviária."));
    });
    request.on("error", reject);
  });
}

async function requestJsonWithPowerShell(url: URL): Promise<OsrmResponse> {
  if (process.platform !== "win32") {
    throw new Error("Fallback PowerShell indisponível fora do Windows.");
  }

  const { stdout } = await execFileAsync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "$ProgressPreference='SilentlyContinue'; (Invoke-WebRequest -UseBasicParsing -Uri $env:YVAE_OSRM_URL -Headers @{ 'User-Agent'='YvaeMonitoramento/1.0' } -TimeoutSec 25).Content",
    ],
    {
      env: {
        ...process.env,
        YVAE_OSRM_URL: url.toString(),
      },
      maxBuffer: 12 * 1024 * 1024,
      timeout: 30000,
      windowsHide: true,
    },
  );

  return JSON.parse(stdout);
}

async function fetchValhallaRouteFromUrl(endpoint: string, waypoints: Coordinate[]) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(endpoint, {
      body: JSON.stringify({
        locations: waypoints.map((point) => ({
          ...point,
          radius: ROAD_SNAP_RADIUS_METERS,
        })),
        costing: "auto",
        directions_type: "none",
        format: "osrm",
        shape_format: "geojson",
        units: "kilometers",
      }),
      headers: {
        "Content-Type": "application/json",
        "X-Client-Id": "sanepar-yvae-monitoramento",
      },
      method: "POST",
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      routes?: Array<{
        geometry?: {
          coordinates?: number[][];
        };
      }>;
    };
    const coordinates = data.routes?.[0]?.geometry?.coordinates;

    if (!coordinates || coordinates.length < 2) {
      return null;
    }

    const route = coordinates
      .map(([lon, lat]) => ({ lat, lon }))
      .filter(isValidCoordinate);

    return route.length >= 2 ? route : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function isValidCoordinate(value: Coordinate | null | undefined): value is Coordinate {
  return (
    typeof value?.lat === "number" &&
    typeof value.lon === "number" &&
    Number.isFinite(value.lat) &&
    Number.isFinite(value.lon)
  );
}
