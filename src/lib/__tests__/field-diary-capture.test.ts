import { describe, expect, it } from "vitest";
import { dedupeFieldDiaryEntries, normalizeFieldDiaryEntry } from "@/lib/field-diary";

function raw(overrides: Record<string, unknown> = {}) {
  return {
    id: "e1",
    campaignId: "campanha-2-outono-2026",
    campaignName: "2ª Campanha - Outono 2026",
    campaignDay: 1,
    entryDate: "2026-06-01",
    locationName: "Rio Pequeno",
    sia: "SIA-0771",
    latitude: "-25.4284",
    longitude: "-49.2733",
    municipality: "São José dos Pinhais",
    activities: ["Coleta de eDNA"],
    waterVisualConditions: [],
    dailySummary: "",
    status: "Enviado",
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-01T10:00:00.000Z",
    photos: [],
    ...overrides,
  };
}

describe("registro de campo — captura automática", () => {
  it("guarda a origem da coordenada, a precisão do GPS e o início da coleta", () => {
    const entry = normalizeFieldDiaryEntry(
      raw({ coordinateSource: "gps", gpsAccuracyM: "8.44", collectionStartedAt: "2026-06-01T09:03:00-03:00" }),
    );

    expect(entry).toMatchObject({
      coordinateSource: "gps",
      gpsAccuracyM: 8.4,
      collectionStartedAt: "2026-06-01T12:03:00.000Z",
    });
  });

  it("registro antigo, sem esses campos, continua válido", () => {
    expect(normalizeFieldDiaryEntry(raw())).toMatchObject({
      latitude: "-25.4284",
      coordinateSource: null,
      gpsAccuracyM: null,
      collectionStartedAt: null,
    });
  });

  it("descarta o que não faz sentido em vez de gravar", () => {
    expect(
      normalizeFieldDiaryEntry(raw({ latitude: "", longitude: "", coordinateSource: "gps", gpsAccuracyM: 8 })),
    ).toMatchObject({ coordinateSource: null, gpsAccuracyM: null });
    expect(normalizeFieldDiaryEntry(raw({ coordinateSource: "manual", gpsAccuracyM: 8 }))).toMatchObject({
      coordinateSource: "manual",
      gpsAccuracyM: null,
    });
    expect(
      normalizeFieldDiaryEntry(raw({ coordinateSource: "adivinhada", collectionStartedAt: "ontem cedo" })),
    ).toMatchObject({ coordinateSource: null, collectionStartedAt: null });
  });

  it("ao juntar registros repetidos, a origem acompanha a coordenada", () => {
    const fromPhone = normalizeFieldDiaryEntry(
      raw({ id: "a", coordinateSource: "gps", gpsAccuracyM: 8, collectionStartedAt: "2026-06-01T12:03:00.000Z" }),
    );
    // Mesma coordenada, mais completo, mas sem saber a origem (veio de planilha).
    const fromSheet = normalizeFieldDiaryEntry(
      raw({ id: "b", dailySummary: "Coleta concluída sem ocorrências.", collectionTime: "09:03" }),
    );
    // Outra coordenada, digitada.
    const typed = normalizeFieldDiaryEntry(
      raw({ id: "c", latitude: "-25.5", coordinateSource: "manual", dailySummary: "Resumo.", collectionTime: "09:10", weatherConditions: "Céu limpo" }),
    );

    if (!fromPhone || !fromSheet || !typed) {
      throw new Error("Registros de teste inválidos.");
    }

    const [sameCoordinates] = dedupeFieldDiaryEntries([fromPhone, fromSheet]);
    expect(sameCoordinates).toMatchObject({
      latitude: "-25.4284",
      coordinateSource: "gps",
      gpsAccuracyM: 8,
      collectionStartedAt: "2026-06-01T12:03:00.000Z",
    });

    const [merged] = dedupeFieldDiaryEntries([fromPhone, typed]);
    // A coordenada que ficou e a origem que ficou são do mesmo registro.
    expect(merged.coordinateSource).toBe(merged.latitude === "-25.5" ? "manual" : "gps");
    expect(merged.gpsAccuracyM).toBe(merged.coordinateSource === "gps" ? 8 : null);
  });
});
