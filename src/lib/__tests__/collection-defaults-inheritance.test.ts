import { describe, expect, it } from "vitest";
import { resolveCollectionDefaults } from "@/lib/campaign-management";
import { buildProjectCollectionDefaults, type CollectionDefaults } from "@/lib/field-standard";

const campaigns = [{ id: "campanha-1" }, { id: "campanha-2" }, { id: "campanha-3" }, { id: "campanha-4" }];

type ManagementById = Parameters<typeof resolveCollectionDefaults>[0];

function defaultsWith(patch: Partial<CollectionDefaults>): CollectionDefaults {
  return { ...buildProjectCollectionDefaults(), ...patch };
}

// Só o que importa para a herança: os padrões gravados em cada campanha.
function managementWith(collectionDefaultsById: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(collectionDefaultsById).map(([id, collectionDefaults]) => [id, { collectionDefaults }]),
  ) as unknown as ManagementById;
}

describe("padrões de coleta — herança entre campanhas", () => {
  it("sem nada gravado, vale o padrão do projeto", () => {
    expect(resolveCollectionDefaults({}, "campanha-3", campaigns)).toEqual({
      defaults: buildProjectCollectionDefaults(),
      sourceCampaignId: null,
    });
  });

  it("o que foi definido numa campanha vale para as seguintes, até alguém mudar", () => {
    const management = managementWith({ "campanha-2": defaultsWith({ destinationLab: "LAPOA" }) });

    // A campanha anterior não é afetada.
    expect(resolveCollectionDefaults(management, "campanha-1", campaigns).sourceCampaignId).toBeNull();
    expect(resolveCollectionDefaults(management, "campanha-1", campaigns).defaults.destinationLab).toBe("GA");

    for (const campaignId of ["campanha-2", "campanha-3", "campanha-4"]) {
      const resolved = resolveCollectionDefaults(management, campaignId, campaigns);

      expect(resolved.sourceCampaignId).toBe("campanha-2");
      expect(resolved.defaults.destinationLab).toBe("LAPOA");
    }
  });

  it("os padrões da própria campanha vencem os herdados", () => {
    const management = managementWith({
      "campanha-2": defaultsWith({ destinationLab: "LAPOA" }),
      "campanha-4": defaultsWith({ destinationLab: "LHM" }),
    });

    expect(resolveCollectionDefaults(management, "campanha-3", campaigns).defaults.destinationLab).toBe("LAPOA");
    expect(resolveCollectionDefaults(management, "campanha-4", campaigns)).toMatchObject({
      sourceCampaignId: "campanha-4",
      defaults: { destinationLab: "LHM" },
    });
  });

  it("conserta o que foi gravado com valor fora da lista", () => {
    const management = managementWith({
      "campanha-2": { destinationLab: "LAB INEXISTENTE", projectCode: "errado" },
    });
    const resolved = resolveCollectionDefaults(management, "campanha-2", campaigns);

    expect(resolved.sourceCampaignId).toBe("campanha-2");
    expect(resolved.defaults.destinationLab).toBe("GA");
    expect(resolved.defaults.projectCode).toBe("YVA");
  });

  it("campanha fora da lista usa só os próprios padrões ou os do projeto", () => {
    const management = managementWith({ "campanha-2": defaultsWith({ destinationLab: "LAPOA" }) });

    expect(resolveCollectionDefaults(management, "campanha-extra", campaigns).sourceCampaignId).toBeNull();
  });
});
