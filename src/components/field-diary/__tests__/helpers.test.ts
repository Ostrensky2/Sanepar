import { describe, expect, it } from "vitest";
import {
  buildCalendarDays,
  formatCoordinatePair,
  formatDate,
  getOperationalStage,
  groupEntriesByFieldDay,
  normalizeFieldDiaryPointKey,
  shiftMonth,
  summarizeFieldDiaryEntries,
} from "@/components/field-diary/helpers";
import type { FieldDiaryEntry } from "@/lib/field-diary";

function makeEntry(overrides: Partial<FieldDiaryEntry> = {}): FieldDiaryEntry {
  return {
    id: "e1",
    campaignId: "campanha-2-outono-2026",
    campaignName: "2ª Campanha - Outono 2026",
    campaignDay: 1,
    entryDate: "2026-06-01",
    collectionTime: "",
    locationName: "Rio Pequeno",
    sia: "SIA-0771",
    samplesReplicasEdna: "",
    zooplanktonId: "",
    latitude: "-25.48",
    longitude: "-49.17",
    municipality: "São José dos Pinhais",
    activities: ["Coleta de eDNA"],
    waterVisualConditions: [],
    hasOccurrence: false,
    occurrenceType: null,
    occurrenceDescription: null,
    requiresFollowUp: "Não",
    followUpNotes: null,
    weatherConditions: "",
    pointAccessibility: "",
    dailySummary: "",
    status: "Enviado",
    createdBy: null,
    createdByName: "Equipe",
    createdAt: "2026-06-01T10:00:00Z",
    updatedAt: "2026-06-01T10:00:00Z",
    ...overrides,
  } as FieldDiaryEntry;
}

describe("field-diary helpers", () => {
  it("classifica estágio operacional", () => {
    expect(getOperationalStage(makeEntry())).toBe("recorded");
    expect(getOperationalStage(makeEntry({ hasOccurrence: true }))).toBe("occurrence");
    expect(getOperationalStage(makeEntry({ locationName: "" }))).toBe("incomplete");
    expect(
      getOperationalStage(
        makeEntry({ activities: [], latitude: "", longitude: "", dailySummary: "" }),
      ),
    ).toBe("planned");
  });

  it("resume entradas por estágio e coordenadas", () => {
    const summary = summarizeFieldDiaryEntries([
      makeEntry(),
      makeEntry({ id: "e2", hasOccurrence: true }),
      makeEntry({ id: "e3", latitude: "", longitude: "", activities: [] }),
    ]);

    expect(summary.total).toBe(3);
    expect(summary.recorded).toBe(1);
    expect(summary.occurrence).toBe(1);
    expect(summary.planned).toBe(1);
    expect(summary.withoutCoordinates).toBe(1);
  });

  it("agrupa por dia de campo ordenando do mais recente", () => {
    const groups = groupEntriesByFieldDay([
      makeEntry({ id: "a", entryDate: "2026-06-01", campaignDay: 1 }),
      makeEntry({ id: "b", entryDate: "2026-06-02", campaignDay: 2 }),
      makeEntry({ id: "c", entryDate: "2026-06-02", campaignDay: 2, locationName: "Rio A" }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].entryDate).toBe("2026-06-02");
    expect(groups[0].entries).toHaveLength(2);
    expect(groups[0].entries[0].locationName).toBe("Rio A");
  });

  it("normaliza chaves de ponto removendo acentos e pontuação", () => {
    expect(normalizeFieldDiaryPointKey("  SÃO JOSÉ dos Pinhais!! ")).toBe("sao jose dos pinhais");
    expect(normalizeFieldDiaryPointKey("SIA-0771")).toBe("sia 0771");
    expect(normalizeFieldDiaryPointKey(null)).toBe("");
  });

  it("formata datas e coordenadas", () => {
    expect(formatDate("2026-06-10")).toBe("10/06/2026");
    expect(formatCoordinatePair("-25.4", "-49.2")).toBe("-25.4, -49.2");
    expect(formatCoordinatePair("", "-49.2")).toBe("Sem coordenada");
  });

  it("monta calendário de 42 dias e desloca meses", () => {
    const days = buildCalendarDays("2026-06-01");

    expect(days).toHaveLength(42);
    expect(days.filter((day) => day.inMonth)).toHaveLength(30);
    expect(shiftMonth("2026-06-01", 1)).toBe("2026-07-01");
    expect(shiftMonth("2026-01-01", -1)).toBe("2025-12-01");
  });
});
