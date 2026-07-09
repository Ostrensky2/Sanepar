import { describe, expect, it } from "vitest";
import {
  buildPointDayColorMap,
  buildRoadRouteRequests,
  dailyRouteColors,
  renderableRouteKinds,
  type CampaignHydroMapPoint,
  type CampaignMapLayerVisibility,
} from "@/components/campaign-hydro-map";

const allLayers: CampaignMapLayerVisibility = {
  roadMap: true,
  basins: true,
  dailyRoutes: true,
  dayTransitions: true,
  planned: true,
  effective: true,
  displacement: true,
};

function point(patch: Partial<CampaignHydroMapPoint> & { lat: number; lon: number }): CampaignHydroMapPoint {
  const { lat, lon, ...rest } = patch;
  return {
    id: `p-${lat}-${lon}-${rest.collectionOrder ?? ""}`,
    code: "SIA-0001",
    point: "Ponto",
    day: "1",
    campaign: "2ª Campanha - Outono 2026",
    date: "2026-06-01",
    collectionOrder: 1,
    municipality: "Curitiba",
    waterBody: "Rio",
    original: null,
    effective: { lat, lon },
    accessibility: "",
    waterAspect: "",
    weatherConditions: "",
    problems: "",
    photoUrl: "",
    ...rest,
  };
}

// Dois dias adjacentes (06-01, 06-02) e um terceiro dia após intervalo (06-05).
function scenarioPoints(): CampaignHydroMapPoint[] {
  return [
    point({ lat: -25.45, lon: -49.12, date: "2026-06-01", day: "1", collectionOrder: 1 }),
    point({ lat: -25.48, lon: -49.19, date: "2026-06-01", day: "1", collectionOrder: 2 }),
    point({ lat: -25.5, lon: -49.02, date: "2026-06-02", day: "2", collectionOrder: 1 }),
    point({ lat: -25.4, lon: -49.25, date: "2026-06-02", day: "2", collectionOrder: 2 }),
    point({ lat: -25.6, lon: -49.3, date: "2026-06-05", day: "3", collectionOrder: 1 }),
  ];
}

function isBlackish(color: string) {
  const normalized = color.replace(/\s+/g, "").toLowerCase();
  return (
    normalized === "black" ||
    normalized === "#000" ||
    normalized === "#000000" ||
    normalized.startsWith("rgb(0,0,0") ||
    normalized.startsWith("rgba(0,0,0")
  );
}

describe("buildRoadRouteRequests", () => {
  it("agrupa por data real e liga só datas adjacentes", () => {
    const { requests, diagnostics } = buildRoadRouteRequests(scenarioPoints(), allLayers);

    expect(diagnostics.routeDates).toBe(3);
    // 2 pares consecutivos no dia 1 e dia 2 => 1 perna cada; dia 3 tem 1 ponto.
    expect(diagnostics.dailyLegsExpected).toBe(2);
    // 06-01 -> 06-02 é adjacente (1 tracejado); 06-02 -> 06-05 tem intervalo.
    expect(diagnostics.interdayExpected).toBe(2);
    expect(diagnostics.interdayDrawn).toBe(1);
    expect(diagnostics.interdayIgnoredGap).toBe(1);

    const transitions = requests.filter((request) => request.kind === "transition");
    expect(transitions).toHaveLength(1);

    const daily = requests.filter((request) => request.kind === "daily");
    expect(daily).toHaveLength(2);
  });

  it("nenhuma polyline do app é preta contínua e todo segmento tem tipo reconhecido", () => {
    const { requests } = buildRoadRouteRequests(scenarioPoints(), allLayers);

    expect(requests.length).toBeGreaterThan(0);
    for (const request of requests) {
      expect(renderableRouteKinds.has(request.kind)).toBe(true);
      expect(isBlackish(request.color)).toBe(false);
    }
    for (const color of dailyRouteColors) {
      expect(isBlackish(color)).toBe(false);
    }
  });

  it("pinta cada ponto com a cor do seu dia — a mesma cor da linha diária", () => {
    const points = scenarioPoints();
    const colors = buildPointDayColorMap(points);

    // Pontos da mesma data têm a mesma cor; datas diferentes têm cores diferentes.
    const dia1 = colors.get(points[0].id);
    const dia2 = colors.get(points[2].id);
    const dia3 = colors.get(points[4].id);

    expect(dia1).toBeTruthy();
    expect(colors.get(points[1].id)).toBe(dia1);
    expect(colors.get(points[3].id)).toBe(dia2);
    expect(new Set([dia1, dia2, dia3]).size).toBe(3);

    // Nenhum ponto é pintado de preto (a cor é sempre da paleta de dias).
    for (const color of colors.values()) {
      expect(isBlackish(color)).toBe(false);
      expect(dailyRouteColors).toContain(color);
    }

    // A cor do ponto é EXATAMENTE a cor da linha diária do mesmo dia.
    const { requests } = buildRoadRouteRequests(points, allLayers);
    const dia1Leg = requests.find(
      (request) => request.kind === "daily" && request.label === "Dia 1",
    );
    expect(dia1Leg?.color).toBe(dia1);
  });

  it("não cria ligação entre dias quando as datas não são adjacentes", () => {
    const gapOnly: CampaignHydroMapPoint[] = [
      point({ lat: -25.45, lon: -49.12, date: "2026-06-01", day: "1", collectionOrder: 1 }),
      point({ lat: -25.6, lon: -49.3, date: "2026-06-10", day: "2", collectionOrder: 1 }),
    ];
    const { requests, diagnostics } = buildRoadRouteRequests(gapOnly, allLayers);

    expect(requests.filter((request) => request.kind === "transition")).toHaveLength(0);
    expect(diagnostics.interdayIgnoredGap).toBe(1);
    expect(diagnostics.interdayDrawn).toBe(0);
  });

  it("resolve coordenadas originais para rotas quando as efetivas são nulas", () => {
    const plannedOnly: CampaignHydroMapPoint[] = [
      point({ lat: 0, lon: 0, original: { lat: -25.45, lon: -49.12 }, effective: null, date: "2026-06-01", day: "1", collectionOrder: 1 }),
      point({ lat: 0, lon: 0, original: { lat: -25.48, lon: -49.19 }, effective: null, date: "2026-06-01", day: "1", collectionOrder: 2 }),
    ];
    const { requests, diagnostics } = buildRoadRouteRequests(plannedOnly, allLayers);

    expect(diagnostics.routeDates).toBe(1);
    expect(diagnostics.dailyLegsExpected).toBe(1);
    const daily = requests.filter((request) => request.kind === "daily");
    expect(daily).toHaveLength(1);
    expect(daily[0].waypoints).toEqual([
      { lat: -25.45, lon: -49.12 },
      { lat: -25.48, lon: -49.19 }
    ]);
  });
});
