import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyFieldDiaryPayload, prepareFieldDiaryEntry, type FieldDiaryEntry } from "@/lib/field-diary";
import {
  FIELD_OUTBOX_STORAGE_KEY,
  mergeEntriesWithOutbox,
  mergeFieldOutboxRecord,
  readFieldOutbox,
  type FieldOutboxRecord,
} from "@/lib/field-outbox";
import { sendFieldOutboxRecord, submitFieldRecord, syncFieldOutbox } from "@/lib/field-record-sync";
import type { SampleInput } from "@/lib/field-samples";

function entry(overrides: Partial<FieldDiaryEntry> = {}): FieldDiaryEntry {
  return prepareFieldDiaryEntry({
    ...createEmptyFieldDiaryPayload(),
    id: "e-1",
    campaignId: "c1",
    campaignName: "Campanha 2",
    entryDate: "2026-11-12",
    locationName: "Rio Passaúna",
    sia: "0136",
    fieldTeamName: "Equipe",
    ...overrides,
  });
}

function sample(id: string, sequence: number): SampleInput {
  return {
    id,
    code: `YVA-0136-121126-0905-AG${sequence}`,
    sampleType: "water",
    sequence,
    depthM: 0,
    quantity: 1000,
    quantityUnit: "mL",
    specification: "",
    conservation: "FILTRO_CONGELADO",
    preservative: "",
    packaging: "",
    boxPosition: "",
  };
}

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

function respond(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("fila de registros guardados no aparelho", () => {
  it("registro novo editado sem sinal continua novo, com o mesmo id", () => {
    const first = mergeFieldOutboxRecord(null, { entry: entry(), mode: "insert" }, "2026-11-12T10:00:00Z");
    const edited = mergeFieldOutboxRecord(first, { entry: entry({ dailySummary: "Água turva" }), mode: "upsert" }, "2026-11-12T10:05:00Z");

    expect(edited.mode).toBe("insert");
    expect(edited.id).toBe("e-1");
    expect(edited.entry.dailySummary).toBe("Água turva");
    expect(edited.queuedAt).toBe("2026-11-12T10:00:00Z");
  });

  it("amostra guardada que a pessoa tirou sai também da nuvem", () => {
    const first = mergeFieldOutboxRecord(null, {
      entry: entry(),
      mode: "upsert",
      samples: { projectCode: "YVA", samples: [sample("s-1", 1), sample("s-2", 2)], removedIds: ["s-0"] },
    });
    const edited = mergeFieldOutboxRecord(first, {
      entry: entry(),
      mode: "upsert",
      samples: { projectCode: "YVA", samples: [sample("s-1", 1)], removedIds: [] },
    });

    expect(edited.samples?.samples.map((item) => item.id)).toEqual(["s-1"]);
    expect(edited.samples?.removedIds.sort()).toEqual(["s-0", "s-2"]);
  });

  it("salvar sem mexer nas amostras mantém as que estavam guardadas", () => {
    const first = mergeFieldOutboxRecord(null, {
      entry: entry(),
      mode: "insert",
      samples: { projectCode: "YVA", samples: [sample("s-1", 1)], removedIds: [] },
    });
    const edited = mergeFieldOutboxRecord(first, { entry: entry({ dailySummary: "ok" }), mode: "upsert" });

    expect(edited.samples?.samples).toHaveLength(1);
  });

  it("depois que o registro chegou à nuvem com outro id, a edição vai para esse id", () => {
    const partial: FieldOutboxRecord = {
      ...mergeFieldOutboxRecord(null, { entry: entry(), mode: "insert" }),
      savedEntryId: "nuvem-9",
      entry: entry({ id: "nuvem-9" }),
    };
    const edited = mergeFieldOutboxRecord(partial, { entry: entry({ id: "nuvem-9" }), mode: "upsert" });

    expect(edited.mode).toBe("upsert");
    expect(edited.entry.id).toBe("nuvem-9");
    expect(edited.savedEntryId).toBeUndefined();
  });

  it("a lista mostra os registros do aparelho, marcados, por cima dos da nuvem", () => {
    const cloud = [entry({ id: "e-2", sia: "0140", locationName: "Represa Iraí" })];
    const records = [
      mergeFieldOutboxRecord(null, { entry: entry(), mode: "insert" }),
      { ...mergeFieldOutboxRecord(null, { entry: entry({ id: "e-2", sia: "0140", dailySummary: "editado" }), mode: "upsert" }), problem: "Código repetido." },
    ];
    const merged = mergeEntriesWithOutbox(cloud, records);

    expect(merged).toHaveLength(2);
    expect(merged.find((item) => item.id === "e-1")?.deviceState).toBe("pending");
    expect(merged.find((item) => item.id === "e-2")).toMatchObject({ deviceState: "attention", dailySummary: "editado", deviceProblem: "Código repetido." });
  });
});

describe("envio do que ficou guardado", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      localStorage: storage(),
      location: { hostname: "sanepar-blue.vercel.app" },
      dispatchEvent: () => true,
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("sem sinal, salvar guarda o registro e as amostras no aparelho", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const result = await submitFieldRecord(
      { ...entry(), id: undefined },
      { samples: { projectCode: "YVA", samples: [sample("s-1", 1)], removedIds: [] } },
    );

    expect(result.status).toBe("device");
    const [record] = readFieldOutbox();
    expect(record.mode).toBe("insert");
    expect(record.samples?.samples).toHaveLength(1);
    expect(window.localStorage.getItem(FIELD_OUTBOX_STORAGE_KEY)).toContain("YVA-0136-121126-0905-AG1");
  });

  it("registro gravado e amostras sem sinal: só as amostras ficam para depois", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/field-diary") return respond(200, { entry: entry({ id: "nuvem-1" }) });
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);
    const record = mergeFieldOutboxRecord(null, {
      entry: entry(),
      mode: "insert",
      samples: { projectCode: "YVA", samples: [sample("s-1", 1)], removedIds: [] },
    });

    const sent = await sendFieldOutboxRecord(record);

    expect(sent.kind).toBe("offline");
    expect(sent.kind === "offline" && sent.remaining).toMatchObject({ savedEntryId: "nuvem-1", entry: { id: "nuvem-1" } });
    expect(sent.kind === "offline" && sent.remaining.samples?.samples).toHaveLength(1);
  });

  it("sessão expirada não perde o registro: espera a pessoa entrar de novo", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(401, { error: "Sessão expirada." })));

    const result = await submitFieldRecord({ ...entry(), id: undefined });

    expect(result.status).toBe("device");
    expect(readFieldOutbox()[0].waitingLogin).toBe(true);
  });

  it("recusa de dado não fica guardada: a mensagem volta ao formulário", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(400, { error: "Coordenada fora do Paraná." })));

    const result = await submitFieldRecord({ ...entry(), id: undefined });

    expect(result).toEqual({ status: "none", error: "Coordenada fora do Paraná." });
    expect(readFieldOutbox()).toHaveLength(0);
  });

  it("quando o sinal volta, envia e tira do aparelho; recusa vira “precisa de revisão”", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await submitFieldRecord({ ...entry({ id: "a" }), id: undefined });
    await submitFieldRecord({ ...entry({ sia: "0140", locationName: "Represa Iraí" }), id: undefined });
    expect(readFieldOutbox()).toHaveLength(2);

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as { entry?: FieldDiaryEntry };
        return body.entry?.sia === "0140"
          ? respond(409, { error: "Já existe um registro para este ponto e data com dados diferentes." })
          : respond(200, { entry: body.entry });
      }),
    );

    const result = await syncFieldOutbox();

    expect(result).toMatchObject({ sent: 1, attention: 1, stopped: null });
    const left = readFieldOutbox();
    expect(left).toHaveLength(1);
    expect(left[0].entry.sia).toBe("0140");
    expect(left[0].problem).toMatch(/Já existe um registro/);
  });
});
