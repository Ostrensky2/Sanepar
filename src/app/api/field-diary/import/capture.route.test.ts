import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A planilha do Diário não traz a captura automática (origem da coordenada, precisão
// do GPS, início da coleta). Importar não pode apagar nem deixar mentindo o que o
// celular gravou.

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  existing: [] as Array<Record<string, unknown>>,
  upserts: [] as Array<Array<Record<string, unknown>>>,
  logs: [] as Array<Array<Record<string, unknown>>>,
}));

vi.mock("@/lib/api-auth", () => ({ requireApiSession: mocks.auth }));
vi.mock("@/lib/supabase", () => ({
  createOptionalSupabaseClient: () => ({
    from: (table: string) => {
      const query = {
        select: () => query,
        in: () => query,
        returns: async () => ({ data: mocks.existing, error: null }),
        upsert: async (rows: Array<Record<string, unknown>>) => {
          mocks.upserts.push(rows);
          return { error: null };
        },
        insert: async (rows: Array<Record<string, unknown>>) => {
          if (table === "field_diary_change_log") {
            mocks.logs.push(rows);
          }
          return { error: null };
        },
      };
      return query;
    },
  }),
}));

import { POST } from "./route";

const CAMPAIGN = "2ª Campanha - Outono 2026";
// O banco devolve o instante num formato; o app regrava o mesmo instante em ISO.
const STARTED_AT_IN_DATABASE = "2026-06-01T12:03:00+00:00";
const STARTED_AT = "2026-06-01T12:03:00.000Z";

function existingRow(overrides: Record<string, unknown>) {
  return {
    id: "00000000-0000-4000-8000-000000000000",
    campaign_id: "campanha-2-outono-2026",
    campaign_name: CAMPAIGN,
    campaign_day: 1,
    entry_date: "2026-06-01",
    field_team_name: null,
    field_team_members: [],
    collection_time: "09:03",
    location_name: "Rio Pequeno",
    sia: "0771",
    samples_replicas_edna: null,
    zooplankton_id: null,
    latitude: -25.4284,
    longitude: -49.2733,
    coordinate_source: "gps",
    gps_accuracy_m: 8.4,
    collection_started_at: STARTED_AT_IN_DATABASE,
    execution_status: "collected",
    relocation_reason: null,
    municipality: "São José dos Pinhais",
    activities: ["Coleta de eDNA"],
    water_visual_conditions: [],
    has_occurrence: false,
    occurrence_type: null,
    occurrence_description: null,
    requires_follow_up: "Não",
    follow_up_notes: null,
    weather_conditions: null,
    point_accessibility: null,
    daily_summary: "",
    status: "Rascunho",
    created_by: null,
    created_by_name: "Equipe A",
    created_at: "2026-06-01T12:00:00+00:00",
    updated_at: "2026-06-01T12:05:00+00:00",
    photos: [],
    governance_status: "importado",
    collection_order: 1,
    missing_in_import: false,
    ...overrides,
  };
}

type SheetRow = { location: string; sia: string; latitude: number; longitude: number; summary: string };

async function importRequest(rows: SheetRow[]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Registros");

  sheet.addRow([
    "Campanha", "Dia", "Data", "Equipe", "Local", "SIA", "Latitude", "Longitude", "Município", "Atividades",
    "Condições da água", "Ocorrência", "Tipo", "Descrição", "Acompanhamento", "Encaminhamento", "Resumo", "Status",
  ]);

  for (const row of rows) {
    sheet.addRow([
      CAMPAIGN, 1, "2026-06-01", "Equipe A", row.location, row.sia, row.latitude, row.longitude,
      "São José dos Pinhais", "Coleta de eDNA", "", "Não", "", "", "Não", "", row.summary, "Rascunho",
    ]);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const file = new File([buffer], "diario.xlsx");
  const formData = { get: (key: string) => (key === "file" ? file : null) };

  return { url: "https://sanepar.test/api/field-diary/import", formData: async () => formData } as unknown as Request;
}

function upsertedRow(id: string) {
  const row = mocks.upserts.flat().find((candidate) => candidate.id === id);

  if (!row) {
    throw new Error(`Linha ${id} não foi enviada ao banco.`);
  }

  return row;
}

describe("importação do Diário: captura automática do celular", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.existing = [];
    mocks.upserts = [];
    mocks.logs = [];
    mocks.auth.mockResolvedValue({ ok: true, session: { name: "Teste" } });
  });

  it("mantém origem, precisão e início da coleta quando a planilha não muda a coordenada", async () => {
    mocks.existing = [existingRow({ id: "aaaaaaaa-0000-4000-8000-000000000001" })];

    const response = await POST(
      await importRequest([
        { location: "Rio Pequeno", sia: "0771", latitude: -25.4284, longitude: -49.2733, summary: "Coleta concluída." },
      ]),
    );

    expect(response.status).toBe(200);
    expect(upsertedRow("aaaaaaaa-0000-4000-8000-000000000001")).toMatchObject({
      daily_summary: "Coleta concluída.",
      coordinate_source: "gps",
      gps_accuracy_m: 8.4,
      collection_started_at: STARTED_AT,
    });
  });

  it("apaga a origem quando a planilha troca a coordenada, e registra no histórico", async () => {
    mocks.existing = [existingRow({ id: "aaaaaaaa-0000-4000-8000-000000000002" })];

    await POST(
      await importRequest([
        { location: "Rio Pequeno", sia: "0771", latitude: -25.5, longitude: -49.2733, summary: "" },
      ]),
    );

    expect(upsertedRow("aaaaaaaa-0000-4000-8000-000000000002")).toMatchObject({
      latitude: -25.5,
      coordinate_source: null,
      gps_accuracy_m: null,
      // O momento do toque continua valendo: é a hora da coleta, não a posição.
      collection_started_at: STARTED_AT,
    });
    expect(mocks.logs.flat()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field_name: "latitude", origin: "planilha" }),
        expect.objectContaining({ field_name: "coordinateSource", old_value: "gps", new_value: "" }),
      ]),
    );
  });

  it("toda linha de registro existente leva as colunas, para o lote não apagar nenhuma", async () => {
    mocks.existing = [
      existingRow({ id: "aaaaaaaa-0000-4000-8000-000000000003" }),
      existingRow({
        id: "aaaaaaaa-0000-4000-8000-000000000004",
        location_name: "Rio Miringuava",
        sia: "0136",
        coordinate_source: "planned",
        gps_accuracy_m: null,
      }),
    ];

    // Um registro atualizado, um novo e um que não veio na planilha, no mesmo lote.
    await POST(
      await importRequest([
        { location: "Rio Pequeno", sia: "0771", latitude: -25.4284, longitude: -49.2733, summary: "Atualizado." },
        { location: "Rio Novo", sia: "0999", latitude: -25.6, longitude: -49.3, summary: "Novo." },
      ]),
    );

    expect(mocks.upserts).toHaveLength(1);
    expect(upsertedRow("aaaaaaaa-0000-4000-8000-000000000003").coordinate_source).toBe("gps");
    expect(upsertedRow("aaaaaaaa-0000-4000-8000-000000000004")).toMatchObject({
      missing_in_import: true,
      coordinate_source: "planned",
      collection_started_at: STARTED_AT_IN_DATABASE,
    });

    const created = mocks.upserts[0].find((row) => row.sia === "0999");
    // Registro novo de planilha não tem captura: as colunas ficam vazias no banco.
    expect(created).toBeDefined();
    expect(created?.coordinate_source ?? null).toBeNull();
  });

  it("não manda as colunas enquanto o banco ainda não as tem", async () => {
    const legacy = existingRow({ id: "aaaaaaaa-0000-4000-8000-000000000005" }) as Record<string, unknown>;
    delete legacy.coordinate_source;
    delete legacy.gps_accuracy_m;
    delete legacy.collection_started_at;
    mocks.existing = [legacy];

    const response = await POST(
      await importRequest([
        { location: "Rio Pequeno", sia: "0771", latitude: -25.5, longitude: -49.2733, summary: "Atualizado." },
      ]),
    );

    expect(response.status).toBe(200);
    for (const row of mocks.upserts.flat()) {
      expect("coordinate_source" in row).toBe(false);
      expect("gps_accuracy_m" in row).toBe(false);
      expect("collection_started_at" in row).toBe(false);
    }
  });
});
