import { beforeEach, describe, expect, it, vi } from "vitest";
import { RESULTS_SCHEMA_VERSION, type ResultsPublication } from "@/lib/imports/results-contract";
import type { LaboratoryRiskPoint } from "@/lib/laboratory-risk";

const mocks = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.test";
  process.env.SUPABASE_SECRET_KEY = "test-service-key";

  return {
    labRows: vi.fn(),
    legacySnapshot: vi.fn(),
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => table === "lab_risk_results"
      ? {
          select: () => ({
            order: () => ({ returns: mocks.labRows }),
          }),
        }
      : {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({ maybeSingle: mocks.legacySnapshot }),
              }),
            }),
          }),
        },
  }),
}));

import { getLatestPublishedLaboratoryRiskPoints } from "@/lib/supabase";

describe("getLatestPublishedLaboratoryRiskPoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.legacySnapshot.mockResolvedValue({ data: null, error: null });
  });

  it("seleciona deterministicamente a campanha elegível mais recente", async () => {
    const createdAt = "2026-08-21T12:00:00.000Z";
    mocks.labRows.mockResolvedValue({
      data: [
        { points: publication(1, "2026-08-21T12:00:00.000Z"), created_at: createdAt },
        { points: { ...publication(3, "2026-08-21T14:00:00.000Z"), viewModel: {} }, created_at: createdAt },
        { points: publication(2, "2026-08-21T13:00:00.000Z"), created_at: createdAt },
      ],
      error: null,
    });

    const result = await getLatestPublishedLaboratoryRiskPoints();

    expect(result).toHaveLength(2);
    expect(result?.[0]).toMatchObject({ campaign: "Campanha 2", score: 0.72, sampleId: "2" });
    expect(result?.[1]).toMatchObject({ campaign: "Campanha 1", score: 0.72, sampleId: "1" });
    expect(mocks.legacySnapshot).not.toHaveBeenCalled();
  });

  it("preserva o formato array legado da tabela atual", async () => {
    const legacy = legacyRiskPoint("array-legado");
    mocks.labRows.mockResolvedValue({
      data: [{ points: [legacy], created_at: "2026-08-21T12:00:00.000Z" }],
      error: null,
    });

    await expect(getLatestPublishedLaboratoryRiskPoints()).resolves.toMatchObject([
      { id: "array-legado", campaign: "Campanha legada" },
    ]);
    expect(mocks.legacySnapshot).not.toHaveBeenCalled();
  });

  it("mantém o snapshot histórico como último fallback", async () => {
    const snapshot = legacyRiskPoint("snapshot-legado");
    mocks.labRows.mockResolvedValue({ data: [], error: null });
    mocks.legacySnapshot.mockResolvedValue({ data: { points: [snapshot] }, error: null });

    await expect(getLatestPublishedLaboratoryRiskPoints()).resolves.toMatchObject([
      { id: "snapshot-legado", campaign: "Campanha legada" },
    ]);
  });
});

function publication(campaignNumber: number, importedAt: string): ResultsPublication {
  const emptyHeat = { taxa: [], rows: [] };
  return {
    campaignId: `campanha-${campaignNumber}`,
    campaignNumber,
    campaignTitle: `Campanha ${campaignNumber}`,
    importedAt,
    schemaVersion: RESULTS_SCHEMA_VERSION,
    fileName: `campanha-${campaignNumber}.xlsx`,
    methodology: { origin: "Método homologado", version: "1" },
    molecularRows: [],
    rankingRows: [],
    viewModel: {
      meta: {
        campanha: campaignNumber,
        amostras: 1,
        municipios: 1,
        mananciais: 1,
        especies: 0,
        linhas: 1,
        reads_total: 0,
        reads_ciano: 0,
        reads_bact: 0,
        reads_coi: 0,
        coi_amostras: 0,
        coi_taxa: 0,
        classes: { Moderado: 1 },
        score_min: 0.72,
        score_max: 0.72,
        score_med: 0.72,
      },
      points: [{
        pos: 1,
        amostra: campaignNumber,
        ponto: `Ponto ${campaignNumber}`,
        municipio: "Curitiba",
        manancial: "Manancial",
        lat: -25.4,
        lon: -49.2,
        sia: `SIA-${campaignNumber}`,
        score: 0.72,
        classe: "Moderado",
        confianca: "Alta",
        turbidez: "Baixa",
        clima: "Estável",
        organismos: "",
        drivers: "",
        r_amb: "Moderado",
        r_op: "Baixo",
        r_san: "Baixo",
        just: "Resultado homologado",
        rec: "Monitorar",
        ciano_reads: 0,
        ciano_pct: 0,
        bact_reads: 0,
        bact_pct: 0,
        coi_inv_reads: 0,
        tox_reads: 0,
        odor_reads: 0,
        inv_reads: 0,
      }],
      ptaxa: {},
      municipios: [{ municipio: "Curitiba", n: 1, score_max: 0.72, score_med: 0.72 }],
      top_ciano: [],
      top_bact: [],
      top_coi: [],
      freq_ciano: [],
      freq_bact: [],
      freq_coi: [],
      tox: [],
      odor: [],
      invasores: [],
      heat_ciano: emptyHeat,
      heat_bact: emptyHeat,
      heat_coi: emptyHeat,
      coi_all: [],
      coi_groups: [],
      alerts: [],
    },
  };
}

function legacyRiskPoint(id: string): LaboratoryRiskPoint {
  return {
    id,
    code: "SIA-1",
    point: "Ponto legado",
    day: "",
    campaign: "Campanha legada",
    date: "",
    waterBody: "Manancial",
    municipality: "Curitiba",
    original: null,
    effective: { lat: -25.4, lon: -49.2 },
    accessibility: "",
    waterAspect: "",
    weatherConditions: "",
    problems: "",
    driveUrl: "",
    dropboxUrl: "",
    photoUrl: "",
    riskLevel: "moderado",
    riskLabel: "Risco moderado",
    riskClassification: "Moderado",
    environmentalRisk: "Moderado",
    operationalRisk: "Baixo",
    sanitaryRisk: "Baixo",
    environmentalRiskLevel: "moderado",
    operationalRiskLevel: "baixo",
    sanitaryRiskLevel: "baixo",
    eta: "Ponto legado",
    detectedMarkers: [],
    ednaSignal: "Moderado",
    laboratoryStatus: "homologado",
    resultSummary: "Resultado legado",
    score: 0.5,
    confidence: "Alta",
    recommendations: "Monitorar",
    rankingPosition: 1,
    sampleId: "1",
  };
}
