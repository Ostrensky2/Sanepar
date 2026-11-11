import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_READINGS_PER_ENTRY } from "@/lib/field-parameters";
import { baseFieldParameters } from "@/lib/field-standard";
import { fakeSupabase, type FakeRow } from "@/test/fake-supabase";

// Parâmetros medidos num registro de campo: leitura e gravação, com uma medição
// por parâmetro e profundidade.

const auth = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api-auth", () => ({ requireApiSession: auth }));
vi.mock("@/lib/supabase", async () => {
  const { fakeSupabase: fake } = await import("@/test/fake-supabase");
  return { createOptionalSupabaseClient: () => fake.client() };
});

import { GET, PUT } from "@/app/api/field-diary/readings/route";

const CATALOG = "field_parameters";
const READINGS = "field_parameter_readings";
const LOG = "field_diary_change_log";
const URL = "https://example.test/api/field-diary/readings";
const ENTRY = "registro-1";

const ID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ID_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ID_D = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function catalogRows(): FakeRow[] {
  return baseFieldParameters.map((parameter, index) => ({
    id: parameter.id,
    label: parameter.label,
    unit: parameter.unit,
    min_value: parameter.min,
    max_value: parameter.max,
    applies_to: [...parameter.appliesTo],
    uses_depth: parameter.usesDepth,
    biolog_column: parameter.biologColumn,
    is_base: true,
    active: true,
    sort_order: (index + 1) * 10,
  }));
}

function savedRow(overrides: FakeRow): FakeRow {
  return {
    entry_id: ENTRY,
    unit: "",
    depth_m: 0,
    measured_time: null,
    equipment: null,
    ...overrides,
  };
}

function reading(overrides: Record<string, unknown>) {
  return { depthM: 0, measuredTime: "", equipment: "", ...overrides };
}

function put(body: unknown) {
  return PUT(
    new Request(URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

function saved() {
  return fakeSupabase.rows(READINGS);
}

beforeEach(() => {
  auth.mockReset();
  auth.mockResolvedValue({ ok: true, session: { name: "Vilmar" } });
  fakeSupabase.reset();
  fakeSupabase.seed(CATALOG, catalogRows());
  fakeSupabase.seed("field_diary_entries", [
    { id: ENTRY, campaign_name: "4ª Campanha" },
    { id: "registro-2", campaign_name: "4ª Campanha" },
  ]);
  fakeSupabase.seed(READINGS, []);
  // O índice único do banco: (entry_id, parameter_id, coalesce(depth_m, -1)).
  fakeSupabase.addConstraint(READINGS, (incoming, others) =>
    others.some(
      (row) =>
        row.entry_id === incoming.entry_id &&
        row.parameter_id === incoming.parameter_id &&
        (row.depth_m ?? -1) === (incoming.depth_m ?? -1),
    )
      ? { code: "23505", message: "duplicate key value violates unique constraint" }
      : null,
  );
});

describe("GET /api/field-diary/readings", () => {
  it("devolve o catálogo e as medições do registro, na ordem do catálogo", async () => {
    fakeSupabase.seed(READINGS, [
      savedRow({ id: ID_B, parameter_id: "ph", value: "7.2", depth_m: 5 }),
      savedRow({ id: ID_A, parameter_id: "ph", value: 7.4 }),
      savedRow({ id: ID_C, parameter_id: "air_temperature", value: 24.5, unit: "°C", depth_m: null }),
      savedRow({ id: ID_D, entry_id: "registro-2", parameter_id: "ph", value: 6 }),
    ]);

    const response = await GET(new Request(`${URL}?entryId=${ENTRY}`));
    const body = await response.json();

    expect(auth).toHaveBeenCalledWith(expect.any(Request));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body.available).toBe(true);
    expect(body.parameters).toHaveLength(8);
    expect(body.readings.map((item: { id: string }) => item.id)).toEqual([ID_C, ID_A, ID_B]);
    expect(body.readings[2]).toMatchObject({ entryId: ENTRY, parameterId: "ph", value: 7.2, depthM: 5 });
  });

  it("sem registro, devolve só o catálogo", async () => {
    const response = await GET(new Request(URL));
    const body = await response.json();

    expect(body).toMatchObject({ available: true, readings: [] });
    expect(body.parameters).toHaveLength(8);
    expect(fakeSupabase.operations(READINGS)).toEqual([]);
  });

  it("segue sem o bloco de parâmetros enquanto o banco não tem as tabelas", async () => {
    fakeSupabase.setMissing(CATALOG);
    fakeSupabase.setMissing(READINGS);

    const response = await GET(new Request(`${URL}?entryId=${ENTRY}`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.available).toBe(false);
    expect(body.readings).toEqual([]);
    expect(body.parameters).toHaveLength(8);
  });

  it("não devolve nada sem sessão", async () => {
    auth.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) });

    const response = await GET(new Request(`${URL}?entryId=${ENTRY}`));

    expect(response.status).toBe(401);
    expect(fakeSupabase.operations()).toEqual([]);
  });
});

describe("PUT /api/field-diary/readings", () => {
  it("pede a permissão de gravar dados", async () => {
    await put({ entryId: ENTRY, readings: [] });

    expect(auth).toHaveBeenCalledWith(expect.any(Request), "data.import");
  });

  it("grava as medições com a unidade do catálogo", async () => {
    const response = await put({
      entryId: ENTRY,
      readings: [
        reading({ id: ID_A, parameterId: "conductivity", value: 120.5, measuredTime: "09:42", equipment: " Sonda YSI " }),
        reading({ id: ID_B, parameterId: "ph", value: 7.2, depthM: 5 }),
      ],
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.available).toBe(true);
    expect(body.readings).toHaveLength(2);
    expect(saved().find((row) => row.id === ID_A)).toMatchObject({
      entry_id: ENTRY,
      parameter_id: "conductivity",
      value: 120.5,
      unit: "µS/cm",
      depth_m: 0,
      measured_time: "09:42",
      equipment: "Sonda YSI",
    });
    expect(saved().find((row) => row.id === ID_B)).toMatchObject({ unit: "", depth_m: 5, measured_time: null, equipment: null });
  });

  it("não guarda profundidade em parâmetro que não é medido numa profundidade", async () => {
    const response = await put({
      entryId: ENTRY,
      readings: [reading({ id: ID_A, parameterId: "air_temperature", value: 24, depthM: 3 })],
    });

    expect(response.status).toBe(200);
    expect(saved()[0]).toMatchObject({ parameter_id: "air_temperature", depth_m: null, unit: "°C" });
  });

  it("escreve uma linha no histórico do registro quando as medições mudam", async () => {
    await put({
      entryId: ENTRY,
      readings: [
        reading({ id: ID_A, parameterId: "ph", value: 7.2 }),
        reading({ id: ID_B, parameterId: "conductivity", value: 120, depthM: 5 }),
      ],
    });

    expect(fakeSupabase.rows(LOG)).toEqual([
      expect.objectContaining({
        entry_id: ENTRY,
        campaign_name: "4ª Campanha",
        field_name: "Parâmetros",
        old_value: null,
        new_value: "pH 7,2; Condutividade 120 µS/cm (5 m)",
        origin: "app",
        changed_by: "Vilmar",
      }),
    ]);
  });

  it("não escreve no histórico quando nada mudou", async () => {
    fakeSupabase.seed(READINGS, [savedRow({ id: ID_A, parameter_id: "ph", value: 7.2 })]);

    const response = await put({ entryId: ENTRY, readings: [reading({ id: ID_A, parameterId: "ph", value: 7.2 })] });

    expect(response.status).toBe(200);
    expect(fakeSupabase.rows(LOG)).toEqual([]);
  });

  it("grava as medições mesmo se o histórico falhar", async () => {
    fakeSupabase.failOn(LOG, "insert", { code: "42501", message: "permission denied" });

    const response = await put({ entryId: ENTRY, readings: [reading({ id: ID_A, parameterId: "ph", value: 7.2 })] });

    expect(response.status).toBe(200);
    expect(saved()).toHaveLength(1);
  });

  it("remove só as medições retiradas que são deste registro", async () => {
    fakeSupabase.seed(READINGS, [
      savedRow({ id: ID_A, parameter_id: "ph", value: 7.2 }),
      savedRow({ id: ID_B, parameter_id: "salinity", value: 30, unit: "ups" }),
      savedRow({ id: ID_D, entry_id: "registro-2", parameter_id: "ph", value: 6 }),
    ]);

    const response = await put({ entryId: ENTRY, readings: [], removedIds: [ID_B, ID_D, "qualquer coisa"] });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.readings.map((item: { id: string }) => item.id)).toEqual([ID_A]);
    expect(saved().map((row) => row.id)).toEqual([ID_A, ID_D]);
  });

  it("mantém a medição que veio na lista, mesmo marcada como retirada", async () => {
    fakeSupabase.seed(READINGS, [savedRow({ id: ID_A, parameter_id: "ph", value: 7.2 })]);

    await put({ entryId: ENTRY, readings: [reading({ id: ID_A, parameterId: "ph", value: 7.5 })], removedIds: [ID_A] });

    expect(saved()).toEqual([expect.objectContaining({ id: ID_A, value: 7.5 })]);
  });

  it("aceita a medição gravada que mudou de profundidade e outra no lugar dela", async () => {
    fakeSupabase.seed(READINGS, [savedRow({ id: ID_A, parameter_id: "ph", value: 7.2 })]);

    const response = await put({
      entryId: ENTRY,
      readings: [
        reading({ id: ID_B, parameterId: "ph", value: 7.4 }),
        reading({ id: ID_A, parameterId: "ph", value: 7.2, depthM: 5 }),
      ],
    });

    expect(response.status).toBe(200);
    expect(saved()).toHaveLength(2);
    expect(saved().find((row) => row.id === ID_A)?.depth_m).toBe(5);
    expect(saved().find((row) => row.id === ID_B)?.depth_m).toBe(0);
  });

  it("aceita trocar as profundidades de duas medições gravadas", async () => {
    fakeSupabase.seed(READINGS, [
      savedRow({ id: ID_A, parameter_id: "ph", value: 7.2 }),
      savedRow({ id: ID_B, parameter_id: "ph", value: 7.4, depth_m: 5 }),
    ]);

    const response = await put({
      entryId: ENTRY,
      readings: [
        reading({ id: ID_A, parameterId: "ph", value: 7.2, depthM: 5 }),
        reading({ id: ID_B, parameterId: "ph", value: 7.4, depthM: 0 }),
      ],
    });

    expect(response.status).toBe(200);
    expect(saved().find((row) => row.id === ID_A)?.depth_m).toBe(5);
    expect(saved().find((row) => row.id === ID_B)?.depth_m).toBe(0);
  });

  it("aceita substituir uma medição retirada por outra do mesmo parâmetro", async () => {
    fakeSupabase.seed(READINGS, [savedRow({ id: ID_A, parameter_id: "ph", value: 7.2 })]);

    const response = await put({
      entryId: ENTRY,
      readings: [reading({ id: ID_B, parameterId: "ph", value: 6.9 })],
      removedIds: [ID_A],
    });

    expect(response.status).toBe(200);
    expect(saved()).toEqual([expect.objectContaining({ id: ID_B, value: 6.9 })]);
  });

  it("não mexe em nada quando outro aparelho já gravou a mesma medição", async () => {
    fakeSupabase.seed(READINGS, [savedRow({ id: ID_A, parameter_id: "ph", value: 7.2 })]);

    const response = await put({
      entryId: ENTRY,
      readings: [
        reading({ id: ID_B, parameterId: "ph", value: 6.8 }),
        reading({ id: ID_C, parameterId: "salinity", value: 30 }),
      ],
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.conflict).toBe(true);
    expect(body.error).toContain("pH na superfície já tem medição gravada");
    expect(body.readings).toEqual([expect.objectContaining({ id: ID_A, value: 7.2 })]);
    expect(saved()).toEqual([expect.objectContaining({ id: ID_A, value: 7.2 })]);
    expect(fakeSupabase.rows(LOG)).toEqual([]);
  });

  it("avisa quando o banco recusa por medição repetida no mesmo instante", async () => {
    fakeSupabase.failOn(READINGS, "upsert", { code: "23505", message: "duplicate key value" });

    const response = await put({ entryId: ENTRY, readings: [reading({ id: ID_A, parameterId: "ph", value: 7.2 })] });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.conflict).toBe(true);
    expect(fakeSupabase.rows(LOG)).toEqual([]);
  });

  it("recusa a mesma medição duas vezes no envio", async () => {
    const mesmoParametro = await put({
      entryId: ENTRY,
      readings: [
        reading({ id: ID_A, parameterId: "ph", value: 7.2, depthM: 5 }),
        reading({ id: ID_B, parameterId: "ph", value: 7.4, depthM: 5 }),
      ],
    });
    const mesmoId = await put({
      entryId: ENTRY,
      readings: [
        reading({ id: ID_A, parameterId: "ph", value: 7.2 }),
        reading({ id: ID_A, parameterId: "salinity", value: 30 }),
      ],
    });
    // Sem profundidade no parâmetro, duas profundidades diferentes viram a mesma medição.
    const semProfundidade = await put({
      entryId: ENTRY,
      readings: [
        reading({ id: ID_A, parameterId: "air_temperature", value: 24, depthM: 0 }),
        reading({ id: ID_B, parameterId: "air_temperature", value: 25, depthM: 5 }),
      ],
    });

    expect(mesmoParametro.status).toBe(400);
    expect((await mesmoParametro.json()).error).toContain("pH a 5 m de profundidade aparece duas vezes");
    expect(mesmoId.status).toBe(400);
    expect(semProfundidade.status).toBe(400);
    expect((await semProfundidade.json()).error).toContain("Temperatura do ar aparece duas vezes");
    expect(saved()).toEqual([]);
  });

  it("recusa medição com dado inválido ou de parâmetro fora do catálogo", async () => {
    const valorTexto = await put({ entryId: ENTRY, readings: [reading({ id: ID_A, parameterId: "ph", value: "7,2" })] });
    const horaRuim = await put({
      entryId: ENTRY,
      readings: [reading({ id: ID_A, parameterId: "ph", value: 7.2, measuredTime: "25:00" })],
    });
    const profundidadeNegativa = await put({
      entryId: ENTRY,
      readings: [reading({ id: ID_A, parameterId: "ph", value: 7.2, depthM: -1 })],
    });
    const semId = await put({ entryId: ENTRY, readings: [reading({ id: "1", parameterId: "ph", value: 7.2 })] });
    const foraDoCatalogo = await put({
      entryId: ENTRY,
      readings: [reading({ id: ID_A, parameterId: "clorofila_a", value: 3 })],
    });

    expect(valorTexto.status).toBe(400);
    expect(horaRuim.status).toBe(400);
    expect(profundidadeNegativa.status).toBe(400);
    expect(semId.status).toBe(400);
    expect(foraDoCatalogo.status).toBe(400);
    expect((await foraDoCatalogo.json()).error).toContain("não está no catálogo");
    expect(saved()).toEqual([]);
  });

  it("recusa envio sem registro, sem lista ou grande demais", async () => {
    const semRegistro = await put({ readings: [] });
    const semLista = await put({ entryId: ENTRY });
    const corpoRuim = await put("isto não é JSON");
    const grande = await put({
      entryId: ENTRY,
      readings: Array.from({ length: MAX_READINGS_PER_ENTRY + 1 }, () => reading({ id: ID_A, parameterId: "ph", value: 7 })),
    });

    expect(semRegistro.status).toBe(400);
    expect(semLista.status).toBe(400);
    expect(corpoRuim.status).toBe(400);
    expect(grande.status).toBe(400);
    expect(fakeSupabase.operations(READINGS)).toEqual([]);
  });

  it("recusa medição que pertence a outro registro de campo", async () => {
    fakeSupabase.seed(READINGS, [savedRow({ id: ID_D, entry_id: "registro-2", parameter_id: "ph", value: 6 })]);

    const response = await put({ entryId: ENTRY, readings: [reading({ id: ID_D, parameterId: "ph", value: 9 })] });

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("pertence a outro registro");
    expect(saved()).toEqual([expect.objectContaining({ id: ID_D, entry_id: "registro-2", value: 6 })]);
  });

  it("responde 404 quando o registro de campo não existe", async () => {
    const response = await put({
      entryId: "registro-inexistente",
      readings: [reading({ id: ID_A, parameterId: "ph", value: 7.2 })],
    });

    expect(response.status).toBe(404);
    expect(saved()).toEqual([]);
  });

  it("responde 503 enquanto o banco não tem as tabelas", async () => {
    fakeSupabase.setMissing(CATALOG);
    fakeSupabase.setMissing(READINGS);

    const response = await put({ entryId: ENTRY, readings: [reading({ id: ID_A, parameterId: "ph", value: 7.2 })] });
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.available).toBe(false);
    expect(body.error).toContain("O registro de campo foi salvo; as medições não.");
  });

  it("não grava nada sem permissão", async () => {
    auth.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });

    const response = await put({ entryId: ENTRY, readings: [reading({ id: ID_A, parameterId: "ph", value: 7.2 })] });

    expect(response.status).toBe(403);
    expect(fakeSupabase.operations()).toEqual([]);
  });
});
