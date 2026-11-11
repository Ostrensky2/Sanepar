import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_FIELD_PARAMETERS } from "@/lib/field-parameters";
import { baseFieldParameters } from "@/lib/field-standard";
import { fakeSupabase, type FakeRow } from "@/test/fake-supabase";

// Catálogo de parâmetros medidos em campo: os oito do padrão, mais os que a equipe cria.

const auth = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api-auth", () => ({ requireApiSession: auth }));
vi.mock("@/lib/supabase", async () => {
  const { fakeSupabase: fake } = await import("@/test/fake-supabase");
  return { createOptionalSupabaseClient: () => fake.client() };
});

import { GET, PATCH, POST } from "@/app/api/field-diary/parameters/route";

const TABLE = "field_parameters";
const URL = "https://example.test/api/field-diary/parameters";

function baseRows(): FakeRow[] {
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

function customRow(overrides: FakeRow = {}): FakeRow {
  return {
    id: "clorofila_a",
    label: "Clorofila a",
    unit: "µg/L",
    min_value: 0,
    max_value: 500,
    applies_to: ["water", "plankton"],
    uses_depth: true,
    biolog_column: null,
    is_base: false,
    active: true,
    sort_order: 1000,
    ...overrides,
  };
}

function send(method: "POST" | "PATCH", body: unknown) {
  const handler = method === "POST" ? POST : PATCH;

  return handler(
    new Request(URL, {
      method,
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  auth.mockReset();
  auth.mockResolvedValue({ ok: true, session: { name: "Vilmar" } });
  fakeSupabase.reset();
  fakeSupabase.seed(TABLE, baseRows());
  // O índice único do banco em lower(label).
  fakeSupabase.addConstraint(TABLE, (incoming, others) =>
    others.some((row) => String(row.label).toLowerCase() === String(incoming.label).toLowerCase())
      ? { code: "23505", message: "duplicate key value violates unique constraint" }
      : null,
  );
});

describe("GET /api/field-diary/parameters", () => {
  it("lista o catálogo para qualquer pessoa com sessão, com os desativados", async () => {
    fakeSupabase.rows(TABLE).push(customRow({ active: false }));

    const response = await GET(new Request(URL));
    const body = await response.json();

    expect(auth).toHaveBeenCalledWith(expect.any(Request));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body.available).toBe(true);
    expect(body.parameters).toHaveLength(9);
    expect(body.parameters.find((parameter: { id: string }) => parameter.id === "clorofila_a")).toMatchObject({
      label: "Clorofila a",
      active: false,
      isBase: false,
    });
  });

  it("devolve os oito do padrão enquanto o banco não tem a tabela", async () => {
    fakeSupabase.setMissing(TABLE);

    const response = await GET(new Request(URL));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.available).toBe(false);
    expect(body.parameters.map((parameter: { id: string }) => parameter.id)).toEqual(
      baseFieldParameters.map((parameter) => parameter.id),
    );
  });

  it("não lista nada sem sessão", async () => {
    auth.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) });

    const response = await GET(new Request(URL));

    expect(response.status).toBe(401);
    expect(fakeSupabase.operations()).toEqual([]);
  });

  it("avisa quando a consulta ao catálogo falha", async () => {
    fakeSupabase.failOn(TABLE, "select", { code: "57014", message: "timeout" });

    const response = await GET(new Request(URL));

    expect(response.status).toBe(500);
  });
});

describe("POST /api/field-diary/parameters", () => {
  it("pede a permissão de gravar dados", async () => {
    await send("POST", { label: "Clorofila a" });

    expect(auth).toHaveBeenCalledWith(expect.any(Request), "data.import");
  });

  it("cria o parâmetro com identificador próprio, ativo e fora do padrão", async () => {
    const response = await send("POST", {
      label: "  Clorofila   a ",
      unit: "µg/L",
      min: "0",
      max: "500",
      appliesTo: ["water", "plankton"],
      usesDepth: true,
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.parameter).toMatchObject({
      id: "clorofila_a",
      label: "Clorofila a",
      unit: "µg/L",
      min: 0,
      max: 500,
      appliesTo: ["water", "plankton"],
      usesDepth: true,
      isBase: false,
      active: true,
      biologColumn: null,
    });
    expect(fakeSupabase.rows(TABLE).find((row) => row.id === "clorofila_a")).toMatchObject({
      is_base: false,
      active: true,
      created_by: "Vilmar",
    });
  });

  it("recusa nome que já existe e devolve o parâmetro do catálogo", async () => {
    const response = await send("POST", { label: "condutividade" });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("Já existe um parâmetro chamado “Condutividade”");
    expect(body.parameter.id).toBe("conductivity");
    expect(fakeSupabase.rows(TABLE)).toHaveLength(8);
  });

  it("explica quando o nome repetido é de um parâmetro desativado", async () => {
    fakeSupabase.rows(TABLE).push(customRow({ active: false }));

    const response = await send("POST", { label: "CLOROFILA A" });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("está desativado");
    expect(body.parameter.id).toBe("clorofila_a");
  });

  it("recusa dado inválido sem gravar", async () => {
    const semNome = await send("POST", { label: "   " });
    const faixaInvertida = await send("POST", { label: "Clorofila a", min: 10, max: 5 });
    const semTipo = await send("POST", { label: "Clorofila a", appliesTo: [] });
    const corpoRuim = await send("POST", "isto não é JSON");

    expect(semNome.status).toBe(400);
    expect(faixaInvertida.status).toBe(400);
    expect(semTipo.status).toBe(400);
    expect(corpoRuim.status).toBe(400);
    expect(fakeSupabase.rows(TABLE)).toHaveLength(8);
    expect(fakeSupabase.operations(TABLE)).not.toContain(`${TABLE}:insert`);
  });

  it("não repete identificador quando o nome novo cai no de um parâmetro que já existe", async () => {
    fakeSupabase.rows(TABLE).push(customRow({ id: "cloro", label: "Cloro residual" }));

    const response = await send("POST", { label: "Cloro" });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.parameter.id).toBe("cloro_2");
  });

  it("para de aceitar parâmetros quando o catálogo enche", async () => {
    const extras = Array.from({ length: MAX_FIELD_PARAMETERS - 8 }, (_, index) =>
      customRow({ id: `extra_${index}`, label: `Extra ${index}` }),
    );
    fakeSupabase.rows(TABLE).push(...extras);

    const response = await send("POST", { label: "Clorofila a" });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain(`até ${MAX_FIELD_PARAMETERS} parâmetros`);
  });

  it("responde 503 enquanto o banco não tem a tabela", async () => {
    fakeSupabase.setMissing(TABLE);

    const response = await send("POST", { label: "Clorofila a" });
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.available).toBe(false);
  });

  it("avisa quando outra pessoa cria o mesmo nome no mesmo instante", async () => {
    fakeSupabase.failOn(TABLE, "insert", { code: "23505", message: "duplicate key value" });

    const response = await send("POST", { label: "Clorofila a" });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("Outra pessoa acabou de criar");
  });

  it("não cria nada sem permissão", async () => {
    auth.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });

    const response = await send("POST", { label: "Clorofila a" });

    expect(response.status).toBe(403);
    expect(fakeSupabase.operations()).toEqual([]);
  });
});

describe("PATCH /api/field-diary/parameters", () => {
  beforeEach(() => {
    fakeSupabase.rows(TABLE).push(customRow());
  });

  it("pede a permissão de gravar dados", async () => {
    await send("PATCH", { id: "clorofila_a", active: false });

    expect(auth).toHaveBeenCalledWith(expect.any(Request), "data.import");
  });

  it("desativa e reativa um parâmetro do padrão sem mexer na definição", async () => {
    const off = await send("PATCH", { id: "salinity", active: false });
    const offBody = await off.json();

    expect(off.status).toBe(200);
    expect(offBody.parameter).toMatchObject({ id: "salinity", active: false, label: "Salinidade", isBase: true });

    const on = await send("PATCH", { id: "salinity", active: true });

    expect((await on.json()).parameter.active).toBe(true);
  });

  it("não deixa alterar a definição de um parâmetro do padrão", async () => {
    const response = await send("PATCH", { id: "ph", label: "Potencial hidrogeniônico" });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("não podem ser alterados");
    expect(fakeSupabase.rows(TABLE).find((row) => row.id === "ph")?.label).toBe("pH");
    expect(fakeSupabase.operations(TABLE)).not.toContain(`${TABLE}:update`);
  });

  it("altera um parâmetro criado pela equipe, mantendo o que não foi enviado", async () => {
    const response = await send("PATCH", { id: "clorofila_a", unit: "mg/m³", max: null });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.parameter).toMatchObject({
      id: "clorofila_a",
      label: "Clorofila a",
      unit: "mg/m³",
      min: 0,
      max: null,
      appliesTo: ["water", "plankton"],
    });
  });

  it("recusa trocar o nome para o de outro parâmetro", async () => {
    const response = await send("PATCH", { id: "clorofila_a", label: "Turbidez" });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.parameter.id).toBe("turbidity");
    expect(fakeSupabase.rows(TABLE).find((row) => row.id === "clorofila_a")?.label).toBe("Clorofila a");
  });

  it("aceita gravar de novo o próprio nome", async () => {
    const response = await send("PATCH", { id: "clorofila_a", label: "Clorofila A" });

    expect(response.status).toBe(200);
    expect((await response.json()).parameter.label).toBe("Clorofila A");
  });

  it("recusa pedido sem alteração, identificador inválido e parâmetro que não existe", async () => {
    const semMudanca = await send("PATCH", { id: "clorofila_a" });
    const idInvalido = await send("PATCH", { id: "Clorofila A; drop table", active: false });
    const inexistente = await send("PATCH", { id: "nao_existe", active: false });

    expect(semMudanca.status).toBe(400);
    expect(idInvalido.status).toBe(400);
    expect(inexistente.status).toBe(404);
    expect(fakeSupabase.operations(TABLE)).not.toContain(`${TABLE}:update`);
  });

  it("recusa definição inválida num parâmetro da equipe", async () => {
    const response = await send("PATCH", { id: "clorofila_a", min: 600 });

    expect(response.status).toBe(400);
    expect(fakeSupabase.rows(TABLE).find((row) => row.id === "clorofila_a")?.min_value).toBe(0);
  });

  it("responde 503 enquanto o banco não tem a tabela", async () => {
    fakeSupabase.setMissing(TABLE);

    const response = await send("PATCH", { id: "clorofila_a", active: false });

    expect(response.status).toBe(503);
  });
});
