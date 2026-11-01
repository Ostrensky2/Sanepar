import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({ requireApiSession: mocks.auth }));
vi.mock("@/lib/supabase", () => ({
  createOptionalSupabaseClient: () => ({
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        returns: async () => ({ data: [], error: null }),
        maybeSingle: async () => ({ data: null, error: null }),
        upsert: (row: Record<string, unknown>) => {
          mocks.upsert(row);
          return {
            select: () => ({
              single: async () => ({ data: { ...row, photos: [] }, error: null }),
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

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: "6f1f8d1e-2b7a-4a43-9a51-0d6c1f0f5a11",
    campaignId: "campanha-2",
    campaignName: "2ª Campanha",
    campaignDay: 1,
    entryDate: "2026-06-01",
    locationName: "Rio Pequeno",
    sia: "SIA-0771",
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

function request(body: unknown, method: "POST" | "PUT" = "POST") {
  return new Request("https://sanepar.test/api/field-diary", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ entry: body }),
  });
}

describe("API do Diário de campo: regras conferidas antes do banco", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ ok: true, session: { name: "Teste" } });
  });

  it("recusa coordenada inválida com mensagem em português e não grava", async () => {
    const response = await POST(request(entry({ latitude: "abc", longitude: "-49.1" })));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("A latitude “abc” não é um número válido");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("recusa latitude fora da faixa", async () => {
    const response = await PUT(request(entry({ latitude: "-95", longitude: "-49.1" })));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("entre -90 e 90");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("recusa par lat/lon incompleto", async () => {
    const response = await POST(request(entry({ latitude: "-25.48", longitude: "" })));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(
      "Informe a longitude junto com a latitude, ou deixe as duas em branco.",
    );
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("recusa ponto realocado sem motivo", async () => {
    const response = await PUT(
      request(entry({ latitude: "-25.48", longitude: "-49.17", executionStatus: "relocated", relocationReason: " " })),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("Informe o motivo da realocação");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it.each([
    ["POST", POST],
    ["PUT", PUT],
  ] as const)("%s recusa situação desconhecida sem gravar uma situação inferida", async (method, handler) => {
    const response = await handler(request(entry({ executionStatus: "movido" }), method));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(
      "A situação do ponto “movido” não é reconhecida. Use Planejado, Realizado, Não realizado, Realocado ou Bloqueado.",
    );
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("grava coordenada como número e a situação com o motivo", async () => {
    const response = await PUT(
      request(
        entry({
          latitude: "-25,4819",
          longitude: "-49,1925",
          executionStatus: "relocated",
          relocationReason: "Margem alagada; coleta 150 m a montante.",
          weatherConditions: "Sol",
        }),
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        latitude: -25.4819,
        longitude: -49.1925,
        execution_status: "relocated",
        relocation_reason: "Margem alagada; coleta 150 m a montante.",
        weather_conditions: "Céu limpo",
        governance_status: "corrigido",
      }),
    );
    const saved = (await response.json()).entry;
    expect(saved).toMatchObject({ latitude: "-25.4819", longitude: "-49.1925", executionStatus: "relocated" });
  });

  it("sem situação informada, grava a situação deduzida da coleta", async () => {
    await PUT(request(entry({ latitude: "", longitude: "" })));

    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ latitude: null, longitude: null, execution_status: "realized", relocation_reason: null }),
    );
  });
});
