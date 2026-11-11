import { beforeEach, describe, expect, it, vi } from "vitest";

// Captura automática (origem da coordenada, precisão do GPS, início da coleta) na
// gravação de um registro de campo.

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  previousRow: null as Record<string, unknown> | null,
  sameDayRows: [] as Array<Record<string, unknown>>,
  upserts: [] as Array<Record<string, unknown>>,
  upsertErrors: [] as Array<{ code: string; message: string } | null>,
}));

vi.mock("@/lib/api-auth", () => ({ requireApiSession: mocks.auth }));
vi.mock("@/lib/supabase", () => ({
  createOptionalSupabaseClient: () => ({
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        returns: async () => ({ data: mocks.sameDayRows, error: null }),
        maybeSingle: async () => ({ data: mocks.previousRow, error: null }),
        upsert: (row: Record<string, unknown>) => {
          mocks.upserts.push(row);
          const error = mocks.upsertErrors.shift() ?? null;

          return {
            select: () => ({
              single: async () => (error ? { data: null, error } : { data: { ...row, photos: [] }, error: null }),
            }),
          };
        },
        insert: async () => ({ error: null }),
      };
      return query;
    },
  }),
}));

import { POST, PUT } from "@/app/api/field-diary/route";

const ID = "6f1f8d1e-2b7a-4a43-9a51-0d6c1f0f5a11";
const STARTED_AT = "2026-06-01T12:03:00.000Z";

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    campaignId: "campanha-2",
    campaignName: "2ª Campanha",
    campaignDay: 1,
    entryDate: "2026-06-01",
    collectionTime: "09:03",
    locationName: "Rio Pequeno",
    sia: "SIA-0771",
    latitude: "-25.428400",
    longitude: "-49.273300",
    municipality: "São José dos Pinhais",
    activities: ["Coleta de eDNA"],
    waterVisualConditions: [],
    dailySummary: "Coleta concluída.",
    status: "Enviado",
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-01T10:00:00.000Z",
    photos: [],
    ...overrides,
  };
}

function storedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    campaign_id: "campanha-2",
    campaign_name: "2ª Campanha",
    campaign_day: 1,
    entry_date: "2026-06-01",
    field_team_name: null,
    field_team_members: [],
    collection_time: "09:03",
    location_name: "Rio Pequeno",
    sia: "SIA-0771",
    samples_replicas_edna: null,
    zooplankton_id: null,
    latitude: -25.4284,
    longitude: -49.2733,
    coordinate_source: "gps",
    gps_accuracy_m: 8.4,
    collection_started_at: STARTED_AT,
    municipality: "São José dos Pinhais",
    activities: ["Coleta de eDNA"],
    water_visual_conditions: [],
    has_occurrence: false,
    requires_follow_up: "Não",
    daily_summary: "Coleta concluída.",
    status: "Enviado",
    created_at: "2026-06-01T10:00:00.000Z",
    updated_at: "2026-06-01T10:00:00.000Z",
    photos: [],
    governance_status: "corrigido",
    ...overrides,
  };
}

function request(body: unknown, method: "POST" | "PUT" = "PUT") {
  return new Request("https://sanepar.test/api/field-diary", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ entry: body }),
  });
}

describe("API do Diário de campo: captura automática", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.previousRow = null;
    mocks.sameDayRows = [];
    mocks.upserts = [];
    mocks.upsertErrors = [];
    mocks.auth.mockResolvedValue({ ok: true, session: { name: "Teste" } });
  });

  it("grava a origem GPS, a precisão e o início da coleta", async () => {
    const response = await PUT(
      request(entry({ coordinateSource: "gps", gpsAccuracyM: 8.44, collectionStartedAt: STARTED_AT })),
    );

    expect(response.status).toBe(200);
    expect(mocks.upserts[0]).toMatchObject({
      latitude: -25.4284,
      longitude: -49.2733,
      coordinate_source: "gps",
      gps_accuracy_m: 8.4,
      collection_started_at: STARTED_AT,
    });
    expect((await response.json()).entry).toMatchObject({
      coordinateSource: "gps",
      gpsAccuracyM: 8.4,
      collectionStartedAt: STARTED_AT,
    });
  });

  it("nunca grava precisão de GPS numa coordenada digitada ou planejada", async () => {
    await PUT(request(entry({ coordinateSource: "manual", gpsAccuracyM: 8 })));
    await PUT(request(entry({ coordinateSource: "planned", gpsAccuracyM: 8 })));

    expect(mocks.upserts[0]).toMatchObject({ coordinate_source: "manual", gps_accuracy_m: null });
    expect(mocks.upserts[1]).toMatchObject({ coordinate_source: "planned", gps_accuracy_m: null });
  });

  it("não grava origem sem coordenada, nem origem que não existe", async () => {
    await PUT(request(entry({ latitude: "", longitude: "", coordinateSource: "gps", gpsAccuracyM: 8 })));
    await PUT(request(entry({ coordinateSource: "satélite", gpsAccuracyM: 8 })));

    expect(mocks.upserts[0]).toMatchObject({ coordinate_source: null, gps_accuracy_m: null });
    expect(mocks.upserts[1]).toMatchObject({ coordinate_source: null, gps_accuracy_m: null });
  });

  it("navegador com a versão anterior, sem mexer na coordenada, não apaga a captura", async () => {
    mocks.previousRow = storedRow();

    // A versão anterior do app não conhece os campos de captura e não os envia.
    await PUT(request(entry({ dailySummary: "Resumo corrigido." })));

    expect(mocks.upserts[0].daily_summary).toBe("Resumo corrigido.");
    expect("coordinate_source" in mocks.upserts[0]).toBe(false);
    expect("gps_accuracy_m" in mocks.upserts[0]).toBe(false);
    expect("collection_started_at" in mocks.upserts[0]).toBe(false);
  });

  it("navegador com a versão anterior que troca a coordenada apaga a origem GPS", async () => {
    mocks.previousRow = storedRow();

    await PUT(request(entry({ latitude: "-25.5" })));

    expect(mocks.upserts[0]).toMatchObject({ latitude: -25.5, coordinate_source: null, gps_accuracy_m: null });
    // O início da coleta não depende da coordenada: fica como está no banco.
    expect("collection_started_at" in mocks.upserts[0]).toBe(false);
  });

  it("banco ainda sem as colunas: o registro é gravado mesmo assim, sem elas", async () => {
    mocks.upsertErrors = [
      { code: "PGRST204", message: "Could not find the 'coordinate_source' column of 'field_diary_entries'" },
    ];

    const response = await PUT(
      request(entry({ coordinateSource: "gps", gpsAccuracyM: 8, collectionStartedAt: STARTED_AT })),
    );

    expect(response.status).toBe(200);
    expect(mocks.upserts).toHaveLength(2);
    expect(mocks.upserts[1]).toMatchObject({ latitude: -25.4284, collection_time: "09:03" });
    expect("coordinate_source" in mocks.upserts[1]).toBe(false);
    expect("gps_accuracy_m" in mocks.upserts[1]).toBe(false);
    expect("collection_started_at" in mocks.upserts[1]).toBe(false);
  });

  it("erro do banco que não é das colunas novas não é repetido nem escondido", async () => {
    mocks.upsertErrors = [{ code: "23514", message: "violates check constraint" }];

    const response = await PUT(request(entry({ coordinateSource: "gps", gpsAccuracyM: 8 })));

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(mocks.upserts).toHaveLength(1);
  });

  it("registro novo para ponto e dia que já existem leva a origem da coordenada que chegou", async () => {
    mocks.sameDayRows = [
      storedRow({
        id: "11111111-2222-4333-8444-555555555555",
        latitude: null,
        longitude: null,
        coordinate_source: null,
        gps_accuracy_m: null,
        collection_started_at: null,
        governance_status: "importado",
      }),
    ];

    const response = await POST(
      request(entry({ coordinateSource: "gps", gpsAccuracyM: 6, collectionStartedAt: STARTED_AT }), "POST"),
    );

    expect(response.status).toBe(200);
    expect(mocks.upserts[0]).toMatchObject({
      id: "11111111-2222-4333-8444-555555555555",
      latitude: -25.4284,
      coordinate_source: "gps",
      gps_accuracy_m: 6,
      collection_started_at: STARTED_AT,
    });
  });
});
