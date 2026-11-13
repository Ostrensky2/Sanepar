import { describe, expect, it } from "vitest";
import {
  NEAREST_POINT_AUTO_MAX_M,
  buildCampaignPlannedPoints,
  decideNearestPoint,
  findNearestPoint,
  plannedCoordinateFromList,
  readCampaignPlannedPoints,
  type CampaignPlannedPoint,
} from "@/lib/nearest-point";

// Uns 111 m por milésimo de grau de latitude.
const point = (sia: string, latitude: number, campaign = "4ª Campanha - Primavera 2026"): CampaignPlannedPoint => ({
  sia,
  locationName: `Local ${sia}`,
  municipality: "Curitiba",
  campaign,
  latitude,
  longitude: -49.27,
});

const points = [point("0136", -25.4), point("0137", -25.41), point("0138", -25.45)];
const gpsAt = (latitude: number, accuracyM: number | null = 8) => ({ latitude, longitude: -49.27, accuracyM });
const campaign4 = { campaignId: "campanha-4", campaignName: "4ª Campanha - Primavera 2026" };

describe("ponto mais próximo do celular", () => {
  it("acha o mais próximo da campanha do registro", () => {
    const nearest = findNearestPoint(points, gpsAt(-25.4095), campaign4);

    expect(nearest?.point.sia).toBe("0137");
    expect(nearest?.distanceM).toBeGreaterThan(40);
    expect(nearest?.distanceM).toBeLessThan(70);
  });

  it("prefere a campanha do registro; sem pontos dela, usa os das outras", () => {
    const mixed = [...points, point("0900", -25.4096, "1ª Campanha - Verão 2026")];

    expect(findNearestPoint(mixed, gpsAt(-25.4096), campaign4)?.point.sia).toBe("0137");
    expect(findNearestPoint(mixed, gpsAt(-25.4096), { campaignId: "campanha-9" })?.point.sia).toBe("0900");
    expect(findNearestPoint([], gpsAt(-25.4), campaign4)).toBeNull();
  });

  it("sem ponto escolhido, escolhe sozinho o mais próximo", () => {
    const decision = decideNearestPoint({ points, gps: gpsAt(-25.4003), entry: { ...campaign4 } });

    expect(decision.kind).toBe("select");
    expect(decision.kind !== "none" && decision.nearest.point.sia).toBe("0136");
  });

  it(`sem ponto escolhido e longe de todos (mais de ${NEAREST_POINT_AUTO_MAX_M} m), só sugere`, () => {
    const decision = decideNearestPoint({ points, gps: gpsAt(-25.3), entry: { ...campaign4 } });

    expect(decision.kind).toBe("suggest");
  });

  it("com o ponto certo escolhido, não faz nada", () => {
    const decision = decideNearestPoint({
      points,
      gps: gpsAt(-25.4003),
      entry: { ...campaign4, sia: "136", locationName: "Local 0136" },
    });

    expect(decision.kind).toBe("same");
  });

  it("com outro ponto escolhido, sugere trocar quando o celular está longe dele", () => {
    const decision = decideNearestPoint({
      points,
      gps: gpsAt(-25.4098),
      entry: { ...campaign4, sia: "0136", locationName: "Local 0136" },
    });

    expect(decision.kind).toBe("suggest");
    expect(decision.kind === "suggest" && decision.nearest.point.sia).toBe("0137");
  });

  it("não troca o ponto escolhido quando o celular está perto dele, mesmo havendo outro mais perto", () => {
    const close = [point("0136", -25.4), point("0139", -25.4012)];
    const decision = decideNearestPoint({
      points: close,
      gps: gpsAt(-25.4009),
      entry: { ...campaign4, sia: "0136" },
    });

    expect(decision.kind).toBe("none");
  });

  it("acha a coordenada planejada do ponto na lista guardada no aparelho", () => {
    expect(plannedCoordinateFromList(points, { ...campaign4, sia: "SIA-0137" })).toEqual({
      latitude: -25.41,
      longitude: -49.27,
      fromOtherCampaign: false,
    });
    expect(plannedCoordinateFromList(points, { sia: "0999" })).toBeNull();
  });

  it("monta a lista sem repetir ponto e lê a resposta descartando o que não é ponto", () => {
    const built = buildCampaignPlannedPoints([
      { code: "0136", waterBody: "Rio", municipality: "Curitiba", campaign: "4ª", original: { lat: -25.4, lon: -49.2 } },
      { code: "136", waterBody: "Rio", municipality: "Curitiba", campaign: "4ª", effective: { lat: -25.4, lon: -49.2 } },
      { code: "0140", waterBody: "Represa", municipality: "Pinhais", campaign: "4ª", original: { lat: 0, lon: 0 } },
    ]);

    expect(built).toHaveLength(1);
    expect(readCampaignPlannedPoints({ points: [...built, { sia: "x", latitude: "a" }, null] })).toEqual(built);
    expect(readCampaignPlannedPoints({ error: "Sem sinal" })).toEqual([]);
  });
});
