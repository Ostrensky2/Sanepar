import { describe, expect, it } from "vitest";
import { campaignPointToFieldDiaryPayload } from "@/lib/imports/field-spreadsheet-to-diary";
import type { CampaignMapPoint } from "@/lib/imports/campaigns";

function campaignPoint(overrides: Partial<CampaignMapPoint> = {}): CampaignMapPoint {
  return {
    id: "p3",
    code: "770",
    point: "2",
    day: "1",
    campaign: "3ª Campanha - Inverno 2026",
    date: "01/09/2026",
    waterBody: "Captação ETA Iguaçu",
    municipality: "Curitiba",
    original: { lat: -25.48, lon: -49.19 },
    effective: null,
    accessibility: "",
    waterAspect: "",
    weatherConditions: "",
    problems: "",
    driveUrl: "",
    dropboxUrl: "",
    photoUrl: "",
    ...overrides,
  };
}

function diaryPayloads(points: CampaignMapPoint[]) {
  return points
    .map(campaignPointToFieldDiaryPayload)
    .filter((payload) => payload !== null);
}

describe("campaignPointToFieldDiaryPayload", () => {
  it("mapeia campos da planilha de campo para o diário", () => {
    const payload = campaignPointToFieldDiaryPayload({
      id: "p1",
      code: "SIA-0770",
      point: "2",
      day: "3",
      campaign: "1ª Campanha - Verão 2026",
      date: "09/02/2026",
      waterBody: "Captação ETA Iguaçu",
      municipality: "Curitiba",
      original: null,
      effective: { lat: -25.48, lon: -49.19 },
      accessibility: "Fácil",
      waterAspect: "Espuma; Resíduos",
      weatherConditions: "Nublado Pós Chuva",
      problems: "",
      samplesReplicasEdna: "C1770R1",
      zooplanktonId: "7244271",
      collectionTime: "08:30",
      createdByName: "Equipe",
      activities: ["Coleta realizada", "Vistoria visual"],
      hasOccurrence: true,
      occurrenceType: "Condição climática adversa",
      occurrenceDescription: "Chuva recente.",
      requiresFollowUp: "Avaliar posteriormente",
      followUpNotes: "Reavaliar.",
      dailySummary: "Coleta concluída.",
      status: "Enviado",
      driveUrl: "",
      dropboxUrl: "",
      photoUrl: "",
      collectionOrder: 5,
    } satisfies CampaignMapPoint);

    expect(payload).toMatchObject({
      campaignId: "campanha-1-verao-2026",
      campaignName: "1ª Campanha - Verão 2026",
      campaignDay: 3,
      entryDate: "2026-02-09",
      locationName: "Captação ETA Iguaçu",
      sia: "SIA-0770",
      collectionTime: "08:30",
      samplesReplicasEdna: "C1770R1",
      zooplanktonId: "7244271",
      activities: ["Coleta realizada", "Vistoria visual"],
      waterVisualConditions: ["Espuma", "Resíduos"],
      hasOccurrence: true,
      requiresFollowUp: "Avaliar posteriormente",
      status: "Enviado",
      collectionOrder: 5,
    });
  });

  it("resolve nome curto da segunda campanha para a campanha canônica", () => {
    const payload = campaignPointToFieldDiaryPayload({
      id: "p2",
      code: "770",
      point: "2",
      day: "1",
      campaign: "2",
      date: "01/06/2026",
      waterBody: "Captação ETA Iguaçu",
      municipality: "Curitiba",
      original: null,
      effective: { lat: -25.48, lon: -49.19 },
      accessibility: "Fácil",
      waterAspect: "Aparentemente normal",
      weatherConditions: "Sol",
      problems: "",
      driveUrl: "",
      dropboxUrl: "",
      photoUrl: "",
    } satisfies CampaignMapPoint);

    expect(payload).toMatchObject({
      campaignId: "campanha-2-outono-2026",
      campaignName: "2ª Campanha - Outono 2026",
    });
  });

  describe("regressão de pontos planejados no Diário", () => {
    it("campanha em planejamento: ignora ponto apenas com coordenada original", () => {
      expect(campaignPointToFieldDiaryPayload(campaignPoint())).toBeNull();
    });

    it("template com effective pré-preenchido: não materializa sem evidência operacional", () => {
      expect(
        campaignPointToFieldDiaryPayload(
          campaignPoint({
            original: null,
            effective: { lat: -25.481, lon: -49.191 },
            createdByName: "Aline/Juliana",
            accessibility: "Fácil",
            waterAspect: "Não informado",
            weatherConditions: "Não informado",
            problems: "Não informado",
            requiresFollowUp: "Não",
            status: "Rascunho",
          }),
        ),
      ).toBeNull();
    });

    it("efetivo com evidência operacional: materializa o registro concluído", () => {
      const payload = campaignPointToFieldDiaryPayload(
        campaignPoint({
          original: null,
          effective: { lat: -25.481, lon: -49.191 },
          activities: ["Coleta realizada"],
        }),
      );

      expect(payload).toMatchObject({
        latitude: "-25.481",
        longitude: "-49.191",
        activities: ["Coleta realizada"],
      });
    });

    it("Diário vazio: conjunto somente planejado gera zero registros", () => {
      expect(diaryPayloads([campaignPoint(), campaignPoint({ id: "p4", code: "771" })])).toEqual([]);
    });

    it("pontos do primeiro dia: inclui somente os efetivamente visitados", () => {
      const payloads = diaryPayloads([
        campaignPoint({
          id: "p3",
          code: "770",
          effective: { lat: -25.481, lon: -49.191 },
          collectionTime: "08:30",
        }),
        campaignPoint({ id: "p4", code: "771" }),
      ]);

      expect(payloads).toHaveLength(1);
      expect(payloads[0]).toMatchObject({ campaignDay: 1, sia: "SIA-0770" });
    });

    it("reload: mantém somente o ponto operacional do primeiro dia", () => {
      const points = [
        campaignPoint({
          effective: { lat: -25.481, lon: -49.191 },
          activities: ["Coleta realizada"],
        }),
        campaignPoint({
          id: "p4",
          code: "771",
          original: null,
          effective: { lat: -25.482, lon: -49.192 },
        }),
      ];

      expect(diaryPayloads(points).map((payload) => payload.sia)).toEqual(["SIA-0770"]);
      expect(diaryPayloads(points).map((payload) => payload.sia)).toEqual(["SIA-0770"]);
    });

    it("novo dia: preserva o histórico e adiciona somente o novo efetivo operacional", () => {
      const payloads = diaryPayloads([
        campaignPoint({
          effective: { lat: -25.481, lon: -49.191 },
          dailySummary: "Coleta concluída.",
        }),
        campaignPoint({
          id: "p4",
          code: "771",
          day: "2",
          date: "02/09/2026",
          effective: { lat: -25.482, lon: -49.192 },
          collectionTime: "09:15",
        }),
        campaignPoint({
          id: "p5",
          code: "772",
          day: "2",
          date: "02/09/2026",
          original: null,
          effective: { lat: -25.483, lon: -49.193 },
        }),
      ]);

      expect(payloads).toHaveLength(2);
      expect(payloads).toEqual([
        expect.objectContaining({ sia: "SIA-0770", campaignDay: 1, entryDate: "2026-09-01" }),
        expect.objectContaining({ sia: "SIA-0771", campaignDay: 2, entryDate: "2026-09-02" }),
      ]);
    });

    it("plannedPoints históricos: não materializa originais de campanhas anteriores", () => {
      expect(
        diaryPayloads([
          campaignPoint({ campaign: "1ª Campanha - Verão 2026", date: "09/02/2026" }),
          campaignPoint({ id: "p4", campaign: "2ª Campanha - Outono 2026", date: "01/06/2026" }),
        ]),
      ).toEqual([]);
    });

    it("nova sessão: reidrata somente o ponto operacional", () => {
      const serialized = JSON.stringify([
        campaignPoint({
          effective: { lat: -25.481, lon: -49.191 },
          activities: ["Coleta realizada"],
        }),
        campaignPoint({
          id: "p4",
          code: "771",
          original: null,
          effective: { lat: -25.482, lon: -49.192 },
        }),
      ]);
      const rehydratedPoints = JSON.parse(serialized) as CampaignMapPoint[];

      expect(diaryPayloads(rehydratedPoints).map((payload) => payload.sia)).toEqual(["SIA-0770"]);
    });

    it("sequência resolveu e todos voltaram: 73 placeholders não reaparecem após reprocessamento", () => {
      const placeholders = Array.from({ length: 73 }, (_, index) =>
        campaignPoint({
          id: `placeholder-${index}`,
          code: String(1000 + index),
          original: null,
          effective: { lat: -25.48 - index / 10_000, lon: -49.19 - index / 10_000 },
          createdByName: index % 2 ? "Aline/Juliana" : "Vilmar/João",
          accessibility: "Fácil",
          waterAspect: "Não informado",
          weatherConditions: "Não informado",
          problems: "Não informado",
          requiresFollowUp: "Não",
          status: "Rascunho",
        }),
      );

      expect(diaryPayloads(placeholders)).toEqual([]);
      expect(diaryPayloads(JSON.parse(JSON.stringify(placeholders)) as CampaignMapPoint[])).toEqual([]);
    });
  });
});
