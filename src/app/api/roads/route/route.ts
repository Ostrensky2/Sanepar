import { NextResponse } from "next/server";

type Coordinate = {
  lat: number;
  lon: number;
};

const osrmEndpoints = [
  "https://router.project-osrm.org/route/v1/driving",
  "https://routing.openstreetmap.de/routed-car/route/v1/driving",
];
const valhallaEndpoints = ["https://valhalla1.openstreetmap.de/route"];

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

  const fullRoute = await fetchOsrmRoute(waypoints);

  if (fullRoute) {
    return NextResponse.json({ coordinates: fullRoute });
  }

  const segmentedRoute =
    waypoints.length > 2 ? await fetchSegmentedRoute(waypoints) : null;

  if (segmentedRoute) {
    return NextResponse.json({ coordinates: segmentedRoute });
  }

  return NextResponse.json(
    { error: "Não foi possível obter rota rodoviária para os pontos." },
    { status: 502 },
  );
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

  return coordinates.length > 1 ? coordinates : null;
}

async function fetchOsrmRoute(waypoints: Coordinate[]) {
  const encodedWaypoints = waypoints
    .map((point) => `${point.lon},${point.lat}`)
    .join(";");
  const routeRequests = [
    ...osrmEndpoints.map((endpoint) => {
      const url = new URL(`${endpoint}/${encodedWaypoints}`);
      url.searchParams.set("overview", "full");
      url.searchParams.set("geometries", "geojson");

      return fetchOsrmRouteFromUrl(url);
    }),
    ...valhallaEndpoints.map((endpoint) => fetchValhallaRouteFromUrl(endpoint, waypoints)),
  ];

  const routes = await Promise.all(routeRequests);

  return routes.find((coordinates) => coordinates !== null) ?? null;
}

async function fetchOsrmRouteFromUrl(url: URL) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "YvaeMonitoramento/1.0",
      },
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

    return coordinates
      .map(([lon, lat]) => ({ lat, lon }))
      .filter(isValidCoordinate);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchValhallaRouteFromUrl(endpoint: string, waypoints: Coordinate[]) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(endpoint, {
      body: JSON.stringify({
        locations: waypoints,
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

    return coordinates
      .map(([lon, lat]) => ({ lat, lon }))
      .filter(isValidCoordinate);
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
