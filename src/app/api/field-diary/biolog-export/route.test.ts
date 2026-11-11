import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";

// Exportação para o Biolog: leitura de todas as amostras e medições das campanhas
// de uma vez, e a marca de exportado que congela o código da amostra.

const auth = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api-auth", () => ({ requireApiSession: auth }));
vi.mock("@/lib/supabase", async () => {
  const { fakeSupabase: fake } = await import("@/test/fake-supabase");
  return { createOptionalSupabaseClient: () => fake.client() };
});

import { GET, POST } from "@/app/api/field-diary/biolog-export/route";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function sampleRow(n: number, entryId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: id(n),
    entry_id: entryId,
    sample_code: `YVA-071126-0136-AG${n}`,
    project_code: "YVA",
    sample_type: "water",
    sequence: n,
    depth_m: "0.00",
    quantity: "1000.000",
    quantity_unit: "mL",
    specification: "eDNA",
    conservation: "FILTRO_CONGELADO",
    packaging: "Isopor com gelo",
    box_position: null,
    exported_at: null,
    ...overrides,
  };
}

function readingRow(n: number, entryId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: id(1000 + n),
    entry_id: entryId,
    parameter_id: "ph",
    value: "7.2",
    unit: "",
    depth_m: "0.00",
    measured_time: "09:10",
    equipment: "Sonda",
    ...overrides,
  };
}

const parameterRow = (parameterId: string, label: string, sortOrder: number) => ({
  id: parameterId,
  label,
  unit: "",
  min_value: null,
  max_value: null,
  applies_to: ["water", "plankton"],
  uses_depth: true,
  biolog_column: null,
  is_base: true,
  active: true,
  sort_order: sortOrder,
});

function get(query: string) {
  return GET(new Request(`https://example.test/api/field-diary/biolog-export${query}`));
}

function post(body: unknown) {
  return POST(
    new Request("https://example.test/api/field-diary/biolog-export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  fakeSupabase.reset();
  auth.mockReset();
  auth.mockResolvedValue({ ok: true, session: { name: "Equipe A", email: "a@example.test" } });
  fakeSupabase.seed("field_diary_entries", [
    { id: "registro-1", campaign_name: "4ª Campanha" },
    { id: "registro-2", campaign_name: "4ª Campanha" },
    { id: "registro-3", campaign_name: "5ª Campanha" },
    { id: "registro-4", campaign_name: "Ação pontual" },
  ]);
  fakeSupabase.seed("field_diary_samples", [
    sampleRow(2, "registro-1"),
    sampleRow(1, "registro-1", { exported_at: "2026-11-09T10:00:00.000Z" }),
    sampleRow(3, "registro-2", { sample_code: "YVA-071126-0140-PL1", sample_type: "plankton", sequence: 1 }),
    sampleRow(4, "registro-3", { sample_code: "YVA-081126-0200-AG1", sequence: 1 }),
    sampleRow(5, "registro-4", { sample_code: "YVA-091126-0300-AG1", sequence: 1 }),
  ]);
  fakeSupabase.seed("field_parameters", [parameterRow("ph", "pH", 30), parameterRow("turbidity", "Turbidez", 80)]);
  fakeSupabase.seed("field_parameter_readings", [
    readingRow(1, "registro-1", { parameter_id: "turbidity", value: "12" }),
    readingRow(2, "registro-1"),
    readingRow(3, "registro-3"),
    readingRow(4, "registro-4"),
  ]);
});

describe("GET /api/field-diary/biolog-export", () => {
  it("devolve as amostras e as medições de todos os registros da campanha, sem cache", async () => {
    const response = await get(`?campaign=${encodeURIComponent("4ª Campanha")}`);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(payload.available).toBe(true);
    expect(payload.samples.map((sample: Record<string, unknown>) => [sample.entryId, sample.code, sample.exportedAt])).toEqual([
      ["registro-1", "YVA-071126-0136-AG1", "2026-11-09T10:00:00.000Z"],
      ["registro-1", "YVA-071126-0136-AG2", null],
      ["registro-2", "YVA-071126-0140-PL1", null],
    ]);
    expect(payload.samples[0]).toMatchObject({ depthM: 0, quantity: 1000, quantityUnit: "mL", conservation: "FILTRO_CONGELADO" });
    expect(payload.readings.map((reading: Record<string, unknown>) => [reading.entryId, reading.parameterId, reading.value])).toEqual([
      ["registro-1", "ph", 7.2],
      ["registro-1", "turbidity", 12],
    ]);
    expect(payload.parameters.map((parameter: Record<string, unknown>) => parameter.id)).toEqual(["ph", "turbidity"]);
  });

  it("aceita várias campanhas e ignora nome repetido ou vazio", async () => {
    const response = await get(
      `?campaign=${encodeURIComponent("5ª Campanha")}&campaign=${encodeURIComponent(" 4ª Campanha ")}&campaign=&campaign=${encodeURIComponent("5ª Campanha")}`,
    );
    const payload = await response.json();

    expect(payload.samples).toHaveLength(4);
    expect(payload.readings).toHaveLength(3);
    expect(fakeSupabase.operations("field_diary_entries")).toHaveLength(2);
  });

  it("campanha sem registro de campo: lista vazia, e não erro", async () => {
    const response = await get("?campaign=Nova");

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ available: true, samples: [], readings: [] });
  });

  it("lê em lotes quando a campanha tem muitos registros", async () => {
    const entries = Array.from({ length: 250 }, (_, index) => ({ id: `ponto-${index}`, campaign_name: "Grande" }));

    fakeSupabase.seed("field_diary_entries", entries);
    fakeSupabase.seed(
      "field_diary_samples",
      entries.map((entry, index) =>
        sampleRow(index + 1, entry.id, { sample_code: `YVA-071126-${String(index).padStart(4, "0")}-AG1`, sequence: 1 }),
      ),
    );

    const payload = await (await get("?campaign=Grande")).json();

    expect(payload.samples).toHaveLength(250);
    // 250 registros em lotes de 100: três leituras de amostras.
    expect(fakeSupabase.operations("field_diary_samples")).toHaveLength(3);
  });

  it("sem campanha no pedido: 400", async () => {
    expect((await get("")).status).toBe(400);
    expect((await get("?campaign=%20")).status).toBe(400);
  });

  it("banco ainda sem a tabela das amostras: indisponível, com o catálogo do padrão", async () => {
    fakeSupabase.setMissing("field_diary_samples");

    const payload = await (await get("?campaign=Nova")).json();

    expect(payload).toMatchObject({ available: false, samples: [], readings: [] });
    expect(payload.parameters).toHaveLength(8);
  });

  it("banco ainda sem as tabelas dos parâmetros: a planilha sai só com as amostras", async () => {
    fakeSupabase.setMissing("field_parameters");
    fakeSupabase.setMissing("field_parameter_readings");

    const payload = await (await get(`?campaign=${encodeURIComponent("4ª Campanha")}`)).json();

    expect(payload.available).toBe(true);
    expect(payload.samples).toHaveLength(3);
    expect(payload.readings).toEqual([]);
    expect(payload.parameters).toHaveLength(8);
  });

  it("falha do banco vira erro, e não planilha vazia", async () => {
    fakeSupabase.failOn("field_diary_samples", "select", { code: "57014", message: "timeout" });
    expect((await get(`?campaign=${encodeURIComponent("4ª Campanha")}`)).status).toBe(500);

    fakeSupabase.failOn("field_diary_samples", "select", null);
    fakeSupabase.failOn("field_parameter_readings", "select", { code: "57014", message: "timeout" });
    expect((await get(`?campaign=${encodeURIComponent("4ª Campanha")}`)).status).toBe(500);

    fakeSupabase.failOn("field_parameter_readings", "select", null);
    fakeSupabase.failOn("field_diary_entries", "select", { code: "57014", message: "timeout" });
    expect((await get(`?campaign=${encodeURIComponent("4ª Campanha")}`)).status).toBe(500);
  });

  it("exige sessão", async () => {
    auth.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) });

    expect((await get("?campaign=Nova")).status).toBe(401);
    expect(fakeSupabase.operations()).toEqual([]);
  });
});

describe("POST /api/field-diary/biolog-export", () => {
  it("marca as amostras como exportadas e registra no histórico de cada registro", async () => {
    const response = await post({ sampleIds: [id(2), id(3), id(4)] });
    const payload = await response.json();
    const rows = fakeSupabase.rows("field_diary_samples");

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ available: true, marked: 3 });
    expect(payload.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(rows.filter((row) => row.exported_at === payload.exportedAt).map((row) => row.id)).toEqual([id(2), id(3), id(4)]);
    // Quem não foi pedida continua sem marca.
    expect(rows.find((row) => row.id === id(5))?.exported_at).toBeNull();
    expect(fakeSupabase.rows("field_diary_change_log")).toEqual([
      {
        entry_id: "registro-1",
        campaign_name: "4ª Campanha",
        field_name: "Exportação para o Biolog",
        old_value: null,
        new_value: "YVA-071126-0136-AG2",
        origin: "app",
        changed_by: "Equipe A",
      },
      expect.objectContaining({ entry_id: "registro-2", new_value: "YVA-071126-0140-PL1" }),
      expect.objectContaining({ entry_id: "registro-3", campaign_name: "5ª Campanha", new_value: "YVA-081126-0200-AG1" }),
    ]);
    expect(auth).toHaveBeenCalledWith(expect.anything(), "data.import");
  });

  it("quem já estava marcada fica com a data da primeira exportação", async () => {
    const payload = await (await post({ sampleIds: [id(1), id(2), id(2)] })).json();
    const rows = fakeSupabase.rows("field_diary_samples");

    expect(payload.marked).toBe(1);
    expect(rows.find((row) => row.id === id(1))?.exported_at).toBe("2026-11-09T10:00:00.000Z");
    expect(fakeSupabase.rows("field_diary_change_log")).toHaveLength(1);
  });

  it("exportar de novo sem amostra nova não mexe em nada nem escreve histórico", async () => {
    const payload = await (await post({ sampleIds: [id(1)] })).json();

    expect(payload).toMatchObject({ available: true, marked: 0 });
    expect(fakeSupabase.rows("field_diary_change_log")).toEqual([]);
  });

  it("banco ainda sem a coluna da marca: responde indisponível, sem erro", async () => {
    fakeSupabase.failOn("field_diary_samples", "update", {
      code: "PGRST204",
      message: "Could not find the 'exported_at' column of 'field_diary_samples' in the schema cache",
    });

    const response = await post({ sampleIds: [id(2)] });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: false, marked: 0 });
    expect(fakeSupabase.rows("field_diary_change_log")).toEqual([]);
  });

  it("outra falha do banco: 500, e nada no histórico", async () => {
    fakeSupabase.failOn("field_diary_samples", "update", { code: "57014", message: "timeout" });

    const response = await post({ sampleIds: [id(2)] });

    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe("Não foi possível marcar as amostras como exportadas.");
    expect(fakeSupabase.rows("field_diary_change_log")).toEqual([]);
  });

  it("se o histórico falhar, as amostras continuam marcadas", async () => {
    fakeSupabase.failOn("field_diary_change_log", "insert", { code: "42501", message: "denied" });

    const response = await post({ sampleIds: [id(2)] });

    expect(response.status).toBe(200);
    expect((await response.json()).marked).toBe(1);
  });

  it("recusa lista vazia, identificador que não é de amostra e corpo inválido", async () => {
    expect((await post({ sampleIds: [] })).status).toBe(400);
    expect((await post({ sampleIds: ["registro-1"] })).status).toBe(400);
    expect((await post({ sampleIds: "todas" })).status).toBe(400);
    expect((await post(null)).status).toBe(400);
    expect(fakeSupabase.operations("field_diary_samples")).toEqual([]);
  });

  it("exige a permissão de gravar registro de campo", async () => {
    auth.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });

    expect((await post({ sampleIds: [id(2)] })).status).toBe(403);
    expect(fakeSupabase.operations()).toEqual([]);
  });
});
