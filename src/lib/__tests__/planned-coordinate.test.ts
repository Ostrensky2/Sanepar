import { describe, expect, it } from "vitest";
import { findPlannedCoordinate } from "@/lib/planned-coordinate";

const points = [
  {
    waterBody: "Rio Pequeno",
    code: "SIA-0771",
    municipality: "São José dos Pinhais",
    campaign: "1ª Campanha - Verão 2026",
    original: { lat: -25.48, lon: -49.17 },
    effective: { lat: -25.49, lon: -49.18 },
  },
  {
    waterBody: "Rio Pequeno",
    code: "SIA-0771",
    municipality: "São José dos Pinhais",
    campaign: "2ª Campanha - Outono 2026",
    original: { lat: -25.5, lon: -49.2 },
  },
  {
    waterBody: "Rio Miringuava",
    code: "SIA-0136",
    municipality: "São José dos Pinhais",
    campaign: "2ª Campanha - Outono 2026",
    original: null,
    effective: { lat: "-25.6", lon: "-49.3" },
  },
  { waterBody: "Rio Sem Coordenada", code: "SIA-0001", municipality: "Curitiba", original: { lat: 0, lon: 0 } },
  { waterBody: "Represa Sem SIA", code: "", municipality: "Piraquara", campaign: "1", original: { lat: -25.44, lon: -49.06 } },
];

describe("coordenada planejada do ponto (usada quando o celular fica sem GPS)", () => {
  it("usa a coordenada da campanha do registro", () => {
    expect(
      findPlannedCoordinate(points, { sia: "SIA-0771", campaignId: "campanha-2-outono-2026" }),
    ).toEqual({ latitude: -25.5, longitude: -49.2, fromOtherCampaign: false });
    expect(
      findPlannedCoordinate(points, { sia: "sia 0771", locationName: "RIO PEQUENO", campaignName: "1ª Campanha - Verão 2026" }),
    ).toEqual({ latitude: -25.48, longitude: -49.17, fromOtherCampaign: false });
  });

  it("reconhece o SIA escrito de qualquer jeito", () => {
    for (const sia of ["SIA-0771", "0771", "771", "sia 771"]) {
      expect(findPlannedCoordinate(points, { sia, campaignId: "campanha-2-outono-2026" })?.latitude).toBe(-25.5);
    }
  });

  it("sem coordenada na campanha do registro, usa a de outra e avisa", () => {
    expect(findPlannedCoordinate(points, { sia: "SIA-0771", campaignId: "campanha-3" })).toEqual({
      latitude: -25.48,
      longitude: -49.17,
      fromOtherCampaign: true,
    });
  });

  it("sem a coordenada original, vale a efetiva; zero e vazio não contam", () => {
    expect(findPlannedCoordinate(points, { sia: "SIA-0136", campaignId: "campanha-2-outono-2026" })).toEqual({
      latitude: -25.6,
      longitude: -49.3,
      fromOtherCampaign: false,
    });
    expect(findPlannedCoordinate(points, { sia: "SIA-0001" })).toBeNull();
  });

  it("não confunde pontos: o SIA tem de ser o mesmo, e o local também quando informado", () => {
    expect(findPlannedCoordinate(points, { sia: "SIA-0771", locationName: "Rio Miringuava" })).toBeNull();
    expect(findPlannedCoordinate(points, { sia: "SIA-077" })).toBeNull();
    expect(findPlannedCoordinate(points, { sia: "7710" })).toBeNull();
    expect(findPlannedCoordinate(points, {})).toBeNull();
    expect(findPlannedCoordinate(points, { sia: "", locationName: "" })).toBeNull();
  });

  it("ponto sem SIA é achado pelo local e município", () => {
    expect(
      findPlannedCoordinate(points, { locationName: "Represa sem SIA", municipality: "Piraquara", campaignId: "campanha-1-verao-2026" }),
    ).toEqual({ latitude: -25.44, longitude: -49.06, fromOtherCampaign: false });
    expect(findPlannedCoordinate(points, { locationName: "Represa sem SIA", municipality: "Curitiba" })).toBeNull();
  });
});
