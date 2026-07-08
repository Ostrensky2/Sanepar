import { describe, expect, it } from "vitest";
import {
  classifyFieldDiaryImport,
  diffFieldDiaryEntries,
} from "@/lib/imports/conflict-detection";
import type { FieldDiaryEntry } from "@/lib/field-diary";

describe("classifyFieldDiaryImport", () => {
  it("classifica novo, idêntico e aditivo (campo vazio preenchido)", () => {
    const incoming = entry({ collectionTime: "08:30", activities: ["Coleta realizada"] });

    expect(classifyFieldDiaryImport(incoming, null, "k").status).toBe("new");
    expect(
      classifyFieldDiaryImport(
        incoming,
        entry({ collectionTime: "08:30", activities: ["Coleta realizada"] }),
        "k",
      ).status,
    ).toBe("identical");

    const additive = classifyFieldDiaryImport(
      incoming,
      entry({ collectionTime: "", activities: [] }),
      "k",
    );
    expect(additive.status).toBe("additive");
    expect(additive.entry.collectionTime).toBe("08:30");
  });

  it("registro preliminar (importado): a planilha vence e sobrescreve o campo divergente", () => {
    const incoming = entry({ collectionTime: "08:30" });
    const result = classifyFieldDiaryImport(
      incoming,
      entry({ collectionTime: "09:00", governanceStatus: "importado" }),
      "k",
    );

    expect(result.status).toBe("additive");
    expect(result.entry.collectionTime).toBe("08:30");
    expect(result.conflicts).toHaveLength(0);
  });

  it("registro protegido (consolidado/corrigido): divergência vira conflito e mantém o app", () => {
    const incoming = entry({ collectionTime: "08:30" });

    for (const governanceStatus of ["consolidado", "corrigido"] as const) {
      const result = classifyFieldDiaryImport(
        incoming,
        entry({ collectionTime: "09:00", governanceStatus }),
        "k",
      );

      expect(result.status).toBe("conflict");
      expect(result.entry.collectionTime).toBe("09:00");
      expect(result.conflicts[0]).toMatchObject({ fieldName: "collectionTime" });
    }
  });

  it("com force=true, a planilha sobrescreve mesmo um registro protegido", () => {
    const incoming = entry({ collectionTime: "08:30" });
    const result = classifyFieldDiaryImport(
      incoming,
      entry({ collectionTime: "09:00", governanceStatus: "consolidado" }),
      "k",
      { force: true },
    );

    expect(result.status).toBe("additive");
    expect(result.entry.collectionTime).toBe("08:30");
    expect(result.conflicts).toHaveLength(0);
  });
});

describe("diffFieldDiaryEntries", () => {
  it("detecta os campos que mudaram, com valor anterior e novo", () => {
    const before = entry({ collectionTime: "09:00", municipality: "Curitiba" });
    const after = entry({ collectionTime: "08:30", municipality: "Curitiba" });
    const changes = diffFieldDiaryEntries(before, after);

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      field: "collectionTime",
      oldValue: "09:00",
      newValue: "08:30",
    });
  });

  it("não reporta mudança quando os registros são equivalentes", () => {
    const before = entry({ activities: ["Coleta realizada"] });
    const after = entry({ activities: ["Coleta realizada"] });
    expect(diffFieldDiaryEntries(before, after)).toHaveLength(0);
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
