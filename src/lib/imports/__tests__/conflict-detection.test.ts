import { describe, expect, it } from "vitest";
import { classifyFieldDiaryImport } from "@/lib/imports/conflict-detection";
import type { FieldDiaryEntry } from "@/lib/field-diary";

describe("classifyFieldDiaryImport", () => {
  it("classifica novo, idêntico, aditivo e conflito", () => {
    const incoming = entry({ collectionTime: "08:30", activities: ["Coleta realizada"] });

    expect(classifyFieldDiaryImport(incoming, null, "k").status).toBe("new");
    expect(classifyFieldDiaryImport(incoming, entry({ collectionTime: "08:30", activities: ["Coleta realizada"] }), "k").status).toBe("identical");

    const additive = classifyFieldDiaryImport(
      incoming,
      entry({ collectionTime: "", activities: [] }),
      "k",
    );
    expect(additive.status).toBe("additive");
    expect(additive.entry.collectionTime).toBe("08:30");

    const conflict = classifyFieldDiaryImport(
      incoming,
      entry({ collectionTime: "09:00", activities: ["Coleta realizada"] }),
      "k",
    );
    expect(conflict.status).toBe("conflict");
    expect(conflict.conflicts[0]).toMatchObject({ fieldName: "collectionTime" });
  });
});

function entry(patch: Partial<FieldDiaryEntry> = {}): FieldDiaryEntry {
  return {
    id: "id",
    campaignId: null,
    campaignName: "Campanha",
    campaignDay: 1,
    entryDate: "2026-02-09",
    fieldTeamName: "",
    fieldTeamMembers: [],
    collectionTime: "",
    locationName: "Ponto",
    sia: "SIA-0770",
    samplesReplicasEdna: "",
    zooplanktonId: "",
    latitude: "-25.48",
    longitude: "-49.19",
    municipality: "Curitiba",
    activities: [],
    waterVisualConditions: [],
    hasOccurrence: false,
    occurrenceType: "",
    occurrenceDescription: "",
    requiresFollowUp: "Não",
    followUpNotes: "",
    weatherConditions: "",
    pointAccessibility: "",
    dailySummary: "",
    status: "Rascunho",
    createdBy: "",
    createdByName: "",
    createdAt: "2026-02-09T00:00:00.000Z",
    updatedAt: "2026-02-09T00:00:00.000Z",
    photos: [],
    ...patch,
  };
}
