import { describe, expect, it } from "vitest";
import { campaignPointToFieldDiaryPayload } from "@/lib/imports/field-spreadsheet-to-diary";
import type { CampaignMapPoint } from "@/lib/imports/campaigns";

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
});
