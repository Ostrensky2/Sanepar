import { beforeEach, describe, expect, it, vi } from "vitest";

// Amostras do ponto: leitura e gravação, com o código da etiqueta calculado no
// servidor e nunca repetido.

type Row = Record<string, unknown>;
type DbError = { code: string; message: string };

const db = vi.hoisted(() => ({
  auth: vi.fn(),
  entries: [] as Array<Record<string, unknown>>,
  samples: [] as Array<Record<string, unknown>>,
  changeLog: [] as Array<Record<string, unknown>>,
  samplesTableMissing: false,
  upsertError: null as { code: string; message: string } | null,
}));

vi.mock("@/lib/api-auth", () => ({ requireApiSession: db.auth }));
vi.mock("@/lib/supabase", () => ({
  createOptionalSupabaseClient: () => ({
    from: (table: string) => {
      const rowsOf = () =>
        table === "field_diary_samples" ? db.samples : table === "field_diary_entries" ? db.entries : db.changeLog;
      const filters: Array<(row: Row) => boolean> = [];
      let operation: "select" | "delete" | "upsert" | "insert" = "select";
      let payload: Row[] = [];
      let limit: number | null = null;

      const run = (): { data: Row[] | null; error: DbError | null } => {
        if (table === "field_diary_samples" && db.samplesTableMissing) {
          return { data: null, error: { code: "PGRST205", message: "Could not find the table in the schema cache" } };
        }

        const matches = (row: Row) => filters.every((filter) => filter(row));

        if (operation === "select") {
          const rows = rowsOf().filter(matches);
          return { data: (limit === null ? rows : rows.slice(0, limit)).map((row) => ({ ...row })), error: null };
        }

        if (operation === "delete") {
          const kept = rowsOf().filter((row) => !matches(row));
          rowsOf().splice(0, rowsOf().length, ...kept);
          return { data: null, error: null };
        }

        if (operation === "upsert") {
          if (db.upsertError) return { data: null, error: db.upsertError };

          // Mesmo que o índice único do banco: código repetido em outra linha recusa tudo.
          if (payload.some((row) => db.samples.some((saved) => saved.sample_code === row.sample_code && saved.id !== row.id))) {
            return { data: null, error: { code: "23505", message: "duplicate key value" } };
          }

          for (const row of payload) {
            const index = db.samples.findIndex((saved) => saved.id === row.id);
            if (index >= 0) db.samples[index] = { ...db.samples[index], ...row };
            else db.samples.push({ ...row });
          }
          return { data: null, error: null };
        }

        rowsOf().push(...payload);
        return { data: null, error: null };
      };

      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          filters.push((row) => row[column] === value);
          return query;
        },
        in: (column: string, values: unknown[]) => {
          filters.push((row) => values.includes(row[column]));
          return query;
        },
        like: (column: string, pattern: string) => {
          filters.push((row) => String(row[column]).startsWith(pattern.replace(/%$/, "")));
          return query;
        },
        limit: (count: number) => {
          limit = count;
          return query;
        },
        delete: () => {
          operation = "delete";
          return query;
        },
        upsert: (rows: Row[]) => {
          operation = "upsert";
          payload = rows;
          return query;
        },
        insert: (row: Row) => {
          operation = "insert";
          payload = [row];
          return query;
        },
        returns: async () => run(),
        maybeSingle: async () => {
          const result = run();
          return { data: result.data?.[0] ?? null, error: result.error };
        },
        then: (resolve: (value: ReturnType<typeof run>) => unknown) => Promise.resolve(run()).then(resolve),
      };

      return query;
    },
  }),
}));

import { GET, PUT } from "@/app/api/field-diary/samples/route";

const ENTRY = "6f1f8d1e-2b7a-4a43-9a51-0d6c1f0f5a11";
const OTHER_ENTRY = "0b0b0b0b-2b7a-4a43-9a51-0d6c1f0f5a22";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function sample(n: number, overrides: Row = {}) {
  return {
    id: id(n),
    sampleType: "water",
    sequence: n,
    depthM: 0,
    quantity: 1000,
    conservation: "FILTRO_CONGELADO",
    packaging: "Isopor com gelo",
    specification: "eDNA",
    boxPosition: "",
    ...overrides,
  };
}

function savedRow(n: number, overrides: Row = {}) {
  return {
    id: id(n),
    entry_id: ENTRY,
    sample_code: `YVA-0136-071126-0905-AG${n}`,
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
    ...overrides,
  };
}

function put(body: Row) {
  return PUT(
    new Request("https://example.test/api/field-diary/samples", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

const body = (overrides: Row = {}) => ({ entryId: ENTRY, projectCode: "YVA", samples: [sample(1)], removedIds: [], ...overrides });
const codes = () => db.samples.map((row) => row.sample_code).sort();

beforeEach(() => {
  db.auth.mockReset();
  db.auth.mockResolvedValue({ ok: true, session: { name: "Equipe A", email: "a@example.test" } });
  db.entries = [
    { id: ENTRY, campaign_name: "4ª Campanha", entry_date: "2026-11-07", collection_time: "09:05:00", sia: "SIA-0136" },
    { id: OTHER_ENTRY, campaign_name: "Ação pontual", entry_date: "2026-11-07", collection_time: "09:05:00", sia: "136" },
  ];
  db.samples = [];
  db.changeLog = [];
  db.samplesTableMissing = false;
  db.upsertError = null;
});

describe("GET /api/field-diary/samples", () => {
  it("lista as amostras do registro na ordem do padrão, sem cache", async () => {
    db.samples = [
      savedRow(9, { sample_code: "YVA-0136-071126-0905-PL1", sample_type: "plankton", sequence: 1, quantity: null }),
      savedRow(2),
      savedRow(1, { box_position: "A1" }),
      savedRow(5, { entry_id: OTHER_ENTRY, sample_code: "YVA-0136-081126-0905-AG1" }),
    ];

    const response = await GET(new Request(`https://example.test/api/field-diary/samples?entryId=${ENTRY}`));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload.available).toBe(true);
    expect(payload.samples.map((item: Row) => item.code)).toEqual([
      "YVA-0136-071126-0905-AG1",
      "YVA-0136-071126-0905-AG2",
      "YVA-0136-071126-0905-PL1",
    ]);
    expect(payload.samples[0]).toMatchObject({ depthM: 0, quantity: 1000, quantityUnit: "mL", boxPosition: "A1", entryId: ENTRY });
    expect(payload.samples[2].quantity).toBeNull();
  });

  it("diz quais amostras já saíram na planilha do Biolog", async () => {
    db.samples = [savedRow(1, { exported_at: "2026-11-09T10:00:00.000Z" }), savedRow(2, { exported_at: null }), savedRow(3)];

    const response = await GET(new Request(`https://example.test/api/field-diary/samples?entryId=${ENTRY}`));
    const payload = await response.json();

    expect(payload.samples.map((item: Row) => item.exportedAt)).toEqual(["2026-11-09T10:00:00.000Z", null, null]);
  });

  it("sem registro, só responde que o banco aceita amostras", async () => {
    db.samples = [savedRow(1)];

    const payload = await (await GET(new Request("https://example.test/api/field-diary/samples"))).json();

    expect(payload).toEqual({ available: true, samples: [] });
  });

  it("banco ainda sem a tabela: responde indisponível em vez de erro", async () => {
    db.samplesTableMissing = true;

    const response = await GET(new Request(`https://example.test/api/field-diary/samples?entryId=${ENTRY}`));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: false, samples: [] });
  });

  it("exige sessão", async () => {
    db.auth.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) });

    expect((await GET(new Request(`https://example.test/api/field-diary/samples?entryId=${ENTRY}`))).status).toBe(401);
  });
});

describe("PUT /api/field-diary/samples", () => {
  it("exige a permissão de gravar registro de campo", async () => {
    db.auth.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });

    const response = await put(body());

    expect(response.status).toBe(403);
    expect(db.auth.mock.calls[0][1]).toBe("data.import");
    expect(db.samples).toEqual([]);
  });

  it("grava com o código calculado pela data e pelo ponto do registro gravado", async () => {
    const response = await put(
      body({
        samples: [
          sample(1, { depthM: "2,5", boxPosition: "A1", preservative: " Longmire " }),
          sample(2),
          sample(3, { sampleType: "plankton", sequence: 1, quantity: "", conservation: "OUTRO", specification: "" }),
        ],
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.samples.map((item: Row) => item.code)).toEqual([
      "YVA-0136-071126-0905-AG1",
      "YVA-0136-071126-0905-AG2",
      "YVA-0136-071126-0905-PL1",
    ]);
    expect(db.samples[0]).toMatchObject({
      id: id(1),
      entry_id: ENTRY,
      sample_code: "YVA-0136-071126-0905-AG1",
      project_code: "YVA",
      sample_type: "water",
      sequence: 1,
      depth_m: 2.5,
      quantity: 1000,
      quantity_unit: "mL",
      conservation: "FILTRO_CONGELADO",
      preservative: "Longmire",
      box_position: "A1",
    });
    expect(db.samples[1].preservative).toBeNull();
    expect(payload.samples[0].preservative).toBe("Longmire");
    expect(db.samples[2]).toMatchObject({ quantity: null, specification: null, quantity_unit: "L" });
    expect(db.changeLog).toEqual([
      expect.objectContaining({
        entry_id: ENTRY,
        campaign_name: "4ª Campanha",
        field_name: "Amostras",
        old_value: null,
        new_value: "YVA-0136-071126-0905-AG1, YVA-0136-071126-0905-AG2, YVA-0136-071126-0905-PL1",
        origin: "app",
        changed_by: "Equipe A",
      }),
    ]);
  });

  it("o branco ganha código próprio (BR1) e as réplicas de água seguem AG1 a AG5, com o conservante novo", async () => {
    const response = await put(
      body({
        samples: [
          ...[1, 2, 3, 4, 5].map((n) => sample(n, { conservation: "LONGMIRE", quantity: 250, packaging: "Criobox" })),
          sample(6, { sampleType: "blank", sequence: 1, depthM: 3, quantity: 250, conservation: "LONGMIRE" }),
          sample(7, { sampleType: "plankton", sequence: 1, quantity: 1000, conservation: "SILICA" }),
        ],
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.samples.map((item: Row) => item.code).slice(-3)).toEqual([
      "YVA-0136-071126-0905-AG5",
      "YVA-0136-071126-0905-BR1",
      "YVA-0136-071126-0905-PL1",
    ]);
    // O branco não tem profundidade.
    expect(db.samples[5]).toMatchObject({ sample_type: "blank", depth_m: null, quantity: 250, quantity_unit: "mL" });
    expect(db.samples[6]).toMatchObject({ conservation: "SILICA", quantity: 1000, quantity_unit: "L" });
  });

  it("repetir o mesmo envio não duplica nem acusa conflito", async () => {
    await put(body({ samples: [sample(1), sample(2)] }));
    const again = await put(body({ samples: [sample(1), sample(2)] }));

    expect(again.status).toBe(200);
    expect(codes()).toEqual(["YVA-0136-071126-0905-AG1", "YVA-0136-071126-0905-AG2"]);
    // Nada mudou na lista de amostras: o histórico não ganha linha nova.
    expect(db.changeLog).toHaveLength(1);
  });

  it("edita uma amostra gravada sem trocar o código", async () => {
    db.samples = [savedRow(1)];

    const response = await put(body({ samples: [sample(1, { depthM: 5, packaging: "Caixa térmica" })] }));

    expect(response.status).toBe(200);
    expect(db.samples).toHaveLength(1);
    expect(db.samples[0]).toMatchObject({ sample_code: "YVA-0136-071126-0905-AG1", depth_m: 5, packaging: "Caixa térmica" });
    expect(db.changeLog).toEqual([]);
  });

  it("recusa quando o código mostrado no aparelho não é o do registro gravado", async () => {
    const response = await put(body({ samples: [sample(1, { code: "YVA-061126-0136-AG1" })] }));

    expect(response.status).toBe(422);
    expect((await response.json()).error).toContain("confira as etiquetas");
    expect(db.samples).toEqual([]);
  });

  it("registro sem SIA não gera código e não grava amostra", async () => {
    db.entries[0].sia = "";

    const response = await put(body());

    expect(response.status).toBe(422);
    expect((await response.json()).error).toContain("Informe o ponto de coleta (SIA)");
    expect(db.samples).toEqual([]);
  });

  it("código que já existe em outro registro: 409 com o próximo número livre, sem gravar nada", async () => {
    db.samples = [
      savedRow(11, { entry_id: OTHER_ENTRY, sample_code: "YVA-0136-071126-0905-AG1", sequence: 1 }),
      savedRow(12, { entry_id: OTHER_ENTRY, sample_code: "YVA-0136-071126-0905-AG2", sequence: 2 }),
      savedRow(13, { entry_id: OTHER_ENTRY, sample_code: "YVA-0136-071126-0905-AG3", sequence: 3 }),
    ];

    const response = await put(
      body({ samples: [sample(1), sample(2), sample(4, { sampleType: "plankton", sequence: 1 })] }),
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.conflicts).toEqual([
      { sampleId: id(1), code: "YVA-0136-071126-0905-AG1", suggestedSequence: 4, suggestedCode: "YVA-0136-071126-0905-AG4", sameEntry: false },
      { sampleId: id(2), code: "YVA-0136-071126-0905-AG2", suggestedSequence: 5, suggestedCode: "YVA-0136-071126-0905-AG5", sameEntry: false },
    ]);
    expect(db.samples).toHaveLength(3);
    expect(db.samples.every((row) => row.entry_id === OTHER_ENTRY)).toBe(true);
  });

  it("aceita depois que o aparelho adota os números propostos", async () => {
    db.samples = [savedRow(11, { entry_id: OTHER_ENTRY, sample_code: "YVA-0136-071126-0905-AG1", sequence: 1 })];

    const response = await put(body({ samples: [sample(1, { sequence: 2 })] }));

    expect(response.status).toBe(200);
    expect(codes()).toEqual(["YVA-0136-071126-0905-AG1", "YVA-0136-071126-0905-AG2"]);
  });

  it("código gravado neste mesmo registro por outro aparelho: avisa que é do mesmo registro e devolve o que está gravado", async () => {
    db.samples = [savedRow(21, { sequence: 1, sample_code: "YVA-0136-071126-0905-AG1" })];

    const response = await put(body({ samples: [sample(1)] }));
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.conflicts).toEqual([
      { sampleId: id(1), code: "YVA-0136-071126-0905-AG1", suggestedSequence: 2, suggestedCode: "YVA-0136-071126-0905-AG2", sameEntry: true },
    ]);
    expect(payload.samples.map((item: Row) => item.id)).toEqual([id(21)]);
    expect(db.samples).toHaveLength(1);
  });

  it("remove só amostras deste registro e deixa reutilizar o número da que saiu", async () => {
    db.samples = [
      savedRow(1),
      savedRow(2),
      savedRow(3),
      savedRow(30, { entry_id: OTHER_ENTRY, sample_code: "YVA-0136-081126-0905-AG1", sequence: 1 }),
    ];

    const response = await put(
      body({
        samples: [sample(1), sample(2), sample(7, { sequence: 3 })],
        removedIds: [id(3), id(30), "não-é-uuid"],
      }),
    );

    expect(response.status).toBe(200);
    expect(db.samples.map((row) => row.id).sort()).toEqual([id(1), id(2), id(30), id(7)].sort());
    expect(db.samples.find((row) => row.id === id(7))?.sample_code).toBe("YVA-0136-071126-0905-AG3");
  });

  it("esvazia as amostras do registro quando todas são removidas", async () => {
    db.samples = [savedRow(1), savedRow(2)];

    const response = await put(body({ samples: [], removedIds: [id(1), id(2)] }));

    expect(response.status).toBe(200);
    expect((await response.json()).samples).toEqual([]);
    expect(db.samples).toEqual([]);
    expect(db.changeLog[0]).toMatchObject({ old_value: "YVA-0136-071126-0905-AG1, YVA-0136-071126-0905-AG2", new_value: null });
  });

  it("não deixa regravar aqui uma amostra que pertence a outro registro", async () => {
    db.samples = [savedRow(1, { entry_id: OTHER_ENTRY, sample_code: "YVA-0136-081126-0905-AG1" })];

    const response = await put(body({ samples: [sample(1)] }));

    expect(response.status).toBe(400);
    expect(db.samples[0]).toMatchObject({ entry_id: OTHER_ENTRY, sample_code: "YVA-0136-081126-0905-AG1" });
  });

  it("corrida entre dois aparelhos: o banco recusa o código repetido e o app pede para salvar de novo", async () => {
    db.upsertError = { code: "23505", message: "duplicate key value violates unique constraint" };

    const response = await put(body());

    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("Salve de novo");
  });

  it.each([
    ["sem registro", { entryId: "" }],
    ["código de projeto inválido", { projectCode: "YVAE" }],
    ["amostras fora de lista", { samples: "AG1" }],
    ["amostra com tipo desconhecido", { samples: [sample(1, { sampleType: "zooplankton" })] }],
    ["duas amostras com o mesmo número", { samples: [sample(1), sample(2, { sequence: 1 })] }],
  ])("recusa envio inválido: %s", async (_name, override) => {
    const response = await put(body(override));

    expect(response.status).toBe(400);
    expect(db.samples).toEqual([]);
  });

  it("amostra já exportada fica com o código, mesmo com a data do registro corrigida", async () => {
    db.samples = [savedRow(1, { exported_at: "2026-11-09T10:00:00.000Z" }), savedRow(2)];
    db.entries[0].entry_date = "2026-11-08";

    // O aparelho mostra o código antigo na exportada e o novo na outra.
    const response = await put(
      body({
        samples: [
          sample(1, { code: "YVA-0136-071126-0905-AG1", packaging: "Caixa térmica" }),
          sample(2, { code: "YVA-0136-081126-0905-AG2" }),
        ],
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(codes()).toEqual(["YVA-0136-071126-0905-AG1", "YVA-0136-081126-0905-AG2"]);
    expect(db.samples[0]).toMatchObject({
      sample_code: "YVA-0136-071126-0905-AG1",
      packaging: "Caixa térmica",
      exported_at: "2026-11-09T10:00:00.000Z",
    });
    expect(payload.samples.map((item: Row) => [item.code, item.exportedAt])).toEqual([
      ["YVA-0136-071126-0905-AG1", "2026-11-09T10:00:00.000Z"],
      ["YVA-0136-081126-0905-AG2", null],
    ]);
  });

  it("amostra já exportada não troca de tipo nem de número, nem acusa código diferente no aparelho", async () => {
    db.samples = [savedRow(1, { exported_at: "2026-11-09T10:00:00.000Z" })];
    db.entries[0].sia = "SIA-0140";

    // Aparelho com versão antiga: recalculou o código pelo ponto novo e trocou o tipo.
    const response = await put(
      body({ samples: [sample(1, { code: "YVA-0140-071126-0905-PL3", sampleType: "plankton", sequence: 3 })] }),
    );

    expect(response.status).toBe(200);
    expect(db.samples).toHaveLength(1);
    expect(db.samples[0]).toMatchObject({
      sample_code: "YVA-0136-071126-0905-AG1",
      sample_type: "water",
      sequence: 1,
      project_code: "YVA",
    });
  });

  it("amostra exportada segue gravando num registro que ficou sem SIA", async () => {
    db.samples = [savedRow(1, { exported_at: "2026-11-09T10:00:00.000Z" })];
    db.entries[0].sia = "";

    const response = await put(body({ samples: [sample(1, { boxPosition: "B2" })] }));

    expect(response.status).toBe(200);
    expect(db.samples[0]).toMatchObject({ sample_code: "YVA-0136-071126-0905-AG1", box_position: "B2" });
  });

  it("amostra exportada pode ser retirada do registro, e a retirada fica no histórico", async () => {
    db.samples = [savedRow(1, { exported_at: "2026-11-09T10:00:00.000Z" }), savedRow(2)];

    const response = await put(body({ samples: [sample(2)], removedIds: [id(1)] }));

    expect(response.status).toBe(200);
    expect(codes()).toEqual(["YVA-0136-071126-0905-AG2"]);
    expect(db.changeLog).toHaveLength(1);
    expect(db.changeLog[0]).toMatchObject({
      field_name: "Amostras",
      old_value: "YVA-0136-071126-0905-AG1, YVA-0136-071126-0905-AG2",
      new_value: "YVA-0136-071126-0905-AG2",
    });
  });

  it("registro sem hora da coleta: explica que falta a hora e não grava", async () => {
    db.entries[0].collection_time = null;

    const response = await put(body());

    expect(response.status).toBe(422);
    expect((await response.json()).error).toContain("hora da coleta");
    expect(db.samples).toEqual([]);
  });

  it("código no formato antigo (sem a hora) fica como está, porque já pode estar na etiqueta", async () => {
    db.samples = [savedRow(1, { sample_code: "YVA-071126-0136-AG1" })];
    db.entries[0].collection_time = "10:40:00";

    const response = await put(
      body({ samples: [sample(1, { code: "YVA-071126-0136-AG1", packaging: "Caixa térmica" }), sample(2)] }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(codes()).toEqual(["YVA-0136-071126-1040-AG2", "YVA-071126-0136-AG1"]);
    expect(db.samples[0]).toMatchObject({ sample_code: "YVA-071126-0136-AG1", packaging: "Caixa térmica" });
    expect(payload.samples.map((item: Row) => item.code)).toEqual(["YVA-071126-0136-AG1", "YVA-0136-071126-1040-AG2"]);
  });

  it("registro que não existe: 404", async () => {
    expect((await put(body({ entryId: "não-existe" }))).status).toBe(404);
  });

  it("banco ainda sem a tabela: 503 dizendo que o registro foi salvo e as amostras não", async () => {
    db.samplesTableMissing = true;

    const response = await put(body());

    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("as amostras não");
  });
});
